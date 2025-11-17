// services/stockPhotoService.ts

import { generateContentWithFallback, type LogFunction } from './geminiService';
import type { StockPhoto, StockPhotoApiKeys, GeneratedImage } from '../types';
import type { LogEntry } from '../types';
import { blockKey, getKeyStatus } from '../utils/stockPhotoKeyManager';
import { prompts } from './prompts';

// Placeholder image for fallback cases (1024x576 gray placeholder with text)
const PLACEHOLDER_BASE64 = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAyNCIgaGVpZ2h0PSI1NzYiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPHJlY3Qgd2lkdGg9IjEwMjQiIGhlaWdodD0iNTc2IiBmaWxsPSIjMzc0MTUxIi8+CiAgPHRleHQgeD0iNTEyIiB5PSIyODgiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIzMiIgZmlsbD0iIzlDQTNBRiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSI+CiAgICBJbWFnZSBVbmF2YWlsYWJsZQogIDwvdGV4dD4KICA8dGV4dCB4PSI1MTIiIHk9IjMyMCIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjE2IiBmaWxsPSIjNkI3MjgwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIj4KICAgIFBsYWNlaG9sZGVyCiAgPC90ZXh0Pgo8L3N2Zz4=';

/**
 * Упрощает AI-промпт для поиска на стоковых сервисах
 */
const simplifyPromptForStock = async (
    aiPrompt: string, 
    geminiApiKey: string,
    log: LogFunction
): Promise<string> => {
    try {
        log({ type: 'info', message: `Упрощение промпта для стоков: "${aiPrompt}"` });
        
        const response = await generateContentWithFallback(
            { contents: { parts: [{ text: prompts.simplifyForStock(aiPrompt) }] } },
            log,
            { gemini: geminiApiKey }
        );
        
        const simplified = response.text.trim();
        log({ type: 'response', message: `Упрощённый промпт: "${simplified}"` });
        return simplified;
        
    } catch (error) {
        log({ type: 'warning', message: 'Не удалось упростить промпт, используем оригинал', data: error });
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
    if (/^[a-zA-Z0-9\s,.-]+$/.test(query)) {
        return query;
    }
    
    try {
        log({ type: 'info', message: `Перевод запроса на английский: "${query}"` });
        
        const response = await generateContentWithFallback(
            { contents: { parts: [{ text: prompts.translateToEnglish(query) }] } },
            log,
            { gemini: geminiApiKey }
        );

        const translated = response.text.trim();
        log({ type: 'response', message: `Переведено: "${translated}"` });
        return translated;
        
    } catch (error) {
        log({ type: 'warning', message: 'Не удалось перевести, используем оригинал', data: error });
        return query;
    }
};

/**
 * Поиск изображений на Unsplash
 */
const searchUnsplash = async (
    query: string, 
    apiKey: string,
    log: LogFunction
): Promise<StockPhoto[]> => {
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
        { headers: { 'Authorization': `Client-ID ${apiKey}` } }
    );

    if (!response.ok) {
        if (response.status === 429) {
            const errorMsg = 'Rate limit exceeded';
            blockKey('unsplash', errorMsg);
            log({ type: 'error', message: `❌ Unsplash заблокирован на 1 час: ${errorMsg}` });
        }
        throw new Error(`Unsplash API error: ${response.status}`);
    }

    const data = await response.json();
    
    const photos = data.results
        .filter((photo: any) => photo.width >= MIN_WIDTH && photo.height >= MIN_HEIGHT)
        .map((photo: any) => ({
            id: photo.id,
            url: photo.urls.regular,
            downloadUrl: photo.links.download_location,
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

/**
 * Поиск изображений на Pexels
 */
const searchPexels = async (
    query: string, 
    apiKey: string,
    log: LogFunction
): Promise<StockPhoto[]> => {
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
        { headers: { 'Authorization': apiKey } }
    );

    if (!response.ok) {
        if (response.status === 429) {
            const errorMsg = 'Rate limit exceeded';
            blockKey('pexels', errorMsg);
            log({ type: 'error', message: `❌ Pexels заблокирован на 1 час: ${errorMsg}` });
        }
        throw new Error(`Pexels API error: ${response.status}`);
    }

    const data = await response.json();
    
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

/**
 * Обрезает и масштабирует изображение до 16:9 (1024x576)
 */
const cropToAspectRatio = async (imageUrl: string, log: LogFunction): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new (window as any).Image();
        img.crossOrigin = 'anonymous';
        
        const timeout = setTimeout(() => reject(new Error('Image load timeout (5s)')), 5000);
        
        img.onload = () => {
            clearTimeout(timeout);
            const canvas = (window as any).document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error('Failed to get canvas context'));
            
            const targetWidth = 1024;
            const targetHeight = 576; // 16:9
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            
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
        
        const response = await fetch('/api/download-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: photo.downloadUrl, source: photo.source, apiKey: apiKey })
        });

        if (!response.ok) {
            let errorDetails = `Proxy endpoint error: ${response.status}`;
            let errorData = null;
            
            try {
                errorData = await response.json();
                errorDetails += ` - ${errorData.message || JSON.stringify(errorData)}`;
                log({ type: 'error', message: 'Ошибка от прокси-сервера', data: { 
                    status: response.status,
                    statusText: response.statusText,
                    error: errorData,
                    url: photo.downloadUrl,
                    source: photo.source,
                    photographer: photo.photographer
                } });
            } catch (e) {
                // If JSON parsing fails, try to get text
                try {
                    const textError = await response.text();
                    errorDetails += ` - ${textError}`;
                    log({ type: 'error', message: 'Не удалось распарсить ошибку от прокси (текст)', data: { 
                        status: response.status,
                        statusText: response.statusText,
                        text: textError,
                        url: photo.downloadUrl,
                        source: photo.source
                    } });
                } catch (textError) {
                    errorDetails += ` - Unable to read error response`;
                    log({ type: 'error', message: 'Не удалось прочитать ошибку от прокси', data: { 
                        status: response.status,
                        statusText: response.statusText,
                        url: photo.downloadUrl,
                        source: photo.source
                    } });
                }
            }
            throw new Error(errorDetails);
        }
        const { base64 } = await response.json();
        if (!base64) throw new Error('No base64 data received from proxy');
        
        const croppedBase64 = await cropToAspectRatio(base64, log);
        
        log({ 
            type: 'response', 
            message: `✅ Фото скачано и обработано через proxy`,
            data: {
                photographer: photo.photographer,
                source: photo.source,
                originalUrl: photo.url,
                downloadUrl: photo.downloadUrl
            }
        });
        return croppedBase64;
        
    } catch (error) {
        log({ 
            type: 'error', 
            message: '❌ Не удалось скачать фото, используем placeholder', 
            data: {
                error: error instanceof Error ? error.message : error,
                photographer: photo.photographer,
                source: photo.source,
                downloadUrl: photo.downloadUrl,
                stack: error instanceof Error ? error.stack : undefined
            }
        });
        return PLACEHOLDER_BASE64;
    }
};

/**
 * Умный поиск стоковых фото с fallback между сервисами
 */
export const searchStockPhotos = async (
    rawPrompt: string,
    userApiKeys: StockPhotoApiKeys,
    geminiApiKey: string,
    preferredService: 'unsplash' | 'pexels' | 'auto',
    log: LogFunction
): Promise<StockPhoto[]> => {
    try {
        const { getStockPhotoKeys } = await import('../config/appConfig');
        const finalKeys = getStockPhotoKeys(userApiKeys);
        
        log({ type: 'info', message: `Используются ключи: Unsplash=${finalKeys.unsplash ? '✅' : '❌'}, Pexels=${finalKeys.pexels ? '✅' : '❌'}` });
        
        const simplifiedPrompt = await simplifyPromptForStock(rawPrompt, geminiApiKey, log);
        const finalQuery = await translateToEnglish(simplifiedPrompt, geminiApiKey, log);
        
        const servicesToTry: ('unsplash' | 'pexels')[] = [];
        if (preferredService === 'unsplash') {
            if (finalKeys.unsplash) servicesToTry.push('unsplash');
            if (finalKeys.pexels) servicesToTry.push('pexels');
        } else if (preferredService === 'pexels') {
            if (finalKeys.pexels) servicesToTry.push('pexels');
            if (finalKeys.unsplash) servicesToTry.push('unsplash');
        } else { // auto
            if (finalKeys.unsplash) servicesToTry.push('unsplash');
            if (finalKeys.pexels) servicesToTry.push('pexels');
        }
        
        for (const service of servicesToTry) {
            try {
                log({ type: 'info', message: `🔍 Поиск на ${service}...` });
                const photos = service === 'unsplash' 
                    ? await searchUnsplash(finalQuery, finalKeys.unsplash!, log)
                    : await searchPexels(finalQuery, finalKeys.pexels!, log);
                if (photos.length > 0) return photos;
                log({ type: 'warning', message: `⚠️ ${service} не нашёл результатов.` });
            } catch (error) {
                log({ type: 'warning', message: `❌ Ошибка ${service}, пробуем следующий сервис...`, data: error });
            }
        }
        
        throw new Error('❌ Не удалось найти изображения ни на одном стоковом сервисе');
        
    } catch (error) {
        log({ type: 'error', message: 'Ошибка поиска стоковых фото', data: error });
        throw error;
    }
};