
// services/aiTextService.ts
import { GenerateContentResponse } from "@google/genai";
import { getAiClient, withRetries } from './apiUtils';
import { getBlueprintPrompt, getQuickTestBlueprintPrompt, getNextChapterPrompt, getRegenerateTextPrompt, getThumbnailConceptsPrompt, getContentPlanPrompt } from './prompts';
import type { LogEntry, Podcast, Chapter, Character, ThumbnailDesignConcept, Source, DetailedContentIdea } from '../types';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;

const PRIMARY_TEXT_MODEL = 'gemini-flash-lite-latest';
const FALLBACK_TEXT_MODEL = 'gemini-2.5-flash';

/**
 * Wrapper for generateContent that includes both retries and model fallback.
 * This logic was moved from the deprecated geminiService.
 */
export const generateContentWithFallback = async (
    params: { contents: any; config?: any; }, 
    log: LogFunction,
): Promise<GenerateContentResponse> => {
    
    const attemptGeneration = (model: string) => {
        log({ type: 'request', message: `Attempting generation with model: ${model}`, data: { contents: params.contents } });
        const ai = getAiClient(log);
        return ai.models.generateContent({ model, ...params });
    };

    try {
        // First, try the primary model, wrapped in our retry logic.
        return await withRetries(() => attemptGeneration(PRIMARY_TEXT_MODEL), log);
    } catch (primaryError) {
        log({ type: 'error', message: `Primary model (${PRIMARY_TEXT_MODEL}) failed after all retries.`, data: primaryError });
        log({ type: 'info', message: `Switching to fallback model: ${FALLBACK_TEXT_MODEL}` });
        
        try {
            // If the primary fails, try the fallback model, also with retries.
            return await withRetries(() => attemptGeneration(FALLBACK_TEXT_MODEL), log);
        } catch (fallbackError) {
            log({ type: 'error', message: `Fallback model (${FALLBACK_TEXT_MODEL}) also failed after all retries.`, data: fallbackError });
            // If both fail, throw a comprehensive error.
            throw new Error(`Both primary (${PRIMARY_TEXT_MODEL}) and fallback (${FALLBACK_TEXT_MODEL}) models failed. See logs for details.`);
        }
    }
};


const parseGeminiJsonResponse = async (rawText: string, log: LogFunction): Promise<any> => {
    log({ type: 'response', message: 'Сырой ответ от Gemini', data: rawText });
    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : rawText;

    try {
        return JSON.parse(jsonText);
    } catch (jsonError) {
        log({ type: 'error', message: 'Не удалось распарсить JSON, попытка исправления с помощью ИИ...', data: { error: jsonError, text: jsonText } });
        
        const correctionPrompt = `The following text is a malformed JSON response from an API. Please correct any syntax errors (like trailing commas, missing brackets, or unescaped quotes) and return ONLY the valid JSON object. Do not include any explanatory text or markdown formatting like \`\`\`json. Malformed JSON: ${jsonText}`;

        try {
            const correctionResponse = await generateContentWithFallback({ contents: correctionPrompt }, log);
            const correctedRawText = correctionResponse.text;
            log({ type: 'info', message: 'Получен исправленный JSON от ИИ.', data: correctedRawText });
            
            const correctedJsonMatch = correctedRawText.match(/```json\s*([\s\S]*?)\s*```/);
            const correctedJsonText = correctedJsonMatch ? correctedJsonMatch[1] : correctedRawText;
            return JSON.parse(correctedJsonText);

        } catch (correctionError) {
             log({ type: 'error', message: 'Не удалось исправить и распарсить JSON даже после второй попытки.', data: correctionError });
             throw new Error(`Ответ модели не является валидным JSON, и попытка автоматического исправления не удалась.`);
        }
    }
};

export const generateContentPlan = async (count: number, log: LogFunction): Promise<DetailedContentIdea[]> => {
    log({ type: 'info', message: `Запрос детального контент-плана от ИИ на ${count} видео.` });
    const prompt = getContentPlanPrompt(count);
    
    try {
        const response = await generateContentWithFallback({ contents: prompt }, log);
        const data = await parseGeminiJsonResponse(response.text, log);
        
        if (!data.ideas || !Array.isArray(data.ideas) || data.ideas.length === 0) {
            throw new Error("AI не смог сгенерировать детальный контент-план.");
        }
        
        log({ type: 'info', message: `Успешно сгенерировано ${data.ideas.length} детальных планов.` });
        return data.ideas;
    } catch (error) {
        log({ type: 'error', message: 'Ошибка при генерации контент-плана', data: error });
        throw error;
    }
};

export const googleSearchForKnowledge = async (question: string, log: LogFunction): Promise<string> => {
    log({ type: 'info', message: 'Начало поиска информации в Google для базы знаний.' });
    const prompt = `Using Google Search, find and provide a detailed, structured answer to the following question. The answer should be comprehensive, well-formatted, and contain key facts. Write the answer in Russian. Question: "${question}"`;

    try {
        const response = await generateContentWithFallback({ 
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] } 
        }, log);
        
        const answer = response.text;
        if (!answer.trim()) throw new Error("Не удалось получить содержательный ответ от Google Search.");
        
        log({ type: 'response', message: 'Ответ от Google Search получен.' });
        return answer;
    } catch (error) {
        const errorMessage = `Не удалось выполнить поиск: ${error instanceof Error ? error.message : String(error)}`;
        log({ type: 'error', message: 'Ошибка при поиске в Google', data: error });
        throw new Error(errorMessage);
    }
};

// Fix: Add 'imageSource' to Omit to align the blueprint with its purpose.
// The blueprint defines the content, while imageSource is a generation setting handled later.
type BlueprintResult = Omit<Podcast, 'id' | 'topic' | 'selectedTitle' | 'chapters' | 'totalDurationMinutes' | 'creativeFreedom' | 'knowledgeBaseText' | 'language' | 'designConcepts' | 'narrationMode' | 'characterVoices' | 'monologueVoice' | 'selectedBgIndex' | 'backgroundMusicVolume' | 'initialImageCount' | 'imageSource'> & { chapters: Chapter[] };

export const generatePodcastBlueprint = async (topic: string, knowledgeBaseText: string, creativeFreedom: boolean, language: string, log: LogFunction): Promise<BlueprintResult> => {
    log({ type: 'info', message: 'Начало генерации концепции подкаста и первой главы.' });
    const prompt = getBlueprintPrompt(topic, knowledgeBaseText, creativeFreedom, language);
    
    try {
        const config = knowledgeBaseText ? {} : { tools: [{ googleSearch: {} }] };
        const response = await generateContentWithFallback({ contents: prompt, config }, log);
        const data = await parseGeminiJsonResponse(response.text, log);

        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        const sources: Source[] = knowledgeBaseText ? [] : Array.from(new Map<string, Source>(groundingChunks.map((c: any) => c.web).filter((w: any) => w?.uri).map((w: any) => [w.uri, { uri: w.uri, title: w.title?.trim() || w.uri }])).values());
        
        const firstChapter: Chapter = {
            id: crypto.randomUUID(),
            title: data.chapter.title,
            script: data.chapter.script,
            musicSearchKeywords: data.chapter.musicSearchKeywords,
            visualSearchPrompts: data.visualSearchPrompts || [],
            status: 'pending',
        };
        
        log({ type: 'info', message: 'Концепция подкаста и первая глава успешно созданы.' });
        return {
            youtubeTitleOptions: data.youtubeTitleOptions,
            description: data.description,
            seoKeywords: data.seoKeywords,
            visualSearchPrompts: data.visualSearchPrompts,
            characters: data.characters,
            sources,
            chapters: [firstChapter]
        };
    } catch (error) {
        log({ type: 'error', message: 'Ошибка при создании концепции подкаста', data: error });
        throw error;
    }
};

export const generateQuickTestBlueprint = async (topic: string, language: string, log: LogFunction): Promise<BlueprintResult> => {
    log({ type: 'info', message: 'Generating a lean blueprint for Quick Test.' });
    const prompt = getQuickTestBlueprintPrompt(topic, language);
    
    try {
        const response = await generateContentWithFallback({ contents: prompt }, log);
        const data = await parseGeminiJsonResponse(response.text, log);
        
        const firstChapter: Chapter = {
            id: crypto.randomUUID(),
            title: data.chapter.title,
            script: data.chapter.script,
            musicSearchKeywords: data.chapter.musicSearchKeywords,
            status: 'pending',
        };
        
        log({ type: 'info', message: 'Lean blueprint for Quick Test successfully created.' });
        return {
            youtubeTitleOptions: data.youtubeTitleOptions,
            description: data.description,
            seoKeywords: data.seoKeywords,
            visualSearchPrompts: data.visualSearchPrompts,
            characters: data.characters,
            sources: [],
            chapters: [firstChapter]
        };
    } catch (error) {
        log({ type: 'error', message: 'Error creating quick test blueprint', data: error });
        throw error;
    }
};

export const regenerateTextAssets = async (topic: string, creativeFreedom: boolean, language: string, log: LogFunction): Promise<{ youtubeTitleOptions: string[]; description: string; seoKeywords: string[] }> => {
    log({ type: 'info', message: 'Начало регенерации текстовых материалов для YouTube.' });
    const prompt = getRegenerateTextPrompt(topic, creativeFreedom, language);

    try {
        const response = await generateContentWithFallback({ contents: prompt }, log);
        const data = await parseGeminiJsonResponse(response.text, log);
        log({ type: 'info', message: 'Текстовые материалы успешно обновлены.' });
        return data;
    } catch (error) {
        log({ type: 'error', message: 'Ошибка при регенерации текстовых материалов', data: error });
        throw error;
    }
};

export const generateNextChapterScript = async (topic: string, podcastTitle: string, characters: Character[], previousChapters: Chapter[], chapterIndex: number, knowledgeBaseText: string, creativeFreedom: boolean, language: string, log: LogFunction): Promise<Omit<Chapter, 'id' | 'status'>> => {
    log({ type: 'info', message: `Начало генерации сценария для главы ${chapterIndex + 1}` });
    const previousSummary = previousChapters.map((c, i) => `Chapter ${i+1}: ${c.title} - ${c.script.slice(0, 2).map(s => s.text).join(' ')}...`).join('\n');
    const prompt = getNextChapterPrompt(topic, podcastTitle, characters, previousSummary, chapterIndex, knowledgeBaseText, creativeFreedom, language);
    
    try {
        const response = await generateContentWithFallback({ contents: prompt }, log);
        const data = await parseGeminiJsonResponse(response.text, log);

        log({ type: 'info', message: `Сценарий для главы ${chapterIndex + 1} успешно создан.` });
        return {
            title: data.title,
            script: data.script,
            musicSearchKeywords: data.musicSearchKeywords,
            visualSearchPrompts: data.visualSearchPrompts, // Now getting visual prompts for this chapter
        };
    } catch (error) {
        log({ type: 'error', message: `Ошибка при генерации сценария для главы ${chapterIndex + 1}`, data: error });
        throw error;
    }
};

export const generateThumbnailDesignConcepts = async (topic: string, language: string, log: LogFunction): Promise<ThumbnailDesignConcept[]> => {
    log({ type: 'info', message: 'Начало генерации дизайн-концепций для обложек.' });
    const prompt = getThumbnailConceptsPrompt(topic, language);

    try {
        const response = await generateContentWithFallback({ contents: prompt }, log);
        const data = await parseGeminiJsonResponse(response.text, log);
        if (!data.concepts || data.concepts.length === 0) {
            throw new Error("AI не смог сгенерировать дизайн-концепции.");
        }
        log({ type: 'info', message: 'Дизайн-концепции успешно созданы.' });
        return data.concepts.slice(0, 3);
    } catch (error) {
        log({ type: 'error', message: 'Ошибка при генерации дизайн-концепций. Будут использованы стандартные.', data: error });
        // Fallback to default concepts on error
        return [
            { name: "Контрастный Удар (Резервный)", fontFamily: "Anton", fontSize: 110, textColor: "#FFFF00", shadowColor: "#000000", overlayOpacity: 0.3, textTransform: 'uppercase', strokeColor: "#000000", strokeWidth: 8 },
            { name: "Классический Триллер (Резервный)", fontFamily: "Roboto Slab", fontSize: 100, textColor: "#FFFFFF", shadowColor: "#000000", overlayOpacity: 0.5, textTransform: 'uppercase', strokeColor: "transparent", strokeWidth: 0 },
            { name: "Современный Градиент (Резервный)", fontFamily: "Bebas Neue", fontSize: 130, textColor: "#FFFFFF", shadowColor: "transparent", overlayOpacity: 0.4, textTransform: 'uppercase', gradientColors: ["#00FFFF", "#FF00FF"] }
        ];
    }
};