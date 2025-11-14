import { generateContentWithFallback, withRetries } from './geminiService';
import { parseGeminiJsonResponse } from './aiUtils';
import type { SoundEffect, LogEntry, ScriptLine } from '../types';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;
type ApiKeys = { gemini?: string; openRouter?: string; freesound?: string; };

const FREESOUND_PROXY_URL = '/api/freesound';

export const performFreesoundSearch = async (searchTags: string, log: LogFunction, customApiKey?: string): Promise<SoundEffect[]> => {
    const tags = searchTags.trim().replace(/,\s*/g, ' ');
    if (!tags) return [];

    log({ type: 'request', message: 'Отправка POST-запроса на прокси Freesound...', data: { query: tags } });

    const doFetch = async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds timeout
        
        let response: Response;
        try {
            log({ type: 'info', message: 'Выполнение fetch-запроса...', data: { query: tags } });
            response = await fetch(FREESOUND_PROXY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    query: tags,
                    customApiKey: customApiKey,
                }),
            });
            log({ type: 'info', message: 'Fetch-запрос завершен, получен ответ.' });
        } catch (fetchError: any) {
            log({ type: 'error', message: 'Ошибка сети при запросе к прокси Freesound (fetch failed)', data: { name: fetchError.name, message: fetchError.message, stack: fetchError.stack } });
            throw fetchError;
        } finally {
            clearTimeout(timeoutId);
        }

        const proxyInvokedHeader = response.headers.get('X-Vercel-Proxy-Invoked') || response.headers.get('X-Dev-Proxy-Invoked');
        log({ type: 'info', message: `Получен ответ от прокси Freesound. Статус: ${response.status}. Хедер прокси: ${proxyInvokedHeader ? 'Да' : 'Нет'}.` });
        
        const rawText = await response.text();
        log({ type: 'info', message: 'Сырой текстовый ответ от прокси (до 500 символов):', data: rawText.substring(0, 500) });

        if (!response.ok) {
            const error: any = new Error(`Freesound Proxy error: ${response.statusText}`);
            error.status = response.status;
            error.data = rawText;
            throw error;
        }

        if (!rawText.trim()) {
            log({ type: 'info', message: 'Прокси Freesound вернул пустой ответ, результатов не найдено.' });
            return { results: [] };
        }

        try {
            const data = JSON.parse(rawText);
            log({ type: 'response', message: 'Ответ от прокси успешно распарсен.' });
            return data;
        } catch (parseError: any) {
            const err: any = new Error('Не удалось распарсить JSON-ответ от прокси Freesound.');
            err.data = { message: parseError.message, responseText: rawText };
            throw err;
        }
    };

    try {
        const data = await withRetries(doFetch, log, 3, 500);
        if (!data || !data.results) {
             log({ type: 'info', message: 'Ответ от Freesound не содержит поля "results".', data });
             return [];
        }
        return data.results;
    } catch (error: any) {
        log({ type: 'error', message: 'Ошибка при запросе к Freesound прокси после всех попыток.', data: { name: error.name, message: error.message, data: error.data } });
        throw error;
    }
};

export const findSfxForScript = async (script: ScriptLine[], log: LogFunction, apiKeys: ApiKeys): Promise<ScriptLine[]> => {
    const sfxLines = script.map((line, index) => ({ line, index }))
                          .filter(({ line }) => line.speaker.toUpperCase() === 'SFX' && line.text);

    if (sfxLines.length === 0) {
        log({ type: 'info', message: 'SFX не найдены в сценарии, пропуск поиска.' });
        return script;
    }

    log({ type: 'request', message: `Запрос ключевых слов для ${sfxLines.length} SFX одним пакетом.` });

    const sfxDescriptions = sfxLines.map(({ line }) => line.text);
    
    const prompt = `For each of the following ${sfxDescriptions.length} sound effect descriptions, generate a simple, effective search query of 2-3 English keywords for a sound library like Freesound.org.\n\nDescriptions:\n${sfxDescriptions.map((d, i) => `${i + 1}. \"${d}\"`).join('\n')}\n\nReturn the result as a SINGLE VALID JSON OBJECT in \`\`\`json ... \`\`\`.\n\n**JSON Structure:**\n{\n  \"keywords\": [\n    \"keywords for description 1\",\n    \"keywords for description 2\",\n    ...\n  ]\n}`;

    try {
        const response = await generateContentWithFallback({ contents: prompt }, log, apiKeys);
        const data = await parseGeminiJsonResponse(response.text, log, apiKeys);
        const keywordsList = data.keywords as string[];

        if (!keywordsList || keywordsList.length !== sfxLines.length) {
            throw new Error(`Gemini returned an incorrect number of keyword sets. Expected ${sfxLines.length}, got ${keywordsList?.length || 0}.`);
        }
        
        const populatedScript = [...script];
        
        for (let i = 0; i < sfxLines.length; i++) {
            const { line, index } = sfxLines[i];
            const keywords = keywordsList[i];
            log({ type: 'info', message: `Поиск SFX для "${line.text}" по ключевым словам: "${keywords}"` });

            if (keywords) {
                try {
                    // Search Freesound sequentially to avoid overwhelming their API
                    const sfxTracks = await performFreesoundSearch(keywords, log, apiKeys.freesound);
                    if (sfxTracks.length > 0) {
                        populatedScript[index] = { ...line, soundEffect: sfxTracks[0], soundEffectVolume: 0.5 };
                        log({ type: 'response', message: `Найден SFX: ${sfxTracks[0].name}` });
                    } else {
                        log({ type: 'info', message: `SFX по ключевым словам "${keywords}" не найдены.` });
                    }
                } catch (e) {
                     log({ type: 'error', message: `Ошибка поиска SFX на Freesound для "${keywords}"`, data: e });
                }
            }
        }
        return populatedScript;
        
    } catch (error) {
        log({ type: 'error', message: 'Ошибка при пакетной генерации ключевых слов для SFX. SFX не будут добавлены.', data: error });
        // Return original script if batch processing fails
        return script;
    }
};

export const findSfxWithAi = async (description: string, log: LogFunction, apiKeys: ApiKeys): Promise<SoundEffect[]> => {
    log({ type: 'request', message: `Запрос ключевых слов для SFX: "${description}"` });

    const prompt = `For the following sound effect description, generate a simple, effective search query of 2-3 English keywords for a sound library like Freesound.org.
    
    Description: "${description}"
    
    Return ONLY the comma-separated keywords.
    
    Example for "A heavy wooden door creaking open": 
    door, wood, creak
    
    Keywords:`;

    try {
        const keywordsResponse = await generateContentWithFallback({ contents: prompt }, log, apiKeys);
        const keywords = keywordsResponse.text.trim();
        log({ type: 'info', message: `ИИ предложил ключевые слова для SFX: ${keywords}` });

        if (!keywords) {
            log({ type: 'info', message: 'ИИ не вернул ключевых слов.' });
            return [];
        }

        let searchTerms = keywords.split(/[\s,]+/).filter(Boolean);
        while (searchTerms.length > 0) {
            const currentQuery = searchTerms.join(' ');
            log({ type: 'info', message: `Поиск SFX по запросу: "${currentQuery}"` });
            const sfxResults = await performFreesoundSearch(currentQuery, log, apiKeys.freesound);
            if (sfxResults.length > 0) {
                log({ type: 'info', message: `Найдено ${sfxResults.length} SFX по запросу "${currentQuery}".` });
                return sfxResults;
            }
            log({ type: 'info', message: `По запросу "${currentQuery}" ничего не найдено, сокращаем запрос...` });
            searchTerms.pop();
        }

        log({ type: 'info', message: `По ключевым словам "${keywords}" ничего не найдено.` });
        return [];
    } catch (error) {
        log({ type: 'error', message: `Ошибка в процессе поиска SFX с ИИ для "${description}".`, data: error });
        throw new Error('Не удалось подобрать SFX.');
    }
};

export const findSfxManually = async (keywords: string, log: LogFunction, customApiKey?: string): Promise<SoundEffect[]> => {
    log({ type: 'info', message: `Ручной поиск SFX по ключевым словам: ${keywords}` });
    try {
        const tracks = await performFreesoundSearch(keywords, log, customApiKey);
        if (tracks.length > 0) {
            log({ type: 'response', message: 'SFX по ручному запросу успешно получены.' });
        } else {
            log({ type: 'info', message: 'По ручному запросу SFX не найдены.' });
        }
        return tracks;
    } catch (error) {
        log({ type: 'error', message: 'Ошибка при ручном поиске SFX.', data: error });
        throw new Error('Не удалось найти SFX.');
    }
};
