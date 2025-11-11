import { GoogleGenAI, Modality } from "@google/genai";
import type { PodcastPackage, Source } from '../types';

const getAiClient = () => {
  if (!process.env.API_KEY) {
    throw new Error("Ключ API не настроен. Убедитесь, что переменная окружения API_KEY установлена.");
  }
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const generateScriptPackage = async (topic: string, setLoadingStep: (step: string) => void): Promise<Omit<PodcastPackage, 'audio'>> => {
    setLoadingStep("Исследование темы в интернете...");
    const ai = getAiClient();

    const model = "gemini-2.5-pro";
    const prompt = `
      Ты — ИИ-исследователь и сценарист для подкастов, специализирующийся на создании захватывающего контента о тайнах, паранормальных явлениях и исторических странностях в Америке.
      Твоя задача — провести исследование по теме "${topic}" используя доступные тебе инструменты поиска, а затем на основе найденной информации создать полный пакет материалов для выпуска подкаста.

      Весь сгенерированный текстовый контент (заголовок, описание, ключевые слова, сценарий) должен быть на русском языке. Промпты для изображений должны быть на английском языке.

      Предоставь результат в виде ЕДИНОГО, ВАЛИДНОГО JSON-ОБЪЕКТА, обернутого в \`\`\`json ... \`\`\`. Не добавляй никакого другого текста до или после JSON-блока. Структура JSON должна быть следующей:
      {
        "title": "Захватывающий и таинственный заголовок для выпуска на русском языке.",
        "description": "Краткое описание выпуска в одном абзаце на русском языке, подходящее для платформы подкастов.",
        "seoKeywords": ["Массив", "из", "5-7", "релевантных", "SEO-ключевых слов", "на русском языке"],
        "imagePrompts": ["Массив из 10 различных, очень детализированных, атмосферных и фотореалистичных промптов для генератора изображений на английском языке.", "Промпты должны визуально рассказывать историю подкаста от начала до конца."],
        "script": [
          {
            "type": "вступление",
            "text": "Текст для этого сегмента на русском языке. Включай атмосферные подсказки в скобках, например (зловещая музыка нарастает)."
          }
        ]
      }
    `;

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
            },
        });

        setLoadingStep("Обработка ответа от ИИ...");
        
        const rawText = response.text.trim();
        console.log("Raw response from Gemini:", rawText); // ЛОГИРОВАНИЕ СЫРОГО ОТВЕТА

        const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
        const jsonText = jsonMatch ? jsonMatch[1] : rawText;

        let data;
        try {
            data = JSON.parse(jsonText);
        } catch (jsonError) {
            console.error("Failed to parse JSON response:", jsonError);
            console.error("Extracted text for parsing:", jsonText);
            throw new Error(`Не удалось обработать ответ от модели. Ответ не является валидным JSON. Подробности в консоли.`);
        }

        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        
        const sources: Source[] = groundingChunks
            .map((chunk: any) => chunk.web)
            .filter((web: any) => web?.uri && web?.title)
            .map((web: any) => ({ uri: web.uri, title: web.title.trim() }));

        const uniqueSources = Array.from(new Map(sources.map(item => [item['uri'], item])).values());

        return {
            ...data,
            sources: uniqueSources,
        };
    } catch (error) {
        console.error("Full error object in generateScriptPackage:", error);
        if (error instanceof Error && error.message.includes('JSON')) {
             throw error;
        }
        if (error instanceof Error) {
            if (error.message.includes('API_KEY')) {
                throw error;
            }
            if (error.message.includes('400') || error.message.includes('INVALID_ARGUMENT')) {
                 throw new Error(`Ошибка конфигурации запроса к API. Подробности: ${error.message}. Проверьте консоль.`);
            }
        }
        throw new Error("Не удалось сгенерировать пакет для подкаста. Модель могла вернуть неверный ответ или произошла сетевая ошибка. Проверьте консоль для деталей.");
    }
};

export const generatePodcastAudio = async (script: { type: string; text: string }[]): Promise<string> => {
    const ai = getAiClient();
    const fullScript = script.map(part => part.text).join('\n\n');

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: fullScript }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' }, // Deep, calm, slightly ominous narrative voice
                    },
                },
            },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) {
            throw new Error("Не удалось получить аудиоданные от модели.");
        }
        return base64Audio;
    } catch (error) {
        console.error("Error generating podcast audio:", error);
        throw new Error("Не удалось сгенерировать аудио для подкаста.");
    }
};
