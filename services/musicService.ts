
// services/musicService.ts
import type { LogEntry, MusicTrack } from '../types';
import { getApiKey } from '../config/apiConfig';
import { generateContentWithFallback } from './aiTextService';
import { getMusicKeywordsPrompt } from './prompts';
import { fetchWithCorsFallback } from './apiUtils';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;

const JAMENDO_API_URL = 'https://api.jamendo.com/v3.0/tracks/';

const searchJamendo = async (query: string, clientId: string, log: LogFunction): Promise<MusicTrack[]> => {
    if (!query) return [];
    
    // Use fuzzytags for broader search based on multiple keywords
    const searchUrl = `${JAMENDO_API_URL}?client_id=${clientId}&format=json&limit=10&fuzzytags=${encodeURIComponent(query)}&order=popularity_total`;
    log({ type: 'request', message: `Запрос музыки с Jamendo: ${query}`, data: { url: searchUrl } });

    try {
        // Use CORS fallback
        const jamendoResponse = await fetchWithCorsFallback(searchUrl);
        
        if (!jamendoResponse.ok) {
            log({ type: 'error', message: `Jamendo API error: ${jamendoResponse.statusText}` });
            return [];
        }
        const jamendoData = await jamendoResponse.json();

        if (!jamendoData || !jamendoData.results || jamendoData.results.length === 0) {
            return [];
        }
        
        return jamendoData.results.map((track: any) => ({
            id: track.id,
            name: track.name,
            artist_name: track.artist_name,
            // Fix: Force HTTPS for audio URLs to prevent Mixed Content errors
            audio: track.audio.replace(/^http:\/\//, 'https://')
        }));
    } catch (error) {
        log({ type: 'error', message: `Network error while searching music for '${query}'`, data: error });
        return [];
    }
};

const searchJamendoWithStrategy = async (keywords: string, log: LogFunction): Promise<MusicTrack[]> => {
    const clientId = getApiKey('jamendo');
    if (!clientId) {
        log({ type: 'info', message: 'Jamendo Client ID не предоставлен.' });
        return [];
    }

    // Prepare query: replace commas with spaces and trim
    const query = (keywords || "").replace(/,\s*/g, ' ').trim();
    
    if (!query) {
        log({ type: 'info', message: 'Ключевые слова для поиска музыки не предоставлены.' });
        return [];
    }
    
    try {
        const tracks = await searchJamendo(query, clientId, log);
        return tracks;
    } catch (e) {
        log({ type: 'error', message: `Ошибка при поиске по запросу "${query}"`, data: e });
        return [];
    }
};

export const findMusicManually = async (keywords: string, log: LogFunction): Promise<MusicTrack[]> => {
    log({ type: 'info', message: `Ручной поиск музыки по ключевым словам: ${keywords}` });
    try {
        const tracks = await searchJamendoWithStrategy(keywords, log);
        if (tracks.length > 0) {
            log({ type: 'response', message: `Найдено ${tracks.length} треков по запросу.` });
        } else {
            log({ type: 'info', message: 'По запросу музыка не найдена.' });
        }
        return tracks;
    } catch (error) {
        log({ type: 'error', message: 'Ошибка при ручном поиске музыки.', data: error });
        throw new Error('Не удалось найти музыку.');
    }
};

export const findMusicWithAi = async (topic: string, log: LogFunction): Promise<MusicTrack[]> => {
    log({ type: 'info', message: 'Запрос к ИИ для подбора ключевых слов для музыки.' });
    
    try {
        const keywordsPrompt = getMusicKeywordsPrompt(topic);
        const keywordsResponse = await generateContentWithFallback({ contents: keywordsPrompt }, log);
        const keywords = keywordsResponse.text.trim();
        log({ type: 'info', message: `ИИ предложил ключевые слова: ${keywords}` });

        const tracks = await searchJamendoWithStrategy(keywords, log);
        
        log({ type: 'response', message: tracks.length > 0 ? `AI подобрал ${tracks.length} треков.` : 'Музыка не найдена.' });
        return tracks;

    } catch (error) {
        log({ type: 'error', message: 'Ошибка в процессе поиска музыки с ИИ.', data: error });
        throw new Error('Не удалось подобрать музыку.');
    }
};