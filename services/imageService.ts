// services/imageService.ts (ПРАВИЛЬНАЯ ВЕРСЯ БЕЗ КОНФЛИКТОВ)

import { GoogleGenAI, GenerateContentResponse, Modality } from "@google/genai";
import type { LogEntry, YoutubeThumbnail, TextOptions, ThumbnailDesignConcept, ImageMode, GeneratedImage, ApiKeys as AllApiKeys } from '../types';
import { drawCanvas } from './canvasUtils';
import { withRetries, LogFunction, RetryConfig, withQueueAndRetries } from './geminiService';
import { searchStockPhotos, downloadStockPhoto } from './stockPhotoService';
import { appConfig } from '../config/appConfig';

type ApiKeys = { 
  gemini: string; 
  unsplash?: string; 
  pexels?: string; 
};

// --- START: Gemini Image Service Circuit Breaker ---
interface GeminiCircuitBreakerState {
    isTripped: boolean;
    consecutiveFailures: number;
    lastFailureTimestamp: number;
}

const CONSECUTIVE_FAILURE_THRESHOLD = 3;
export const COOL_DOWN_PERIOD_MS = 5 * 60 * 1000; // 5 minutes

let circuitBreakerState: GeminiCircuitBreakerState = {
    isTripped: false,
    consecutiveFailures: 0,
    lastFailureTimestamp: 0,
};

export const getGeminiImageStatus = (): Readonly<GeminiCircuitBreakerState> => {
    if (circuitBreakerState.isTripped && Date.now() > circuitBreakerState.lastFailureTimestamp + COOL_DOWN_PERIOD_MS) {
        resetGeminiCircuitBreaker();
    }
    return circuitBreakerState;
};

const recordGeminiFailure = () => {
    circuitBreakerState.consecutiveFailures++;
    circuitBreakerState.lastFailureTimestamp = Date.now();
    if (circuitBreakerState.consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD) {
        circuitBreakerState.isTripped = true;
    }
};

const recordGeminiSuccess = () => {
    circuitBreakerState.consecutiveFailures = 0;
};

export const resetGeminiCircuitBreaker = () => {
    circuitBreakerState = {
        isTripped: false,
        consecutiveFailures: 0,
        lastFailureTimestamp: 0,
    };
};
// --- END: Circuit Breaker ---

const getAiClient = (apiKey: string | undefined, log: LogFunction) => {
  const finalApiKey = apiKey || appConfig.geminiApiKey;
  if (!finalApiKey) {
    const errorMsg = "❌ Gemini API ключ не настроен. Добавьте ключ в настройках.";
    log({ type: 'error', message: errorMsg });
    throw new Error(errorMsg);
  }
  return new GoogleGenAI({ apiKey: finalApiKey });
};

const STYLE_PROMPT_SUFFIX = ", cinematic, hyperrealistic, 8k, dramatic lighting, lovecraftian horror, ultra-detailed, wide angle shot, mysterious atmosphere";

// ============================================================================
// ГЛАВНАЯ ФУНКЦИЯ ГЕНЕРАЦИИ/ПОИСКА ОДНОГО ИЗОБРАЖЕНИЯ
// ============================================================================

export const regenerateSingleImage = async (
    prompt: string, 
    log: LogFunction, 
    apiKeys: AllApiKeys, 
    imageMode: ImageMode = 'generate',
    stockPhotoPreference: 'unsplash' | 'pexels' | 'auto' = 'auto'
): Promise<GeneratedImage> => {
    const fullPrompt = prompt + STYLE_PROMPT_SUFFIX;
    const status = getGeminiImageStatus();
    const canUseGemini = imageMode === 'generate' && !status.isTripped;
    
    let geminiAttempted = false;
    let geminiFailed = false;
    
    // РЕЖИМ 1: Сначала пробуем Gemini, если разрешено
    if (canUseGemini) {
        geminiAttempted = true;
        try {
            log({ type: 'request', message: `Запрос изображения от Gemini` });
            const ai = getAiClient(apiKeys.gemini, log);
            
            const generateCall = () => ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: {
                    parts: [{ text: fullPrompt }],
                },
                config: {
                    responseModalities: [Modality.IMAGE],
                },
            });
    
            const requestKey = `image-gen-${prompt.slice(0, 50)}`;
            const response: GenerateContentResponse = await withQueueAndRetries(
                generateCall, 
                log, 
                { retries: 3, initialDelay: 10000 }, // Retry after 10s for 429 errors
                'image', 
                15000, // Wait 15s between image requests to be safer on low rate limits
                requestKey
            );
            
            let base64Image: string | undefined;

            if (response?.candidates?.[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData?.data) {
                        base64Image = part.inlineData.data;
                        break;
                    }
                }
            }
            
            if (base64Image) {
                log({ type: 'response', message: 'Изображение создано через Gemini (Flash Image)' });
                recordGeminiSuccess(); // Сообщаем об успехе
                return {
                    url: `data:image/png;base64,${base64Image}`,
                    source: 'generated'
                };
            }
            throw new Error("No image data in Gemini Flash Image response");
    
        } catch (geminiError: any) {
            geminiFailed = true;
            recordGeminiFailure(); // Сообщаем о провале
            const updatedStatus = getGeminiImageStatus();
            
            if (updatedStatus.isTripped) {
                log({ type: 'error', message: `❌ Gemini отключен на 5 минут из-за ${updatedStatus.consecutiveFailures} ошибок подряд. Переключаемся на стоковые фото.`, showToUser: true, data: geminiError });
            } else {
                 log({ type: 'warning', message: `Ошибка генерации Gemini (попытка ${updatedStatus.consecutiveFailures}/${CONSECUTIVE_FAILURE_THRESHOLD}). Переключаемся на стоковые фото...`, data: geminiError });
            }
        }
    } else if (imageMode === 'generate' && status.isTripped) {
        log({ type: 'warning', message: '⚠️ Gemini временно отключен из-за ошибок. Используем стоковые фото.', showToUser: true });
    }

    // РЕЖИМ 2: Стоковые фото (как основной режим или fallback)
    try {
        // FIX: Determine the correct stock photo service to use. 
        // When imageMode is 'generate', it should fallback to the user's stock photo preference.
        // The searchStockPhotos function does not accept 'generate' as a parameter.
        const preferredStockService = (imageMode === 'generate' || imageMode === 'auto')
            ? stockPhotoPreference
            : imageMode;

        // Determine if this is a fallback call from Gemini or a direct stock photo request
        const isFallbackFromGemini = geminiAttempted && geminiFailed;
        
        const photos = await searchStockPhotos(
            prompt,
            { unsplash: apiKeys.unsplash, pexels: apiKeys.pexels },
            apiKeys.gemini || '', 
            preferredStockService,
            log,
            isFallbackFromGemini  // allowFallback=true only when coming from Gemini failure
        );
        
        if (photos.length > 0) {
            const sourceText = isFallbackFromGemini ? '(fallback от Gemini)' : '(прямой поиск)';
            log({ type: 'response', message: `✅ Изображение найдено на стоковом сервисе ${sourceText}` });
            const base64 = await downloadStockPhoto(photos[0], { unsplash: apiKeys.unsplash, pexels: apiKeys.pexels }, log);
            return {
                url: base64,
                photographer: photos[0].photographer,
                photographerUrl: photos[0].photographerUrl,
                source: photos[0].source,
                license: photos[0].license
            };
        }
        throw new Error('Не удалось найти подходящие стоковые фото.');
    } catch (stockError) {
        log({ type: 'error', message: 'Все методы получения изображения провалились.' });
        throw new Error('❌ Не удалось получить изображение ни одним способом.');
    }
};

// ============================================================================
// ГЕНЕРАЦИЯ НЕСКОЛЬКИХ ИЗОБРАЖЕНИЙ
// ============================================================================

export const generateStyleImages = async (
    prompts: string[], 
    imageCount: number, 
    log: LogFunction, 
    apiKeys: AllApiKeys, 
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

    const imagePromises = finalPrompts.map((prompt, i) => 
        regenerateSingleImage(prompt, log, apiKeys, imageMode, stockPhotoPreference)
            .then(imageData => {
                log({ type: 'info', message: `Изображение ${i + 1}/${targetImageCount} успешно получено (${imageData.source}).` });
                return { status: 'fulfilled', value: imageData } as const;
            })
            .catch(error => {
                log({ type: 'error', message: `Не удалось получить изображение ${i + 1}. Пропуск.`, data: error });
                return { status: 'rejected', reason: error } as const;
            })
    );
    
    const results = await Promise.all(imagePromises);

    const generatedImages = results.reduce<GeneratedImage[]>((acc, result) => {
        if (result.status === 'fulfilled') {
            acc.push(result.value);
        }
        return acc;
    }, []);

    return generatedImages;
};

export const generateMoreImages = async (
    prompts: string[], 
    log: LogFunction, 
    apiKeys: AllApiKeys, 
    imageMode: ImageMode = 'generate',
    stockPhotoPreference: 'unsplash' | 'pexels' | 'gemini' | 'none' | 'auto' = 'auto'
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

    const imagePromises = selectedPrompts.map((prompt, i) => 
        regenerateSingleImage(prompt, log, apiKeys, imageMode, stockPhotoPreference)
            .then(imageData => {
                log({ type: 'info', message: `Дополнительное изображение ${i + 1}/${targetImageCount} успешно получено (${imageData.source}).` });
                return { status: 'fulfilled', value: imageData } as const;
            })
            .catch(error => {
                log({ type: 'error', message: `Не удалось получить дополнительное изображение ${i + 1}. Пропуск.`, data: error });
                return { status: 'rejected', reason: error } as const;
            })
    );
    
    const results = await Promise.all(imagePromises);
    
    const generatedImages = results.reduce<GeneratedImage[]>((acc, result) => {
        if (result.status === 'fulfilled') {
            acc.push(result.value);
        }
        return acc;
    }, []);
    
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
        img.onerror = (e: any) => {
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