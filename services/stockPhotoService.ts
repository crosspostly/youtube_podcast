import { GoogleGenAI } from '@google/genai';
import type { StockPhoto, StockPhotoApiKeys, GeneratedImage } from '../types';
import type { LogEntry } from '../types';
import { blockKey, getKeyStatus } from '../utils/stockPhotoKeyManager';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;

// Placeholder image for fallback cases (1024x576 gray placeholder with text)
const PLACEHOLDER_BASE64 = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAyNCIgaGVpZ2h0PSI1NzYiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPHJlY3Qgd2lkdGg9IjEwMjQiIGhlaWdodD0iNTc2IiBmaWxsPSIjMzc0MTUxIi8+CiAgPHRleHQgeD0iNTEyIiB5PSIyODgiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIzMiIgZmlsbD0iIzlDQTNBRiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSI+CiAgICBJbWFnZSBVbmF2YWlsYWJsZQogIDwvdGV4dD4KICA8dGV4dCB4PSI1MTIiIHk9IjMyMCIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE2IiBmaWxsPSIjNkI3MjgwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIj4KICAgIFBsYWNlaG9sZGVyCiAgPC90ZXh0Pgo8L3N2Zz4=';

// ============================================================================
// УПРОЩЕНИЕ AI-ПРОМПТОВ ДЛЯ СТОКОВЫХ ПОИСКОВ
// ============================================================================

/**
 * Упрощает AI-промпт для поиска на стоковых сервисах
 * Убирает технические термины (cinematic, 8k, hyperrealistic)
 * Оставляет только ключевые объекты и атмосферу
 */
const simplifyPromptForStock = async (
    aiPrompt: string, 
    geminiApiKey: string,
    log: LogFunction
): Promise<string> => {
    try {
        log({ type: 'info', message: `Упрощение промпта для стоков: "${aiPrompt}"` });
        
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [{
                    text: `Simplify this AI image generation prompt for stock photo search.
                           Remove technical terms: cinematic, hyperrealistic, 8k, ultra-detailed, dramatic lighting, etc.
                           Keep only: main objects, atmosphere, colors.
                           Output only the simplified query, nothing else.
                           
                           AI Prompt: "${aiPrompt}"
                           
                           Simplified query:`
                }]
            }
        });
        
        const simplified = response.text.trim();
        log({ type: 'response', message: `Упрощённый промпт: "${simplified}"` });
        return simplified;
        
    } catch (error) {
        log({ type: 'warning', message: 'Не удалось упростить промпт, используем оригинал', data: error });
        // Fallback: убираем базовые стоп-слова вручную
        return aiPrompt
            .replace(/cinematic|hyperrealistic|8k|ultra-detailed|dramatic lighting|wide angle|lovecraftian horror/gi, '')
            .trim();
    }
};

/**
 * Переводит запрос на английский (если на русском)
 */
const translateToEnglish = async (
    query: string, 
    geminiApiKey: string,
    log: LogFunction
): Promise<string> => {
    // Проверяем, содержит ли только латиницу
    if (/^[a-zA-Z0-9\s,.-]+$/.test(query)) {
        return query; // Уже на английском
    }
    
    try {
        log({ type: 'info', message: `Перевод запроса на английский: "${query}"` });
        
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: `Translate to English (output only translation): "${query}"` }] }
        });
        
        const translated = response.text.trim();
        log({ type: 'response', message: `Переведено: "${translated}"` });
        return translated;
        
    } catch (error) {
        log({ type: 'warning', message: 'Не удалось перевести, используем оригинал', data: error });
        return query;
    }
};

// ============================================================================
// ПОИСК НА UNSPLASH
// ============================================================================

/**
 * Поиск изображений на Unsplash
 */
const searchUnsplash = async (
    query: string, 
    apiKey: string,
    log: LogFunction
): Promise<StockPhoto[]> => {
    // Проверка блокировки ПЕРЕД запросом
    const status = getKeyStatus('unsplash');
    if (status.isBlocked) {
        const remainingTime = Math.ceil((status.blockedUntil! - Date.now()) / 60000);
        throw new Error(`Unsplash API временно заблокирован (осталось ${remainingTime} мин). Причина: ${status.lastError}`);
    }
    
    log({ type: 'request', message: `Поиск на Unsplash: "${query}"` });
    
    const MIN_WIDTH = 1920;
    const MIN_HEIGHT = 1080;
    
    const response = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=10&orientation=landscape&content_filter=high`,
        {
            headers: {
                'Authorization': `Client-ID ${apiKey}`
            }
        }
    );

    if (!response.ok) {
        // Обработка rate limit
        if (response.status === 429) {
            const errorMsg = 'Rate limit exceeded';
            blockKey('unsplash', errorMsg);
            log({ type: 'error', message: `❌ Unsplash заблокирован на 1 час: ${errorMsg}` });
        }
        throw new Error(`Unsplash API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Фильтруем по минимальному разрешению
    const photos = data.results
        .filter((photo: any) => photo.width >= MIN_WIDTH && photo.height >= MIN_HEIGHT)
        .map((photo: any) => ({
            id: photo.id,
            url: photo.urls.regular,
            downloadUrl: photo.urls.full,
            photographer: photo.user.name,
            photographerUrl: photo.user.links.html,
            source: 'unsplash' as const,
            width: photo.width,
            height: photo.height,
            license: 'Unsplash License (Commercial use allowed)'
        }));
    
    log({ type: 'response', message: `Найдено ${photos.length} фото на Unsplash` });
    return photos;
};

// ============================================================================
// ПОИСК НА PEXELS
// ============================================================================

/**
 * Поиск изображений на Pexels
 */
const searchPexels = async (
    query: string, 
    apiKey: string,
    log: LogFunction
): Promise<StockPhoto[]> => {
    // Проверка блокировки ПЕРЕД запросом
    const status = getKeyStatus('pexels');
    if (status.isBlocked) {
        const remainingTime = Math.ceil((status.blockedUntil! - Date.now()) / 60000);
        throw new Error(`Pexels API временно заблокирован (осталось ${remainingTime} мин). Причина: ${status.lastError}`);
    }
    
    log({ type: 'request', message: `Поиск на Pexels: "${query}"` });
    
    const MIN_WIDTH = 1920;
    const MIN_HEIGHT = 1080;
    
    const response = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=10&orientation=landscape`,
        {
            headers: {
                'Authorization': apiKey
            }
        }
    );

    if (!response.ok) {
        // Обработка rate limit
        if (response.status === 429) {
            const errorMsg = 'Rate limit exceeded';
            blockKey('pexels', errorMsg);
            log({ type: 'error', message: `❌ Pexels заблокирован на 1 час: ${errorMsg}` });
        }
        throw new Error(`Pexels API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Фильтруем по минимальному разрешению
    const photos = data.photos
        .filter((photo: any) => photo.width >= MIN_WIDTH && photo.height >= MIN_HEIGHT)
        .map((photo: any) => ({
            id: photo.id.toString(),
            url: photo.src.large,
            downloadUrl: photo.src.original,
            photographer: photo.photographer,
            photographerUrl: photo.photographer_url,
            source: 'pexels' as const,
            width: photo.width,
            height: photo.height,
            license: 'Pexels License (Commercial use allowed)'
        }));
    
    log({ type: 'response', message: `Найдено ${photos.length} фото на Pexels` });
    return photos;
};

// ============================================================================
// ОБРАБОТКА ИЗОБРАЖЕНИЙ
// ============================================================================

/**
 * Обрезает и масштабирует изображение до 16:9 (1024x576)
 */
const cropToAspectRatio = async (imageUrl: string, log: LogFunction): Promise<string> => {
    return new Promise((resolve, reject) => {
        // FIX: Use `window.Image` to resolve missing DOM type error.
        const img = new (window as any).Image();
        img.crossOrigin = 'anonymous';
        
        // Timeout 5 секунд для предотвращения зависания
        const timeout = setTimeout(() => {
            reject(new Error('Image load timeout (5s)'));
        }, 5000);
        
        img.onload = () => {
            clearTimeout(timeout);
            
            // FIX: Use `window.document` to resolve missing DOM type error.
            const canvas = (window as any).document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            if (!ctx) {
                reject(new Error('Failed to get canvas context'));
                return;
            }
            
            const targetWidth = 1024;
            const targetHeight = 576; // 16:9
            
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            
            // Center crop
            const scale = Math.max(targetWidth / img.width, targetHeight / img.height);
            const scaledWidth = img.width * scale;
            const scaledHeight = img.height * scale;
            const x = (targetWidth - scaledWidth) / 2;
            const y = (targetHeight - scaledHeight) / 2;
            
            ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
            
            const base64 = canvas.toDataURL('image/jpeg', 0.95);
            log({ type: 'info', message: 'Изображение обрезано до 16:9 (1024x576)' });
            resolve(base64);
        };
        
        img.onerror = (error) => {
            clearTimeout(timeout);
            log({ type: 'error', message: 'Не удалось загрузить изображение для обрезки', data: error });
            reject(new Error('Failed to load image'));
        };
        
        img.src = imageUrl;
    });
};

/**
 * Скачивает изображение и конвертирует в base64 через proxy
 */
export const downloadStockPhoto = async (photo: StockPhoto, apiKeys: StockPhotoApiKeys, log: LogFunction): Promise<string> => {
    try {
        log({ type: 'request', message: `Скачивание фото через proxy от ${photo.photographer}...` });

        const { getStockPhotoKeys } = await import('../config/appConfig');
        const finalKeys = getStockPhotoKeys(apiKeys);
        const apiKey = photo.source === 'unsplash' ? finalKeys.unsplash : finalKeys.pexels;
        
        // Запрос к proxy endpoint
        const response = await fetch('/api/download-image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: photo.downloadUrl,
                source: photo.source,
                apiKey: apiKey
            })
        });

        if (!response.ok) {
            throw new Error(`Proxy endpoint error: ${response.status}`);
        }

        const { base64 } = await response.json();
        
        if (!base64) {
            throw new Error('No base64 data received from proxy');
        }
        
        // Обрезаем до 16:9
        const croppedBase64 = await cropToAspectRatio(base64, log);
        
        log({ type: 'response', message: `✅ Фото скачано и обработано через proxy` });
        return croppedBase64;
        
    } catch (error) {
        log({ 
            type: 'error', 
            message: '❌ Не удалось скачать фото, используем placeholder', 
            data: error 
        });
        
        // FALLBACK: Возвращаем placeholder
        return PLACEHOLDER_BASE64;
    }
};

// ============================================================================
// ГЛАВНАЯ ФУНКЦИЯ ПОИСКА
// ============================================================================

/**
 * Умный поиск стоковых фото с fallback между сервисами
 */
export const searchStockPhotos = async (
    rawPrompt: string,
    userApiKeys: StockPhotoApiKeys,  // Пользовательские ключи
    geminiApiKey: string,
    preferredService: 'unsplash' | 'pexels' | 'auto',
    log: LogFunction
): Promise<StockPhoto[]> => {
    try {
        // ШАГ 0: Получить финальные ключи (пользовательские ИЛИ дефолтные)
        const { getStockPhotoKeys } = await import('../config/appConfig');
        const finalKeys = getStockPhotoKeys(userApiKeys);
        
        log({ 
          type: 'info', 
          message: `Используются ключи: Unsplash=${finalKeys.unsplash ? '✅' : '❌'}, Pexels=${finalKeys.pexels ? '✅' : '❌'}` 
        });
        
        // Шаг 1: Упростить промпт для стоков
        const simplifiedPrompt = await simplifyPromptForStock(rawPrompt, geminiApiKey, log);
        
        // Шаг 2: Перевести на английский (если нужно)
        const finalQuery = await translateToEnglish(simplifiedPrompt, geminiApiKey, log);
        
        // Шаг 3: Поиск на выбранном сервисе с fallback
        
        // ПРИОРИТЕТ 1: UNSPLASH
        if (preferredService === 'unsplash' && finalKeys.unsplash) {
            try {
                log({ type: 'info', message: '🔍 Поиск на Unsplash (приоритетный сервис)' });
                const photos = await searchUnsplash(finalQuery, finalKeys.unsplash, log);
                if (photos.length > 0) return photos;
                
                // Fallback на Pexels
                if (finalKeys.pexels) {
                    log({ type: 'warning', message: '⚠️ Unsplash не нашёл результатов, fallback на Pexels...' });
                    const pexelsPhotos = await searchPexels(finalQuery, finalKeys.pexels, log);
                    if (pexelsPhotos.length > 0) return pexelsPhotos;
                }
            } catch (error) {
                log({ type: 'warning', message: '❌ Unsplash error, trying Pexels...', data: error });
                if (finalKeys.pexels) {
                    const pexelsPhotos = await searchPexels(finalQuery, finalKeys.pexels, log);
                    if (pexelsPhotos.length > 0) return pexelsPhotos;
                }
            }
        } 
        
        // ПРИОРИТЕТ 2: PEXELS
        else if (preferredService === 'pexels' && finalKeys.pexels) {
            try {
                log({ type: 'info', message: '🔍 Поиск на Pexels (приоритетный сервис)' });
                const photos = await searchPexels(finalQuery, finalKeys.pexels, log);
                if (photos.length > 0) return photos;
                
                // Fallback на Unsplash
                if (finalKeys.unsplash) {
                    log({ type: 'warning', message: '⚠️ Pexels не нашёл результатов, fallback на Unsplash...' });
                    const unsplashPhotos = await searchUnsplash(finalQuery, finalKeys.unsplash, log);
                    if (unsplashPhotos.length > 0) return unsplashPhotos;
                }
            } catch (error) {
                log({ type: 'warning', message: '❌ Pexels error, trying Unsplash...', data: error });
                if (finalKeys.unsplash) {
                    const unsplashPhotos = await searchUnsplash(finalQuery, finalKeys.unsplash, log);
                    if (unsplashPhotos.length > 0) return unsplashPhotos;
                }
            }
        } 
        
        // РЕЖИМ AUTO: Пробуем оба (по умолчанию Unsplash первым)
        else {
            log({ type: 'info', message: '🔍 Режим AUTO: пробуем оба сервиса' });
            
            // Сначала Unsplash (по умолчанию)
            if (finalKeys.unsplash) {
                try {
                    log({ type: 'info', message: '🔍 Попытка 1: Unsplash' });
                    const photos = await searchUnsplash(finalQuery, finalKeys.unsplash, log);
                    if (photos.length > 0) return photos;
                } catch (error) {
                    log({ type: 'warning', message: '❌ Unsplash failed in AUTO mode', data: error });
                }
            }
            
            // Затем Pexels
            if (finalKeys.pexels) {
                try {
                    log({ type: 'info', message: '🔍 Попытка 2: Pexels' });
                    const photos = await searchPexels(finalQuery, finalKeys.pexels, log);
                    if (photos.length > 0) return photos;
                } catch (error) {
                    log({ type: 'warning', message: '❌ Pexels failed in AUTO mode', data: error });
                }
            }
        }
        
        throw new Error('❌ Не удалось найти изображения ни на одном стоковом сервисе');
        
    } catch (error) {
        log({ type: 'error', message: 'Ошибка поиска стоковых фото', data: error });
        throw error;
    }
};