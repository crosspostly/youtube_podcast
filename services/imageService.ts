// services/imageService.ts (ПРАВИЛЬНАЯ ВЕРСИЯ БЕЗ КОНФЛИКТОВ)

import { GoogleGenAI, Modality, GenerateContentResponse } from "@google/genai";
import type { LogEntry, YoutubeThumbnail, TextOptions, ThumbnailDesignConcept, ImageMode, GeneratedImage } from '../types';
import { drawCanvas } from './canvasUtils';
import { withRetries, ApiRequestQueue, LogFunction, RetryConfig } from './geminiService';
import { searchStockPhotos, downloadStockPhoto } from './stockPhotoService';

type ApiKeys = { 
  gemini: string; 
  openRouter: string; 
  unsplash?: string; 
  pexels?: string; 
};

// --- START: Image-specific Request Queue ---
let imageQueue: ApiRequestQueue | null = null;

const getImageQueue = (log: LogFunction): ApiRequestQueue => {
    if (!imageQueue) {
        imageQueue = new ApiRequestQueue(log, 65000);
        log({ type: 'info', message: 'Image generation API request queue initialized (65s delay)' });
    }
    return imageQueue;
};

const withImageQueueAndRetries = async <T>(fn: () => Promise<T>, log: LogFunction, config: RetryConfig = {}, requestKey?: string): Promise<T> => {
    const queue = getImageQueue(log);
    return await queue.add(() => withRetries(fn, log, config), requestKey);
};
// --- END: Image-specific Request Queue ---

const getAiClient = (apiKey: string | undefined, log: LogFunction) => {
  const finalApiKey = apiKey || process.env.API_KEY;
  if (!finalApiKey) {
    const errorMsg = "Ключ API Gemini не настроен. Убедитесь, что переменная окружения API_KEY установлена, или введите ключ в настройках.";
    log({ type: 'error', message: errorMsg });
    throw new Error(errorMsg);
  }
  return new GoogleGenAI({ apiKey: finalApiKey });
};

const STYLE_PROMPT_SUFFIX = ", cinematic, hyperrealistic, 8k, dramatic lighting, lovecraftian horror, ultra-detailed, wide angle shot, mysterious atmosphere";

const generateWithOpenRouter = async (prompt: string, log: LogFunction, openRouterApiKey: string): Promise<string> => {
    log({ type: 'request', message: `Fallback: Запрос изображения от OpenRouter (Flux)`, data: { prompt } });
    
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${openRouterApiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/crosspostly/youtube_podcast",
            "X-Title": "AI Podcast Studio"
        },
        body: JSON.stringify({
            "model": "black-forest-labs/flux-1.1-pro",
            "messages": [{
                "role": "user",
                "content": [{ "type": "text", "text": `Generate an image: ${prompt}` }]
            }],
            "max_tokens": 1024,
            "temperature": 0.7
        })
    });

    if (!response.ok) {
        const errorBody = await response.text();
        log({ type: 'error', message: `OpenRouter API error`, data: { status: response.status, body: errorBody } });
        throw new Error(`OpenRouter error: ${response.status} - ${errorBody}`);
    }

    const data = await response.json();
    const imageContent = data.choices?.[0]?.message?.content;
    
    if (!imageContent) {
        throw new Error("No image data in OpenRouter response");
    }
    
    if (imageContent.startsWith('http')) {
        const imgResponse = await fetch(imageContent);
        const blob = await imgResponse.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
    }
    
    return `data:image/png;base64,${imageContent}`;
};

// ============================================================================
// ГЛАВНАЯ ФУНКЦИЯ ГЕНЕРАЦИИ/ПОИСКА ОДНОГО ИЗОБРАЖЕНИЯ
// ============================================================================

export const regenerateSingleImage = async (
    prompt: string, 
    log: LogFunction, 
    apiKeys: ApiKeys, 
    imageMode: ImageMode = 'generate',
    stockPhotoPreference: 'unsplash' | 'pexels' | 'auto' = 'auto'
): Promise<GeneratedImage> => {
    const fullPrompt = prompt + STYLE_PROMPT_SUFFIX;
    
    // РЕЖИМ 1: Подбор стоковых фото
    if (imageMode === 'unsplash' || imageMode === 'pexels' || imageMode === 'auto') {
        try {
            let preferredService: 'unsplash' | 'pexels' | 'auto';
            
            if (imageMode === 'auto') {
                preferredService = stockPhotoPreference;
            } else {
                preferredService = imageMode === 'unsplash' ? 'unsplash' : 'pexels';
            }
            
            const photos = await searchStockPhotos(
                prompt,
                { unsplash: apiKeys.unsplash, pexels: apiKeys.pexels },
                apiKeys.gemini,
                preferredService,
                log
            );
            
            if (photos.length > 0) {
                log({ type: 'response', message: `✅ Изображение найдено на ${photos[0].source}` });
                const base64 = await downloadStockPhoto(photos[0], log);
                return {
                    url: base64,
                    photographer: photos[0].photographer,
                    photographerUrl: photos[0].photographerUrl,
                    source: photos[0].source,
                    license: photos[0].license
                };
            }
        } catch (error) {
            log({ type: 'warning', message: 'Стоковые фото не найдены, переключаемся на генерацию...', data: error });
            // Продолжаем к AI генерации (fallback)
        }
    }
    
    // РЕЖИМ 2: AI Генерация (Попытка 1: Gemini)
    try {
        log({ type: 'request', message: `Запрос изображения от Gemini` });
        const ai = getAiClient(apiKeys.gemini, log);
        
        const generateCall = () => ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [{ text: fullPrompt }] },
            config: { responseModalities: [Modality.IMAGE] },
        });

        const response = await withImageQueueAndRetries(generateCall, log, { retries: 2 });
        
        const part = response?.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (part?.inlineData) {
            log({ type: 'response', message: 'Изображение создано через Gemini' });
            const base64Image: string = part.inlineData.data;
            return {
                url: `data:image/png;base64,${base64Image}`,
                source: 'generated'
            };
        }
        throw new Error("No image data in Gemini response");

    } catch (geminiError: any) {
        log({ type: 'warning', message: `Gemini failed, trying OpenRouter...`, data: geminiError });
        
        // FALLBACK 1: OpenRouter
        if (apiKeys.openRouter) {
            try {
                const result = await generateWithOpenRouter(fullPrompt, log, apiKeys.openRouter);
                log({ type: 'response', message: 'Изображение создано через OpenRouter' });
                return {
                    url: result,
                    source: 'generated'
                };
            } catch (openRouterError: any) {
                log({ type: 'warning', message: `OpenRouter failed, trying stock photos...`, data: openRouterError });
                
                // FALLBACK 2: Стоковые фото (финальный fallback)
                try {
                    const photos = await searchStockPhotos(
                        prompt,
                        { unsplash: apiKeys.unsplash, pexels: apiKeys.pexels },
                        apiKeys.gemini,
                        'auto',
                        log
                    );
                    
                    if (photos.length > 0) {
                        log({ type: 'response', message: '✅ Изображение найдено на стоковом сервисе (fallback)' });
                        const base64 = await downloadStockPhoto(photos[0], log);
                        return {
                            url: base64,
                            photographer: photos[0].photographer,
                            photographerUrl: photos[0].photographerUrl,
                            source: photos[0].source,
                            license: photos[0].license
                        };
                    }
                } catch (stockError) {
                    log({ type: 'error', message: 'Все методы получения изображения провалились' });
                    throw new Error('❌ Не удалось получить изображение ни одним способом');
                }
            }
        }
        
        throw geminiError;
    }
};

// ============================================================================
// ГЕНЕРАЦИЯ НЕСКОЛЬКИХ ИЗОБРАЖЕНИЙ
// ============================================================================

export const generateStyleImages = async (
    prompts: string[], 
    imageCount: number, 
    log: LogFunction, 
    apiKeys: ApiKeys, 
    imageMode: ImageMode = 'generate',
    stockPhotoPreference: 'unsplash' | 'pexels' | 'auto' = 'auto'
): Promise<GeneratedImage[]> => {
    const targetImageCount = imageCount > 0 ? imageCount : 3;
    let finalPrompts = [...prompts];
    if (finalPrompts.length === 0) {
         log({ type: 'info', message: 'Промпты для изображений не предоставлены, пропуск генерации.' });
        return [];
    }
    while (finalPrompts.length < targetImageCount) {
        finalPrompts.push(...prompts.slice(0, targetImageCount - finalPrompts.length));
    }
    finalPrompts = finalPrompts.slice(0, targetImageCount);

    const generatedImages: GeneratedImage[] = [];
    for (const [i, prompt] of finalPrompts.entries()) {
        try {
            const imageData = await regenerateSingleImage(prompt, log, apiKeys, imageMode, stockPhotoPreference);
            log({ type: 'info', message: `Изображение ${i + 1}/${targetImageCount} успешно получено (${imageData.source}).` });
            generatedImages.push(imageData);
        } catch (error) {
            log({ type: 'error', message: `Не удалось получить изображение ${i + 1}. Пропуск.`, data: error });
            // Continue to the next image
        }
    }

    return generatedImages;
};

export const generateMoreImages = async (
    prompts: string[], 
    log: LogFunction, 
    apiKeys: ApiKeys, 
    imageMode: ImageMode = 'generate',
    stockPhotoPreference: 'unsplash' | 'pexels' | 'auto' = 'auto'
): Promise<GeneratedImage[]> => {
    const targetImageCount = 5;
    if (prompts.length === 0) {
        log({ type: 'info', message: 'Нет промптов для генерации дополнительных изображений.' });
        return [];
    }

    const selectedPrompts = [];
    for (let i = 0; i < targetImageCount; i++) {
        selectedPrompts.push(prompts[Math.floor(Math.random() * prompts.length)]);
    }

    const generatedImages: GeneratedImage[] = [];
    for (const [i, prompt] of selectedPrompts.entries()) {
        try {
            const imageData = await regenerateSingleImage(prompt, log, apiKeys, imageMode, stockPhotoPreference);
            log({ type: 'info', message: `Дополнительное изображение ${i + 1}/${targetImageCount} успешно получено (${imageData.source}).` });
            generatedImages.push(imageData);
        } catch (error) {
            log({ type: 'error', message: `Не удалось получить дополнительное изображение ${i + 1}. Пропуск.`, data: error });
            // Continue to the next image
        }
    }
    
    return generatedImages;
};

// ============================================================================
// CANVAS-BASED THUMBNAIL GENERATION
// ============================================================================

export const generateYoutubeThumbnails = async (
    baseImageSrc: string, 
    title: string, 
    designConcepts: ThumbnailDesignConcept[], 
    log: LogFunction,
    defaultFont?: string
): Promise<YoutubeThumbnail[]> => {
    if (!baseImageSrc) {
        log({ type: 'info', message: 'Базовое изображение для обложки отсутствует, пропуск.' });
        return [];
    }
    log({ type: 'info', message: 'Создание обложек для YouTube по AI-концепциям...' });

    const img = new (window as any).Image();
    img.crossOrigin = "anonymous";
    
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = (e) => {
            log({type: 'error', message: "Не удалось загрузить базовое изображение для Canvas.", data: e});
            reject(new Error("Не удалось загрузить базовое изображение для обложки."));
        };
        img.src = baseImageSrc;
    });

    const canvas = (window as any).document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Не удалось получить 2D-контекст холста.");

    const results: YoutubeThumbnail[] = [];
    for (const concept of designConcepts) {
        const options: TextOptions = {
            text: title,
            fontFamily: defaultFont || concept.fontFamily || 'Impact',
            fontSize: concept.fontSize || 90,
            fillStyle: concept.textColor || '#FFFFFF',
            textAlign: 'center',
            position: { x: canvas.width / 2, y: canvas.height / 2 },
            shadow: {
                color: concept.shadowColor || 'rgba(0,0,0,0.8)',
                blur: 15,
                offsetX: 5,
                offsetY: 5
            },
            overlayColor: `rgba(0,0,0,${concept.overlayOpacity || 0.4})`,
            textTransform: concept.textTransform || 'uppercase',
            strokeColor: concept.strokeColor,
            strokeWidth: concept.strokeWidth,
            gradientColors: concept.gradientColors,
        };
        
        await drawCanvas(ctx, img as any, options);
        
        results.push({
            styleName: concept.name,
            dataUrl: canvas.toDataURL('image/png'),
            options: options
        });
    }

    log({ type: 'response', message: 'Обложки по AI-концепциям успешно созданы.' });
    return results;
};