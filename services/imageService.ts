import { GoogleGenAI, Modality } from "@google/genai";
import type { LogEntry, YoutubeThumbnail, TextOptions, ThumbnailDesignConcept } from '../types';
import { drawCanvas } from './canvasUtils';
import { withRetries } from './geminiService';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;

const getAiClient = (log: LogFunction, customApiKey?: string) => {
  const apiKey = customApiKey || process.env.API_KEY;
  if (!apiKey) {
    const errorMsg = "Ключ API не настроен. Убедитесь, что переменная окружения API_KEY установлена или введен пользовательский ключ.";
    log({ type: 'error', message: errorMsg });
    throw new Error(errorMsg);
  }
  return new GoogleGenAI({ apiKey });
};

const STYLE_PROMPT_SUFFIX = ", cinematic, hyperrealistic, 8k, dramatic lighting, lovecraftian horror, ultra-detailed, wide angle shot, mysterious atmosphere";

const generateSingleImageWithOpenRouter = async (prompt: string, log: LogFunction, openRouterApiKey: string): Promise<string> => {
    log({ type: 'info', message: 'Попытка генерации изображения через OpenRouter (SDXL)...' });
    const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/images/generations";
    const fullPrompt = prompt + STYLE_PROMPT_SUFFIX;

    try {
        log({ type: 'request', message: `Запрос изображения от OpenRouter`, data: { prompt: fullPrompt } });
        const response = await fetch(OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${openRouterApiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://studio.ai.google/',
                'X-Title': 'Mystic Narratives AI',
            },
            body: JSON.stringify({
                model: "stabilityai/sdxl",
                prompt: fullPrompt,
                n: 1,
                size: "1344x768"
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`OpenRouter API error (${response.status}): ${errorData.error?.message || 'Unknown error'}`);
        }

        const result = await response.json();
        const base64Image = result.data[0]?.b64_json;
        if (!base64Image) throw new Error("Не удалось получить base64 данные изображения из ответа OpenRouter.");
        
        log({ type: 'response', message: `Изображение успешно сгенерировано через OpenRouter` });
        return `data:image/png;base64,${base64Image}`;
    } catch (error) {
         log({ type: 'error', message: `Не удалось сгенерировать изображение через OpenRouter`, data: error });
         throw error;
    }
};

export const regenerateSingleImage = async (prompt: string, log: LogFunction, geminiApiKey?: string, openRouterApiKey?: string): Promise<string> => {
    const fullPrompt = prompt + STYLE_PROMPT_SUFFIX;
    try {
        log({ type: 'request', message: `Запрос одного изображения от gemini-2.5-flash-image`, data: { prompt: fullPrompt } });
        const ai = getAiClient(log, geminiApiKey);
        
        const generateCall = () => ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [{ text: fullPrompt }],
            },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        });

        const response = await withRetries(generateCall, log);

        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                const base64Image: string = part.inlineData.data;
                return `data:image/png;base64,${base64Image}`;
            }
        }
        throw new Error("Не удалось найти данные изображения в ответе модели.");

    } catch (error: any) {
        const errorMessage = (error?.message || '').toLowerCase();
        const isQuotaError = errorMessage.includes('quota') || errorMessage.includes('resource has been exhausted');
        log({ type: 'error', message: `Ошибка при генерации одного изображения через Gemini`, data: error });

        if (isQuotaError && openRouterApiKey) {
            log({ type: 'info', message: 'Квота Gemini исчерпана. Переключаюсь на OpenRouter.' });
            return generateSingleImageWithOpenRouter(prompt, log, openRouterApiKey);
        } else if (isQuotaError) {
             throw new Error("Квота генерации изображений исчерпана. Добавьте API-ключ OpenRouter.");
        }
        throw error;
    }
};

export const generateStyleImages = async (prompts: string[], log: LogFunction, geminiApiKey?: string, openRouterApiKey?: string): Promise<string[]> => {
    const targetImageCount = 3;
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
    for (let i = 0; i < finalPrompts.length; i++) {
        try {
            const imageSrc = await regenerateSingleImage(finalPrompts[i], log, geminiApiKey, openRouterApiKey);
            generatedImages.push(imageSrc);
             log({ type: 'info', message: `Изображение ${i + 1}/${targetImageCount} успешно сгенерировано.` });
        } catch (error) {
            log({ type: 'error', message: `Не удалось сгенерировать изображение ${i + 1}. Пропуск.`, data: error });
        }
    }
    return generatedImages;
};

export const generateMoreImages = async (prompts: string[], log: LogFunction, geminiApiKey?: string, openRouterApiKey?: string): Promise<string[]> => {
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
    for (let i = 0; i < selectedPrompts.length; i++) {
        try {
            const imageSrc = await regenerateSingleImage(selectedPrompts[i], log, geminiApiKey, openRouterApiKey);
            generatedImages.push(imageSrc);
            log({ type: 'info', message: `Дополнительное изображение ${i + 1}/${targetImageCount} успешно сгенерировано.` });
        } catch (error) {
            log({ type: 'error', message: `Не удалось сгенерировать дополнительное изображение ${i + 1}. Пропуск.`, data: error });
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

    const img = new Image();
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

    const canvas = document.createElement('canvas');
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
        await drawCanvas(ctx, img, options);
        
        results.push({
            styleName: concept.name,
            dataUrl: canvas.toDataURL('image/png'),
            options: options
        });
    }

    log({ type: 'response', message: 'Обложки по AI-концепциям успешно созданы.' });
    return results;
};
