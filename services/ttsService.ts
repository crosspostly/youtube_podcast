import { GoogleGenAI, Modality, GenerateContentResponse } from "@google/genai";
import * as lamejs from 'lamejs';
import type { Podcast, Chapter, Source, LogEntry, ScriptLine, Character, ThumbnailDesignConcept, NarrationMode, MusicTrack, SoundEffect } from '../types';
import { withQueueAndRetries, generateContentWithFallback, withRetries } from './geminiService';
import { parseGeminiJsonResponse } from './aiUtils';
import { findSfxForScript } from './sfxService';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;
type ApiKeys = { gemini?: string; openRouter?: string; freesound?: string; };

// ... (other helper functions remain unchanged)
// --- GENERATE LOGIC CHANGED ONLY ---
export const generatePodcastBlueprint = async (topic: string, knowledgeBaseText: string, creativeFreedom: boolean, language: string, totalDurationMinutes: number, log: LogFunction, apiKeys: ApiKeys, initialImageCount: number): Promise<Omit<Podcast, 'id' | 'topic' | 'selectedTitle' | 'chapters' | 'totalDurationMinutes' | 'creativeFreedom' | 'knowledgeBaseText' | 'language' | 'designConcepts' | 'narrationMode' | 'characterVoices' | 'monologueVoice' | 'initialImageCount' | 'backgroundMusicVolume' | 'thumbnailBaseImage'> & { chapters: Chapter[] }> => {
    log({ type: 'info', message: 'Начало генерации концепции подкаста и первой главы.' });

    // ... prompt build remains unchanged

    try {
        const config = knowledgeBaseText ? {} : { tools: [{ googleSearch: {} }] };
        const response = await generateContentWithFallback({ contents: prompt, config }, log, apiKeys);
        const data = await parseGeminiJsonResponse(response.text, log, apiKeys);

        log({ type: 'info', message: 'Начало пакетного поиска SFX...' });
        const scriptWithSfx = await findSfxForScript(data.chapter.script, log, apiKeys);
        data.chapter.script = scriptWithSfx;
        log({ type: 'info', message: 'Пакетный поиск SFX завершен.' });

        // ... the rest remains unchanged
        return {
            youtubeTitleOptions: data.youtubeTitleOptions,
            description: data.description,
            seoKeywords: data.seoKeywords,
            characters: data.characters,
            sources,
            chapters: [firstChapter]
        };
    } catch (error) {
        log({ type: 'error', message: 'Ошибка при создании концепции подкаста', data: error });
        throw error;
    }
};

export const generateNextChapterScript = async (topic: string, podcastTitle: string, characters: Character[], previousChapters: Chapter[], chapterIndex: number, totalDurationMinutes: number, knowledgeBaseText: string, creativeFreedom: boolean, language: string, log: LogFunction, apiKeys: ApiKeys): Promise<{title: string, script: ScriptLine[], imagePrompts: string[]}> => {
    log({ type: 'info', message: `Начало генерации сценария для главы ${chapterIndex + 1}` });
    // ... build prompt as before
    try {
        const response = await generateContentWithFallback({ contents: prompt }, log, apiKeys);
        const data = await parseGeminiJsonResponse(response.text, log, apiKeys);

        log({ type: 'info', message: 'Начало пакетного поиска SFX...' });
        const scriptWithSfx = await findSfxForScript(data.script, log, apiKeys);
        data.script = scriptWithSfx;
        log({ type: 'info', message: 'Пакетный поиск SFX завершен.' });

        log({ type: 'info', message: `Сценарий для главы ${chapterIndex + 1} успешно создан.` });
        return data;
    } catch (error) {
        log({ type: 'error', message: `Ошибка при генерации сценария для главы ${chapterIndex + 1}`, data: error });
        throw error;
    }
};
// --- ALL OTHER LOGIC REMAINS UNCHANGED ---