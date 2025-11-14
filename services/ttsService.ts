import { GoogleGenAI, Modality, GenerateContentResponse } from "@google/genai";
import * as lamejs from 'lamejs';
import type { Podcast, Chapter, Source, LogEntry, ScriptLine, Character, ThumbnailDesignConcept, NarrationMode, MusicTrack, SoundEffect } from '../types';
import { withQueueAndRetries, generateContentWithFallback, withRetries } from './geminiService';
import { parseGeminiJsonResponse } from './aiUtils';
import { findSfxForScript } from './sfxService';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;
type ApiKeys = { gemini?: string; openRouter?: string; freesound?: string; };

// This client is now only for the TTS-specific model which doesn't use the text fallback logic.
const getTtsAiClient = (customApiKey: string | undefined, log: LogFunction) => {
  const apiKey = customApiKey || process.env.API_KEY;
  if (!apiKey) {
    const errorMsg = "Ключ API не настроен. Убедитесь, что переменная окружения API_KEY установлена, или введите ключ в настройках.";
    log({ type: 'error', message: errorMsg });
    throw new Error(errorMsg);
  }
  return new GoogleGenAI({ apiKey });
};

// --- WAV / AUDIO UTILITIES ---

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

// FIX: Use `any` for AudioBuffer as the type is not available in the current context.
const audioBufferToWavBlob = (buffer: any): Blob => {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    let result: Float32Array;
    if (numChannels === 2) {
        result = new Float32Array(buffer.length * 2);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);
        for (let i = 0; i < buffer.length; i++) {
            result[i * 2] = left[i];
            result[i * 2 + 1] = right[i];
        }
    } else {
        result = buffer.getChannelData(0);
    }

    const dataLength = result.length * (bitDepth / 8);
    const bufferLength = 44 + dataLength;
    const arrayBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(arrayBuffer);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * (bitDepth / 8) * numChannels, true);
    view.setUint16(32, numChannels * (bitDepth / 8), true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    let offset = 44;
    for (let i = 0; i < result.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, result[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return new Blob([view], { type: 'audio/wav' });
};

export const combineAndMixAudio = async (podcast: Podcast): Promise<Blob> => {
    // FIX: Use `(window as any)` to access AudioContext to resolve missing DOM type error.
    const audioContext = new ((window as any).AudioContext || (window as any).webkitAudioContext)();

    // Create a new array containing only chapters with audio blobs.
    // This makes indexing straightforward and robust, fixing bugs with partial generation.
    const chaptersToProcess = podcast.chapters.filter((c): c is (Chapter & { audioBlob: Blob }) => !!c.audioBlob);
    
    if (chaptersToProcess.length === 0) throw new Error("Нет аудиофайлов для сборки.");

    const chapterAudioBuffers = await Promise.all(
        chaptersToProcess.map(c => c.audioBlob.arrayBuffer().then(ab => audioContext.decodeAudioData(ab)))
    );
    
    const totalDuration = chapterAudioBuffers.reduce((sum, buffer) => sum + buffer.duration, 0);
    if (totalDuration === 0) throw new Error("Общая длительность аудио равна нулю.");
    
    const sampleRate = chapterAudioBuffers[0].sampleRate;
    const numberOfChannels = chapterAudioBuffers[0].numberOfChannels;

    // FIX: Use `(window as any)` to access OfflineAudioContext to resolve missing DOM type error.
    const offlineContext = new (window as any).OfflineAudioContext(numberOfChannels, Math.ceil(totalDuration * sampleRate), sampleRate);

    let speechTimeCursor = 0;
    // Layer 1: Speech and Music - Iterate over the clean list of chapters with audio.
    for (let i = 0; i < chaptersToProcess.length; i++) {
        const chapter = chaptersToProcess[i];
        const speechBuffer = chapterAudioBuffers[i];
        
        const speechSource = offlineContext.createBufferSource();
        speechSource.buffer = speechBuffer;
        speechSource.connect(offlineContext.destination);
        speechSource.start(speechTimeCursor);

        if (chapter.backgroundMusic) {
             try {
                const musicResponse = await fetch(chapter.backgroundMusic.audio);
                const musicArrayBuffer = await musicResponse.arrayBuffer();
                const musicBuffer = await audioContext.decodeAudioData(musicArrayBuffer);

                const musicGainNode = offlineContext.createGain();
                const chapterVolume = chapter.backgroundMusicVolume ?? podcast.backgroundMusicVolume;
                
                musicGainNode.gain.value = chapterVolume;
                musicGainNode.connect(offlineContext.destination);
                
                const crossfadeDuration = 1.5;
                const fadeInStartTime = speechTimeCursor;
                const fadeOutEndTime = speechTimeCursor + speechBuffer.duration;
                
                // Crossfade logic now correctly checks for adjacency in the list of chapters being processed.
                if (i === 0 || chaptersToProcess[i-1].backgroundMusic?.id !== chapter.backgroundMusic.id) {
                    musicGainNode.gain.setValueAtTime(0, fadeInStartTime);
                    musicGainNode.gain.linearRampToValueAtTime(chapterVolume, fadeInStartTime + crossfadeDuration);
                }

                if (i === chaptersToProcess.length - 1 || chaptersToProcess[i+1]?.backgroundMusic?.id !== chapter.backgroundMusic.id) {
                     musicGainNode.gain.setValueAtTime(chapterVolume, Math.max(fadeInStartTime, fadeOutEndTime - crossfadeDuration));
                     musicGainNode.gain.linearRampToValueAtTime(0, fadeOutEndTime);
                }

                let musicCursor = 0;
                while (musicCursor < speechBuffer.duration) {
                    const musicSource = offlineContext.createBufferSource();
                    musicSource.buffer = musicBuffer;
                    musicSource.connect(musicGainNode);
                    musicSource.start(speechTimeCursor + musicCursor, 0, speechBuffer.duration - musicCursor);
                    musicCursor += musicBuffer.duration;
                }
            } catch (e) { console.error(`Не удалось обработать музыку для главы ${chapter.title}`, e); }
        }
        speechTimeCursor += speechBuffer.duration;
    }

    // Layer 2: Sound Effects
    let estimatedTimeCursor = 0;
    const CHARS_PER_SECOND = 15; // Estimated reading speed for timing SFX
    const allScriptLines = podcast.chapters.flatMap(c => c.script);

    for (const line of allScriptLines) {
        if (line.speaker.toUpperCase() !== 'SFX' && line.text) {
             estimatedTimeCursor += Math.max(1, line.text.length / CHARS_PER_SECOND);
        } else if (line.speaker.toUpperCase() === 'SFX' && line.soundEffect?.previews['preview-hq-mp3']) {
            try {
                const sfxResponse = await fetch(line.soundEffect.previews['preview-hq-mp3']);
                const sfxArrayBuffer = await sfxResponse.arrayBuffer();
                const sfxBuffer = await audioContext.decodeAudioData(sfxArrayBuffer);
                
                const sfxGainNode = offlineContext.createGain();
                sfxGainNode.gain.value = line.soundEffectVolume ?? 0.5; // Default volume 50%
                sfxGainNode.connect(offlineContext.destination);

                const sfxSource = offlineContext.createBufferSource();
                sfxSource.buffer = sfxBuffer;
                sfxSource.connect(sfxGainNode);
                
                // Calculate the latest possible start time so the SFX doesn't play past the total duration.
                // This value is clamped at 0 to prevent negative start times if the SFX is longer than the audio.
                const maxStartTime = Math.max(0, totalDuration - sfxBuffer.duration);

                // Schedule the SFX at the estimated time, but not later than the max possible start time.
                const startTime = Math.min(estimatedTimeCursor, maxStartTime);
                
                sfxSource.start(startTime);

            } catch(e) { console.error(`Не удалось обработать SFX: ${line.soundEffect.name}`, e); }
        }
    }

    const renderedBuffer = await offlineContext.startRendering();
    return audioBufferToWavBlob(renderedBuffer);
};

export const convertWavToMp3 = async (wavBlob: Blob, log: LogFunction): Promise<Blob> => {
    log({ type: 'info', message: 'Начало конвертации WAV в MP3.' });
    const arrayBuffer = await wavBlob.arrayBuffer();
    const wav = lamejs.WavHeader.readHeader(new DataView(arrayBuffer));
    const samples = new Int16Array(arrayBuffer, wav.dataOffset, wav.dataLen / 2);
    
    const mp3encoder = new lamejs.Mp3Encoder(wav.channels, wav.sampleRate, 128); // 128 kbps
    const mp3Data = [];
    const sampleBlockSize = 1152; 

    for (let i = 0; i < samples.length; i += sampleBlockSize) {
        const sampleChunk = samples.subarray(i, i + sampleBlockSize);
        const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
        if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
        }
    }
    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
    }

    const mp3Blob = new Blob(mp3Data.map(d => new Uint8Array(d.buffer, 0, d.length)), { type: 'audio/mpeg' });
    log({ type: 'info', message: 'Конвертация в MP3 завершена.' });
    return mp3Blob;
};


// --- SCRIPT & AUDIO GENERATION ---

const getScriptLengthInstruction = (totalDurationMinutes: number): string => {
    // If the total requested duration is very short, create a proportionally short script.
    if (totalDurationMinutes < 5) {
        // Estimate: ~1200 characters per minute of spoken text.
        const charsPerMinute = 1200;
        const targetCharCount = Math.round(totalDurationMinutes * charsPerMinute);
        
        // Create a +/- 10% range for flexibility.
        const minCharCount = Math.round(targetCharCount * 0.9);
        const maxCharCount = Math.round(targetCharCount * 1.1);

        return `The script should be approximately ${totalDurationMinutes.toFixed(1)} minutes long when spoken. **CRITICAL: The total text volume of this chapter's script MUST be between ${minCharCount} and ${maxCharCount} characters.**`;
    }

    // For longer videos, the user wants a fixed, substantial chapter length.
    // This range corresponds to approximately 7-8 minutes of speech.
    const minCharCount = 8500;
    const maxCharCount = 9500;
    const minMinutes = 7;
    const maxMinutes = 8;
    
    return `The script should be approximately ${minMinutes}-${maxMinutes} minutes long when spoken. **IMPORTANT: The total text volume of this chapter's script MUST be between ${minCharCount} and ${maxCharCount} characters.**`;
};

export const googleSearchForKnowledge = async (question: string, log: LogFunction, apiKeys: ApiKeys): Promise<string> => {
    log({ type: 'info', message: 'Начало поиска информации в Google для базы знаний.' });

    const prompt = `Using Google Search, find and provide a detailed, structured answer to the following question. The answer should be comprehensive, well-formatted, and contain key facts. Write the answer in Russian.

    Question: "${question}"`;

    try {
        const response = await generateContentWithFallback({ 
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] } 
        }, log, apiKeys);
        
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

export const generatePodcastBlueprint = async (topic: string, knowledgeBaseText: string, creativeFreedom: boolean, language: string, totalDurationMinutes: number, log: LogFunction, apiKeys: ApiKeys, initialImageCount: number): Promise<Omit<Podcast, 'id' | 'topic' | 'selectedTitle' | 'chapters' | 'totalDurationMinutes' | 'creativeFreedom' | 'knowledgeBaseText' | 'language' | 'designConcepts' | 'narrationMode' | 'characterVoices' | 'monologueVoice' | 'initialImageCount' | 'backgroundMusicVolume' | 'thumbnailBaseImage'> & { chapters: Chapter[] }> => {
    log({ type: 'info', message: 'Начало генерации концепции подкаста и первой главы.' });

    const sourceInstruction = knowledgeBaseText
        ? `Use STRICTLY AND ONLY the provided text ("Knowledge Base") as the SOLE source of facts. Do not use Google Search or invent facts.`
        : `Use Google Search to gather facts and information on the topic.`;

    const styleInstruction = creativeFreedom
        ? `**Style Requirements (Creative Freedom):**
    - **Atmosphere:** Create a dark, mysterious, and mystical atmosphere in the style of Stephen King and H.P. Lovecraft. Use ambiguity, hints of ancient evil, and psychological tension.
    - **Narrative:** The story should be captivating from the first seconds and maintain suspense. Use facts from the source as a foundation, but weave them into a fictional, chilling tale.`
        : `**Style Requirements (Documentary Precision):**
    - **Atmosphere:** Create a serious, informative, and objective tone.
    - **Narrative:** Strictly adhere to the facts from the source. Structure the narrative in a documentary style, without fiction or artistic exaggeration.`;
    
    const knowledgeBaseBlock = knowledgeBaseText
        ? `\n\n**Knowledge Base (Sole Source of Facts):**\n---\n${knowledgeBaseText}\n---`
        : "";

    const scriptLengthInstruction = getScriptLengthInstruction(totalDurationMinutes);

    const prompt = `You are an AI screenwriter and YouTube producer. Your task is to create a complete package of materials for a compelling YouTube video on the topic: "${topic}".
    
    **CRITICAL INSTRUCTION: Generate all text content STRICTLY in the following language: ${language}.**

    ${sourceInstruction}
    ${styleInstruction}

    **General Task Requirements:**
    1.  **Characters:** Create two unique characters for this video (e.g., "Host", "Historian"). Give each a brief description (gender, voice character).
    2.  **YouTube Assets:** Create YouTube-optimized text assets (title options, description, tags).
    3.  **Script:** Write the script for the FIRST CHAPTER. ${scriptLengthInstruction}
    4.  **Sound Design:** You MUST add 3-5 relevant sound effect cues throughout the script to create atmosphere. Format all sound effect cues as a separate element with the speaker "SFX". **Example: { "speaker": "SFX", "text": "Sound of a creaking door opening..." }**
    5.  **Image Prompts:** Based on the script content, create ${initialImageCount} detailed, cinematic image prompts in English.

    Return the result as a SINGLE VALID JSON OBJECT in \`\`\`json ... \`\`\`.

    **JSON Structure:**
    {
      "youtubeTitleOptions": [ "An array of 3-5 clickable, intriguing, and SEO-optimized titles for the YouTube video" ],
      "description": "A detailed description for the YouTube video (2-3 paragraphs). It should engage the viewer, summarize the content, and include a call to action (subscribe, like).",
      "seoKeywords": ["list", "of", "10-15", "relevant", "tags", "for", "the YouTube video"],
      "characters": [
        { "name": "Character Name 1", "description": "Brief description, gender, and voice character. E.g., Male, deep, authoritative voice." },
        { "name": "Character Name 2", "description": "Brief description, gender, and voice character. E.g., Female, calm, intriguing voice." }
      ],
      "chapter": {
        "title": "Title of the first chapter",
        "script": [
          { "speaker": "SFX", "text": "Sound of a creaking door opening..." },
          { "speaker": "Character Name 1", "text": "Intriguing introduction text..." },
          { "speaker": "Character Name 2", "text": "Mysterious response..." }
        ],
        "imagePrompts": ["An array of ${initialImageCount} detailed, cinematic image prompts in English"]
      }
    }${knowledgeBaseBlock}`;
    
    try {
        const config = knowledgeBaseText ? {} : { tools: [{ googleSearch: {} }] };
        const response = await generateContentWithFallback({ contents: prompt, config }, log, apiKeys);
        const data = await parseGeminiJsonResponse(response.text, log, apiKeys);

        log({ type: 'info', message: 'Начало пакетного поиска SFX...' });
        const scriptWithSfx = await findSfxForScript(data.chapter.script, log, apiKeys);
        data.chapter.script = scriptWithSfx;
        log({ type: 'info', message: 'Пакетный поиск SFX завершен.' });

        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        const sources: Source[] = knowledgeBaseText ? [] : Array.from(new Map<string, Source>(groundingChunks.map((c: any) => c.web).filter((w: any) => w?.uri).map((w: any) => [w.uri, { uri: w.uri, title: w.title?.trim() || w.uri }])).values());
        
        const firstChapter: Chapter = {
            id: crypto.randomUUID(),
            title: data.chapter.title,
            script: data.chapter.script,
            status: 'pending',
            imagePrompts: data.chapter.imagePrompts || [],
            selectedBgIndex: 0,
        };
        
        log({ type: 'info', message: 'Концепция подкаста и первая глава успешно созданы.' });
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

export const regenerateTextAssets = async (topic: string, knowledgeBaseText: string, creativeFreedom: boolean, language: string, log: LogFunction, apiKeys: ApiKeys): Promise<{ youtubeTitleOptions: string[]; description: string; seoKeywords: string[] }> => {
    log({ type: 'info', message: 'Начало регенерации текстовых материалов для YouTube.' });

    const styleInstruction = creativeFreedom 
        ? "Style: Fictional, mystical, intriguing." 
        : "Style: Documentary, strict, informative.";

    const prompt = `You are a YouTube marketing expert. Your task is to create new, even more engaging text materials for a video on the topic: "${topic}".
    
    **CRITICAL INSTRUCTION: Generate all text content STRICTLY in the following language: ${language}.**
    
    ${styleInstruction}

    Based on the topic and style, generate:
    1.  An array of 3-5 new, clickable titles.
    2.  A new description.
    3.  A new set of tags.

    Return the result as a SINGLE VALID JSON OBJECT in \`\`\`json ... \`\`\`.

    **JSON Structure:**
    {
      "youtubeTitleOptions": ["A new array of 3-5 clickable and SEO-optimized titles for the YouTube video"],
      "description": "A new, detailed description for the YouTube video (2-3 paragraphs) with a call to action.",
      "seoKeywords": ["new", "list", "of", "10-15", "relevant", "tags", "for", "the YouTube video"]
    }`;

    try {
        const response = await generateContentWithFallback({ contents: prompt }, log, apiKeys);
        const data = await parseGeminiJsonResponse(response.text, log, apiKeys);
        log({ type: 'info', message: 'Текстовые материалы успешно обновлены.' });
        return data;
    } catch (error) {
        log({ type: 'error', message: 'Ошибка при регенерации текстовых материалов', data: error });
        throw error;
    }
};

export const generateNextChapterScript = async (topic: string, podcastTitle: string, characters: Character[], previousChapters: Chapter[], chapterIndex: number, totalDurationMinutes: number, knowledgeBaseText: string, creativeFreedom: boolean, language: string, log: LogFunction, apiKeys: ApiKeys): Promise<{title: string, script: ScriptLine[], imagePrompts: string[]}> => {
    log({ type: 'info', message: `Начало генерации сценария для главы ${chapterIndex + 1}` });
    const previousSummary = previousChapters.map((c, i) => `Chapter ${i+1}: ${c.title} - ${c.script.slice(0, 2).map(s => s.text).join(' ')}...`).join('\n');
    const characterDescriptions = characters.map(c => `- ${c.name}: ${c.description}`).join('\n');

    const styleInstruction = creativeFreedom
        ? "Continue the story in a captivating and atmospheric style of King/Lovecraft. Deepen the mystery, introduce new unsettling details, and build suspense."
        : "Continue the story in a strict documentary style, adhering to the facts. Present information in a structured and objective manner.";
    
    const sourceInstruction = knowledgeBaseText
        ? "When writing the script, rely STRICTLY on the facts from the provided 'Knowledge Base'."
        : "";
        
    const knowledgeBaseBlock = knowledgeBaseText
        ? `\n\n**Knowledge Base (Source of Facts):**\n---\n${knowledgeBaseText}\n---`
        : "";

    const scriptLengthInstruction = getScriptLengthInstruction(totalDurationMinutes);

    const prompt = `You are a master of suspense, an AI screenwriter continuing a long-form podcast.

    Podcast Topic: "${topic}"
    Podcast Title: "${podcastTitle}"
    Characters:
    ${characterDescriptions}
    Summary of previous chapters:
    ${previousSummary}

    **CRITICAL INSTRUCTION: Generate all text content STRICTLY in the following language: ${language}.**

    Your task: write the script for the NEXT, ${chapterIndex + 1}-th chapter.
    - **Script Length:** ${scriptLengthInstruction}
    - **Sound Design:** You MUST add 3-5 relevant sound effect cues throughout the script to create atmosphere.
    - **Image Prompts:** Based on the new script content, create 3 detailed, cinematic image prompts in English.
    - **Formatting:** Use only the character names: ${characters.map(c => `"${c.name}"`).join(', ')}. Format all cues and sound effects as a separate element with the speaker "SFX".
    - ${styleInstruction}
    ${sourceInstruction}
    
    Return the result as a SINGLE VALID JSON OBJECT in \`\`\`json ... \`\`\`.
    Structure: {
        "title": "Title of this new chapter",
        "script": [{ "speaker": "SFX", "text": "..." }, { "speaker": "${characters[0].name}", "text": "..." }, { "speaker": "${characters[1].name}", "text": "..." }],
        "imagePrompts": ["Prompt 1 in English", "Prompt 2 in English", "Prompt 3 in English"]
    }${knowledgeBaseBlock}`;
    
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

const processTtsResponse = (response: GenerateContentResponse): Blob => {
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("Не удалось получить аудиоданные от модели TTS.");
    
    const binaryString = atob(base64Audio);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    const pcmData = new Int16Array(bytes.buffer);
    
    return createWavBlobFromPcm(pcmData, 24000, 1);
};

const generateAudioWithRetries = async (
    params: { contents: any; config: any; },
    log: LogFunction,
    customApiKey?: string
): Promise<GenerateContentResponse> => {
    const ai = getTtsAiClient(customApiKey, log);

    // Use the most stable model directly
    const model = 'gemini-2.5-flash-preview-tts';
    try {
        log({ type: 'request', message: `Attempting audio generation with model: ${model}` });
        const generateCall = () => ai.models.generateContent({ model, ...params });
        const response = await withQueueAndRetries(generateCall, log);
        log({ type: 'response', message: `Successfully generated audio with model: ${model}` });
        return response;
    } catch (error) {
        log({ type: 'error', message: `Model ${model} failed after retries.`, data: error });
        throw new Error(`TTS model failed. See logs for details.`);
    }
};


export const previewVoice = async (voiceName: string, languageCode: string, log: LogFunction, apiKey?: string): Promise<Blob> => {
    log({ type: 'info', message: `Запрос на предпрослушивание голоса: ${voiceName}` });

    const textToSpeak = languageCode === 'ru' 
        ? "Привет, я один из голосов, доступных для озвучки вашего проекта."
        : "Hello, I am one of the voices available to narrate your project.";

    const params = {
        contents: [{ parts: [{ text: textToSpeak }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName } },
            },
        },
    };

    try {
        const response = await generateAudioWithRetries(params, log, apiKey);
        return processTtsResponse(response);
    } catch (error) {
        log({ type: 'error', message: `Ошибка при предпрослушивании голоса ${voiceName}`, data: error });
        throw error;
    }
};


export const generateChapterAudio = async (
    script: ScriptLine[],
    narrationMode: NarrationMode,
    characterVoices: { [key: string]: string },
    monologueVoice: string,
    log: LogFunction,
    apiKeys: ApiKeys
): Promise<Blob> => {
    log({ type: 'info', message: `Начало синтеза аудио в режиме '${narrationMode}'.` });
    // IMPORTANT: Filter out SFX lines before sending to TTS
    const dialogueScript = script.filter(line => line.speaker.toUpperCase() !== 'SFX');

    if (dialogueScript.length === 0) {
        log({ type: 'info', message: 'В главе нет диалогов для озвучки, возвращаем тишину.' });
        const silentPcm = new Int16Array(24000 * 1); // 1 second of silence
        return createWavBlobFromPcm(silentPcm, 24000, 1);
    }

    let ttsPrompt: string;
    let ttsConfig: any;

    if (narrationMode === 'monologue') {
        ttsPrompt = dialogueScript.map(line => line.text).join(' \n');
        ttsConfig = {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: monologueVoice } },
            },
        };
    } else { // Dialogue mode
        const speakersInScript = Array.from(new Set(dialogueScript.map(line => line.speaker)));
        const speakerVoiceConfigs = speakersInScript.map(charName => {
            const voiceName = characterVoices[charName] || 'Zephyr'; // Default fallback
            log({ type: 'info', message: `Для персонажа "${charName}" выбран голос: ${voiceName}` });
            return {
                speaker: charName,
                voiceConfig: { prebuiltVoiceConfig: { voiceName } }
            };
        });

        ttsPrompt = `TTS the following conversation:\n\n${dialogueScript.map(line => `${line.speaker}: ${line.text}`).join('\n')}`;
        ttsConfig = {
            responseModalities: [Modality.AUDIO],
            speechConfig: { multiSpeakerVoiceConfig: { speakerVoiceConfigs } }
        };
    }
    
    const params = {
        contents: [{ parts: [{ text: ttsPrompt }] }],
        config: ttsConfig
    };
    
    try {
        const response = await generateAudioWithRetries(params, log, apiKeys.gemini);
        const wavBlob = processTtsResponse(response);
        log({ type: 'info', message: 'WAV файл успешно создан.' });
        return wavBlob;
    } catch (error) {
        log({ type: 'error', message: 'Ошибка при синтезе аудио (TTS)', data: error });
        throw error;
    }
};

export const generateThumbnailDesignConcepts = async (topic: string, language: string, log: LogFunction, apiKeys: ApiKeys): Promise<ThumbnailDesignConcept[]> => {
    log({ type: 'info', message: 'Начало генерации дизайн-концепций для обложек.' });

    const prompt = `You are an expert in creating viral, high-CTR YouTube thumbnails, specializing in the style of top creators like MrBeast. Your design MUST use principles of visual psychology: high contrast, emotional impact, and extremely readable, bold typography.
    
    Analyze this video topic: "${topic}". 
    
    **CRITICAL READABILITY REQUIREMENT:** The text MUST be perfectly readable on any complex or bright background. Propose designs that use high-contrast color combinations (e.g., bright yellow text with a thick black outline), heavy font weights, and prominent shadows or glows. Avoid thin fonts or low-contrast colors.

    Propose 3 distinct, "bombastic" design concepts. For each concept, provide a name and specific design parameters. Include modern design elements like text strokes (outlines) and gradients.
    
    **CRITICAL INSTRUCTION: For 'fontFamily', suggest specific, popular, free-to-use Google Font names that fit the theme (e.g., 'Anton', 'Bebas Neue', 'Creepster'). Do not use generic categories like 'serif'. Your entire response must be in the language: ${language}.**

    Return the result as a SINGLE VALID JSON OBJECT in \`\`\`json ... \`\`\`.

    **JSON Structure:**
    {
      "concepts": [
        {
          "name": "Concept name (e.g., Electric Shock, Conspiracy Board, Ancient Artifact)",
          "fontFamily": "A specific Google Font name like 'Anton' or 'Oswald'",
          "fontSize": 120,
          "textColor": "#FFFF00",
          "shadowColor": "#000000",
          "overlayOpacity": 0.3,
          "textTransform": "uppercase",
          "strokeColor": "#000000",
          "strokeWidth": 12,
          "gradientColors": ["#startColorHex", "#endColorHex"]
        }
      ]
    }`;

    try {
        const response = await generateContentWithFallback({ contents: prompt }, log, apiKeys);
        const data = await parseGeminiJsonResponse(response.text, log, apiKeys);
        if (!data.concepts || data.concepts.length === 0) {
            throw new Error("AI не смог сгенерировать дизайн-концепции.");
        }
        log({ type: 'info', message: 'Дизайн-концепции успешно созданы.' });
        return data.concepts.slice(0, 3);
    } catch (error) {
        log({ type: 'error', message: 'Ошибка при генерации дизайн-концепций. Будут использованы стандартные.', data: error });
        
        const fallbackConcepts: { [key: string]: ThumbnailDesignConcept[] } = {
            "Русский": [
                { name: "Контрастный Удар (Резервный)", fontFamily: "Anton", fontSize: 110, textColor: "#FFFF00", shadowColor: "#000000", overlayOpacity: 0.3, textTransform: 'uppercase', strokeColor: "#000000", strokeWidth: 8 },
                { name: "Классический Триллер (Резервный)", fontFamily: "Roboto Slab", fontSize: 100, textColor: "#FFFFFF", shadowColor: "#000000", overlayOpacity: 0.5, textTransform: 'uppercase', strokeColor: "transparent", strokeWidth: 0 },
                { name: "Современный Градиент (Резервный)", fontFamily: "Bebas Neue", fontSize: 130, textColor: "#FFFFFF", shadowColor: "transparent", overlayOpacity: 0.4, textTransform: 'uppercase', gradientColors: ["#00FFFF", "#FF00FF"] }
            ],
            "English": [
                 { name: "Contrast Punch (Fallback)", fontFamily: "Anton", fontSize: 110, textColor: "#FFFF00", shadowColor: "#000000", overlayOpacity: 0.3, textTransform: 'uppercase', strokeColor: "#000000", strokeWidth: 8 },
                 { name: "Classic Thriller (Fallback)", fontFamily: "Roboto Slab", fontSize: 100, textColor: "#FFFFFF", shadowColor: "#000000", overlayOpacity: 0.5, textTransform: 'uppercase', strokeColor: "transparent", strokeWidth: 0 },
                 { name: "Modern Gradient (Fallback)", fontFamily: "Bebas Neue", fontSize: 130, textColor: "#FFFFFF", shadowColor: "transparent", overlayOpacity: 0.4, textTransform: 'uppercase', gradientColors: ["#00FFFF", "#FF00FF"] }
            ]
        };
        
        return fallbackConcepts[language as keyof typeof fallbackConcepts] || fallbackConcepts["English"];
    }
};

// --- AI MUSIC FINDER ---

const JAMENDO_CLIENT_ID = '76b53e2b';
const JAMENDO_API_URL = 'https://api.jamendo.com/v3.0/tracks/';

export const performJamendoSearch = async (searchTags: string, log: LogFunction): Promise<MusicTrack[]> => {
    const tags = searchTags.trim().replace(/,\s*/g, ' ');
    if (!tags) return [];

    const searchUrl = `${JAMENDO_API_URL}?client_id=${JAMENDO_CLIENT_ID}&format=json&limit=10&tags=${tags}&order=popularity_total`;
    log({ type: 'request', message: 'Запрос музыки с Jamendo', data: { url: searchUrl } });

    const doFetch = async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds timeout
        try {
            const response = await fetch(searchUrl, { signal: controller.signal });
            if (!response.ok) {
                const errorText = await response.text();
                const error: any = new Error(`Jamendo API error: ${response.statusText}`);
                error.status = response.status;
                error.data = errorText;
                log({ type: 'error', message: `Jamendo request failed with status ${response.status}`, data: errorText });
                throw error;
            }
            return response.json();
        } finally {
            clearTimeout(timeoutId);
        }
    };

    try {
        const data = await withRetries(doFetch, log, 3, 500);
        if (!data || !data.results) {
            throw new Error('No results found from Jamendo API');
        }
        return data.results.map((track: any) => ({
            id: track.id,
            name: track.name,
            artist_name: track.artist_name,
            audio: track.audio
        }));
    } catch (error) {
        log({ type: 'error', message: 'Ошибка при запросе к Jamendo API после всех попыток.', data: error });
        return []; // Return empty array on failure instead of throwing
    }
};

export const findMusicManually = async (keywords: string, log: LogFunction): Promise<MusicTrack[]> => {
    log({ type: 'info', message: `Ручной поиск музыки по ключевым словам: ${keywords}` });
    try {
        const tracks = await performJamendoSearch(keywords, log);
        if (tracks.length > 0) {
            log({ type: 'response', message: 'Музыкальные треки по ручному запросу успешно получены.' });
        } else {
            log({ type: 'info', message: 'По ручному запросу музыка не найдена.' });
        }
        return tracks;
    } catch (error) {
        log({ type: 'error', message: 'Ошибка при ручном поиске музыки.', data: error });
        throw new Error('Не удалось найти музыку.');
    }
};

export const findMusicWithAi = async (topic: string, log: LogFunction, apiKeys: ApiKeys): Promise<MusicTrack[]> => {
    log({ type: 'info', message: 'Запрос к ИИ для подбора ключевых слов для музыки.' });
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
        attempts++;
        try {
            const keywordsPrompt = `Analyze the mood of the provided text: "${topic}". Your task is to generate a search query for a royalty-free music library like Jamendo. 
    
        Instructions:
        1.  Identify the primary mood and a suitable genre.
        2.  Combine them into a simple, effective search query of 2-3 English keywords.
        3.  Prioritize using tags from the "Recommended Tags" list if they fit. Avoid overly specific or niche terms not on the list unless absolutely necessary.
        4.  Return ONLY the comma-separated keywords.

        Recommended Tags:
        - Moods: mysterious, epic, sad, suspenseful, peaceful, dark, uplifting, dramatic, romantic, energetic, chill
        - Genres: ambient, cinematic, electronic, orchestral, acoustic, rock, instrumental, lounge, soundtrack
        
        Example for "A lonely journey through a haunted forest": 
        dark, ambient, cinematic
        
        Example for "The final battle for the kingdom":
        epic, orchestral, action
        
        Provided text: "${topic}"
        Keywords:`;
        
            const keywordsResponse = await generateContentWithFallback({ contents: keywordsPrompt }, log, apiKeys);
            const keywords = keywordsResponse.text.trim();
            log({ type: 'info', message: `ИИ предложил ключевые слова для музыки (Попытка ${attempts}): ${keywords}` });

            if (!keywords) {
                log({ type: 'info', message: `ИИ не вернул ключевых слов. Попытка ${attempts}.` });
                continue;
            }

            let searchTerms = keywords.split(/[\s,]+/).filter(Boolean);
            while (searchTerms.length > 0) {
                const currentQuery = searchTerms.join(' ');
                log({ type: 'info', message: `Поиск музыки по запросу: "${currentQuery}"` });
                const musicResults = await performJamendoSearch(currentQuery, log);
                if (musicResults.length > 0) {
                    log({ type: 'info', message: `Найдено ${musicResults.length} треков по запросу "${currentQuery}".` });
                    return musicResults;
                }
                log({ type: 'info', message: `По запросу "${currentQuery}" ничего не найдено, сокращаем запрос...` });
                searchTerms.pop(); // Remove the last keyword and retry
            }

            log({ type: 'info', message: `По ключевым словам "${keywords}" ничего не найдено даже после упрощения.` });
        } catch (error) {
            log({ type: 'error', message: `Ошибка в процессе поиска музыки с ИИ (Попытка ${attempts}).`, data: error });
            if (attempts >= maxAttempts) {
                throw new Error('Не удалось подобрать музыку.');
            }
        }
    }

    log({ type: 'info', message: `Не удалось найти музыку после ${maxAttempts} попыток.` });
    return [];
};
