import { GoogleGenAI, Modality, GenerateContentResponse } from "@google/genai";
import * as lamejs from 'lamejs';
import type { Podcast, Chapter, Source, LogEntry, ScriptLine, Character, ThumbnailDesignConcept, NarrationMode, MusicTrack, SoundEffect } from '../types';
import { withQueueAndRetries, generateContentWithFallback, withRetries, RetryConfig } from './geminiService';
import { parseGeminiJsonResponse } from './aiUtils';
import { findSfxForScript } from './sfxService';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;
type ApiKeys = { gemini?: string; freesound?: string; };

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

// FIX: Cannot find name 'AudioBuffer'. Replaced with 'any'.
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

export const combineAndMixAudio = async (podcast: Podcast, log: LogFunction): Promise<Blob> => {
    // FIX: Property 'AudioContext' does not exist on type 'Window'. Cast to any.
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

    // FIX: Cannot find name 'OfflineAudioContext'. Cast to any.
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
                const proxyUrl = `/api/audio-proxy?url=${encodeURIComponent(chapter.backgroundMusic.audio)}`;
                log({ type: 'info', message: `Fetching music via proxy: ${proxyUrl}` });
                const musicResponse = await fetch(proxyUrl);
                if (!musicResponse.ok) throw new Error(`Proxy request failed: ${musicResponse.statusText}`);

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

    // ========================================
    // Layer 2: Sound Effects with Improved Timing
    // FIX: Complete function implementation
    let sfxTimeCursor = 0;
    const CHARS_PER_SECOND = 15; // Estimate for timing SFX, consistent with SRT generation

    for (let i = 0; i < chaptersToProcess.length; i++) {
        const chapter = chaptersToProcess[i];
        const speechBuffer = chapterAudioBuffers[i];
        let lineTimeCursorInChapter = 0;

        for (const line of chapter.script) {
            if (line.speaker.toUpperCase() === 'SFX' && line.soundEffect) {
                try {
                    const sfxStartTime = sfxTimeCursor + lineTimeCursorInChapter;
                    const proxyUrl = `/api/audio-proxy?url=${encodeURIComponent(line.soundEffect.previews['preview-hq-mp3'])}`;
                    const sfxResponse = await fetch(proxyUrl);
                    if (!sfxResponse.ok) {
                         log({ type: 'warning', message: `Failed to fetch SFX for "${line.text}"`, data: { status: sfxResponse.status } });
                         continue;
                    }
                    
                    const sfxArrayBuffer = await sfxResponse.arrayBuffer();
                    const sfxBuffer = await audioContext.decodeAudioData(sfxArrayBuffer);
                    
                    const sfxGainNode = offlineContext.createGain();
                    sfxGainNode.gain.value = line.soundEffectVolume ?? 0.5;
                    sfxGainNode.connect(offlineContext.destination);

                    const sfxSource = offlineContext.createBufferSource();
                    sfxSource.buffer = sfxBuffer;
                    sfxSource.connect(sfxGainNode);
                    sfxSource.start(sfxStartTime);
                } catch (e) { 
                    log({ type: 'error', message: `Failed to process SFX: ${line.text}`, data: e });
                }
            } else if (line.speaker.toUpperCase() !== 'SFX') {
                // Approximate time for speech line to position next SFX
                const lineDuration = Math.max(1.5, line.text.length / CHARS_PER_SECOND);
                lineTimeCursorInChapter += lineDuration;
            }
        }
        sfxTimeCursor += speechBuffer.duration;
    }

    const renderedBuffer = await offlineContext.startRendering();
    return audioBufferToWavBlob(renderedBuffer);
};
//--- END OF FILE services/videoService.ts --- (Incorrectly placed comment)
// This is the correct end of the function and file.

const decodeBase64 = (base64: string) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
};

// --- KNOWLEDGE BASE & SCRIPT GENERATION ---

export const googleSearchForKnowledge = async (question: string, log: LogFunction, apiKeys: ApiKeys): Promise<string> => {
    log({ type: 'request', message: `Поиск в Google: "${question}"` });
    try {
        const response = await generateContentWithFallback({
            contents: question,
            config: {
                tools: [{ googleSearch: {} }],
            },
        }, log, apiKeys);

        const text = response.text;
        if (!text) throw new Error("Google Search returned an empty response.");
        log({ type: 'response', message: 'Ответ от Google Search получен.' });
        return text;
    } catch (error) {
        log({ type: 'error', message: 'Ошибка при поиске в Google.', data: error });
        throw new Error('Не удалось получить информацию из Google Search.');
    }
};

export const generatePodcastBlueprint = async (topic: string, knowledge: string, creative: boolean, lang: string, duration: number, mode: NarrationMode, log: LogFunction, apiKeys: ApiKeys, initialImageCount: number): Promise<Omit<Podcast, 'id' | 'topic' | 'knowledgeBaseText' | 'creativeFreedom' | 'totalDurationMinutes' | 'language' | 'narrationMode' | 'characterVoices' | 'monologueVoice' | 'initialImageCount' | 'backgroundMusicVolume'>> => {
    log({ type: 'request', message: 'Запрос на создание концепции проекта...' });

    const totalChapters = Math.max(1, Math.ceil(duration / 7));
    const characterPrompt = mode === 'dialogue'
        ? `
        - **characters**: An array of EXACTLY TWO characters who will discuss the topic. Give them thematic names and brief, one-sentence descriptions (e.g., "Skeptic" or "Believer").
        - **narrationMode**: "dialogue"
        `
        : `
        - **characters**: An array with ONE "Narrator" character.
        - **narrationMode**: "monologue"
        `;

    const creativePrompt = creative
        ? "Adopt the narrative style of a gripping, suspenseful storyteller like H.P. Lovecraft or Stephen King. Use vivid, atmospheric language. The script should be more of a dramatic story based on the facts, not a dry documentary."
        : "Adopt the style of a clear, informative documentary narrator. Stick closely to the known facts and present them in a structured, easy-to-follow manner.";

    const prompt = `
    Based on the topic "${topic}", create a blueprint for a ${duration}-minute podcast with approximately ${totalChapters} chapters.
    
    **Style and Tone**: ${creativePrompt}
    
    **Knowledge Base (use this as the primary source of truth)**:
    ${knowledge || "No specific knowledge base provided. Use Google Search to find information if necessary."}
    
    **Language**: The entire output, including all text, titles, descriptions, and prompts, must be in **${lang}**.
    
    **Your Task**:
    1.  Generate a list of 5 creative, attention-grabbing titles for a YouTube video on this topic.
    2.  Write a compelling, SEO-friendly YouTube video description (2-3 sentences).
    3.  Provide a list of 10-15 relevant SEO keywords.
    4.  Define the characters for the podcast.
    5.  Write the script for the FIRST chapter ONLY. The script should be engaging and set the tone for the series. It must be an array of objects, each with a "speaker" and "text" property. Include "SFX" as a speaker for sound effects (e.g., { "speaker": "SFX", "text": "Sound of wind howling" }).
    6.  For the first chapter, create ${initialImageCount} detailed, visually striking prompts for an AI image generator like Gemini. The prompts must be in English, regardless of the output language, and should describe atmospheric scenes that match the script.
    
    **Output Format**:
    Return the response as a SINGLE VALID JSON OBJECT in \`\`\`json ... \`\`\`.
    
    **JSON Structure**:
    {
      "youtubeTitleOptions": ["Title 1", "Title 2", ...],
      "description": "YouTube description...",
      "seoKeywords": ["keyword1", "keyword2", ...],
      ${characterPrompt},
      "chapters": [
        {
          "title": "Chapter 1 Title",
          "script": [
            { "speaker": "CharacterName", "text": "Dialogue line 1..." },
            { "speaker": "SFX", "text": "Description of a sound effect..." },
            ...
          ],
          "imagePrompts": [
            "English prompt for image 1...",
            "English prompt for image 2...",
            ...
          ]
        }
      ]
    }
    `;

    const response = await generateContentWithFallback({ contents: prompt }, log, apiKeys);
    const blueprint = await parseGeminiJsonResponse(response.text, log, apiKeys);

    // Populate SFX from the generated script
    if (blueprint.chapters?.[0]?.script) {
        blueprint.chapters[0].script = await findSfxForScript(blueprint.chapters[0].script, log, apiKeys);
    }

    log({ type: 'response', message: 'Концепция проекта успешно создана.' });
    return blueprint;
};

export const generateNextChapterScript = async (topic: string, podcastTitle: string, characters: Character[], previousChapters: Chapter[], chapterIndex: number, totalDuration: number, knowledge: string, creative: boolean, lang: string, mode: NarrationMode, log: LogFunction, apiKeys: ApiKeys): Promise<Pick<Chapter, 'title' | 'script' | 'imagePrompts'>> => {
    log({ type: 'request', message: `Запрос на генерацию сценария для главы ${chapterIndex + 1}` });

    const creativePrompt = creative
        ? "Maintain the narrative style of a gripping, suspenseful storyteller (like Lovecraft or King). Focus on building atmosphere and drama."
        : "Maintain the style of a clear, informative documentary. Present the next set of facts logically.";

    const previousChapterSummaries = previousChapters.map((ch, i) => `Chapter ${i + 1}: ${ch.title} - ${ch.script.slice(0, 2).map(s => s.text).join(' ')}...`).join('\n');

    const prompt = `
    You are writing a script for a podcast titled "${podcastTitle}" on the topic of "${topic}".
    This is Chapter ${chapterIndex + 1} of a podcast that should be approximately ${totalDuration} minutes long.
    
    **Style and Tone**: ${creativePrompt}
    
    **Characters**:
    ${characters.map(c => `- ${c.name}: ${c.description}`).join('\n')}
    
    **Previous Chapters Summary**:
    ${previousChapterSummaries || "This is the first chapter after the introduction."}

    **Knowledge Base (use this as the primary source of truth)**:
    ${knowledge || "No specific knowledge base provided. Use Google Search to find information if necessary."}

    **Language**: The entire output, including all text and titles, must be in **${lang}**.
    
    **Your Task**:
    1.  Write a compelling title for Chapter ${chapterIndex + 1}.
    2.  Write the script for Chapter ${chapterIndex + 1}. Continue the story from the previous chapters. It must be an array of objects with "speaker" and "text". Use the defined characters. Include "SFX" as a speaker for relevant sound effects.
    3.  Create 3 detailed, visually striking prompts in English for an AI image generator that match this chapter's script.
    
    **Output Format**:
    Return the response as a SINGLE VALID JSON OBJECT in \`\`\`json ... \`\`\`.
    
    **JSON Structure**:
    {
      "title": "Chapter ${chapterIndex + 1} Title",
      "script": [
        { "speaker": "CharacterName", "text": "Dialogue line..." },
        { "speaker": "SFX", "text": "Sound effect description..." },
        ...
      ],
      "imagePrompts": [
        "English prompt for image 1...",
        "English prompt for image 2...",
        "English prompt for image 3..."
      ]
    }
    `;

    const response = await generateContentWithFallback({ contents: prompt }, log, apiKeys);
    const chapterData = await parseGeminiJsonResponse(response.text, log, apiKeys);

    if (chapterData.script) {
        chapterData.script = await findSfxForScript(chapterData.script, log, apiKeys);
    }

    log({ type: 'response', message: `Сценарий для главы ${chapterIndex + 1} успешно сгенерирован.` });
    return chapterData;
};


// --- TEXT-TO-SPEECH (TTS) GENERATION ---

export const previewVoice = async (voiceId: string, languageCode: string, log: LogFunction, apiKeys: ApiKeys): Promise<Blob> => {
    log({ type: 'request', message: `Previewing voice: ${voiceId}` });
    const text = languageCode === 'ru' ? "Привет, я один из голосов, доступных для озвучки." : "Hello, I am one of the voices available for narration.";
    const script: ScriptLine[] = [{ speaker: 'Narrator', text }];
    const voices = { 'Narrator': voiceId };
    return await generateChapterAudio(script, 'monologue', voices, voiceId, log, apiKeys, true); // isPreview = true
};

export const generateChapterAudio = async (
    script: ScriptLine[],
    narrationMode: NarrationMode,
    characterVoices: { [key: string]: string },
    monologueVoice: string,
    log: LogFunction,
    apiKeys: ApiKeys,
    isPreview: boolean = false
): Promise<Blob> => {
    const speechLines = script.filter(line => line.speaker.toUpperCase() !== 'SFX');
    if (speechLines.length === 0) {
        log({ type: 'info', message: 'В главе нет текста для озвучки, возвращаем пустой аудиофайл.' });
        return createWavBlobFromPcm(new Int16Array(0), 24000, 1);
    }
    
    const requestKey = `tts-${script.map(s=>s.text).join('').slice(0,50)}`;
    const ai = getTtsAiClient(apiKeys.gemini, log);

    const generateCall = () => {
        const textToSpeak = speechLines.map(line => `${line.speaker}: ${line.text}`).join('\n');
        
        let speechConfig: any = {};
        if (narrationMode === 'dialogue' && !isPreview) {
            const speakerVoiceConfigs = Object.entries(characterVoices).map(([speaker, voiceName]) => ({
                speaker,
                voiceConfig: { prebuiltVoiceConfig: { voiceName } }
            }));
            speechConfig.multiSpeakerVoiceConfig = { speakerVoiceConfigs };
        } else {
            speechConfig.voiceConfig = { prebuiltVoiceConfig: { voiceName: monologueVoice } };
        }
        
        log({ type: 'request', message: `Запрос TTS для ${speechLines.length} строк.`, data: { text: textToSpeak.substring(0, 100) + "...", speechConfig } });

        return ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: textToSpeak }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig,
            },
        });
    };

    try {
        const response: GenerateContentResponse = await withQueueAndRetries(
            generateCall, 
            log, 
            { retries: 4, initialDelay: 5000 },
            'tts',
            2000,
            requestKey
        );
        
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
            const audioBytes = decodeBase64(base64Audio);
            const pcmData = new Int16Array(audioBytes.buffer);
            const wavBlob = createWavBlobFromPcm(pcmData, 24000, 1);
            log({ type: 'response', message: 'Аудио успешно сгенерировано.' });
            return wavBlob;
        } else {
            throw new Error("TTS API returned no audio data.");
        }
    } catch (error) {
        log({ type: 'error', message: 'Ошибка при генерации аудио.', data: error });
        throw error;
    }
};

// --- ASSET REGENERATION & MANAGEMENT ---

export const regenerateTextAssets = async (topic: string, knowledge: string, creative: boolean, lang: string, log: LogFunction, apiKeys: ApiKeys): Promise<Pick<Podcast, 'youtubeTitleOptions' | 'description' | 'seoKeywords'>> => {
    log({ type: 'request', message: 'Запрос на регенерацию текстовых ассетов...' });
    const prompt = `
    For the topic "${topic}", generate new text assets.
    Knowledge Base: ${knowledge || "None"}
    Style: ${creative ? "Creative, suspenseful" : "Informative, documentary"}
    Language: ${lang}
    
    Return a SINGLE VALID JSON OBJECT in \`\`\`json ... \`\`\` with this structure:
    {
      "youtubeTitleOptions": ["Title 1", "Title 2", "Title 3", "Title 4", "Title 5"],
      "description": "YouTube description...",
      "seoKeywords": ["keyword1", "keyword2", ...]
    }
    `;
    const response = await generateContentWithFallback({ contents: prompt }, log, apiKeys);
    return parseGeminiJsonResponse(response.text, log, apiKeys);
};

export const generateThumbnailDesignConcepts = async (topic: string, language: string, log: LogFunction, apiKeys: ApiKeys): Promise<ThumbnailDesignConcept[]> => {
    log({ type: 'request', message: 'Запрос на создание AI-концепций для обложек...' });
    const prompt = `
    Generate 5 distinct design concepts for a YouTube thumbnail about "${topic}".
    For each concept, provide a name and parameters. Consider modern, high-CTR styles (e.g., MrBeast style with bold outlines, gradients).
    Language for analysis: ${language}.
    
    Return a SINGLE VALID JSON OBJECT in \`\`\`json ... \`\`\` with the key "concepts" containing an array of objects.
    
    JSON Structure for each concept object:
    {
      "name": "Concept Name (e.g., 'Bold Impact', 'Mystic Glow')",
      "fontFamily": "A suitable Google Font name (e.g., 'Montserrat', 'Bebas Neue')",
      "fontSize": 90,
      "textColor": "#FFFFFF",
      "shadowColor": "rgba(0,0,0,0.75)",
      "overlayOpacity": 0.4,
      "strokeColor": "#000000",
      "strokeWidth": 10,
      "gradientColors": ["#FFD700", "#FFA500"],
      "textTransform": "uppercase"
    }
    `;
    const response = await generateContentWithFallback({ contents: prompt }, log, apiKeys);
    const result = await parseGeminiJsonResponse(response.text, log, apiKeys);
    return result.concepts;
};

export const convertWavToMp3 = async (wavBlob: Blob, log: LogFunction): Promise<Blob> => {
    try {
        log({ type: 'info', message: `Начало конвертации в MP3. Размер WAV: ${(wavBlob.size / 1024 / 1024).toFixed(2)} MB` });
        // @FIX: Property 'AudioContext' does not exist on type 'Window'.
        const audioContext = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
        const arrayBuffer = await wavBlob.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        const sampleRate = audioBuffer.sampleRate;
        const numChannels = audioBuffer.numberOfChannels;
        const pcmData = audioBuffer.getChannelData(0); // Assuming mono, adjust if stereo is needed

        const mp3encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, 128); // 128 kbps
        const samples = new Int16Array(pcmData.length);
        for (let i = 0; i < pcmData.length; i++) {
            samples[i] = pcmData[i] * 32767.5;
        }

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

        const mp3Blob = new Blob(mp3Data.map(d => new Uint8Array(d.buffer, 0, d.length)), { type: 'audio/mp3' });
        log({ type: 'response', message: `Конвертация в MP3 завершена. Размер MP3: ${(mp3Blob.size / 1024 / 1024).toFixed(2)} MB` });
        return mp3Blob;
    } catch (error) {
        log({ type: 'error', message: 'Ошибка при конвертации в MP3', data: error });
        throw new Error("Не удалось конвертировать аудио в MP3.");
    }
};

// --- MUSIC & SFX ---

export const findMusicWithAi = async (context: string, log: LogFunction, apiKeys: ApiKeys): Promise<MusicTrack[]> => {
    log({ type: 'request', message: 'Подбор музыки с помощью ИИ...' });
    const prompt = `
    Based on the following podcast script context, suggest 3-5 keywords for searching for background music on a service like Jamendo.
    Focus on mood, genre, and instrumentation. Output only comma-separated keywords in English.
    
    Context: "${context.substring(0, 500)}..."
    
    Keywords:
    `;
    try {
        const keywordsResponse = await generateContentWithFallback({ contents: prompt }, log, apiKeys);
        const keywords = keywordsResponse.text.trim();
        log({ type: 'info', message: `ИИ предложил ключевые слова для музыки: ${keywords}` });
        
        if (!keywords) return [];

        return await findMusicManually(keywords, log);
    } catch (error) {
        log({ type: 'error', message: 'Ошибка при подборе музыки с ИИ.', data: error });
        return [];
    }
};

export const findMusicManually = async (keywords: string, log: LogFunction): Promise<MusicTrack[]> => {
    log({ type: 'request', message: `Ручной поиск музыки: "${keywords}"` });
    try {
        const response = await fetch(`https://api.jamendo.com/v3.0/tracks/?client_id=e2db592f&format=json&limit=10&fuzzytags=${encodeURIComponent(keywords)}&order=popularity_week`);
        if (!response.ok) throw new Error(`Jamendo API error: ${response.statusText}`);
        
        const data = await response.json();
        const tracks = data.results.map((track: any): MusicTrack => ({
            id: track.id,
            name: track.name,
            artist_name: track.artist_name,
            audio: track.audio
        }));
        log({ type: 'response', message: `Найдено ${tracks.length} музыкальных треков.` });
        return tracks;
    } catch (error) {
        log({ type: 'error', message: 'Ошибка при ручном поиске музыки.', data: error });
        return [];
    }
};
