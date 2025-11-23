// services/chapterPackager.ts
import JSZip from 'jszip';
import type { Podcast, Chapter, ChapterMetadata, SfxTiming, LogEntry } from '../types';
import { fetchWithCorsFallback } from './apiUtils';
import { getChapterDurations } from './audioUtils';
import { Mp3Encoder } from 'lamejs';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;

const CHARS_PER_SECOND = 15; // Reading speed for timing SFX
const MAX_SFX_DURATION = 3; // Maximum SFX duration in seconds

/**
 * Main function to package podcast by chapters
 * Creates ZIP with chapters/ folder structure
 */
export const packageProjectByChapters = async (
    podcast: Podcast,
    log: LogFunction
): Promise<Blob> => {
    log({ type: 'info', message: '🎬 Начало упаковки проекта по главам...' });
    
    const zip = new JSZip();
    
    // Get chapter durations
    const chapterDurations = await getChapterDurations(podcast.chapters);
    log({ type: 'info', message: `✅ Получены длительности ${chapterDurations.length} глав` });
    
    // Process each chapter
    for (let i = 0; i < podcast.chapters.length; i++) {
        const chapter = podcast.chapters[i];
        const chapterNum = String(i + 1).padStart(2, '0');
        const audioDuration = chapterDurations[i];
        
        log({ type: 'info', message: `📁 Обработка главы ${chapterNum}: "${chapter.title}" (${audioDuration.toFixed(1)}s)` });
        
        const chapterFolder = zip.folder(`chapters/chapter_${chapterNum}`);
        if (!chapterFolder) continue;
        
        try {
            // 1. Add chapter audio (speech)
            if (chapter.audioBlob) {
                chapterFolder.file('audio.wav', chapter.audioBlob);
                log({ type: 'info', message: `  ✅ Аудио главы добавлено` });
            }
            
            // 2. Generate and add chapter subtitles
            const chapterSrt = generateChapterSrt(chapter, 0);
            chapterFolder.file('subtitles.srt', chapterSrt);
            log({ type: 'info', message: `  ✅ Субтитры сгенерированы` });
            
            // 3. Download and trim background music
            if (chapter.backgroundMusic) {
                try {
                    log({ type: 'info', message: `  🎵 Скачивание музыки: "${chapter.backgroundMusic.name}"` });
                    const musicUrl = chapter.backgroundMusic.audio.replace(/^http:\/\//, 'https://');
                    const musicBlob = await downloadAndTrimAudio(
                        musicUrl,
                        audioDuration,
                        'music',
                        log
                    );
                    chapterFolder.file('music.mp3', musicBlob);
                    log({ type: 'info', message: `  ✅ Музыка добавлена и обрезана до ${audioDuration.toFixed(1)}s` });
                } catch (e: any) {
                    log({ type: 'error', message: `  ❌ Не удалось скачать музыку: ${e.message}` });
                }
            }
            
            // 4. Add chapter images
            if (chapter.backgroundImages && chapter.backgroundImages.length > 0) {
                const imagesFolder = chapterFolder.folder('images');
                for (let imgIdx = 0; imgIdx < chapter.backgroundImages.length; imgIdx++) {
                    const img = chapter.backgroundImages[imgIdx];
                    if (img.blob) {
                        const imgNum = String(imgIdx + 1).padStart(3, '0');
                        imagesFolder?.file(`${imgNum}.png`, img.blob);
                    }
                }
                log({ type: 'info', message: `  ✅ Добавлено ${chapter.backgroundImages.length} изображений` });
            }
            
            // 5. Download and trim SFX with precise timings
            const sfxFolder = chapterFolder.folder('sfx');
            const sfxTimings: SfxTiming[] = [];
            
            let timeCursor = 0;
            for (const line of chapter.script) {
                if (line.speaker.toUpperCase() === 'SFX' && line.soundEffect) {
                    const sfx = line.soundEffect;
                    const sfxStartTime = timeCursor;
                    
                    const sfxUrl = getBestSfxUrl(sfx);
                    
                    if (sfxUrl) {
                        try {
                            log({ type: 'info', message: `  🔊 Скачивание SFX: "${sfx.name}" @ ${sfxStartTime.toFixed(1)}s` });
                            const sfxBlob = await downloadAndTrimAudio(
                                sfxUrl,
                                MAX_SFX_DURATION,
                                'sfx',
                                log
                            );
                            
                            const sfxFileName = `${sanitizeFileName(sfx.name)}.mp3`;
                            sfxFolder?.file(sfxFileName, sfxBlob);
                            
                            const sfxDuration = Math.min(MAX_SFX_DURATION, audioDuration - sfxStartTime);
                            sfxTimings.push({
                                name: sfx.name,
                                startTime: sfxStartTime,
                                duration: sfxDuration,
                                volume: line.soundEffectVolume ?? 0.7,
                                filePath: `sfx/${sfxFileName}`
                            });
                            
                            log({ type: 'info', message: `    ✅ SFX добавлен (${sfxDuration.toFixed(1)}s)` });
                        } catch (e: any) {
                            log({ type: 'error', message: `    ❌ Не удалось скачать SFX "${sfx.name}": ${e.message}` });
                        }
                    }
                } else if (line.text) {
                    // Advance time cursor based on speech duration
                    timeCursor += line.text.length / CHARS_PER_SECOND;
                }
            }
            
            if (sfxTimings.length > 0) {
                log({ type: 'info', message: `  ✅ Добавлено ${sfxTimings.length} звуковых эффектов` });
            }
            
            // 6. Create chapter metadata
            const metadata: ChapterMetadata = {
                chapterNumber: i + 1,
                title: chapter.title,
                audioDuration: audioDuration,
                imageDuration: chapter.backgroundImages?.length 
                    ? audioDuration / chapter.backgroundImages.length 
                    : audioDuration,
                imageCount: chapter.backgroundImages?.length ?? 0,
                musicVolume: chapter.backgroundMusicVolume ?? podcast.backgroundMusicVolume,
                sfxTimings: sfxTimings
            };
            
            chapterFolder.file('metadata.json', JSON.stringify(metadata, null, 2));
            log({ type: 'info', message: `  ✅ Метаданные главы созданы` });
            
        } catch (error: any) {
            log({ type: 'error', message: `❌ Ошибка обработки главы ${chapterNum}: ${error.message}` });
        }
    }
    
    // 7. Add project metadata
    const projectMetadata = {
        title: podcast.selectedTitle || podcast.topic,
        totalChapters: podcast.chapters.length,
        totalDuration: chapterDurations.reduce((sum, d) => sum + d, 0),
        description: podcast.description,
        keywords: podcast.seoKeywords
    };
    zip.file('project_metadata.json', JSON.stringify(projectMetadata, null, 2));
    log({ type: 'info', message: '✅ Метаданные проекта созданы' });
    
    // 8. Add assembly script
    const assemblyScript = generateChapterBasedAssemblyScript(podcast.chapters.length);
    zip.file('assemble_video.bat', assemblyScript);
    log({ type: 'info', message: '✅ Скрипт сборки видео добавлен' });
    
    log({ type: 'info', message: '🎉 Упаковка завершена! Генерация ZIP...' });
    return zip.generateAsync({ type: 'blob' });
};

/**
 * Get best available SFX URL from previews
 */
const getBestSfxUrl = (sfx: any): string | null => {
    const candidates = [
        sfx.previews?.['preview-hq-mp3'],
        sfx.previews?.['preview-hq-ogg'],
        sfx.previews?.['preview-lq-mp3'],
    ].filter(Boolean);
    
    return candidates[0]?.replace(/^http:\/\//, 'https://') || null;
};

/**
 * Download audio and trim to max duration
 */
const downloadAndTrimAudio = async (
    url: string,
    maxDuration: number,
    type: 'music' | 'sfx',
    log: LogFunction
): Promise<Blob> => {
    // Validate URL
    if (!url || !url.startsWith('https://')) {
        throw new Error(`Invalid URL for ${type}: ${url}`);
    }
    
    // Download
    const response = await fetchWithCorsFallback(url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const contentType = response.headers.get('content-type');
    if (contentType && (contentType.includes('text/html') || contentType.includes('application/json'))) {
        throw new Error(`Invalid content type: ${contentType}. Expected audio.`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    
    // Decode audio
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    let audioBuffer: AudioBuffer;
    
    try {
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    } catch (e) {
        throw new Error(`Failed to decode ${type} audio`);
    }
    
    // Check if trimming needed
    if (audioBuffer.duration <= maxDuration) {
        // No trim needed, return original
        return new Blob([arrayBuffer], { type: 'audio/mpeg' });
    }
    
    // Trim to max duration with fade out
    const trimmedDuration = maxDuration;
    const fadeOutDuration = 1.0; // 1 second fade out
    
    const offlineContext = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        Math.ceil(trimmedDuration * audioBuffer.sampleRate),
        audioBuffer.sampleRate
    );
    
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    
    // Apply fade out
    const gainNode = offlineContext.createGain();
    gainNode.gain.setValueAtTime(1.0, 0);
    gainNode.gain.setValueAtTime(1.0, trimmedDuration - fadeOutDuration);
    gainNode.gain.linearRampToValueAtTime(0, trimmedDuration);
    
    source.connect(gainNode);
    gainNode.connect(offlineContext.destination);
    source.start(0, 0, trimmedDuration);
    
    const renderedBuffer = await offlineContext.startRendering();
    
    // Convert to WAV then MP3
    const wavBlob = audioBufferToWavBlob(renderedBuffer);
    return convertWavToMp3Simple(wavBlob);
};

/**
 * Convert AudioBuffer to WAV Blob
 */
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

    const writeString = (offset: number, string: string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * (bitDepth / 8) * numChannels, true);
    view.setUint16(32, numChannels * (bitDepth / 8), true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    let offset = 44;
    for (let i = 0; i < result.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, result[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return new Blob([view], { type: 'audio/wav' });
};

/**
 * Simple WAV to MP3 conversion
 */
const convertWavToMp3Simple = async (wavBlob: Blob): Promise<Blob> => {
    // For now, return WAV as-is
    // Full MP3 encoding can be added later with lamejs if needed
    // Most systems can handle WAV for mixing
    return wavBlob;
};

/**
 * Clean subtitle text from encoding artifacts
 */
const cleanSubtitleText = (text: string): string => {
    return text
        // Fix common encoding issues
        .replace(/â€"/g, '—')        // em-dash
        .replace(/â€"/g, '–')        // en-dash  
        .replace(/â€œ/g, '"')        // left double quote
        .replace(/â€/g, '"')         // right double quote
        .replace(/â€™/g, "'")        // right single quote
        .replace(/â€˜/g, "'")        // left single quote
        .replace(/â€¦/g, '...')      // ellipsis
        
        // Remove control characters
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
        
        // Normalize spaces
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Generate SRT subtitles for a single chapter
 */
const generateChapterSrt = (chapter: Chapter, startTime: number): string => {
    let srtContent = '';
    let currentTime = startTime;
    let subtitleIndex = 1;
    
    const formatTime = (seconds: number): string => {
        const date = new Date(0);
        date.setSeconds(seconds);
        return date.toISOString().substr(11, 12).replace('.', ',');
    };
    
    const chunkSubtitles = (text: string, maxLineLength = 42, maxLines = 2): string[] => {
        const cleanedText = cleanSubtitleText(text);
        const words = cleanedText.split(' ');
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
        if (currentLine) lines.push(currentLine);

        const chunks: string[] = [];
        for (let i = 0; i < lines.length; i += maxLines) {
            chunks.push(lines.slice(i, i + maxLines).join('\n'));
        }
        return chunks;
    };
    
    for (const line of chapter.script) {
        if (line.speaker.toUpperCase() === 'SFX') continue;
        
        const chunks = chunkSubtitles(line.text);
        for (const chunk of chunks) {
            if (!chunk.trim()) continue;
            
            const duration = Math.max(1, chunk.replace(/\n/g, ' ').length / CHARS_PER_SECOND);
            
            srtContent += `${subtitleIndex}\n`;
            srtContent += `${formatTime(currentTime)} --> ${formatTime(currentTime + duration)}\n`;
            srtContent += `${chunk}\n\n`;
            
            currentTime += duration;
            subtitleIndex++;
        }
    }
    
    return srtContent;
};

/**
 * Sanitize filename for file system
 */
const sanitizeFileName = (name: string): string => {
    return name
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '_')
        .toLowerCase()
        .substring(0, 50); // Limit length
};

/**
 * Generate FFmpeg assembly script for chapter-based structure
 */
const generateChapterBasedAssemblyScript = (chapterCount: number): string => {
    return `@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo Chapter-Based Video Assembly (High Quality)
echo ===================================================
echo.

REM Check FFmpeg
where ffmpeg >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] FFmpeg not found! Install FFmpeg and add to PATH.
    pause
    exit /b 1
)

REM Create temp folder
mkdir temp_videos 2>nul

REM Process each chapter
for /L %%i in (1,1,${chapterCount}) do (
    set "chapter_num=0%%i"
    set "chapter_num=!chapter_num:~-2!"
    set "chapter_dir=chapters\\chapter_!chapter_num!"
    
    echo.
    echo [INFO] Processing Chapter !chapter_num!...
    
    REM Check if chapter exists
    if not exist "!chapter_dir!" (
        echo [WARNING] Chapter !chapter_num! not found, skipping...
        goto :skip_chapter
    )
    
    REM Read metadata
    if not exist "!chapter_dir!\\metadata.json" (
        echo [ERROR] Metadata missing for chapter !chapter_num!
        goto :skip_chapter
    )
    
    REM Create image concat file
    set "img_count=0"
    for %%f in ("!chapter_dir!\\images\\*.png") do set /a img_count+=1
    
    if !img_count! equ 0 (
        echo [WARNING] No images found for chapter !chapter_num!
        goto :skip_chapter
    )
    
    REM Get audio duration using ffprobe
    for /f %%d in ('ffprobe -v error -show_entries format=duration -of default^=noprint_wrappers^=1:nokey^=1 "!chapter_dir!\\audio.wav"') do set "duration=%%d"
    
    REM Calculate image duration
    powershell -Command "[math]::Round(!duration! / !img_count!, 2)" > temp_img_dur.txt
    set /p img_duration=<temp_img_dur.txt
    del temp_img_dur.txt
    
    echo [INFO] Chapter duration: !duration!s, Image duration: !img_duration!s each
    
    REM Create concat file
    (for %%f in ("!chapter_dir!\\images\\*.png") do (
        echo file '%%f'
        echo duration !img_duration!
    )) > temp_concat_!chapter_num!.txt
    
    REM Build FFmpeg command with filters
    set "filter_complex=[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v]"
    set "inputs=-f concat -safe 0 -i temp_concat_!chapter_num!.txt -i \"!chapter_dir!\\audio.wav\""
    set "maps=-map [v] -map 1:a"
    
    REM Add music if exists
    if exist "!chapter_dir!\\music.mp3" (
        set "inputs=!inputs! -i \"!chapter_dir!\\music.mp3\""
        set "filter_complex=!filter_complex!;[1:a][2:a]amix=inputs=2:duration=first:dropout_transition=2[a]"
        set "maps=-map [v] -map [a]"
    ) else (
        set "filter_complex=!filter_complex!;[1:a]acopy[a]"
        set "maps=-map [v] -map [a]"
    )
    
    REM Apply subtitles
    set "subtitle_filter=subtitles=!chapter_dir!\\subtitles.srt:force_style='FontName=Arial,FontSize=24,PrimaryColour=&Hffffff,OutlineColour=&H000000,Outline=2,Bold=1'"
    
    REM Execute FFmpeg
    ffmpeg -y !inputs! ^
        -filter_complex "!filter_complex!" ^
        !maps! ^
        -vf "!subtitle_filter!" ^
        -c:v libx264 -preset medium -crf 20 ^
        -c:a aac -b:a 192k ^
        -shortest ^
        temp_videos\\chapter_!chapter_num!.mp4
    
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to process chapter !chapter_num!
    ) else (
        echo [SUCCESS] Chapter !chapter_num! complete
    )
    
    :skip_chapter
)

echo.
echo [INFO] Concatenating all chapters into final video...

REM Create final concat list
(for /L %%i in (1,1,${chapterCount}) do (
    set "chapter_num=0%%i"
    set "chapter_num=!chapter_num:~-2!"
    if exist "temp_videos\\chapter_!chapter_num!.mp4" (
        echo file 'temp_videos/chapter_!chapter_num!.mp4'
    )
)) > final_concat.txt

REM Concatenate
ffmpeg -y -f concat -safe 0 -i final_concat.txt -c copy final_video.mp4

if %errorlevel% equ 0 (
    echo.
    echo [SUCCESS] Final video created: final_video.mp4
    echo.
) else (
    echo [ERROR] Failed to create final video
)

REM Cleanup
echo [INFO] Cleaning up temporary files...
rmdir /s /q temp_videos 2>nul
del temp_concat_*.txt 2>nul
del final_concat.txt 2>nul

echo.
echo Done!
pause
`;
};
