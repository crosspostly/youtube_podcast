
// services/sfxService.ts
import type { LogEntry, SoundEffect, ScriptLine } from '../types';
import { getApiKey } from '../config/apiConfig';
import { generateContentWithFallback } from './aiTextService';
import { getSfxKeywordsPrompt } from './prompts';
// Fix: Import the new proxy utility to fix CORS issues.
import { getProxiedUrl } from './apiUtils';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;

const FREESOUND_API_URL = 'https://freesound.org/apiv2/search/text/';
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const performFreesoundSearch = async (searchTags: string, log: LogFunction, retryWithFewerTerms: boolean = true): Promise<SoundEffect[]> => {
    const apiKey = getApiKey('freesound');
    // Clean tags: remove punctuation, extra spaces
    const cleanTags = searchTags.replace(/[^\w\s]/gi, '').trim().replace(/\s+/g, ' ');
    
    if (!cleanTags || !apiKey) {
        if (!apiKey) log({ type: 'info', message: 'Freesound API key не предоставлен.' });
        return [];
    }

    const searchUrl = `${FREESOUND_API_URL}?query=${encodeURIComponent(cleanTags)}&fields=id,name,previews,license,username&sort=relevance&page_size=15`;
    log({ type: 'request', message: `Запрос SFX с Freesound (Query: "${cleanTags}")`, data: { url: searchUrl } });

    try {
        const proxiedUrl = getProxiedUrl(searchUrl);
        const response = await fetch(proxiedUrl, {
            method: 'GET',
            headers: { 'Authorization': `Token ${apiKey}` },
            mode: 'cors'
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            log({ 
                type: 'error', 
                message: `Freesound API Error. Status: ${response.status} ${response.statusText}`, 
                data: { body: errorText, headers: Object.fromEntries(response.headers.entries()) } 
            });
            return [];
        }
        
        const data = await response.json();
        
        if (!data || !data.results || data.results.length === 0) {
            log({ type: 'info', message: `Freesound: Ничего не найдено по запросу "${cleanTags}".` });
            
            // Fallback strategy: If no results and multiple words, try removing the last word
            if (retryWithFewerTerms) {
                const words = cleanTags.split(' ');
                if (words.length > 1) {
                    const shorterQuery = words.slice(0, -1).join(' ');
                    log({ type: 'info', message: `Попытка упрощенного поиска: "${shorterQuery}"` });
                    return performFreesoundSearch(shorterQuery, log, true);
                }
            }
            return [];
        }
        
        return data.results;

    } catch (error: any) {
        const errorMsg = error.message || String(error);
        // Check for common "AdBlock" or "Network blocked" errors
        if (errorMsg === 'Failed to fetch' || error.name === 'TypeError') {
             log({ 
                type: 'error', 
                message: 'СЕТЕВАЯ ОШИБКА: Запрос к Freesound заблокирован. Отключите AdBlock, uBlock Origin или Privacy Badger для этого сайта.', 
                data: { error: errorMsg, hint: "Браузер заблокировал запрос до его отправки." } 
            });
        } else {
            log({ type: 'error', message: 'Ошибка при запросе к Freesound.', data: error });
        }
        return [];
    }
};

export const findSfxManually = async (keywords: string, log: LogFunction): Promise<SoundEffect[]> => {
    log({ type: 'info', message: `Ручной поиск SFX по ключевым словам: ${keywords}` });
    return performFreesoundSearch(keywords, log);
};

export const findSfxWithAi = async (description: string, log: LogFunction): Promise<SoundEffect[]> => {
    log({ type: 'info', message: 'Запрос к ИИ для подбора ключевых слов для SFX.' });
    try {
        const prompt = getSfxKeywordsPrompt(description);
        const keywordsResponse = await generateContentWithFallback({ contents: prompt }, log);
        const keywords = keywordsResponse.text.trim();
        log({ type: 'info', message: `ИИ предложил ключевые слова для SFX: ${keywords}` });
        return performFreesoundSearch(keywords, log);
    } catch (error) {
        log({ type: 'error', message: 'Ошибка в процессе поиска SFX с ИИ.', data: error });
        throw new Error('Не удалось подобрать SFX.');
    }
};

export const findSfxForScript = async (script: ScriptLine[], log: LogFunction): Promise<ScriptLine[]> => {
    const newScript = [...script];
    let requestCount = 0;
    for (let i = 0; i < newScript.length; i++) {
        const line = newScript[i];
        if (line.speaker.toUpperCase() === 'SFX' && line.searchKeywords) {
            if (requestCount > 0) {
                log({ type: 'info', message: 'Задержка 1.5с перед следующим запросом к Freesound...' });
                await delay(1500);
            }
            requestCount++;
            try {
                const sfxTracks = await findSfxManually(line.searchKeywords, log);
                if (sfxTracks.length > 0) {
                    newScript[i] = { ...line, soundEffect: sfxTracks[0], soundEffectVolume: 0.5 };
                    log({ type: 'info', message: `SFX найден: ${sfxTracks[0].name}` });
                } else {
                    log({ type: 'info', message: `SFX не найден для: ${line.text}` });
                }
            } catch (e) { 
                log({type: 'error', message: `Не удалось автоматически найти SFX для "${line.text}"`, data: e});
            }
        }
    }
    return newScript;
};
