import { generateContentWithFallback, withRetries } from './geminiService';
import type { SoundEffect, LogEntry } from '../types';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;
type ApiKeys = { gemini?: string; openRouter?: string; freesound?: string; };

const FREESOUND_PROXY_URL = '/api/freesound';

export const performFreesoundSearch = async (searchTags: string, log: LogFunction, customApiKey?: string): Promise<SoundEffect[]> => {
    const tags = searchTags.trim().replace(/,\s*/g, ' ');
    if (!tags) return [];

    const params = new URLSearchParams({ query: tags });
    if (customApiKey) {
        params.append('customApiKey', customApiKey);
    }
    const searchUrl = `${FREESOUND_PROXY_URL}?${params.toString()}`;

    log({ type: 'request', message: 'Отправка GET-запроса на прокси Freesound...', data: { url: searchUrl } });


    const doFetch = async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds timeout
        
        let response: Response;
        try {
            log({ type: 'info', message: 'Выполнение fetch-запроса...', data: { url: searchUrl } });
            response = await fetch(searchUrl, {
                method: 'GET',
                signal: controller.signal,
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

export const findSfxManually = async (keywords: string, log: LogFunction, apiKey?: string): Promise<SoundEffect[]> => {
    log({ type: 'info', message: `Ручной поиск SFX по ключевым словам: ${keywords}` });
    return performFreesoundSearch(keywords, log, apiKey);
};

export const findSfxWithAi = async (description: string, log: LogFunction, apiKeys: ApiKeys): Promise<SoundEffect[]> => {
    log({ type: 'info', message: 'Запрос к ИИ для подбора ключевых слов для SFX.' });
    
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
        attempts++;
        try {
            const prompt = `Analyze the following sound effect description: "${description}".
            Your task is to generate a simple, effective search query of 2-3 English keywords for a sound library like Freesound.org.
            Focus on the core sound, avoiding generic terms like "sound of".
            
            Examples:
            - "Sound of a heavy wooden door creaking open": heavy door creak
            - "A wolf howls at the full moon in a forest": wolf howl forest
            - "Footsteps on wet pavement": footsteps wet pavement
            
            Description: "${description}"
            Keywords:`;

            const keywordsResponse = await generateContentWithFallback({ contents: prompt }, log, apiKeys);
            const keywords = keywordsResponse.text.trim();
            log({ type: 'info', message: `ИИ предложил ключевые слова для SFX (Попытка ${attempts}): ${keywords}` });

            if (!keywords) {
                log({ type: 'info', message: `ИИ не вернул ключевых слов. Попытка ${attempts}.` });
                continue;
            }

            let searchTerms = keywords.split(/[\s,]+/).filter(Boolean);
            while (searchTerms.length > 0) {
                const currentQuery = searchTerms.join(' ');
                log({ type: 'info', message: `Поиск SFX по запросу: "${currentQuery}"` });
                const sfxResults = await performFreesoundSearch(currentQuery, log, apiKeys.freesound);
                if (sfxResults.length > 0) {
                    log({ type: 'info', message: `Найдено ${sfxResults.length} SFX по запросу "${currentQuery}"` });
                    return sfxResults;
                }
                log({ type: 'info', message: `По запросу "${currentQuery}" ничего не найдено, сокращаем запрос...` });
                searchTerms.pop();
            }
            log({ type: 'info', message: `По ключевым словам "${keywords}" ничего не найдено даже после упрощения.` });
        } catch (error) {
            log({ type: 'error', message: `Ошибка в процессе поиска SFX с ИИ (Попытка ${attempts}).`, data: error });
            if (attempts >= maxAttempts) {
                throw new Error('Не удалось подобрать SFX.');
            }
        }
    }

    log({ type: 'info', message: `Не удалось найти SFX после ${maxAttempts} попыток.` });
    return [];
};