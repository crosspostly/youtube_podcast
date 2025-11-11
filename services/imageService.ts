import { GoogleGenAI } from "@google/genai";
import type { LogEntry, YoutubeThumbnail, TextOptions } from '../types';
import { drawCanvas } from './canvasUtils';

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

const generateImagesWithOpenRouter = async (prompts: string[], log: LogFunction, openRouterApiKey: string): Promise<string[]> => {
    log({ type: 'info', message: 'Попытка генерации изображений через OpenRouter (SDXL)...' });
    const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/images/generations";
    
    const generatedImages: string[] = [];

    for (let i = 0; i < prompts.length; i++) {
        const fullPrompt = prompts[i] + STYLE_PROMPT_SUFFIX;
        try {
            log({ type: 'request', message: `Запрос изображения ${i + 1}/${prompts.length} от OpenRouter`, data: { prompt: fullPrompt } });
            const response = await fetch(OPENROUTER_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${openRouterApiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://studio.ai.google/', // Recommended by OpenRouter
                    'X-Title': 'Mystic Narratives AI', // Recommended by OpenRouter
                },
                body: JSON.stringify({
                    model: "stabilityai/sdxl",
                    prompt: fullPrompt,
                    n: 1,
                    size: "1344x768" // Aspect ratio close to 16:9
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`OpenRouter API error (${response.status}): ${errorData.error?.message || 'Unknown error'}`);
            }

            const result = await response.json();
            const base64Image = result.data[0]?.b64_json;

            if (!base64Image) {
                throw new Error("Не удалось получить base64 данные изображения из ответа OpenRouter.");
            }

            log({ type: 'response', message: `Изображение ${i + 1} успешно сгенерировано через OpenRouter` });
            generatedImages.push(`data:image/png;base64,${base64Image}`);

        } catch (error) {
             log({ type: 'error', message: `Не удалось сгенерировать изображение ${i + 1} через OpenRouter`, data: error });
        }
    }
    return generatedImages;
};


export const generateStyleImages = async (prompts: string[], log: LogFunction, geminiApiKey?: string, openRouterApiKey?: string): Promise<string[]> => {
    const targetImageCount = 10;
    let finalPrompts = [...prompts];
    if (finalPrompts.length === 0) {
         log({ type: 'info', message: 'Промпты для изображений не предоставлены, пропуск генерации.' });
        return [];
    }
    while (finalPrompts.length < targetImageCount) {
        finalPrompts.push(...prompts.slice(0, targetImageCount - finalPrompts.length));
    }
    finalPrompts = finalPrompts.slice(0, targetImageCount);

    // --- Primary Generation (Google Imagen) ---
    try {
        log({ type: 'info', message: `Начало генерации ${targetImageCount} изображений через Google Imagen...` });
        const ai = getAiClient(log, geminiApiKey);
        const model = 'imagen-4.0-generate-001';
        
        const generatedImages: string[] = [];
        for (let i = 0; i < finalPrompts.length; i++) {
            const prompt = finalPrompts[i];
            const fullPrompt = prompt + STYLE_PROMPT_SUFFIX;
            log({ type: 'request', message: `Запрос изображения ${i + 1}/${targetImageCount} от ${model}`, data: { prompt: fullPrompt } });
            const response = await ai.models.generateImages({
                model,
                prompt: fullPrompt,
                config: {
                    numberOfImages: 1,
                    outputMimeType: 'image/jpeg',
                    aspectRatio: '16:9',
                },
            });
            const base64Image = response.generatedImages[0].image.imageBytes;
            log({ type: 'response', message: `Изображение ${i + 1} успешно сгенерировано` });
            generatedImages.push(`data:image/jpeg;base64,${base64Image}`);
        }
        log({ type: 'info', message: `Генерация изображений через Imagen завершена.` });
        return generatedImages;

    } catch (error: any) {
        const errorMessage = (error?.message || '').toLowerCase();
        const isQuotaError = errorMessage.includes('quota') || errorMessage.includes('resource has been exhausted');

        log({ type: 'error', message: `Ошибка при генерации через Google Imagen`, data: error });

        if (isQuotaError && openRouterApiKey) {
            log({ type: 'info', message: 'Квота Imagen исчерпана. Переключаюсь на OpenRouter в качестве fallback.' });
            return generateImagesWithOpenRouter(finalPrompts, log, openRouterApiKey);
        } else if (isQuotaError) {
             log({ type: 'error', message: 'Квота Imagen исчерпана, но ключ OpenRouter не предоставлен. Генерация изображений остановлена.' });
             throw new Error("Квота генерации изображений исчерпана. Добавьте API-ключ OpenRouter в настройках для продолжения.");
        } else {
            // Re-throw if it's not a quota error
            throw error;
        }
    }
};


// --- CANVAS-BASED THUMBNAIL GENERATION ---

interface ThumbnailStylePreset {
    name: string;
    options: Omit<TextOptions, 'text' | 'position'>;
}

const thumbnailStylePresets: ThumbnailStylePreset[] = [
    {
        name: "Неоновый Ужас",
        options: {
            fontFamily: "'Impact', 'Arial Black', sans-serif",
            fontSize: 90,
            fillStyle: '#00ffff',
            textAlign: 'center',
            shadow: { color: '#00ffff', blur: 20, offsetX: 0, offsetY: 0 },
            overlayColor: 'rgba(0,0,0,0.2)',
        }
    },
    {
        name: "Классический Триллер",
        options: {
            fontFamily: "'Georgia', 'Times New Roman', serif",
            fontSize: 100,
            fillStyle: '#ffffff',
            textAlign: 'center',
            shadow: { color: 'rgba(0,0,0,0.8)', blur: 10, offsetX: 5, offsetY: 5 },
            overlayColor: 'rgba(0,0,0,0.5)',
        }
    },
    {
        name: "Современный Минимализм",
        options: {
            fontFamily: "'Helvetica', 'Arial', sans-serif",
            fontSize: 90,
            fillStyle: '#ffffff',
            textAlign: 'center',
            shadow: { color: 'transparent', blur: 0, offsetX: 0, offsetY: 0 },
            overlayColor: 'rgba(0,0,0,0.4)',
        }
    }
];


export const generateYoutubeThumbnails = (baseImageSrc: string, title: string, log: LogFunction): Promise<YoutubeThumbnail[]> => {
    return new Promise((resolve, reject) => {
        if (!baseImageSrc) {
            log({ type: 'info', message: 'Базовое изображение для обложки отсутствует, пропуск.' });
            return resolve([]);
        }
        log({ type: 'info', message: 'Создание шаблонов обложек для YouTube через Canvas...' });

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 1280;
            canvas.height = 720;
            const ctx = canvas.getContext('2d');
            if (!ctx) return reject(new Error("Не удалось получить 2D-контекст холста."));

            const results: YoutubeThumbnail[] = thumbnailStylePresets.map(preset => {
                const options: TextOptions = {
                    ...preset.options,
                    text: title.toUpperCase(),
                    position: { x: canvas.width / 2, y: canvas.height / 2 },
                };
                
                drawCanvas(ctx, img, options);
                
                return {
                    styleName: preset.name,
                    dataUrl: canvas.toDataURL('image/png'),
                    options: options
                };
            });

            log({ type: 'response', message: 'Шаблоны обложек успешно созданы.' });
            resolve(results);
        };
        img.onerror = (e) => {
            log({type: 'error', message: "Не удалось загрузить базовое изображение для Canvas.", data: e});
            reject(new Error("Не удалось загрузить базовое изображение для обложки."));
        };
        img.src = baseImageSrc;
    });
};