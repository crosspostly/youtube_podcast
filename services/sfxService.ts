
// services/sfxService.ts
import type { LogEntry, SoundEffect, ScriptLine } from '../types';
import { getApiKey } from '../config/apiConfig';
import { generateContentWithFallback } from './aiTextService';
import { getSfxKeywordsPrompt } from './prompts';
import { fetchWithCorsFallback } from './apiUtils';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;

const FREESOUND_API_URL = 'https://freesound.org/apiv2/search/text/';
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Выполнить текстовый поиск по Freesound с fallback и чисткой ключевых слов.
 * @param searchTags Ключевые слова для поиска
 * @param log Функция логирования
 * @param retryWithFewerTerms Повторить с сокращённым запросом если не найдено
 */
const performFreesoundSearch = async (
    searchTags: string,
    log: LogFunction,
    retryWithFewerTerms: boolean = true
): Promise<SoundEffect[]> => {
    const apiKey = getApiKey('freesound');
    const cleanTags = searchTags
        .replace(/[^\w\s-]/gi, '')         // удаляем пунктуацию
        .replace(/\s+/g, ' ')             // множественные пробелы одним
        .trim();

    if (!cleanTags || !apiKey) {
        if (!apiKey) log({ type: 'info', message: 'Freesound API key не предоставлен.' });
        return [];
    }

    // Recursive fallback helper
    const tryFallback = () => {
        if (retryWithFewerTerms) {
            const words = cleanTags.split(' ');
            if (words.length > 1) {
                const shorterQuery = words.slice(0, -1).join(' ');
                log({ type: 'info', message: `🔄 Попытка упрощенного поиска: "${shorterQuery}"` });
                return performFreesoundSearch(shorterQuery, log, true);
            }
        }
        return Promise.resolve([]);
    };

    const searchUrl = `${FREESOUND_API_URL}?query=${encodeURIComponent(cleanTags)}&fields=id,name,previews,license,username&sort=relevance&page_size=15`;
    log({ type: 'request', message: `Запрос SFX с Freesound (Query: "${cleanTags}")` });

    try {
        const response = await fetchWithCorsFallback(searchUrl, {
            method: 'GET',
            headers: { 'Authorization': `Token ${apiKey}` },
            mode: 'cors'
        });

        if (!response.ok) {
            log({
                type: 'error',
                message: `Freesound API Error: ${response.status} ${response.statusText}.`
            });
            // On API error (like 400 Bad Request due to complex query), try fallback
            return tryFallback();
        }

        const data = await response.json();

        if (!data || !data.results || data.results.length === 0) {
            log({ type: 'info', message: `Freesound: Ничего не найдено по запросу "${cleanTags}".` });
            // On empty results, try fallback
            return tryFallback();
        }

        // Возвращаем только валидные результаты с https и mp3 preview
        return data.results
            .filter((sfx: any) => sfx.previews && sfx.previews['preview-hq-mp3'])
            .map((sfx: any) => ({
                ...sfx,
                previews: {
                    ...sfx.previews,
                    'preview-hq-mp3': sfx.previews['preview-hq-mp3'].replace(/^http:\/\//, 'https://')
                }
            }));
    } catch (error: any) {
        const errorMsg = error.message || String(error);
        log({ 
            type: 'error', 
            message: `Сбой запроса к Freesound ("${cleanTags}").`, 
            data: errorMsg 
        });
        // On network/fetch error, try fallback as the query might be malformed for the proxy
        return tryFallback();
    }
};

/** Ручной поиск SFX по ключевым словам */
export const findSfxManually = async (keywords: string, log: LogFunction): Promise<SoundEffect[]> => {
    log({ type: 'info', message: `Ручной поиск SFX по ключевым словам: ${keywords}` });
    return performFreesoundSearch(keywords, log);
};

/** Автоматический подбор SFX через ИИ-описание */
export const findSfxWithAi = async (description: string, log: LogFunction): Promise<SoundEffect[]> => {
    log({ type: 'info', message: 'Запрос к ИИ для подбора ключевых слов для SFX.' });
    try {
        const prompt = getSfxKeywordsPrompt(description);
        const keywordsResponse = await generateContentWithFallback({ contents: prompt }, log);
        const keywords = keywordsResponse.text.trim();
        log({ type: 'info', message: `ИИ предложил ключевые слова для SFX: ${keywords}` });
        return performFreesoundSearch(keywords, log);
    } catch (error: any) {
        log({ type: 'error', message: 'Ошибка в процессе поиска SFX с ИИ.', data: error.message || error });
        return [];
    }
};

/** Автоматически подобрать и подставить SFX во все SFX-реплики сценария */
export const findSfxForScript = async (script: ScriptLine[], log: LogFunction): Promise<ScriptLine[]> => {
    const newScript = [...script];
    let requestCount = 0;
    for (let i = 0; i < newScript.length; i++) {
        const line = newScript[i];
        if (line.speaker.toUpperCase() === 'SFX' && line.searchKeywords) {
            if (requestCount > 0) {
                // Небольшая задержка, чтобы не спамить API
                await delay(1000);
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
                log({ type: 'error', message: `Не удалось автоматически найти SFX для "${line.text}"`, data: e });
            }
        }
    }
    return newScript;
};
