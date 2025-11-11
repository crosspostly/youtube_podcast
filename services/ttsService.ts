import { GoogleGenAI, Modality } from "@google/genai";
import type { Podcast, Chapter, Source, LogEntry, ScriptLine } from '../types';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;

const getAiClient = (log: LogFunction) => {
  if (!process.env.API_KEY) {
    const errorMsg = "Ключ API не настроен. Убедитесь, что переменная окружения API_KEY установлена.";
    log({ type: 'error', message: errorMsg });
    throw new Error(errorMsg);
  }
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
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

export const generatePodcastBlueprint = async (topic: string, log: LogFunction): Promise<Omit<Podcast, 'chapters'> & { chapters: Chapter[] }> => {
    log({ type: 'info', message: 'Начало генерации концепции подкаста и первой главы.' });
    const ai = getAiClient(log);
    const model = "gemini-2.5-pro";
    const prompt = `Ты — ИИ-сценарист для длинных подкастов. Тема: "${topic}". Создай концепцию и сценарий ПЕРВОЙ ГЛАВЫ для 40-минутного подкаста.
    Результат верни как ЕДИНЫЙ ВАЛИДНЫЙ JSON-ОБЪЕКТ в \`\`\`json ... \`\`\`.
    Структура: {
      "title": "Общее название всего подкаста",
      "description": "Общее описание всего подкаста",
      "seoKeywords": ["ключевые", "слова"],
      "imagePrompts": ["яркие промпты для обложки на английском"],
      "chapter": {
        "title": "Название первой главы",
        "script": [{ "speaker": "Ведущий", "text": "Текст введения..." }, { "speaker": "Эксперт", "text": "..." }]
      }
    }`;
    
    try {
        log({ type: 'request', message: `Запрос к модели ${model} для создания концепции`, data: { prompt } });
        const response = await ai.models.generateContent({ model, contents: prompt, config: { tools: [{ googleSearch: {} }] } });
        const data = parseGeminiJsonResponse(response.text, log);

        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        const sources: Source[] = Array.from(new Map<string, Source>(groundingChunks.map((c: any) => c.web).filter((w: any) => w?.uri).map((w: any) => [w.uri, { uri: w.uri, title: w.title?.trim() || w.uri }])).values());
        
        const firstChapter: Chapter = {
            id: crypto.randomUUID(),
            title: data.chapter.title,
            script: data.chapter.script,
            status: 'pending', // Will be updated to completed after audio generation
        };
        
        log({ type: 'info', message: 'Концепция подкаста и первая глава успешно созданы.' });
        return {
            id: crypto.randomUUID(),
            topic,
            title: data.title,
            description: data.description,
            seoKeywords: data.seoKeywords,
            imagePrompts: data.imagePrompts,
            sources,
            chapters: [firstChapter]
        };
    } catch (error) {
        log({ type: 'error', message: 'Ошибка при создании концепции подкаста', data: error });
        throw error;
    }
};

export const generateNextChapterScript = async (topic: string, podcastTitle: string, previousChapters: Chapter[], chapterIndex: number, log: LogFunction): Promise<{title: string, script: ScriptLine[]}> => {
    log({ type: 'info', message: `Начало генерации сценария для главы ${chapterIndex + 1}` });
    const ai = getAiClient(log);
    const model = "gemini-2.5-flash";
    const previousSummary = previousChapters.map((c, i) => `Глава ${i+1}: ${c.title}`).join('\n');

    const prompt = `Ты — ИИ-сценарист, продолжающий писать длинный подкаст.
    Тема подкаста: "${topic}"
    Название подкаста: "${podcastTitle}"
    Краткое содержание предыдущих глав:
    ${previousSummary}

    Твоя задача: написать сценарий для СЛЕДУЮЩЕЙ, ${chapterIndex + 1}-й главы. Продолжай повествование логично. Сценарий должен быть диалогом между "Ведущим" и "Экспертом".
    Результат верни как ЕДИНЫЙ ВАЛИДНЫЙ JSON-ОБЪЕКТ в \`\`\`json ... \`\`\`.
    Структура: {
        "title": "Название этой новой главы",
        "script": [{ "speaker": "Ведущий", "text": "..." }, { "speaker": "Эксперт", "text": "..." }]
    }`;
    
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


export const generatePodcastDialogueAudio = async (script: { speaker: string; text: string }[], log: LogFunction): Promise<Blob> => {
    log({ type: 'info', message: 'Начало синтеза аудиодиалога (TTS).' });
    const ai = getAiClient(log);
    const speakers = Array.from(new Set(script.map(line => line.speaker)));
    if (speakers.length === 0 || speakers.length > 2) throw new Error(`Для диалога требуется 1 или 2 спикера, найдено ${speakers.length}.`);
    const hostSpeaker = speakers.find(s => s.toLowerCase().includes('ведущий')) || speakers[0];
    const guestSpeaker = speakers.find(s => s !== hostSpeaker) || speakers[0];
    const speakerVoiceConfigs = [{ speaker: hostSpeaker, voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }];
    if (hostSpeaker !== guestSpeaker) speakerVoiceConfigs.push({ speaker: guestSpeaker, voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } });
    const ttsPrompt = `TTS the following conversation:\n\n${script.map(line => `${line.speaker}: ${line.text}`).join('\n')}`;
    try {
        log({ type: 'request', message: 'Запрос к модели TTS (multi-speaker)', data: { speakers: speakerVoiceConfigs } });
        const response = await ai.models.generateContent({ model: "gemini-2.5-flash-preview-tts", contents: [{ parts: [{ text: ttsPrompt }] }], config: { responseModalities: [Modality.AUDIO], speechConfig: { multiSpeakerVoiceConfig: { speakerVoiceConfigs } } } });
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
