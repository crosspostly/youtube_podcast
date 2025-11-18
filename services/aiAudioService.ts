// services/aiAudioService.ts
import { GenerateContentResponse, Modality } from "@google/genai";
import { createWavBlobFromPcm } from './audioUtils';
import { withRetries, getAiClient } from './apiUtils';
import type { LogEntry, ScriptLine, NarrationMode } from '../types';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;

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
    log: LogFunction
): Promise<GenerateContentResponse> => {
    const ai = getAiClient(log);
    const model = 'gemini-2.5-flash-preview-tts';
    try {
        log({ type: 'request', message: `Attempting audio generation with model: ${model}` });
        const generateCall = () => ai.models.generateContent({ model, ...params });
        const response = await withRetries(generateCall, log);
        log({ type: 'response', message: `Successfully generated audio with model: ${model}` });
        return response;
    } catch (error) {
        log({ type: 'error', message: `Model ${model} failed after retries.`, data: error });
        throw new Error(`TTS model failed. See logs for details.`);
    }
};

export const previewVoice = async (voiceName: string, languageCode: string, log: LogFunction): Promise<Blob> => {
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
        const response = await generateAudioWithRetries(params, log);
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
    log: LogFunction
): Promise<Blob> => {
    log({ type: 'info', message: `Начало синтеза аудио в режиме '${narrationMode}'.` });
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
        const response = await generateAudioWithRetries(params, log);
        const wavBlob = processTtsResponse(response);
        log({ type: 'info', message: 'WAV файл успешно создан.' });
        return wavBlob;
    } catch (error) {
        log({ type: 'error', message: 'Ошибка при синтезе аудио (TTS)', data: error });
        throw error;
    }
};
