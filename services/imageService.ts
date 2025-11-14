import { GoogleGenAI, Modality, GenerateContentResponse } from "@google/genai";
import type { LogEntry, YoutubeThumbnail, TextOptions, ThumbnailDesignConcept } from '../types';
import { drawCanvas } from './canvasUtils';
import { withRetries, ApiRequestQueue, LogFunction, RetryConfig } from './geminiService';

type ApiKeys = { gemini: string; openRouter: string; };

// --- START: Image-specific Request Queue ---
// This queue ensures a delay between image generation requests
// to avoid hitting rate limits, without slowing down text generation.

let imageQueue: ApiRequestQueue | null = null;

const getImageQueue = (log: LogFunction): ApiRequestQueue => {
    if (!imageQueue) {
        imageQueue = new ApiRequestQueue(log, 65000); // 65,000ms = 65 seconds to be very safe with 2 RPM limits (60/2 = 30s + large buffer)
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


export const regenerateSingleImage = async (prompt: string, log: LogFunction, apiKeys: ApiKeys): Promise<string> => {
    const fullPrompt = prompt + STYLE_PROMPT_SUFFIX;
    
    // Попытка 1: Gemini
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
            return `data:image/png;base64,${part.inlineData.data}`;
        }
        throw new Error("No image data in Gemini response");

    } catch (geminiError: any) {
        log({ type: 'warning', message: `Gemini failed, trying OpenRouter...`, data: geminiError });
        
        // Попытка 2: OpenRouter
        if (apiKeys.openRouter) {
            try {
                const result = await generateWithOpenRouter(fullPrompt, log, apiKeys.openRouter);
                log({ type: 'response', message: 'Изображение создано через OpenRouter' });
                return result;
            } catch (openRouterError: any) {
                log({ type: 'error', message: `Оба провайдера недоступны` });
                throw new Error(`❌ Не удалось сгенерировать изображение. Gemini и OpenRouter недоступны.`);
            }
        }
        
        throw geminiError;
    }
};

export const generateStyleImages = async (prompts: string[], imageCount: number, log: LogFunction, apiKeys: ApiKeys): Promise<string[]> => {
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

    const generatedImages: string[] = [];
    for (const [i, prompt] of finalPrompts.entries()) {
        try {
            const imageSrc = await regenerateSingleImage(prompt, log, apiKeys);
            log({ type: 'info', message: `Изображение ${i + 1}/${targetImageCount} успешно сгенерировано.` });
            generatedImages.push(imageSrc);
        } catch (error) {
            log({ type: 'error', message: `Не удалось сгенерировать изображение ${i + 1}. Пропуск.`, data: error });
            // Continue to the next image
        }
    }

    return generatedImages;
};

export const generateMoreImages = async (prompts: string[], log: LogFunction, apiKeys: ApiKeys): Promise<string[]> => {
    const targetImageCount = 5;
    if (prompts.length === 0) {
        log({ type: 'info', message: 'Нет промптов для генерации дополнительных изображений.' });
        return [];
    }

    const selectedPrompts = [];
    for (let i = 0; i < targetImageCount; i++) {
        selectedPrompts.push(prompts[Math.floor(Math.random() * prompts.length)]);
    }

    const generatedImages: string[] = [];
    for (const [i, prompt] of selectedPrompts.entries()) {
        try {
            const imageSrc = await regenerateSingleImage(prompt, log, apiKeys);
            log({ type: 'info', message: `Дополнительное изображение ${i + 1}/${targetImageCount} успешно сгенерировано.` });
            generatedImages.push(imageSrc);
        } catch (error) {
            log({ type: 'error', message: `Не удалось сгенерировать дополнительное изображение ${i + 1}. Пропуск.`, data: error });
            // Continue to the next image
        }
    }
    
    return generatedImages;
};


// --- CANVAS-BASED THUMBNAIL GENERATION ---

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

    // FIX: Use `window.Image` to resolve missing DOM type error.
    const img = new (window as any).Image();
    img.crossOrigin = "anonymous";
    
    // Wrap image loading in a promise
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = (e) => {
            log({type: 'error', message: "Не удалось загрузить базовое изображение для Canvas.", data: e});
            reject(new Error("Не удалось загрузить базовое изображение для обложки."));
        };
        img.src = baseImageSrc;
    });

    // FIX: Use `window.document` to resolve missing DOM type error.
    const canvas = (window as any).document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Не удалось получить 2D-контекст холста.");

    const results: YoutubeThumbnail[] = [];
    for (const concept of designConcepts) {
        const options: TextOptions = {
            text: title,
            // Use default font if provided, otherwise use AI-suggested font
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
        
        // Drawing is now async because of font loading
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