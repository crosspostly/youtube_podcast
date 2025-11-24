
// services/sfxService.ts
import type { LogEntry, SoundEffect, ScriptLine } from '../types';
import { getApiKey } from '../config/apiConfig';
import { generateContentWithFallback } from './aiTextService';
import { getSfxKeywordsPrompt } from './prompts';
import { fetchWithCorsFallback } from './apiUtils';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;

// ✅ НОВОЕ: Актуальный API endpoint
const FREESOUND_API_URL = 'https://freesound.org/apiv2/search/';
const MAX_SFX_DURATION = 10; // секунд
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ✅ НОВОЕ: Кэширование результатов
const sfxCache = new Map<string, { 
    results: SoundEffect[], 
    timestamp: number 
}>();

const CACHE_TTL = 60 * 60 * 1000; // 1 час

/**
 * ✅ НОВОЕ: Интеллектуальное упрощение запроса:
 * 1. Удалить стоп-слова (the, a, sound, noise, effect, sfx)
 * 2. Выделить приоритетные ключевые слова (взрывы, звуки природы, механика)
 * 3. Взять 1-2 самых важных слова для тегов
 */
const simplifySearchQuery = (query: string): { tags: string[], keywords: string[] } => {
    // Стоп-слова
    const stopWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'sound', 'noise', 'audio', 'sfx', 'effect'
    ]);
    
    // Приоритетные категории SFX
    const priorityWords = new Set([
        // Взрывы и удары
        'explosion', 'boom', 'crash', 'bang', 'slam', 'hit', 'impact',
        // Воздух и ветер
        'whoosh', 'swoosh', 'wind', 'air', 'blow',
        // Двери и механизмы
        'door', 'gate', 'lock', 'unlock', 'open', 'close', 'creak',
        // Шаги и движение
        'footstep', 'walk', 'run', 'step',
        // Вода
        'water', 'splash', 'drip', 'pour', 'rain', 'wave',
        // Материалы
        'metal', 'wood', 'glass', 'stone', 'plastic',
        // Электроника
        'beep', 'bleep', 'alarm', 'bell', 'chime', 'buzz',
        // Интерфейс
        'click', 'switch', 'button', 'press',
        // Атмосфера
        'drone', 'hum', 'rumble', 'ambient',
        // Погода
        'thunder', 'lightning', 'storm',
        // Транспорт
        'car', 'vehicle', 'engine', 'motor',
        // Оружие
        'gun', 'shot', 'fire', 'weapon'
    ]);
    
    const words = query
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.has(word));
    
    // Разделить на теги (приоритетные) и ключевые слова (остальные)
    const tags = words.filter(word => priorityWords.has(word));
    const keywords = words.filter(word => !priorityWords.has(word)).slice(0, 2);
    
    // Если нет приоритетных слов, взять первые 2 слова как теги
    if (tags.length === 0) {
        return { 
            tags: words.slice(0, 2), 
            keywords: [] 
        };
    }
    
    return { tags, keywords };
};

/**
 * ✅ НОВОЕ: Построить URL поиска с использованием filter (быстрее и точнее)
 */
const buildSearchUrl = (
    tags: string[],
    keywords: string[],
    apiKey: string
): string => {
    // Строим filter
    const filterParts: string[] = [];
    
    // Добавляем теги
    tags.forEach(tag => {
        filterParts.push(`tag:${tag}`);
    });
    
    // Ограничиваем длительность (SFX короткие)
    filterParts.push(`duration:[0 TO ${MAX_SFX_DURATION}]`);
    
    const filter = filterParts.join(' ');
    
    const params = new URLSearchParams({
        filter: filter,
        fields: 'id,name,previews,license,username,duration,tags',
        sort: 'rating_desc', // ✅ По рейтингу, не по relevance
        page_size: '15',
        token: apiKey
    });
    
    // Query только для дополнительных ключевых слов
    if (keywords.length > 0) {
        params.append('query', keywords.join(' '));
    }
    
    return `${FREESOUND_API_URL}?${params.toString()}`;
};

/**
 * ✅ ОБНОВЛЁННАЯ: Выполнить оптимизированный поиск по Freesound
 * @param searchTags Ключевые слова для поиска
 * @param log Функция логирования
 * @param retryWithFewerTerms Повторить с сокращённым запросом если не найдено
 */
export const performFreesoundSearch = async (
    searchTags: string,
    log: LogFunction,
    retryWithFewerTerms: boolean = true
): Promise<SoundEffect[]> => {
    const apiKey = getApiKey('freesound');
    
    if (!searchTags || !apiKey) {
        if (!apiKey) log({ type: 'info', message: 'Freesound API key не предоставлен.' });
        return [];
    }
    
    // ✅ НОВОЕ: Проверка кэша
    const cacheKey = searchTags.toLowerCase().trim();
    const cached = sfxCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        log({ 
            type: 'info', 
            message: `💾 SFX из кэша: "${searchTags}" (${cached.results.length} шт.)` 
        });
        return cached.results;
    }
    
    // ✅ НОВОЕ: Умное упрощение
    const { tags, keywords } = simplifySearchQuery(searchTags);
    
    log({ 
        type: 'info', 
        message: `🔍 Поиск SFX: tags=[${tags.join(', ')}] keywords=[${keywords.join(', ')}]` 
    });
    
    // Fallback: если не нашли, пробуем с одним тегом
    const tryFallback = async (): Promise<SoundEffect[]> => {
        if (!retryWithFewerTerms) return [];
        
        if (tags.length > 1) {
            const singleTag = tags[0];
            log({ type: 'info', message: `🔄 Упрощаем до одного тега: "${singleTag}"` });
            return performFreesoundSearch(singleTag, log, false);
        }
        
        return [];
    };
    
    try {
        const searchUrl = buildSearchUrl(tags, keywords, apiKey);
        
        const response = await fetchWithCorsFallback(searchUrl, {
            method: 'GET',
            mode: 'cors'
        });
        
        if (!response.ok) {
            log({
                type: 'error',
                message: `Freesound API Error: ${response.status} ${response.statusText}`
            });
            return tryFallback();
        }
        
        const data = await response.json();
        
        if (!data || !data.results || data.results.length === 0) {
            log({ 
                type: 'info', 
                message: `Freesound: Ничего не найдено. Упрощаем запрос...` 
            });
            return tryFallback();
        }
        
        log({ 
            type: 'info', 
            message: `✅ Найдено ${data.results.length} SFX за 1 запрос` 
        });
        
        // Фильтруем результаты
        const validResults = data.results
            .filter((sfx: any) => 
                sfx.previews && 
                sfx.previews['preview-hq-mp3'] &&
                sfx.duration <= MAX_SFX_DURATION
            )
            .map((sfx: any) => ({
                ...sfx,
                previews: {
                    ...sfx.previews,
                    'preview-hq-mp3': sfx.previews['preview-hq-mp3'].replace(/^http:\/\//, 'https://')
                }
            }));
        
        // ✅ НОВОЕ: Сохраняем в кэш
        sfxCache.set(cacheKey, { 
            results: validResults, 
            timestamp: Date.now() 
        });
        
        return validResults;
        
    } catch (error: any) {
        log({ 
            type: 'error', 
            message: `Сбой запроса к Freesound: ${error.message}` 
        });
        return tryFallback();
    }
};

/** Найти и скачать SFX с загрузкой blob */
export const findAndDownloadSfx = async (
    keywords: string,
    log: LogFunction
): Promise<SoundEffect[]> => {
    log({ type: 'info', message: `🔊 Поиск и загрузка SFX: "${keywords}"` });
    
    try {
        // Шаг 1: Найти SFX
        const foundSfx = await performFreesoundSearch(keywords, log);
        
        if (foundSfx.length === 0) {
            log({ type: 'info', message: `⚠️  SFX не найден: "${keywords}"` });
            return [];
        }
        
        // Шаг 2: Скачать блоб для каждого найденного SFX
        const downloadedSfx: SoundEffect[] = [];
        for (const sfx of foundSfx) {
            try {
                if (sfx.previews?.['preview-hq-mp3']) {
                    const response = await fetch(sfx.previews['preview-hq-mp3']);
                    if (response.ok) {
                        const blob = await response.blob();
                        downloadedSfx.push({
                            ...sfx,
                            blob: blob,  // ← КЛЮЧЕВО: blob добавлен!
                            downloaded: true,
                            downloadTime: new Date().getTime()
                        });
                        log({ 
                            type: 'info', 
                            message: `✅ SFX скачан: "${sfx.name}" (${(blob.size / 1024).toFixed(1)}KB)` 
                        });
                    } else {
                        throw new Error(`HTTP ${response.status}`);
                    }
                } else {
                    throw new Error('No preview URL available');
                }
            } catch (e) {
                log({ 
                    type: 'info',  // Исправлено с 'warn' на 'info'
                    message: `⚠️  Не удалось скачать SFX "${sfx.name}", но ссылка сохранена`, 
                    data: e 
                });
                // Fallback: вернуть с ссылкой без блоба
                downloadedSfx.push({
                    ...sfx,
                    downloaded: false
                });
            }
        }
        
        return downloadedSfx;
    } catch (error: any) {
        log({ type: 'error', message: 'Ошибка при поиске SFX', data: error });
        return [];
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
    
    // Найти все SFX строки, которые нужно обработать
    const sfxLines = newScript
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => line.speaker.toUpperCase() === 'SFX' && line.searchKeywords);
    
    if (sfxLines.length === 0) {
        log({ type: 'info', message: '🔊 SFX строк для обработки не найдено' });
        return newScript;
    }
    
    log({ type: 'info', message: `🔊 Поиск ${sfxLines.length} SFX параллельно...` });
    
    // ✅ ПАРАЛЛЕЛЬНО искать все SFX
    const sfxPromises = sfxLines.map(({ line }) => 
        findAndDownloadSfx(line.searchKeywords!, log)
    );
    
    const sfxResults = await Promise.all(sfxPromises);
    
    // Применить результаты
    sfxLines.forEach(({ line, index }, i) => {
        const sfxTracks = sfxResults[i];
        if (sfxTracks.length > 0 && sfxTracks[0].blob) {
            newScript[index] = { 
                ...line, 
                soundEffect: sfxTracks[0],
                soundEffectBlob: sfxTracks[0].blob,
                soundEffectVolume: 0.6,
                soundEffectDownloaded: true
            };
            log({ type: 'info', message: `✅ SFX найден и скачан: ${sfxTracks[0].name}` });
        } else if (sfxTracks.length > 0) {
            // Fallback: есть ссылка, но нет блоба
            newScript[index] = { 
                ...line, 
                soundEffect: sfxTracks[0],
                soundEffectVolume: 0.6,
                soundEffectDownloaded: false
            };
            log({ type: 'info', message: `⚠️  SFX найден (только ссылка): ${sfxTracks[0].name}` });
        } else {
            log({ type: 'info', message: `SFX не найден для: ${line.text}` });
        }
    });
    
    log({ type: 'info', message: `✅ Найдено ${sfxResults.filter(r => r.length > 0).length}/${sfxLines.length} SFX` });
    
    return newScript;
};
