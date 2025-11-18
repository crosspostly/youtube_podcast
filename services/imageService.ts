import { Modality, GenerateContentResponse } from "@google/genai";
import type { LogEntry, YoutubeThumbnail, TextOptions, ThumbnailDesignConcept } from '../types';
import { drawCanvas } from './canvasUtils';
import { withRetries, getAiClient } from './apiUtils';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;

const STYLE_PROMPT_SUFFIX = ", cinematic, hyperrealistic, 8k, dramatic lighting, lovecraftian horror, ultra-detailed, wide angle shot, mysterious atmosphere";

export const regenerateSingleImage = async (prompt: string, log: LogFunction): Promise<string> => {
    const fullPrompt = prompt + STYLE_PROMPT_SUFFIX;
    
    log({ type: 'request', message: `Запрос одного изображения от gemini-2.5-flash-image`, data: { prompt: fullPrompt } });
    const ai = getAiClient(log);
    
    const generateCall = () => ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
            parts: [{ text: fullPrompt }],
        },
        config: {
            responseModalities: [Modality.IMAGE],
        },
    });

    const response: GenerateContentResponse = await withRetries(generateCall, log);
    
    // Fix: Add verbose logging of the full API response for better debugging.
    log({ type: 'response', message: 'Полный ответ от gemini-2.5-flash-image', data: response });

    const part = response?.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (part?.inlineData) {
        const base64Image: string = part.inlineData.data;
        return `data:image/png;base64,${base64Image}`;
    }
    throw new Error("Не удалось найти данные изображения в ответе модели Gemini.");
};

export const generateStyleImages = async (visualSearchPrompts: string[], imageCount: number, log: LogFunction): Promise<string[]> => {
    const targetImageCount = imageCount > 0 ? imageCount : 3;
    let finalPrompts = [...visualSearchPrompts];
    if (finalPrompts.length === 0) {
         log({ type: 'info', message: 'Промпты для изображений не предоставлены, пропуск генерации.' });
        return [];
    }
    while (finalPrompts.length < targetImageCount) {
        finalPrompts.push(...visualSearchPrompts.slice(0, targetImageCount - finalPrompts.length));
    }
    finalPrompts = finalPrompts.slice(0, targetImageCount);

    const generatedImages: string[] = [];
    for (let i = 0; i < finalPrompts.length; i++) {
        try {
            const imageSrc = await regenerateSingleImage(finalPrompts[i], log);
            generatedImages.push(imageSrc);
             log({ type: 'info', message: `Изображение ${i + 1}/${targetImageCount} успешно сгенерировано.` });
        } catch (error) {
            log({ type: 'error', message: `Не удалось сгенерировать изображение ${i + 1}. Пропуск.`, data: error });
        }
    }
    return generatedImages;
};

export const generateMoreImages = async (visualSearchPrompts: string[], log: LogFunction): Promise<string[]> => {
    const targetImageCount = 5;
    if (visualSearchPrompts.length === 0) {
        log({ type: 'info', message: 'Нет промптов для генерации дополнительных изображений.' });
        return [];
    }

    const selectedPrompts = [];
    for (let i = 0; i < targetImageCount; i++) {
        selectedPrompts.push(visualSearchPrompts[Math.floor(Math.random() * visualSearchPrompts.length)]);
    }

    const generatedImages: string[] = [];
    for (let i = 0; i < selectedPrompts.length; i++) {
        try {
            const imageSrc = await regenerateSingleImage(selectedPrompts[i], log);
            generatedImages.push(imageSrc);
            log({ type: 'info', message: `Дополнительное изображение ${i + 1}/${targetImageCount} успешно сгенерировано.` });
        } catch (error) {
            log({ type: 'error', message: `Не удалось сгенерировать дополнительное изображение ${i + 1}. Пропуск.`, data: error });
        }
    }
    return generatedImages;
};

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
            fontFamily: defaultFont || concept.fontFamily || 'Impact',
            fontSize: concept.fontSize || 90,
            fillStyle: concept.textColor || '#FFFFFF',
            textAlign: 'center',
            position: { x: canvas.width / 2, y: canvas.height / 2 },
            shadow: {
                color: concept.shadowColor || 'rgba(0,0,0,0.8)',
                blur: 15, offsetX: 5, offsetY: 5
            },
            overlayColor: `rgba(0,0,0,${concept.overlayOpacity || 0.4})`,
            textTransform: concept.textTransform || 'uppercase',
            strokeColor: concept.strokeColor,
            strokeWidth: concept.strokeWidth,
            gradientColors: concept.gradientColors,
        };
        
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