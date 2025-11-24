
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
    
    try {
        const response: GenerateContentResponse = await withRetries(generateCall, log);
        
        // SAFE LOGGING: Do not attempt to deep copy or stringify the full response with Base64 data.
        // It can crash the browser or corrupt the object if not handled perfectly.
        const finishReason = response.candidates?.[0]?.finishReason;
        log({ type: 'response', message: `Ответ от модели изображений получен. Reason: ${finishReason}` });

        const part = response?.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        
        if (part?.inlineData && part.inlineData.data) {
            const base64Image: string = part.inlineData.data;
            const mimeType = part.inlineData.mimeType || 'image/png';
            
            const dataUrl = `data:${mimeType};base64,${base64Image}`;
            const blob = await dataUrlToBlob(dataUrl);
            
            log({ type: 'info', message: `✅ Изображение сгенерировано: ${mimeType}, ${(blob.size / 1024).toFixed(1)}KB` });
            
            return { url: dataUrl, blob: blob, prompt: prompt };
        }
        
        throw new Error("Ответ модели не содержит данных изображения (inlineData).");
        
    } catch (e: any) {
        log({ type: 'error', message: `Ошибка внутри regenerateSingleImageWithBlob`, data: e.message || e });
        throw e;
    }
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

// Alias для обратной совместимости
export const generateStyleImages = generateImagesWithBlobs;

export const generateYoutubeThumbnails = async (
    baseImage: BackgroundImage | string,
    title: string,
    designConcepts: ThumbnailDesignConcept[],
    log: LogFunction,
    defaultFont: string
): Promise<YoutubeThumbnail[]> => {
    log({ type: 'info', message: `Начало генерации ${designConcepts.length} YouTube thumbnails.` });

    if (!baseImage) {
        log({ type: 'error', message: 'Не предоставлено базовое изображение для генерации обложек.' });
        return [];
    }
    
    const baseImageSrc = typeof baseImage === 'string' ? baseImage : baseImage.url;

    try {
        // Load the image once
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = baseImageSrc;
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = (e) => reject(new Error(`Failed to load base image from ${baseImageSrc}: ${e}`));
        });

        // Create separate canvases for each concept to avoid race conditions
        const thumbnailPromises = designConcepts.map(async (concept, index): Promise<YoutubeThumbnail | null> => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = 1280;
                canvas.height = 720;
                const ctx = canvas.getContext('2d');
                if (!ctx) return null;

                // Determine font: Priority given to the concept's suggested font.
                // Only if concept.fontFamily is totally missing do we fallback to defaultFont.
                const conceptFont = concept.fontFamily?.trim();
                const effectiveFont = (conceptFont && conceptFont.length > 0) ? conceptFont : (defaultFont || 'Impact');

                log({ 
                    type: 'info', 
                    message: `Rendering Thumbnail #${index + 1} ("${concept.name}")`, 
                    data: { 
                        conceptFont: conceptFont,
                        effectiveFont: effectiveFont,
                        color: concept.textColor 
                    }
                });

                const options: TextOptions = {
                    text: title,
                    fontFamily: effectiveFont,
                    fontSize: concept.fontSize || 90,
                    fillStyle: concept.textColor || '#FFFFFF',
                    textAlign: 'center',
                    position: { x: canvas.width / 2, y: canvas.height / 2 },
                    shadow: {
                        color: concept.shadowColor || 'rgba(0,0,0,0.8)',
                        blur: 15, offsetX: 5, offsetY: 5
                    },
                    overlayColor: `rgba(0,0,0,${concept.overlayOpacity || 0.4})`,
                    strokeColor: concept.strokeColor,
                    strokeWidth: concept.strokeWidth,
                    gradientColors: concept.gradientColors,
                    textTransform: concept.textTransform,
                };
                
                // Pass a fresh options object to drawCanvas
                await drawCanvas(ctx, img, options);
                
                return {
                    styleName: concept.name,
                    dataUrl: canvas.toDataURL('image/png'),
                    options: options
                };
            } catch(e) {
                log({type: 'error', message: `Ошибка создания обложки для концепта: ${concept.name}`, data: e});
                return null;
            }
        });
        
        const thumbnails = await Promise.all(thumbnailPromises);
        const validThumbnails = thumbnails.filter((t): t is YoutubeThumbnail => t !== null);
        
        if (validThumbnails.length === 0) {
             log({ type: 'error', message: `Не удалось сгенерировать ни одной обложки.` });
        } else {
             log({ type: 'info', message: `Успешно сгенерировано ${validThumbnails.length} обложек.` });
        }
        
        return validThumbnails;
    } catch (error) {
        log({ type: 'error', message: 'Критическая ошибка при генерации обложек', data: error });
        return [];
    }
};
