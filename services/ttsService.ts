import { GoogleGenAI, Modality, GenerateContentResponse } from "@google/genai";
import * as lamejs from 'lamejs';
import type { Podcast, Chapter, Source, LogEntry, ScriptLine, Character, ThumbnailDesignConcept, NarrationMode, MusicTrack, SoundEffect } from '../types';
import { withQueueAndRetries, generateContentWithFallback, withRetries, RetryConfig } from './geminiService';
import { parseGeminiJsonResponse } from './aiUtils';
import { findSfxForScript } from './sfxService';
import { appConfig, API_KEYS } from '../config/appConfig';
import { createWavBlob } from '../utils/audioUtils';
import { prompts } from './prompts';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;
type ApiKeys = { gemini?: string; freesound?: string; };

const getTtsAiClient = (customApiKey: string | undefined, log: LogFunction) => {
  const apiKey = customApiKey?.trim() || appConfig.geminiApiKey;
  if (!apiKey) {
    const errorMsg = "❌ Gemini API ключ не настроен. Добавьте ключ в настройках.";
    log({ type: 'error', message: errorMsg });
    throw new Error(errorMsg);
  }
  return new GoogleGenAI({ apiKey });
};

export const googleSearchForKnowledge = async (question: string, log: LogFunction, apiKeys: ApiKeys): Promise<string> => {
    log({ type: 'request', message: `Поиск в Google: "${question}"` });
    const prompt = `Answer the following question based on Google Search results: "${question}". Provide a concise, factual answer.`;
    const response = await generateContentWithFallback({
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] }
    }, log, apiKeys);
    const answer = response.text;
    log({ type: 'response', message: `Ответ Google: ${answer.substring(0, 100)}...` });
    return answer;
};

export const previewVoice = async (voiceId: string, languageCode: string, log: LogFunction, apiKeys: ApiKeys): Promise<Blob> => {
    log({ type: 'request', message: `Запрос предпрослушивания для голоса: ${voiceId}` });
    const ai = getTtsAiClient(apiKeys.gemini, log);
    const sampleText = languageCode === 'ru' ? 'Привет, это предпрослушивание моего голоса.' : 'Hello, this is a preview of my voice.';

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: sampleText }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceId } },
            },
        },
    });

    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) {
        throw new Error("No audio data returned from TTS API");
    }
    const audioBytes = Uint8Array.from(atob(audioData), c => c.charCodeAt(0));
    // Create a valid WAV blob with the correct header for the raw PCM data.
    return createWavBlob(audioBytes, 24000, 1);
};

export const generatePodcastBlueprint = async (topic: string, knowledgeBase: string, creativeFreedom: boolean, language: string, duration: number, narrationMode: NarrationMode, log: LogFunction, apiKeys: ApiKeys, initialImageCount: number) => {
    const style = creativeFreedom ? 'a captivating narrative story in the style of Stephen King or H.P. Lovecraft, using facts as inspiration' : 'a factual, documentary-style report';
    const characterPrompt = narrationMode === 'dialogue'
        ? `
      "characters": [
        { "name": "Narrator", "description": "A calm, deep-voiced storyteller setting the scene." },
        { "name": "Expert", "description": "A knowledgeable historian or specialist providing factual context." }
      ],
    `
        : `
      "characters": [
        { "name": "Narrator", "description": "A calm, deep-voiced storyteller." }
      ],
    `;

    const useGoogleSearch = !knowledgeBase.trim();
    const sourceInstruction = useGoogleSearch
        ? 'Base your answer on Google Search results.'
        : 'Base your answer exclusively on the provided knowledge base.';

    const prompt = prompts.youtubeBlueprint(topic, duration, style, characterPrompt, sourceInstruction, language);

    const response = await generateContentWithFallback({
        contents: `${prompt}\n\nKnowledge Base:\n${knowledgeBase}`,
        config: useGoogleSearch ? { tools: [{ googleSearch: {} }] } : {}
    }, log, apiKeys);

    return await parseGeminiJsonResponse(response.text, log, apiKeys);
};

export const generateNextChapterScript = async (topic: string, mainTitle: string, characters: Character[], previousChapters: Chapter[], chapterIndex: number, duration: number, knowledgeBase: string, creativeFreedom: boolean, language: string, narrationMode: NarrationMode, log: LogFunction, apiKeys: ApiKeys) => {
    const totalChapters = Math.max(1, Math.ceil(duration / 7));
    const isFinalChapter = (chapterIndex + 1) >= totalChapters;
    const style = creativeFreedom ? 'a captivating narrative story' : 'a factual, documentary-style report';
    const useGoogleSearch = !knowledgeBase.trim();
    const sourceInstruction = useGoogleSearch ? 'Base your answer on Google Search results.' : 'Base your answer on the provided knowledge base.';
    const context = previousChapters.map((c, i) => `Chapter ${i + 1}: ${c.title}\nSummary: ${c.script.map(s => s.text).join(' ').substring(0, 150)}...`).join('\n\n');

    const prompt = prompts.nextChapter(topic, mainTitle, context, chapterIndex, style, sourceInstruction, language, isFinalChapter);

    const response = await generateContentWithFallback({
        contents: `${prompt}\n\nKnowledge Base:\n${knowledgeBase}`,
        config: useGoogleSearch ? { tools: [{ googleSearch: {} }] } : {}
    }, log, apiKeys);

    return await parseGeminiJsonResponse(response.text, log, apiKeys);
};

export const generateChapterAudio = async (script: ScriptLine[], narrationMode: NarrationMode, characterVoices: { [key: string]: string }, monologueVoice: string, log: LogFunction, apiKeys: ApiKeys): Promise<Blob> => {
    // Filter out SFX lines to prevent them from being read aloud.
    const ttsScript = script.filter(line => line.speaker.toUpperCase() !== 'SFX');
    
    if (ttsScript.length === 0) {
        log({ type: 'warning', message: 'No text to speak in this chapter, generating silence.' });
        // Return a short silent audio blob to avoid breaking downstream processes
        const silentAudioBytes = new Uint8Array(24000 * 2 * 1 * 0.1); // 0.1 second of silence
        return createWavBlob(silentAudioBytes, 24000, 1);
    }
    
    const fullText = ttsScript.map(line => `${line.speaker}: ${line.text}`).join('\n');
    log({ type: 'request', message: 'Запрос на генерацию аудио для главы...' });
    const ai = getTtsAiClient(apiKeys.gemini, log);
    
    let speechConfig;
    if (narrationMode === 'dialogue') {
        const uniqueSpeakersInScript = [...new Set(ttsScript.map(line => line.speaker))];
        
        const speakerConfigs = uniqueSpeakersInScript
            .map(speaker => {
                const voiceName = characterVoices[speaker];
                if (!voiceName) {
                    log({ type: 'warning', message: `No voice assigned for speaker "${speaker}" in this chapter. It will be skipped in multi-speaker mode.` });
                    return null;
                }
                return {
                    speaker,
                    voiceConfig: { prebuiltVoiceConfig: { voiceName } }
                };
            })
            .filter((config): config is NonNullable<typeof config> => config !== null);

        // API requires exactly 2 voices for multi-speaker mode.
        if (speakerConfigs.length === 2) {
            speechConfig = { multiSpeakerVoiceConfig: { speakerVoiceConfigs: speakerConfigs } };
        } else {
            log({ type: 'warning', message: `Dialogue mode requires 2 unique speakers with assigned voices in the script, but found ${speakerConfigs.length}. Falling back to single-speaker synthesis.` });
            // Fallback to the first available character voice or the default monologue voice
            const fallbackVoice = Object.values(characterVoices)[0] || monologueVoice;
            speechConfig = { voiceConfig: { prebuiltVoiceConfig: { voiceName: fallbackVoice } } };
        }
    } else {
        speechConfig = { voiceConfig: { prebuiltVoiceConfig: { voiceName: monologueVoice } } };
    }

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: fullText }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig,
        },
    });

    const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!audioData) throw new Error("No audio data returned from TTS API");
    const audioBytes = Uint8Array.from(atob(audioData), c => c.charCodeAt(0));
    // Create a valid WAV blob with the correct header for the raw PCM data.
    return createWavBlob(audioBytes, 24000, 1);
};

export const combineAndMixAudio = async (podcast: Podcast, log: LogFunction): Promise<Blob> => {
    // Implementation requires Web Audio API, assumed to be in a browser environment
    const AudioContext = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    if (!AudioContext) throw new Error('Web Audio API not supported');

    const completedChapters = podcast.chapters.filter(c => c.status === 'completed' && c.audioBlob);
    if (completedChapters.length === 0) throw new Error('Нет завершенных глав для сборки аудио.');

    const audioBuffers = await Promise.all(completedChapters.map(c => c.audioBlob!.arrayBuffer().then(b => new AudioContext(1, 1, 44100).decodeAudioData(b))));
    const totalDuration = audioBuffers.reduce((sum, buffer) => sum + buffer.duration, 0);
    const context = new AudioContext(2, Math.ceil(totalDuration * 44100), 44100);

    let offset = 0;
    for (const [index, buffer] of audioBuffers.entries()) {
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        source.start(offset);
        
        const chapter = completedChapters[index];
        // Handle music
        if (chapter.backgroundMusic) {
             try {
                const musicUrl = `/api/audio-proxy?url=${encodeURIComponent(chapter.backgroundMusic.audio)}`;
                const musicResponse = await fetch(musicUrl);
                if (!musicResponse.ok) throw new Error(`Failed to fetch music: ${musicResponse.statusText}`);
                const musicBuffer = await context.decodeAudioData(await musicResponse.arrayBuffer());
                
                const musicSource = context.createBufferSource();
                musicSource.buffer = musicBuffer;
                musicSource.loop = true;
                
                const gainNode = context.createGain();
                gainNode.gain.value = chapter.backgroundMusicVolume ?? podcast.backgroundMusicVolume;
                
                musicSource.connect(gainNode);
                gainNode.connect(context.destination);
                musicSource.start(offset);
                musicSource.stop(offset + buffer.duration);
            } catch (e) {
                log({type: 'error', message: `Не удалось загрузить или обработать музыку для главы ${index + 1}`, data: e});
            }
        }
        
        offset += buffer.duration;
    }

    const renderedBuffer = await context.startRendering();
    
    // Convert to WAV
    const channels = renderedBuffer.numberOfChannels;
    const sampleRate = renderedBuffer.sampleRate;
    const length = renderedBuffer.length * channels * 2;
    const buffer = new ArrayBuffer(44 + length);
    const view = new DataView(buffer);
    
    const writeString = (v: DataView, offset: number, s: string) => {
        for (let i = 0; i < s.length; i++) {
            v.setUint8(offset + i, s.charCodeAt(i));
        }
    };
    
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(view, 8, 'WAVEfmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 4, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, length, true);
    
    const pcm = new Int16Array(length);
    let offsetBytes = 44;
    for (let i = 0; i < renderedBuffer.length; i++) {
        for (let channel = 0; channel < channels; channel++) {
            const val = Math.max(-1, Math.min(1, renderedBuffer.getChannelData(channel)[i]));
            pcm[i * channels + channel] = val * 0x7FFF;
            view.setInt16(offsetBytes, pcm[i * channels + channel], true);
            offsetBytes += 2;
        }
    }

    return new Blob([view], { type: 'audio/wav' });
};

export const regenerateTextAssets = async (topic: string, knowledgeBase: string, creativeFreedom: boolean, language: string, log: LogFunction, apiKeys: ApiKeys) => {
    const style = creativeFreedom ? 'captivating and mysterious' : 'factual and clear';
    const prompt = `
        Regenerate text assets for a YouTube podcast about "${topic}". The style is ${style}. The language is ${language}.
        Return a single valid JSON object in \`\`\`json ... \`\`\`.
        {
          "youtubeTitleOptions": ["New Title 1", "New Title 2", "New Title 3"],
          "description": "A new, regenerated, SEO-optimized YouTube description.",
          "seoKeywords": ["newkeyword1", "newkeyword2"]
        }
    `;
    const response = await generateContentWithFallback({ contents: prompt }, log, apiKeys);
    return await parseGeminiJsonResponse(response.text, log, apiKeys);
};

export const generateThumbnailDesignConcepts = async (topic: string, language: string, log: LogFunction, apiKeys: ApiKeys): Promise<ThumbnailDesignConcept[]> => {
    const prompt = prompts.thumbnailDesigns(topic, language);
    const response = await generateContentWithFallback({ contents: prompt }, log, apiKeys);
    return await parseGeminiJsonResponse(response.text, log, apiKeys);
};

export const convertWavToMp3 = async (wavBlob: Blob, log: LogFunction): Promise<Blob> => {
    log({ type: 'info', message: 'Начало конвертации WAV в MP3...' });
    const wav = new lamejs.WavHeader.readHeader(new DataView(await wavBlob.arrayBuffer()));
    const samples = new Int16Array(await wavBlob.arrayBuffer(), wav.dataOffset, wav.dataLen / 2);
    const mp3encoder = new lamejs.Mp3Encoder(wav.channels, wav.sampleRate, 128);
    const mp3Data: any[] = [];
    const sampleBlockSize = 1152;
    for (let i = 0; i < samples.length; i += sampleBlockSize) {
        const sampleChunk = samples.subarray(i, i + sampleBlockSize);
        const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
        if (mp3buf.length > 0) mp3Data.push(mp3buf);
    }
    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) mp3Data.push(mp3buf);
    log({ type: 'info', message: 'Конвертация в MP3 завершена.' });
    return new Blob(mp3Data, { type: 'audio/mp3' });
};

// Jamendo Client ID from API_KEYS configuration
const JAMENDO_CLIENT_ID = API_KEYS.jamendo;

export const findMusicManually = async (keywords: string, log: LogFunction): Promise<MusicTrack[]> => {
    if (!JAMENDO_CLIENT_ID) {
        log({type: 'warning', message: 'Jamendo Client ID не настроен. Поиск музыки будет пропущен.'});
        return [];
    }
    const url = `https://api.jamendo.com/v3.0/tracks/?client_id=${JAMENDO_CLIENT_ID}&format=json&tags=${encodeURIComponent(keywords)}&limit=10&order=popularity_week`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Jamendo API error: ${response.statusText}`);
        const data = await response.json();
        return data.results.filter((track: any) => track.audio.endsWith('.mp3'));
    } catch (e) {
        log({type: 'error', message: 'Ошибка при поиске музыки на Jamendo', data: e});
        return [];
    }
};

export const findMusicWithAi = async (scriptText: string, log: LogFunction, apiKeys: ApiKeys): Promise<MusicTrack[]> => {
    if (!JAMENDO_CLIENT_ID) {
        return []; // Silently skip if no key, findMusicManually will log the warning.
    }
    const prompt = prompts.musicTags(scriptText);
    try {
        const response = await generateContentWithFallback({ contents: prompt }, log, apiKeys);
        const data = await parseGeminiJsonResponse(response.text, log, apiKeys);
        const tagSets = data.tag_sets as string[];

        for (const tags of tagSets) {
            log({type: 'info', message: `Поиск музыки по AI-тегам: "${tags}"`});
            const tracks = await findMusicManually(tags, log);
            if (tracks.length > 0) return tracks;
        }
        return [];
    } catch (e) {
        log({type: 'error', message: 'Ошибка при подборе музыки с помощью ИИ', data: e});
        return [];
    }
};