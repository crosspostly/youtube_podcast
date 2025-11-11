import { GoogleGenAI, Modality } from "@google/genai";
import type { Podcast, Chapter, Source, LogEntry, ScriptLine, Character } from '../types';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;

const getAiClient = (log: LogFunction, customApiKey?: string) => {
  const apiKey = customApiKey || process.env.API_KEY;
  if (!apiKey) {
    const errorMsg = "Ключ API не настроен. Убедитесь, что переменная окружения API_KEY установлена или введен пользовательский ключ.";
    log({ type: 'error', message: errorMsg });
    throw new Error(errorMsg);
  }
  return new GoogleGenAI({ apiKey });
};

// --- WAV UTILITIES ---

const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
};

const createWavBlobFromPcm = (pcmData: Int16Array, sampleRate: number, numChannels: number): Blob => {
    const bitsPerSample = 16;
    const buffer = new ArrayBuffer(44 + pcmData.byteLength);
    const view = new DataView(buffer);
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcmData.byteLength, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(view, 36, 'data');
    view.setUint32(40, pcmData.byteLength, true);

    const pcmView = new Int16Array(buffer, 44);
    pcmView.set(pcmData);

    return new Blob([view], { type: 'audio/wav' });
};


const combineWavBlobs = async (blobs: Blob[]): Promise<Blob> => {
    const buffers = await Promise.all(blobs.map(b => b.arrayBuffer()));
    if (buffers.length === 0) throw new Error("Нет аудиофайлов для сборки.");

    const firstHeader = new DataView(buffers[0].slice(0, 44));
    const numChannels = firstHeader.getUint16(22, true);
    const sampleRate = firstHeader.getUint32(24, true);
    const bitsPerSample = firstHeader.getUint16(34, true);

    const dataChunks = buffers.map(buffer => buffer.slice(44));
    const totalDataLength = dataChunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
    
    const finalBuffer = new ArrayBuffer(44 + totalDataLength);
    const finalView = new DataView(finalBuffer);

    // Write new WAV header
    writeString(finalView, 0, 'RIFF');
    finalView.setUint32(4, 36 + totalDataLength, true);
    writeString(finalView, 8, 'WAVE');
    writeString(finalView, 12, 'fmt ');
    finalView.setUint32(16, 16, true); // Sub-chunk size
    finalView.setUint16(20, 1, true); // Audio format (PCM)
    finalView.setUint16(22, numChannels, true);
    finalView.setUint32(24, sampleRate, true);
    finalView.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true); // Byte rate
    finalView.setUint16(32, numChannels * (bitsPerSample / 8), true); // Block align
    finalView.setUint16(34, bitsPerSample, true);
    writeString(finalView, 36, 'data');
    finalView.setUint32(40, totalDataLength, true);

    // Concatenate data
    let offset = 44;
    for (const chunk of dataChunks) {
        const sourceArray = new Uint8Array(chunk);
        const destArray = new Uint8Array(finalBuffer, offset, chunk.byteLength);
        destArray.set(sourceArray);
        offset += chunk.byteLength;
    }

    return new Blob([finalBuffer], { type: 'audio/wav' });
};

// --- SCRIPT & AUDIO GENERATION ---

const parseGeminiJsonResponse = (rawText: string, log: LogFunction): any => {
    log({ type: 'response', message: 'Сырой ответ от Gemini', data: rawText });
    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : rawText;
    try {
        return JSON.parse(jsonText);
    } catch (jsonError) {
        log({ type: 'error', message: 'Не удалось распарсить JSON из ответа модели.', data: jsonText });
        throw new Error(`Ответ модели не является валидным JSON. Подробности в журнале.`);
    }
};

export const googleSearchForKnowledge = async (question: string, log: LogFunction, apiKey?: string): Promise<string> => {
    log({ type: 'info', message: 'Начало поиска информации в Google для базы знаний.' });
    const ai = getAiClient(log, apiKey);
    const model = "gemini-2.5-pro";

    const prompt = `Используя Google Search, найди и предоставь подробный, структурированный ответ на следующий вопрос. Ответ должен быть исчерпывающим, хорошо отформатированным и содержать ключевые факты. Пиши на русском языке.

    Вопрос: "${question}"`;

    try {
        log({ type: 'request', message: `Запрос к модели ${model} с Google Search`, data: { question } });
        const response = await ai.models.generateContent({ 
            model, 
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] } 
        });
        
        const answer = response.text;
        if (!answer.trim()) {
            throw new Error("Не удалось получить содержательный ответ от Google Search.");
        }
        
        log({ type: 'response', message: 'Ответ от Google Search получен.' });
        return answer;
    } catch (error) {
        const errorMessage = `Не удалось выполнить поиск: ${error instanceof Error ? error.message : String(error)}`;
        log({ type: 'error', message: 'Ошибка при поиске в Google', data: error });
        throw new Error(errorMessage);
    }
};

export const generatePodcastBlueprint = async (topic: string, knowledgeBaseText: string, creativeFreedom: boolean, log: LogFunction, apiKey?: string): Promise<Omit<Podcast, 'chapters' | 'totalDurationMinutes' | 'creativeFreedom' | 'knowledgeBaseText' > & { chapters: Chapter[] }> => {
    log({ type: 'info', message: 'Начало генерации концепции подкаста и первой главы.' });
    const ai = getAiClient(log, apiKey);
    const model = "gemini-2.5-pro";

    const sourceInstruction = knowledgeBaseText
        ? `Используй СТРОГО И ТОЛЬКО предоставленный ниже текст ("База знаний") как ЕДИНСТВЕННЫЙ источник фактов. Не используй Google Search и не придумывай факты.`
        : `Используй Google Search для сбора фактов и информации по теме.`;

    const styleInstruction = creativeFreedom
        ? `**Требования к стилю (Творческая свобода):**
    - **Атмосфера:** Создай гнетущую, таинственную и мистическую атмосферу в стиле Стивена Кинга и Говарда Лавкрафта. Используй недомолвки, намёки на древнее зло и психологическое напряжение.
    - **Повествование:** История должна захватывать с первых секунд и держать в напряжении. Факты из источника используй как основу, но вплетай их в художественный, леденящий душу рассказ.`
        : `**Требования к стилю (Документальная точность):**
    - **Атмосфера:** Создай серьезный, информативный и объективный тон повествования.
    - **Повествование:** Строго придерживайся фактов из источника. Построй повествование в документальном стиле, без вымысла и художественных преувеличений.`;
    
    const knowledgeBaseBlock = knowledgeBaseText
        ? `\n\n**База знаний (Единственный источник фактов):**\n---\n${knowledgeBaseText}\n---`
        : "";

    const prompt = `Ты — ИИ-сценарист и YouTube-продюсер. Твоя задача — создать полный пакет материалов для захватывающего видео на YouTube на тему: "${topic}".
    
    ${sourceInstruction}
    ${styleInstruction}

    **Общие требования к заданию:**
    - Сценарий главы должен быть рассчитан примерно на 4-5 минут озвучки. **ВАЖНО: Общий объем текста сценария этой главы НЕ ДОЛЖЕН ПРЕВЫШАТЬ 7000 символов.**
    1.  Придумай двух уникальных персонажей для этого видео (например, "Ведущий", "Историк"). Дай каждому краткое описание (пол, характер голоса).
    2.  Создай текстовые материалы, оптимизированные для YouTube (название, описание, теги) и 10 промптов для изображений.
    3.  Напиши сценарий ПЕРВОЙ ГЛАВЫ. Все ремарки оформляй как отдельный элемент со спикером "SFX".

    Результат верни как ЕДИНЫЙ ВАЛИДНЫЙ JSON-ОБЪЕКТ в \`\`\`json ... \`\`\`.

    **Структура JSON:**
    {
      "title": "Кликабельное, интригующее и SEO-оптимизированное название для YouTube видео",
      "description": "Развернутое описание для YouTube видео (2-3 абзаца). Должно заинтересовать зрителя, кратко изложить суть и содержать призыв к действию (подписаться, поставить лайк).",
      "seoKeywords": ["список", "из", "10-15", "релевантных", "тегов", "для", "YouTube видео"],
      "imagePrompts": [
        "10 уникальных, детализированных промптов на английском для генерации изображений."
      ],
      "characters": [
        { "name": "Имя Персонажа 1", "description": "Краткое описание, пол и характер голоса. Например: мужской, глубокий, авторитетный голос." },
        { "name": "Имя Персонажа 2", "description": "Краткое описание, пол и характер голоса. Например: женский, спокойный, интригующий голос." }
      ],
      "chapter": {
        "title": "Название первой главы",
        "script": [
          { "speaker": "SFX", "text": "Звук открывающейся скрипучей двери..." },
          { "speaker": "Имя Персонажа 1", "text": "Текст интригующего вступления..." },
          { "speaker": "Имя Персонажа 2", "text": "Загадочный ответ..." }
        ]
      }
    }${knowledgeBaseBlock}`;
    
    try {
        log({ type: 'request', message: `Запрос к модели ${model} для создания концепции`, data: { prompt } });
        const config = knowledgeBaseText ? {} : { tools: [{ googleSearch: {} }] };
        const response = await ai.models.generateContent({ model, contents: prompt, config });
        const data = parseGeminiJsonResponse(response.text, log);

        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        const sources: Source[] = knowledgeBaseText ? [] : Array.from(new Map<string, Source>(groundingChunks.map((c: any) => c.web).filter((w: any) => w?.uri).map((w: any) => [w.uri, { uri: w.uri, title: w.title?.trim() || w.uri }])).values());
        
        const firstChapter: Chapter = {
            id: crypto.randomUUID(),
            title: data.chapter.title,
            script: data.chapter.script,
            status: 'pending',
        };
        
        log({ type: 'info', message: 'Концепция подкаста и первая глава успешно созданы.' });
        return {
            id: crypto.randomUUID(),
            topic,
            title: data.title,
            description: data.description,
            seoKeywords: data.seoKeywords,
            imagePrompts: data.imagePrompts,
            characters: data.characters,
            sources,
            chapters: [firstChapter]
        };
    } catch (error) {
        log({ type: 'error', message: 'Ошибка при создании концепции подкаста', data: error });
        throw error;
    }
};

export const regenerateTextAssets = async (topic: string, knowledgeBaseText: string, creativeFreedom: boolean, log: LogFunction, apiKey?: string): Promise<{ title: string; description: string; seoKeywords: string[] }> => {
    log({ type: 'info', message: 'Начало регенерации текстовых материалов для YouTube.' });
    const ai = getAiClient(log, apiKey);
    const model = "gemini-2.5-pro";

    const styleInstruction = creativeFreedom 
        ? "Стиль: художественный, мистический, интригующий." 
        : "Стиль: документальный, строгий, информативный.";

    const prompt = `Ты — эксперт по YouTube-маркетингу. Твоя задача — создать новые, еще более привлекательные текстовые материалы для видео на тему: "${topic}".
    
    ${styleInstruction}

    Основываясь на теме и стиле, сгенерируй:
    1.  Новое название.
    2.  Новое описание.
    3.  Новый набор тегов.

    Результат верни как ЕДИНЫЙ ВАЛИДНЫЙ JSON-ОБЪЕКТ в \`\`\`json ... \`\`\`.

    **Структура JSON:**
    {
      "title": "Новое, еще более кликабельное и SEO-оптимизированное название для YouTube видео",
      "description": "Новое, развернутое описание для YouTube видео (2-3 абзаца) с призывом к действию.",
      "seoKeywords": ["новый", "список", "из", "10-15", "релевантных", "тегов", "для", "YouTube видео"]
    }`;

    try {
        log({ type: 'request', message: `Запрос к модели ${model} для регенерации текста`, data: { prompt } });
        const response = await ai.models.generateContent({ model, contents: prompt });
        const data = parseGeminiJsonResponse(response.text, log);
        log({ type: 'info', message: 'Текстовые материалы успешно обновлены.' });
        return data;
    } catch (error) {
        log({ type: 'error', message: 'Ошибка при регенерации текстовых материалов', data: error });
        throw error;
    }
};

export const generateNextChapterScript = async (topic: string, podcastTitle: string, characters: Character[], previousChapters: Chapter[], chapterIndex: number, knowledgeBaseText: string, creativeFreedom: boolean, log: LogFunction, apiKey?: string): Promise<{title: string, script: ScriptLine[]}> => {
    log({ type: 'info', message: `Начало генерации сценария для главы ${chapterIndex + 1}` });
    const ai = getAiClient(log, apiKey);
    const model = "gemini-2.5-pro";
    const previousSummary = previousChapters.map((c, i) => `Глава ${i+1}: ${c.title} - ${c.script.slice(0, 2).map(s => s.text).join(' ')}...`).join('\n');
    const characterDescriptions = characters.map(c => `- ${c.name}: ${c.description}`).join('\n');

    const styleInstruction = creativeFreedom
        ? "Продолжай историю в захватывающем и атмосферном стиле Кинга/Лавкрафта. Углубляй тайну, вводи новые тревожные детали, нагнетай напряжение."
        : "Продолжай историю в строгом документальном стиле, придерживаясь фактов. Подавай информацию структурированно и объективно.";
    
    const sourceInstruction = knowledgeBaseText
        ? "При написании сценария опирайся СТРОГО на факты из предоставленной 'Базы знаний'."
        : "";
        
    const knowledgeBaseBlock = knowledgeBaseText
        ? `\n\n**База знаний (Источник фактов):**\n---\n${knowledgeBaseText}\n---`
        : "";

    const prompt = `Ты — мастер саспенса, ИИ-сценарист, продолжающий писать длинный подкаст.

    Тема подкаста: "${topic}"
    Название подкаста: "${podcastTitle}"
    Персонажи:
    ${characterDescriptions}
    Краткое содержание предыдущих глав:
    ${previousSummary}

    Твоя задача: написать сценарий для СЛЕДУЮЩЕЙ, ${chapterIndex + 1}-й главы, рассчитанный на 4-5 минут озвучки.
    - **ВАЖНО: Общий объем текста сценария этой главы НЕ ДОЛЖЕН ПРЕВЫШАТЬ 7000 символов.**
    - Используй только имена персонажей: ${characters.map(c => `"${c.name}"`).join(', ')}.
    - Все ремарки, звуковые эффекты и описания действий оформляй как отдельный элемент со спикером "SFX".
    - ${styleInstruction}
    
    Результат верни как ЕДИНЫЙ ВАЛИДНЫЙ JSON-ОБЪЕКТ в \`\`\`json ... \`\`\`.
    Структура: {
        "title": "Название этой новой главы",
        "script": [{ "speaker": "SFX", "text": "..." }, { "speaker": "${characters[0].name}", "text": "..." }, { "speaker": "${characters[1].name}", "text": "..." }]
    }${knowledgeBaseBlock}`;
    
    try {
        log({ type: 'request', message: `Запрос к модели ${model} для создания главы ${chapterIndex + 1}`, data: { prompt }});
        const response = await ai.models.generateContent({ model, contents: prompt });
        const data = parseGeminiJsonResponse(response.text, log);
        log({ type: 'info', message: `Сценарий для главы ${chapterIndex + 1} успешно создан.` });
        return data;
    } catch (error) {
        log({ type: 'error', message: `Ошибка при генерации сценария для главы ${chapterIndex + 1}`, data: error });
        throw error;
    }
};

const getVoiceForCharacter = (description: string): string => {
    const lowerDesc = description.toLowerCase();
    const MALE_VOICES = ['Puck', 'Charon', 'Fenrir'];
    const FEMALE_VOICES = ['Zephyr', 'Kore'];

    if (lowerDesc.includes('мужск') || lowerDesc.includes('male')) {
        if (lowerDesc.includes('низк') || lowerDesc.includes('глубок') || lowerDesc.includes('deep')) return 'Puck';
        if (lowerDesc.includes('стар') || lowerDesc.includes('old')) return 'Charon';
        return MALE_VOICES[Math.floor(Math.random() * MALE_VOICES.length)];
    }
    if (lowerDesc.includes('женск') || lowerDesc.includes('female')) {
        if (lowerDesc.includes('спокойн') || lowerDesc.includes('calm')) return 'Zephyr';
        return FEMALE_VOICES[Math.floor(Math.random() * FEMALE_VOICES.length)];
    }
    return 'Zephyr'; // Default fallback
};


export const generatePodcastDialogueAudio = async (script: ScriptLine[], characters: Character[], log: LogFunction, apiKey?: string): Promise<Blob> => {
    log({ type: 'info', message: 'Начало синтеза аудиодиалога (TTS).' });
    const ai = getAiClient(log, apiKey);

    const dialogueScript = script.filter(line => line.speaker.toUpperCase() !== 'SFX');

    if (dialogueScript.length === 0) {
        log({ type: 'info', message: 'В главе нет диалогов для озвучки, возвращаем тишину.' });
        const silentPcm = new Int16Array(24000 * 1); // 1 second of silence
        return createWavBlobFromPcm(silentPcm, 24000, 1);
    }
    
    const speakersInScript = Array.from(new Set(dialogueScript.map(line => line.speaker)));
    
    const speakerVoiceConfigs = speakersInScript.map(charName => {
        const character = characters.find(c => c.name === charName);
        const voiceName = character ? getVoiceForCharacter(character.description) : 'Zephyr';
        log({type: 'info', message: `Для персонажа "${charName}" (${character?.description}) выбран голос: ${voiceName}`});
        return {
            speaker: charName,
            voiceConfig: { prebuiltVoiceConfig: { voiceName } }
        };
    });
    
    const ttsPrompt = `TTS the following conversation:\n\n${dialogueScript.map(line => `${line.speaker}: ${line.text}`).join('\n')}`;
    
    try {
        log({ type: 'request', message: 'Запрос к модели TTS (multi-speaker)', data: { speakers: speakerVoiceConfigs.map(s => s.speaker) } });
        const response = await ai.models.generateContent({ 
            model: "gemini-2.5-flash-preview-tts", 
            contents: [{ parts: [{ text: ttsPrompt }] }], 
            config: { 
                responseModalities: [Modality.AUDIO], 
                speechConfig: { multiSpeakerVoiceConfig: { speakerVoiceConfigs } } 
            } 
        });
        
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) throw new Error("Не удалось получить аудиоданные от модели TTS.");
        
        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const pcmData = new Int16Array(bytes.buffer);
        
        log({ type: 'info', message: 'WAV файл успешно создан.' });
        return createWavBlobFromPcm(pcmData, 24000, 1);
    } catch (error) {
        log({ type: 'error', message: 'Ошибка при синтезе аудио (TTS)', data: error });
        throw error;
    }
};

export { combineWavBlobs };