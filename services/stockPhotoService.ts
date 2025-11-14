import { GoogleGenAI } from '@google/genai';
import type { LogFunction, StockPhoto, StockPhotoApiKeys } from '../types';

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
            model: 'gemini-2.0-flash-lite',
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
        
        const simplified = response.text().trim();
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
            model: 'gemini-2.0-flash-lite',
            contents: { parts: [{ text: `Translate to English (output only translation): "${query}"` }] }
        });
        
        const translated = response.text().trim();
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
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = () => {
            const canvas = document.createElement('canvas');
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
            log({ type: 'error', message: 'Не удалось загрузить изображение для обрезки', data: error });
            reject(new Error('Failed to load image'));
        };
        
        img.src = imageUrl;
    });
};

/**
 * Скачивает изображение и конвертирует в base64
 */
export const downloadStockPhoto = async (photo: StockPhoto, log: LogFunction): Promise<string> => {
    try {
        log({ type: 'request', message: `Скачивание фото от ${photo.photographer}...` });
        
        const response = await fetch(photo.downloadUrl);
        const blob = await response.blob();
        
        // Конвертируем в base64
        const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
        
        // Обрезаем до 16:9
        const croppedBase64 = await cropToAspectRatio(base64, log);
        
        log({ type: 'response', message: `Фото скачано и обработано` });
        return croppedBase64;
        
    } catch (error) {
        log({ type: 'error', message: 'Не удалось скачать фото', data: error });
        throw error;
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
    apiKeys: StockPhotoApiKeys,
    geminiApiKey: string,
    preferredService: 'unsplash' | 'pexels' | 'auto',
    log: LogFunction
): Promise<StockPhoto[]> => {
    try {
        // Шаг 1: Упростить промпт для стоков
        const simplifiedPrompt = await simplifyPromptForStock(rawPrompt, geminiApiKey, log);
        
        // Шаг 2: Перевести на английский (если нужно)
        const finalQuery = await translateToEnglish(simplifiedPrompt, geminiApiKey, log);
        
        // Шаг 3: Поиск на выбранном сервисе
        if (preferredService === 'unsplash' && apiKeys.unsplash) {
            try {
                const photos = await searchUnsplash(finalQuery, apiKeys.unsplash, log);
                if (photos.length > 0) return photos;
                
                // Fallback на Pexels
                log({ type: 'warning', message: 'Unsplash не нашёл, пробуем Pexels...' });
                if (apiKeys.pexels) {
                    const pexelsPhotos = await searchPexels(finalQuery, apiKeys.pexels, log);
                    if (pexelsPhotos.length > 0) return pexelsPhotos;
                }
            } catch (error) {
                log({ type: 'warning', message: 'Unsplash error, trying Pexels...', data: error });
                if (apiKeys.pexels) {
                    const pexelsPhotos = await searchPexels(finalQuery, apiKeys.pexels, log);
                    if (pexelsPhotos.length > 0) return pexelsPhotos;
                }
            }
        } else if (preferredService === 'pexels' && apiKeys.pexels) {
            try {
                const photos = await searchPexels(finalQuery, apiKeys.pexels, log);
                if (photos.length > 0) return photos;
                
                // Fallback на Unsplash
                log({ type: 'warning', message: 'Pexels не нашёл, пробуем Unsplash...' });
                if (apiKeys.unsplash) {
                    const unsplashPhotos = await searchUnsplash(finalQuery, apiKeys.unsplash, log);
                    if (unsplashPhotos.length > 0) return unsplashPhotos;
                }
            } catch (error) {
                log({ type: 'warning', message: 'Pexels error, trying Unsplash...', data: error });
                if (apiKeys.unsplash) {
                    const unsplashPhotos = await searchUnsplash(finalQuery, apiKeys.unsplash, log);
                    if (unsplashPhotos.length > 0) return unsplashPhotos;
                }
            }
        } else {
            // Auto mode: пробуем оба
            if (apiKeys.unsplash) {
                try {
                    const photos = await searchUnsplash(finalQuery, apiKeys.unsplash, log);
                    if (photos.length > 0) return photos;
                } catch (error) {
                    log({ type: 'warning', message: 'Unsplash failed', data: error });
                }
            }
            
            if (apiKeys.pexels) {
                try {
                    const photos = await searchPexels(finalQuery, apiKeys.pexels, log);
                    if (photos.length > 0) return photos;
                } catch (error) {
                    log({ type: 'warning', message: 'Pexels failed', data: error });
                }
            }
        }
        
        throw new Error('Не удалось найти изображения ни на одном стоковом сервисе');
        
    } catch (error) {
        log({ type: 'error', message: 'Ошибка поиска стоковых фото', data: error });
        throw error;
    }
};