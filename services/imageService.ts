import { GoogleGenAI, Modality } from "@google/genai";
import type { LogEntry } from '../types';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;

const getAiClient = (log: LogFunction) => {
  if (!process.env.API_KEY) {
    const errorMsg = "Ключ API не настроен. Убедитесь, что переменная окружения API_KEY установлена.";
    log({ type: 'error', message: errorMsg });
    throw new Error(errorMsg);
  }
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

const STYLE_PROMPT_SUFFIX = ", cinematic, mysterious, hyperrealistic, dark atmosphere, 8k";

export const generateStyleImages = async (prompts: string[], log: LogFunction): Promise<string[]> => {
    if (!prompts || prompts.length === 0) {
        log({ type: 'info', message: 'Промпты для изображений не предоставлены, пропуск генерации.' });
        return [];
    }
    log({ type: 'info', message: `Начало генерации ${prompts.length} изображений...` });
    const ai = getAiClient(log);
    const model = 'imagen-4.0-generate-001';
    
    const imagePromises = prompts.map(async (prompt, index) => {
        const fullPrompt = prompt + STYLE_PROMPT_SUFFIX;
        try {
            log({ type: 'request', message: `Запрос изображения ${index + 1}/${prompts.length} от ${model}`, data: { prompt: fullPrompt } });
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
            log({ type: 'response', message: `Изображение ${index + 1} успешно сгенерировано` });
            return `data:image/jpeg;base64,${base64Image}`;
        } catch (error) {
            log({ type: 'error', message: `Не удалось сгенерировать изображение для промпта: "${prompt}"`, data: error });
            return null; 
        }
    });

    const results = await Promise.all(imagePromises);
    return results.filter((r): r is string => r !== null);
};

export const generateYoutubeThumbnail = async (baseImage: string, title: string, log: LogFunction): Promise<string | null> => {
    if (!baseImage) {
        log({ type: 'info', message: 'Базовое изображение для обложки отсутствует, пропуск генерации.' });
        return null;
    }
    log({ type: 'info', message: 'Начало генерации обложки для YouTube...' });
    const ai = getAiClient(log);
    const model = 'gemini-2.5-flash-image';
    const prompt = `Это изображение для выпуска подкаста о загадках. Добавь на это изображение название подкаста: "${title}". Сделай текст большим, очень читабельным и визуально привлекательным. Используй шрифт и цветовую схему, которые соответствуют таинственной и кинематографической теме. Текст должен быть в центре внимания, чтобы обложка была кликабельной на YouTube. Не изменяй само изображение в остальном.`;

    try {
        const imagePart = {
            inlineData: {
                mimeType: 'image/jpeg',
                data: baseImage.replace('data:image/jpeg;base64,', ''),
            },
        };
        const textPart = { text: prompt };

        log({ type: 'request', message: `Запрос на создание обложки к ${model}` });
        const response = await ai.models.generateContent({
            model,
            contents: { parts: [imagePart, textPart] },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        });

        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                const base64ImageBytes = part.inlineData.data;
                log({ type: 'response', message: 'Обложка для YouTube успешно сгенерирована.' });
                return `data:image/png;base64,${base64ImageBytes}`;
            }
        }
        throw new Error("В ответе на запрос генерации обложки не найдены данные изображения.");
    } catch (error) {
        log({ type: 'error', message: 'Не удалось сгенерировать обложку для YouTube.', data: error });
        return null;
    }
};
