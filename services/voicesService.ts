// services/voicesService.ts
import { getAiClient } from './apiUtils';
import type { LogEntry, Voice } from '../types';
import { VOICES } from '../config/voices';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;

/**
 * Attempts to discover additional voices by testing common voice name patterns
 * This is a workaround since Google doesn't provide a direct voices listing endpoint in the current SDK
 */
export const discoverAdditionalVoices = async (log: LogFunction): Promise<Voice[]> => {
    // Common voice name patterns based on Google's TTS documentation and existing voices
    const potentialVoiceNames = [
        // Existing voices (already in config/voices.ts)
        'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 
        'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 
        'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar', 
        'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi', 
        'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
        
        // Potential additional voices based on Google's naming conventions
        'Nova', 'Lyra', 'Orion', 'Vega', 'Sirius', 'Altair', 'Rigel', 'Procyon',
        'Capella', 'Arcturus', 'Aldebaran', 'Spica', 'Antares', 'Pollux', 
        'Fomalhaut', 'Deneb', 'Regulus', 'Adhara', 'Castor', 'Bellatrix',
        'Elnath', 'Miaplacidus', 'Alnair', 'Alnilam', 'Alioth', 'Dubhe',
        'Mirfak', 'Wezen', 'Sargas', 'Avior', 'Alkaid', 'Menkalinan',
        'Atria', 'Alhena', 'Peacock', 'Polaris', 'Mirzam', 'Alphard',
        'Hamal', 'Algieba', 'Diphda', 'Nunki', 'Menkar', 'Alrescha',
        'Alpheratz', 'Markab', 'Algenib', 'Caph', 'Scheat', 'Algenib'
    ];

    const discoveredVoices: Voice[] = [];
    const ai = getAiClient(log);

    log({ type: 'info', message: `Starting voice discovery with ${potentialVoiceNames.length} potential voice names` });

    // Test a few voices to verify they work (we won't test all to avoid API limits)
    const testSampleSize = Math.min(10, potentialVoiceNames.length);
    const sampleVoices = potentialVoiceNames.slice(0, testSampleSize);
    
    for (const voiceName of sampleVoices) {
        try {
            log({ type: 'info', message: `Testing voice: ${voiceName}` });
            
            // Try a minimal TTS request to test if the voice exists
            const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash-preview-tts' });
            const testText = "Test";
            
            const result = await model.generateContent({
                contents: [{ parts: [{ text: testText }] }],
                config: {
                    responseModalities: ["AUDIO" as const],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName } },
                    },
                },
            });
            
            // If we get here, the voice exists
            const baseVoice = VOICES.find(v => v.id === voiceName);
            if (baseVoice) {
                discoveredVoices.push(baseVoice);
            } else {
                // Create a generic voice entry for newly discovered voices
                discoveredVoices.push({
                    id: voiceName,
                    name: voiceName,
                    description: 'Discovered Voice',
                    gender: voiceName.match(/^[AEIOU]/i) ? 'female' : 'male' // Simple heuristic
                });
            }
            
            log({ type: 'info', message: `Voice ${voiceName} is available` });
            
        } catch (error) {
            log({ type: 'info', message: `Voice ${voiceName} is not available` });
            // Continue with next voice
        }
    }

    // Combine static voices with any newly discovered ones
    const allVoices = [...VOICES];
    
    // Add any newly discovered voices that weren't in the original list
    for (const discovered of discoveredVoices) {
        if (!allVoices.find(v => v.id === discovered.id)) {
            allVoices.push(discovered);
        }
    }

    log({ type: 'info', message: `Voice discovery complete. Total available voices: ${allVoices.length}` });
    return allVoices;
};

/**
 * Fetches available voices from Google Gemini TTS API.
 * Uses voice discovery to find additional voices beyond the static list.
 */
export const fetchAvailableVoices = async (log: LogFunction): Promise<Voice[]> => {
    try {
        log({ type: 'info', message: 'Attempting to fetch available voices from Google Gemini API...' });
        
        // Try to discover additional voices
        const discoveredVoices = await discoverAdditionalVoices(log);
        
        if (discoveredVoices.length > VOICES.length) {
            log({ type: 'info', message: `Discovered ${discoveredVoices.length - VOICES.length} additional voices` });
        }
        
        return discoveredVoices;
        
    } catch (error) {
        log({ type: 'error', message: 'Failed to fetch voices from API, falling back to static list', data: error });
        return VOICES;
    }
};

/**
 * Caches voices in localStorage to avoid repeated API calls
 */
export const cacheVoices = (voices: Voice[]): void => {
    try {
        localStorage.setItem('gemini-voices-cache', JSON.stringify({
            voices,
            timestamp: Date.now()
        }));
    } catch (error) {
        console.warn('Failed to cache voices:', error);
    }
};

/**
 * Retrieves cached voices if they're not too old (24 hours)
 */
export const getCachedVoices = (): Voice[] | null => {
    try {
        const cached = localStorage.getItem('gemini-voices-cache');
        if (!cached) return null;
        
        const { voices, timestamp } = JSON.parse(cached);
        const hoursSinceCache = (Date.now() - timestamp) / (1000 * 60 * 60);
        
        if (hoursSinceCache > 24) {
            localStorage.removeItem('gemini-voices-cache');
            return null;
        }
        
        return voices;
    } catch (error) {
        console.warn('Failed to retrieve cached voices:', error);
        return null;
    }
};