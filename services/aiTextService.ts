// services/aiTextService.ts
import { GenerateContentResponse } from "@google/genai";
import { getAiClient, withRetries } from './apiUtils';
import { getBlueprintPrompt, getQuickTestBlueprintPrompt, getNextChapterPrompt, getRegenerateTextPrompt, getThumbnailConceptsPrompt, getContentPlanPrompt } from './prompts';
import type { LogEntry, Podcast, Chapter, Character, ThumbnailDesignConcept, Source, DetailedContentIdea } from '../types';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;

const PRIMARY_TEXT_MODEL = 'gemini-flash-lite-latest';
const FALLBACK_TEXT_MODEL = 'gemini-2.5-flash';

// SCRIPT LENGTH CONSTRAINTS
const MIN_SCRIPT_LENGTH = 8500; // Minimum characters for 7-8 minutes
const TARGET_SCRIPT_LENGTH = 9000; // Target length
const MAX_SCRIPT_LENGTH = 10000; // Maximum acceptable length
const MAX_REGENERATION_ATTEMPTS = 3; // Maximum attempts to get proper length

/**
 * Calculate total text length of script (excluding SFX lines)
 */
const calculateScriptTextLength = (script: any[]): number => {
    return script
        .filter(line => line.speaker.toUpperCase() !== 'SFX')
        .reduce((total, line) => total + (line.text?.length || 0), 0);
};

/**
 * Validate if script meets minimum length requirements
 */
const validateScriptLength = (script: any[], chapterNumber: number, log: LogFunction): boolean => {
    const textLength = calculateScriptTextLength(script);
    const dialogueLines = script.filter(line => line.speaker.toUpperCase() !== 'SFX').length;
    
    log({ 
        type: 'info', 
        message: `📊 Глава ${chapterNumber} - Проверка длины: ${textLength} символов (${dialogueLines} реплик)`,
        data: { textLength, dialogueLines, minRequired: MIN_SCRIPT_LENGTH }
    });
    
    if (textLength < MIN_SCRIPT_LENGTH) {
        log({ 
            type: 'warning', 
            message: `⚠️ Глава ${chapterNumber} слишком короткая: ${textLength} < ${MIN_SCRIPT_LENGTH} символов. Требуется регенерация.`,
        });
        return false;
    }
    
    if (textLength > MAX_SCRIPT_LENGTH) {
        log({ 
            type: 'warning', 
            message: `⚠️ Глава ${chapterNumber} слишком длинная: ${textLength} > ${MAX_SCRIPT_LENGTH} символов. Рекомендуется сократить.`,
        });
        // Still acceptable, just a warning
    }
    
    log({ 
        type: 'info', 
        message: `✅ Глава ${chapterNumber} прошла проверку длины: ${textLength} символов`,
    });
    
    return true;
};

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
        const response = await generateContentWithFallback({ contents: prompt, config: { temperature: 0.9 } }, log);
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

// Fix: Add 'imageSource' and 'thumbnailText' to Omit to align the blueprint with its purpose.
// The blueprint defines the content, while imageSource and thumbnailText are settings/states handled later.
type BlueprintResult = Omit<Podcast, 'id' | 'topic' | 'selectedTitle' | 'chapters' | 'totalDurationMinutes' | 'creativeFreedom' | 'knowledgeBaseText' | 'language' | 'designConcepts' | 'narrationMode' | 'characterVoices' | 'monologueVoice' | 'selectedBgIndex' | 'backgroundMusicVolume' | 'initialImageCount' | 'imageSource' | 'thumbnailText'> & { chapters: Chapter[] };

export const generatePodcastBlueprint = async (topic: string, knowledgeBaseText: string, creativeFreedom: boolean, language: string, log: LogFunction): Promise<BlueprintResult> => {
    log({ type: 'info', message: '🎬 Начало генерации концепции подкаста и первой главы.' });
    const prompt = getBlueprintPrompt(topic, knowledgeBaseText, creativeFreedom, language);
    
    let attempt = 0;
    let lastData: any = null;
    
    while (attempt < MAX_REGENERATION_ATTEMPTS) {
        attempt++;
        
        try {
            log({ type: 'info', message: `📝 Попытка ${attempt}/${MAX_REGENERATION_ATTEMPTS} генерации первой главы...` });
            
            const config = knowledgeBaseText ? {} : { tools: [{ googleSearch: {} }] };
            const response = await generateContentWithFallback({ contents: prompt, config }, log);
            const data = await parseGeminiJsonResponse(response.text, log);
            lastData = data;

            // Validate script length
            if (!validateScriptLength(data.chapter.script, 1, log)) {
                if (attempt < MAX_REGENERATION_ATTEMPTS) {
                    const currentLength = calculateScriptTextLength(data.chapter.script);
                    const deficit = MIN_SCRIPT_LENGTH - currentLength;
                    log({ 
                        type: 'warning', 
                        message: `🔄 Глава слишком короткая (нехватка ${deficit} символов). Повторная генерация...` 
                    });
                    continue; // Retry generation
                } else {
                    log({ 
                        type: 'warning', 
                        message: `⚠️ Достигнут лимит попыток (${MAX_REGENERATION_ATTEMPTS}). Использую последний результат, хоть он и короткий.` 
                    });
                    // Use the last generated data even if short
                }
            }

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
            
            const scriptLength = calculateScriptTextLength(data.chapter.script);
            log({ type: 'info', message: `✅ Концепция подкаста и первая глава успешно созданы (${scriptLength} символов).` });
            
            return {
                title: data.topic,
                youtubeTitleOptions: data.youtubeTitleOptions,
                description: data.description,
                seoKeywords: data.seoKeywords,
                visualSearchPrompts: data.visualSearchPrompts,
                characters: data.characters,
                sources,
                chapters: [firstChapter]
            };
            
        } catch (error) {
            if (attempt >= MAX_REGENERATION_ATTEMPTS) {
                log({ type: 'error', message: 'Ошибка при создании концепции подкаста после всех попыток', data: error });
                throw error;
            }
            log({ type: 'warning', message: `Попытка ${attempt} не удалась, повторяю...`, data: error });
        }
    }
    
    // Fallback: should never reach here, but TypeScript requires it
    throw new Error('Не удалось создать концепцию подкаста после всех попыток');
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
            title: data.title,
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
    log({ type: 'info', message: `🎬 Начало генерации сценария для главы ${chapterIndex + 1}` });
    const previousSummary = previousChapters.map((c, i) => `Chapter ${i+1}: ${c.title} - ${c.script.slice(0, 2).map(s => s.text).join(' ')}...`).join('\n');
    const prompt = getNextChapterPrompt(topic, podcastTitle, characters, previousSummary, chapterIndex, knowledgeBaseText, creativeFreedom, language);
    
    let attempt = 0;
    let lastData: any = null;
    
    while (attempt < MAX_REGENERATION_ATTEMPTS) {
        attempt++;
        
        try {
            log({ type: 'info', message: `📝 Попытка ${attempt}/${MAX_REGENERATION_ATTEMPTS} генерации главы ${chapterIndex + 1}...` });
            
            const response = await generateContentWithFallback({ contents: prompt }, log);
            const data = await parseGeminiJsonResponse(response.text, log);
            lastData = data;

            // Validate script length
            if (!validateScriptLength(data.script, chapterIndex + 1, log)) {
                if (attempt < MAX_REGENERATION_ATTEMPTS) {
                    const currentLength = calculateScriptTextLength(data.script);
                    const deficit = MIN_SCRIPT_LENGTH - currentLength;
                    log({ 
                        type: 'warning', 
                        message: `🔄 Глава ${chapterIndex + 1} слишком короткая (нехватка ${deficit} символов). Повторная генерация с более строгими инструкциями...` 
                    });
                    
                    // Add length enforcement to the prompt
                    const enhancedPrompt = prompt + `\n\n**CRITICAL LENGTH REQUIREMENT**: The script MUST be at least ${MIN_SCRIPT_LENGTH} characters of dialogue text (excluding SFX). Current attempt was too short. Add more dialogue exchanges, expand explanations, and deepen the conversation to reach the required length.`;
                    
                    const retryResponse = await generateContentWithFallback({ contents: enhancedPrompt }, log);
                    const retryData = await parseGeminiJsonResponse(retryResponse.text, log);
                    lastData = retryData;
                    
                    if (validateScriptLength(retryData.script, chapterIndex + 1, log)) {
                        // Success after enhancement
                        log({ type: 'info', message: `✅ Глава ${chapterIndex + 1} успешно создана после усиления промпта` });
                        return {
                            title: retryData.title,
                            script: retryData.script,
                            musicSearchKeywords: retryData.musicSearchKeywords,
                            visualSearchPrompts: retryData.visualSearchPrompts,
                        };
                    }
                    
                    continue; // Still too short, try again
                } else {
                    log({ 
                        type: 'warning', 
                        message: `⚠️ Достигнут лимит попыток для главы ${chapterIndex + 1}. Использую последний результат.` 
                    });
                }
            }

            const scriptLength = calculateScriptTextLength(data.script);
            log({ type: 'info', message: `✅ Сценарий для главы ${chapterIndex + 1} успешно создан (${scriptLength} символов).` });
            
            return {
                title: data.title,
                script: data.script,
                musicSearchKeywords: data.musicSearchKeywords,
                visualSearchPrompts: data.visualSearchPrompts,
            };
            
        } catch (error) {
            if (attempt >= MAX_REGENERATION_ATTEMPTS) {
                log({ type: 'error', message: `Ошибка при генерации главы ${chapterIndex + 1} после всех попыток`, data: error });
                throw error;
            }
            log({ type: 'warning', message: `Попытка ${attempt} для главы ${chapterIndex + 1} не удалась, повторяю...`, data: error });
        }
    }
    
    // Fallback: return last data if we exhausted all attempts
    if (lastData) {
        log({ type: 'warning', message: `⚠️ Возврат последнего результата для главы ${chapterIndex + 1} (может быть коротким)` });
        return {
            title: lastData.title,
            script: lastData.script,
            musicSearchKeywords: lastData.musicSearchKeywords,
            visualSearchPrompts: lastData.visualSearchPrompts || [],
        };
    }
    
    throw new Error(`Не удалось создать главу ${chapterIndex + 1} после всех попыток`);
};

export const generateThumbnailDesignConcepts = async (topic: string, language: string, log: LogFunction): Promise<ThumbnailDesignConcept[]> => {
    log({ type: 'info', message: 'Начало генерации дизайн-концепций для обложек.' });
    const prompt = getThumbnailConceptsPrompt(topic, language);

    try {
        const response = await generateContentWithFallback({ contents: prompt, config: { temperature: 1.0 } }, log);
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