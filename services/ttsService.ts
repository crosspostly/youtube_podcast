import { GoogleGenAI, Modality, GenerateContentResponse } from "@google/genai";
import type { Podcast, Chapter, Source, LogEntry, ScriptLine, Character, ThumbnailDesignConcept, NarrationMode } from '../types';
import { withRetries, generateContentWithFallback } from './geminiService';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;

// This client is now only for the TTS-specific model which doesn't use the text fallback logic.
const getTtsAiClient = (log: LogFunction, customApiKey?: string) => {
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

const parseGeminiJsonResponse = async (rawText: string, log: LogFunction, apiKey?: string): Promise<any> => {
    log({ type: 'response', message: 'Сырой ответ от Gemini', data: rawText });
    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : rawText;

    try {
        return JSON.parse(jsonText);
    } catch (jsonError) {
        log({ type: 'error', message: 'Не удалось распарсить JSON, попытка исправления с помощью ИИ...', data: { error: jsonError, text: jsonText } });
        
        const correctionPrompt = `The following text is a malformed JSON response from an API. Please correct any syntax errors (like trailing commas, missing brackets, or unescaped quotes) and return ONLY the valid JSON object. Do not include any explanatory text or markdown formatting like \`\`\`json.

        Malformed JSON:
        ${jsonText}`;

        try {
            const correctionResponse = await generateContentWithFallback({ contents: correctionPrompt }, log, apiKey);
            const correctedRawText = correctionResponse.text;
            log({ type: 'info', message: 'Получен исправленный JSON от ИИ.', data: correctedRawText });
            
            const correctedJsonMatch = correctedRawText.match(/```json\s*([\s\S]*?)\s*```/);
            const correctedJsonText = correctedJsonMatch ? correctedJsonMatch[1] : correctedRawText;
            return JSON.parse(correctedJsonText);

        } catch (correctionError) {
             log({ type: 'error', message: 'Не удалось исправить и распарсить JSON даже после второй попытки.', data: correctionError });
             throw new Error(`Ответ модели не является валидным JSON, и попытка автоматического исправления не удалась.`);
        }
    }
};

export const googleSearchForKnowledge = async (question: string, log: LogFunction, apiKey?: string): Promise<string> => {
    log({ type: 'info', message: 'Начало поиска информации в Google для базы знаний.' });

    const prompt = `Using Google Search, find and provide a detailed, structured answer to the following question. The answer should be comprehensive, well-formatted, and contain key facts. Write the answer in Russian.

    Question: "${question}"`;

    try {
        const response = await generateContentWithFallback({ 
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] } 
        }, log, apiKey);
        
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

export const generatePodcastBlueprint = async (topic: string, knowledgeBaseText: string, creativeFreedom: boolean, language: string, log: LogFunction, apiKey?: string): Promise<Omit<Podcast, 'id' | 'topic' | 'selectedTitle' | 'chapters' | 'totalDurationMinutes' | 'creativeFreedom' | 'knowledgeBaseText' | 'language' | 'designConcepts' | 'narrationMode' | 'characterVoices' | 'monologueVoice' | 'selectedBgIndex'> & { chapters: Chapter[] }> => {
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

    const prompt = `You are an AI screenwriter and YouTube producer. Your task is to create a complete package of materials for a compelling YouTube video on the topic: "${topic}".
    
    **CRITICAL INSTRUCTION: Generate all text content STRICTLY in the following language: ${language}.**

    ${sourceInstruction}
    ${styleInstruction}

    **General Task Requirements:**
    - The chapter script should be approximately 7-8 minutes long when spoken. **IMPORTANT: The total text volume of this chapter's script MUST be between 8500 and 9500 characters.**
    1.  Create two unique characters for this video (e.g., "Host", "Historian"). Give each a brief description (gender, voice character).
    2.  Create YouTube-optimized text assets (title options, description, tags) and 10 image prompts.
    3.  Write the script for the FIRST CHAPTER. Format all sound effect cues as a separate element with the speaker "SFX".

    Return the result as a SINGLE VALID JSON OBJECT in \`\`\`json ... \`\`\`.

    **JSON Structure:**
    {
      "youtubeTitleOptions": [ "An array of 3-5 clickable, intriguing, and SEO-optimized titles for the YouTube video" ],
      "description": "A detailed description for the YouTube video (2-3 paragraphs). It should engage the viewer, summarize the content, and include a call to action (subscribe, like).",
      "seoKeywords": ["list", "of", "10-15", "relevant", "tags", "for", "the YouTube video"],
      "imagePrompts": [
        "10 unique, detailed prompts in English for image generation."
      ],
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
        ]
      }
    }${knowledgeBaseBlock}`;
    
    try {
        const config = knowledgeBaseText ? {} : { tools: [{ googleSearch: {} }] };
        const response = await generateContentWithFallback({ contents: prompt, config }, log, apiKey);
        const data = await parseGeminiJsonResponse(response.text, log, apiKey);

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
            youtubeTitleOptions: data.youtubeTitleOptions,
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

export const regenerateTextAssets = async (topic: string, knowledgeBaseText: string, creativeFreedom: boolean, language: string, log: LogFunction, apiKey?: string): Promise<{ youtubeTitleOptions: string[]; description: string; seoKeywords: string[] }> => {
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
        const response = await generateContentWithFallback({ contents: prompt }, log, apiKey);
        const data = await parseGeminiJsonResponse(response.text, log, apiKey);
        log({ type: 'info', message: 'Текстовые материалы успешно обновлены.' });
        return data;
    } catch (error) {
        log({ type: 'error', message: 'Ошибка при регенерации текстовых материалов', data: error });
        throw error;
    }
};

export const generateNextChapterScript = async (topic: string, podcastTitle: string, characters: Character[], previousChapters: Chapter[], chapterIndex: number, knowledgeBaseText: string, creativeFreedom: boolean, language: string, log: LogFunction, apiKey?: string): Promise<{title: string, script: ScriptLine[]}> => {
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

    const prompt = `You are a master of suspense, an AI screenwriter continuing a long-form podcast.

    Podcast Topic: "${topic}"
    Podcast Title: "${podcastTitle}"
    Characters:
    ${characterDescriptions}
    Summary of previous chapters:
    ${previousSummary}

    **CRITICAL INSTRUCTION: Generate all text content STRICTLY in the following language: ${language}.**

    Your task: write the script for the NEXT, ${chapterIndex + 1}-th chapter, approximately 7-8 minutes long when spoken.
    - **IMPORTANT: The total text volume of this chapter's script MUST be between 8500 and 9500 characters.**
    - Use only the character names: ${characters.map(c => `"${c.name}"`).join(', ')}.
    - Format all cues, sound effects, and action descriptions as a separate element with the speaker "SFX".
    - ${styleInstruction}
    
    Return the result as a SINGLE VALID JSON OBJECT in \`\`\`json ... \`\`\`.
    Structure: {
        "title": "Title of this new chapter",
        "script": [{ "speaker": "SFX", "text": "..." }, { "speaker": "${characters[0].name}", "text": "..." }, { "speaker": "${characters[1].name}", "text": "..." }]
    }${knowledgeBaseBlock}`;
    
    try {
        const response = await generateContentWithFallback({ contents: prompt }, log, apiKey);
        const data = await parseGeminiJsonResponse(response.text, log, apiKey);
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

const TTS_MODEL_FALLBACK_CHAIN = [
    'gemini-2.5-flash-preview-tts',
    'gemini-2.5-pro-preview-tts',
    'gemini-2.5-flash-tts'
];

const generateAudioWithFallback = async (
    params: { contents: any; config: any; },
    log: LogFunction,
    customApiKey?: string
): Promise<GenerateContentResponse> => {
    const ai = getTtsAiClient(log, customApiKey);

    for (const model of TTS_MODEL_FALLBACK_CHAIN) {
        try {
            log({ type: 'request', message: `Attempting audio generation with model: ${model}` });
            const generateCall = () => ai.models.generateContent({ model, ...params });
            const response = await withRetries(generateCall, log);
            log({ type: 'response', message: `Successfully generated audio with model: ${model}` });
            return response;
        } catch (error) {
            log({ type: 'error', message: `Model ${model} failed after retries. Trying next model...`, data: error });
        }
    }
    throw new Error(`All TTS models in the fallback chain failed. See logs for details.`);
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
        const response = await generateAudioWithFallback(params, log, apiKey);
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
    apiKey?: string
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
        const response = await generateAudioWithFallback(params, log, apiKey);
        const wavBlob = processTtsResponse(response);
        log({ type: 'info', message: 'WAV файл успешно создан.' });
        return wavBlob;
    } catch (error) {
        log({ type: 'error', message: 'Ошибка при синтезе аудио (TTS)', data: error });
        throw error;
    }
};

export const generateThumbnailDesignConcepts = async (topic: string, language: string, log: LogFunction, apiKey?: string): Promise<ThumbnailDesignConcept[]> => {
    log({ type: 'info', message: 'Начало генерации дизайн-концепций для обложек.' });

    const prompt = `You are an expert in creating viral, high-CTR YouTube thumbnails, specializing in the style of top creators like MrBeast. Your design MUST use principles of visual psychology: high contrast, emotional impact, and extremely readable, bold typography.
    
    Analyze this video topic: "${topic}". 
    
    Propose 3 distinct, "bombastic" design concepts. For each concept, provide a name and specific design parameters. I want you to include modern design elements like text strokes (outlines) and gradients.
    
    **CRITICAL INSTRUCTION: For 'fontFamily', suggest specific, popular, free-to-use Google Font names that fit the theme (e.g., 'Anton', 'Bebas Neue', 'Creepster'). Do not use generic categories like 'serif'. Your entire response must be in the language: ${language}.**

    Return the result as a SINGLE VALID JSON OBJECT in \`\`\`json ... \`\`\`.

    **JSON Structure:**
    {
      "concepts": [
        {
          "name": "Concept name (e.g., Electric Shock, Conspiracy Board, Ancient Artifact)",
          "fontFamily": "A specific Google Font name like 'Anton' or 'Oswald'",
          "fontSize": 120,
          "textColor": "#RRGGBB hex code",
          "shadowColor": "#RRGGBB hex code for a glow or drop shadow",
          "overlayOpacity": A number between 0.2 and 0.6 for the dark overlay,
          "textTransform": "uppercase",
          "strokeColor": "#RRGGBB hex code for a contrasting text outline (e.g., black or white)",
          "strokeWidth": A number between 5 and 15,
          "gradientColors": ["#startColorHex", "#endColorHex"]
        }
      ]
    }`;

    try {
        const response = await generateContentWithFallback({ contents: prompt }, log, apiKey);
        const data = await parseGeminiJsonResponse(response.text, log, apiKey);
        if (!data.concepts || data.concepts.length === 0) {
            throw new Error("AI не смог сгенерировать дизайн-концепции.");
        }
        log({ type: 'info', message: 'Дизайн-концепции успешно созданы.' });
        return data.concepts.slice(0, 3);
    } catch (error) {
        log({ type: 'error', message: 'Ошибка при генерации дизайн-концепций. Будут использованы стандартные.', data: error });
        // Fallback to default concepts on error
        return [
            { name: "Контрастный Удар (Резервный)", fontFamily: "Anton", fontSize: 110, textColor: "#FFFF00", shadowColor: "#000000", overlayOpacity: 0.3, textTransform: 'uppercase', strokeColor: "#000000", strokeWidth: 8 },
            { name: "Классический Триллер (Резервный)", fontFamily: "Roboto Slab", fontSize: 100, textColor: "#FFFFFF", shadowColor: "#000000", overlayOpacity: 0.5, textTransform: 'uppercase', strokeColor: "transparent", strokeWidth: 0 },
            { name: "Современный Градиент (Резервный)", fontFamily: "Bebas Neue", fontSize: 130, textColor: "#FFFFFF", shadowColor: "transparent", overlayOpacity: 0.4, textTransform: 'uppercase', gradientColors: ["#00FFFF", "#FF00FF"] }
        ];
    }
};

export { combineWavBlobs };
