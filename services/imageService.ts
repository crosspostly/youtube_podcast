import { Modality, GenerateContentResponse } from "@google/genai";
import type { LogEntry, YoutubeThumbnail, TextOptions, ThumbnailDesignConcept, BackgroundImage } from '../types';
import { drawCanvas } from './canvasUtils';
import { withRetries, getAiClient } from './apiUtils';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;

const STYLE_PROMPT_SUFFIX = ", cinematic, hyperrealistic, 8k, dramatic lighting, ultra-detailed, wide angle shot, mysterious atmosphere";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
    const response = await fetch(dataUrl);
    return response.blob();
};

export const regenerateSingleImageWithBlob = async (prompt: string, log: LogFunction): Promise<BackgroundImage> => {
    const fullPrompt = prompt + STYLE_PROMPT_SUFFIX;
    log({ type: 'request', message: `Запрос одного изображения`, data: { prompt: fullPrompt } });
    const ai = getAiClient(log);
    const generateCall = () => ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: fullPrompt }] },
        config: { responseModalities: [Modality.IMAGE] },
    });
    const response: GenerateContentResponse = await withRetries(generateCall, log);
    log({ type: 'response', message: 'Ответ gemini-2.5-flash-image', data: response });
    const part = response?.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (part?.inlineData) {
        const base64Image: string = part.inlineData.data;
        const dataUrl = `data:image/png;base64,${base64Image}`;
        const blob = await dataUrlToBlob(dataUrl);
        return { url: dataUrl, blob: blob, prompt: prompt };
    }
    throw new Error("Не удалось найти данные изображения");
};

export const generateStyleImages = generateImagesWithBlobs;

export const generateYoutubeThumbnails = async (
    baseImage: BackgroundImage,
    title: string,
    designConcepts: any[],
    log: LogFunction,
    defaultFont: string
): Promise<any[]> => {
    // Placeholder implementation - this would need the actual thumbnail generation logic
    // For now, return empty array to avoid build errors
    log({ type: 'info', message: 'Генерация YouTube миниатюр (placeholder)' });
    return [];
};

export const generateImagesWithBlobs = async (
    visualSearchPrompts: string[],
    imageCount: number,
    log: LogFunction,
    devMode = false
): Promise<BackgroundImage[]> => {
    const targetImageCount = imageCount > 0 ? imageCount : 3;
    let finalPrompts = [...visualSearchPrompts];
    if (finalPrompts.length === 0) {
        log({ type: 'info', message: 'Нет промптов для изображений' });
        return [];
    }
    while (finalPrompts.length < targetImageCount) {
        finalPrompts.push(...visualSearchPrompts.slice(0, targetImageCount - finalPrompts.length));
    }
    finalPrompts = finalPrompts.slice(0, targetImageCount);
    log({ type: 'info', message: `Запуск генерации ${targetImageCount} изображений с blob` });
    if (devMode) {
        const imagePromises = finalPrompts.map(async (prompt, idx) => {
            const staggerDelay = 2000 + (Math.random() * 5000) + (idx * 1000);
            await delay(staggerDelay);
            try {
                const bgImage = await regenerateSingleImageWithBlob(prompt, log);
                log({ type: 'info', message: `[DEV] Изображение ${idx + 1} готово с blob.` });
                return bgImage;
            } catch (e) {
                log({ type: 'error', message: `[DEV] Ошибка изображения ${idx + 1}`, data: e });
                return null;
            }
        });
        const results = await Promise.all(imagePromises);
        return results.filter((img): img is BackgroundImage => img != null);
    } else {
        const generatedImages: BackgroundImage[] = [];
        for (let i = 0; i < finalPrompts.length; i++) {
            try {
                const bgImage = await regenerateSingleImageWithBlob(finalPrompts[i], log);
                generatedImages.push(bgImage);
                log({ type: 'info', message: `Изображение ${i + 1} сгенерировано с blob.` });
            } catch (e) {
                log({ type: 'error', message: `Ошибка генерации изображения ${i + 1}.`, data: e });
            }
        }
        return generatedImages;
    }
};

// Остальной код imageService.ts оставь без изменений, либо добавь экспорт функций generateImagesWithBlobs, dataUrlToBlob, regenerateSingleImageWithBlob, regenerateSingleImage если их ещё нет.
