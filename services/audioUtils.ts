
import { Mp3Encoder, WavHeader } from 'lamejs';
import type { Podcast, LogEntry, Chapter } from '../types';
import { fetchWithCorsFallback } from './apiUtils';
import { cleanupSfxBlobs } from '../utils/sfxMemoryCleanup';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;

const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
};

export const createWavBlobFromPcm = (pcmData: Int16Array, sampleRate: number, numChannels: number): Blob => {
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

const audioBufferToWavBlob = (buffer: AudioBuffer): Blob => {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
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
    view.setUint16(20, 1, true); // PCM
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
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const chapterBlobs = podcast.chapters.map(c => c.audioBlob).filter((b): b is Blob => !!b);
    if (chapterBlobs.length === 0) throw new Error("Нет аудиофайлов для сборки.");

    const chapterAudioBuffers = await Promise.all(chapterBlobs.map(b => b.arrayBuffer().then(ab => audioContext.decodeAudioData(ab))));
    
    const totalDuration = chapterAudioBuffers.reduce((sum, buffer) => sum + buffer.duration, 0);
    if (totalDuration === 0) throw new Error("Общая длительность аудио равна нулю.");
    
    const sampleRate = chapterAudioBuffers[0].sampleRate;
    const numberOfChannels = chapterAudioBuffers[0].numberOfChannels;

    const offlineContext = new OfflineAudioContext(numberOfChannels, Math.ceil(totalDuration * sampleRate), sampleRate);

    let speechTimeCursor = 0;
    
    // Helper function to retry music fetching with delay and potential url cleaning
    const fetchMusicWithRetry = async (url: string, retries = 3): Promise<Response> => {
        let currentUrl = url;
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetchWithCorsFallback(currentUrl);
                if (response.ok) return response;
            } catch (e) {
                console.warn(`Music fetch attempt ${i+1} failed for ${currentUrl}:`, e);
                
                // On first failure for Jamendo, try removing query parameters to access base file if possible
                // Note: Jamendo needs params for valid access, but sometimes stripping 'from' tracking helps with proxies
                if (i === 0 && currentUrl.includes('jamendo.com') && currentUrl.includes('&from=')) {
                     const cleanUrl = currentUrl.replace(/&from=[^&]*/, '');
                     console.log(`Retrying with cleaned URL: ${cleanUrl}`);
                     currentUrl = cleanUrl;
                }

                if (i === retries - 1) throw e;
                await new Promise(r => setTimeout(r, 2000)); // Wait 2s before retry
            }
        }
        throw new Error(`Failed to fetch music after ${retries} attempts`);
    };

    // Layer 1: Speech and Music
    for (let i = 0; i < podcast.chapters.length; i++) {
        const chapter = podcast.chapters[i];
        const speechBuffer = chapterAudioBuffers[i];
        if (!speechBuffer) continue;
        
        const speechSource = offlineContext.createBufferSource();
        speechSource.buffer = speechBuffer;
        speechSource.connect(offlineContext.destination);
        speechSource.start(speechTimeCursor);

        if (chapter.backgroundMusic) {
            let musicBuffer: AudioBuffer | null = null;

            try {
                // Fix: Force HTTPS to prevent Mixed Content blocking
                let musicUrl = chapter.backgroundMusic.audio.replace(/^http:\/\//, 'https://');
                
                const musicResponse = await fetchMusicWithRetry(musicUrl);

                const contentType = musicResponse.headers.get('content-type');
                if (contentType && (contentType.includes('text/html') || contentType.includes('application/json'))) {
                    throw new Error(`Invalid content type for music: ${contentType}. Expected audio.`);
                }
                
                const musicArrayBuffer = await musicResponse.arrayBuffer();
                musicBuffer = await audioContext.decodeAudioData(musicArrayBuffer);

            } catch (e) { 
                console.error(`Не удалось обработать музыку для главы ${chapter.title}`, e); 
            }
            
            if (musicBuffer) {
                const musicGainNode = offlineContext.createGain();
                const chapterVolume = chapter.backgroundMusicVolume ?? podcast.backgroundMusicVolume ?? 0.2;
                
                musicGainNode.gain.value = chapterVolume;
                musicGainNode.connect(offlineContext.destination);
                
                console.log(`🎵 Music "${chapter.backgroundMusic.name}" volume: ${(chapterVolume * 100).toFixed(0)}%`);
                
                const crossfadeDuration = 1.5;
                const fadeInStartTime = speechTimeCursor;
                const fadeOutEndTime = speechTimeCursor + speechBuffer.duration;
                
                if (i === 0 || podcast.chapters[i-1].backgroundMusic?.id !== chapter.backgroundMusic.id) {
                    musicGainNode.gain.setValueAtTime(0, fadeInStartTime);
                    musicGainNode.gain.linearRampToValueAtTime(chapterVolume, fadeInStartTime + crossfadeDuration);
                }

                if (i === podcast.chapters.length - 1 || podcast.chapters[i+1].backgroundMusic?.id !== chapter.backgroundMusic.id) {
                        musicGainNode.gain.setValueAtTime(chapterVolume, Math.max(fadeInStartTime, fadeOutEndTime - crossfadeDuration));
                        musicGainNode.gain.linearRampToValueAtTime(0, fadeOutEndTime);
                }

                let musicCursor = 0;
                while (musicCursor < speechBuffer.duration) {
                    const musicSource = offlineContext.createBufferSource();
                    musicSource.buffer = musicBuffer;
                    musicSource.connect(musicGainNode);
                    musicSource.start(speechTimeCursor + musicCursor, 0, speechBuffer.duration - musicCursor);
                    musicCursor += musicBuffer!.duration;
                }
            }
        }
        speechTimeCursor += speechBuffer.duration;
    }

    // Layer 2: Sound Effects with Enhanced Blob Support
    let estimatedTimeCursor = 0;
    const CHARS_PER_SECOND = 15; // Estimated reading speed for timing SFX
    const PAUSE_BETWEEN_LINES = 0.5;  // пауза между репликами (сек)
    const SFX_ANTICIPATION = 0.2;     // SFX чуть раньше произнесения (сек)
    const WORDS_PER_SECOND = 2.5;      // средняя скорость речи (точнее, чем chars/15)
    const allScriptLines = podcast.chapters.flatMap(c => c.script);

    for (const line of allScriptLines) {
        if (line.speaker.toUpperCase() !== 'SFX' && line.text) {
            // Word-based duration calculation for better accuracy
            const wordCount = line.text.split(/\s+/).length;
            const estimatedDuration = Math.max(1, wordCount / WORDS_PER_SECOND);
            estimatedTimeCursor += estimatedDuration + PAUSE_BETWEEN_LINES;
        } else if (line.speaker.toUpperCase() === 'SFX' && line.soundEffect) {
            const sfx = line.soundEffect;
            let sfxBuffer: AudioBuffer | null = null;
            
            // 🆕 Проверяем сначала blob в ScriptLine
            if (line.soundEffectBlob && line.soundEffectBlob.size > 0) {
                try {
                    const sfxArrayBuffer = await line.soundEffectBlob.arrayBuffer();
                    sfxBuffer = await audioContext.decodeAudioData(sfxArrayBuffer);
                    console.log(`✅ Using pre-downloaded blob for SFX: ${sfx.name} (${(line.soundEffectBlob.size / 1024).toFixed(1)}KB)`);
                } catch (e) {
                    console.warn(`Failed to decode SFX blob: ${sfx.name}`, e);
                }
            }
            
            // Fallback: пробуем blob в самом SoundEffect
            if (!sfxBuffer && sfx.blob && sfx.blob.size > 0) {
                try {
                    const sfxArrayBuffer = await sfx.blob.arrayBuffer();
                    sfxBuffer = await audioContext.decodeAudioData(sfxArrayBuffer);
                    console.log(`✅ Using SoundEffect blob for SFX: ${sfx.name} (${(sfx.blob.size / 1024).toFixed(1)}KB)`);
                } catch (e) {
                    console.warn(`Failed to decode SoundEffect blob: ${sfx.name}`, e);
                }
            }
            
            // Final fallback: скачиваем по URL
            if (!sfxBuffer) {
                // List of candidates to try in order. 
                // HQ MP3 is preferred, then OGG, then LQ MP3.
                // Safe access with optional chaining in case API returned partial object
                const urlsToTry = [
                    sfx.previews?.['preview-hq-mp3'],
                    sfx.previews?.['preview-hq-ogg'],
                    sfx.previews?.['preview-lq-mp3'],
                    sfx.previews?.['preview-lq-ogg']
                ].filter(url => !!url).map(url => url?.replace(/^http:\/\//, 'https://') || '');

                // Try fetching each candidate URL until one works
                for (const sfxUrl of urlsToTry) {
                    if(!sfxUrl) continue;
                    try {
                        const sfxResponse = await fetchWithCorsFallback(sfxUrl);
                        if (!sfxResponse.ok) continue;

                        const contentType = sfxResponse.headers.get('content-type');
                        if (contentType && (contentType.includes('text/html') || contentType.includes('application/json'))) {
                            continue; 
                        }

                        const sfxArrayBuffer = await sfxResponse.arrayBuffer();
                        sfxBuffer = await audioContext.decodeAudioData(sfxArrayBuffer);
                        if(sfxBuffer) {
                            console.log(`✅ Downloaded and decoded SFX: ${sfx.name} from URL`);
                            break; // Success
                        }
                    } catch (e) {
                        console.warn(`Failed to fetch/decode SFX candidate: ${sfxUrl}`, e);
                    }
                }
            }

            if (sfxBuffer) {
                try {
                    const sfxGainNode = offlineContext.createGain();
                    const sfxVolume = line.soundEffectVolume ?? 0.2; // Default volume 20% (much quieter)
                    sfxGainNode.gain.value = sfxVolume;
                    sfxGainNode.connect(offlineContext.destination);
                    
                    console.log(`🔊 SFX "${sfx.name}" volume: ${(sfxVolume * 100).toFixed(0)}%`);

                    const sfxSource = offlineContext.createBufferSource();
                    sfxSource.buffer = sfxBuffer;
                    sfxSource.connect(sfxGainNode);
                    
                    // Enhanced timing with anticipation for better sync
                    const adjustedTime = Math.max(0, estimatedTimeCursor - SFX_ANTICIPATION);
                    const startTime = Math.min(adjustedTime, totalDuration - sfxBuffer.duration);
                    sfxSource.start(Math.max(0, startTime));
                    
                    console.log(`🔊 SFX scheduled: ${sfx.name} at ${startTime.toFixed(2)}s (duration: ${sfxBuffer.duration.toFixed(2)}s)`);
                } catch(e) {
                     console.error(`Error scheduling SFX: ${sfx.name}`, e);
                }
            } else {
                console.error(`❌ Не удалось обработать SFX: ${sfx.name} - нет blob и не удалось скачать`);
            }
        }
    }

    const renderedBuffer = await offlineContext.startRendering();
    const resultBlob = audioBufferToWavBlob(renderedBuffer);
    
    // 🆕 Memory cleanup: Clear SFX blobs after audio processing
    try {
        const cleanedCount = cleanupSfxBlobs(podcast);
        console.log(`🧹 Cleaned ${cleanedCount} SFX blobs after audio processing`);
    } catch (e) {
        console.warn('Failed to cleanup SFX blobs:', e);
    }
    
    return resultBlob;
};

export const convertWavToMp3 = async (wavBlob: Blob, log: LogFunction): Promise<Blob> => {
    log({ type: 'info', message: 'Начало конвертации WAV в MP3.' });
    const arrayBuffer = await wavBlob.arrayBuffer();
    const wav = WavHeader.readHeader(new DataView(arrayBuffer));
    const samples = new Int16Array(arrayBuffer, wav.dataOffset, wav.dataLen / 2);
    
    const mp3encoder = new Mp3Encoder(wav.channels, wav.sampleRate, 128); // 128 kbps
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

const formatSrtTime = (seconds: number): string => {
    const date = new Date(0);
    date.setSeconds(seconds);
    const time = date.toISOString().substr(11, 12);
    return time.replace('.', ',');
};

export const generateSrtFile = async (podcast: Podcast, log: LogFunction): Promise<Blob> => {
    log({ type: 'info', message: 'Начало генерации SRT-субтитров с разбивкой.' });

    // Helper to break text into readable chunks
    const chunkSubtitles = (text: string, maxLineLength = 42, maxLines = 2): string[] => {
        const words = text.split(' ');
        const lines: string[] = [];
        let currentLine = '';

        words.forEach(word => {
            if (currentLine.length + word.length + 1 <= maxLineLength) {
                currentLine += (currentLine ? ' ' : '') + word;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        });
        lines.push(currentLine);

        const chunks: string[] = [];
        for (let i = 0; i < lines.length; i += maxLines) {
            chunks.push(lines.slice(i, i + maxLines).join('\n'));
        }
        return chunks;
    };
    
    let srtContent = '';
    let currentTime = 0;
    let subtitleIndex = 1;
    const CHARS_PER_SECOND = 15; // Reading speed estimation
    
    const allLines = podcast.chapters.flatMap(c => c.script.filter(s => s.speaker.toUpperCase() !== 'SFX'));

    for (const line of allLines) {
        const chunks = chunkSubtitles(line.text);
        for (const chunk of chunks) {
            if (!chunk.trim()) continue;

            // Duration based on chunk length to time subtitles correctly
            const duration = Math.max(1, chunk.replace(/\n/g, ' ').length / CHARS_PER_SECOND);
            const startTime = formatSrtTime(currentTime);
            const endTime = formatSrtTime(currentTime + duration);
            
            srtContent += `${subtitleIndex}\n`;
            srtContent += `${startTime} --> ${endTime}\n`;
            srtContent += `${chunk}\n\n`;

            currentTime += duration;
            subtitleIndex++;
        }
    }
    
    log({ type: 'info', message: 'Генерация SRT-субтитров завершена.' });
    return new Blob([srtContent], { type: 'text/srt' });
};

export const getChapterDurations = async (chapters: Chapter[]): Promise<number[]> => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const durations: number[] = [];

    for (const chapter of chapters) {
        if (chapter.audioBlob) {
            try {
                const arrayBuffer = await chapter.audioBlob.arrayBuffer();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                durations.push(audioBuffer.duration);
            } catch (e) {
                console.error(`Could not decode audio for chapter ${chapter.title}`, e);
                durations.push(0);
            }
        } else {
            durations.push(0);
        }
    }
    return durations;
};
// Helper to get duration from WAV blob without full decoding
export const getWavDuration = async (blob: Blob): Promise<number> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const buffer = event.target?.result as ArrayBuffer;
                const view = new DataView(buffer);
                // WAV header parsing
                // Offset 24: Sample Rate (4 bytes)
                // Offset 28: Byte Rate (4 bytes)
                // Offset 40: Data Size (4 bytes)
                
                const sampleRate = view.getUint32(24, true);
                const byteRate = view.getUint32(28, true);
                const dataSize = view.getUint32(40, true);
                
                const duration = dataSize / byteRate;
                resolve(duration);
            } catch (e) {
                reject(e);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(blob.slice(0, 100)); // Read header only
    });
};
