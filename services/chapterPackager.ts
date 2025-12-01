
// services/chapterPackager.ts
import JSZip from 'jszip';
import type { Podcast, Chapter, ChapterMetadata, SfxTiming, LogEntry } from '../types';
import { fetchWithCorsFallback } from './apiUtils';
import { getChapterDurations } from './audioUtils';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;

const CHARS_PER_SECOND = 15; // Reading speed for timing SFX fallback
const MAX_SFX_DURATION = 3; // Maximum SFX duration in seconds

// Helper for legacy: convert data URL image to Blob
const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
    const response = await fetch(dataUrl);
    return response.blob();
};

export const packageProjectToFolder = async (
    podcast: Podcast,
    zipFolder: JSZip,
    log: LogFunction
): Promise<void> => {
    log({ type: 'info', message: `📦 Начало упаковки проекта: "${podcast.selectedTitle || podcast.topic}"` });
    const chapterDurations = await getChapterDurations(podcast.chapters);
    log({ type: 'info', message: `✅ Получены длительности ${chapterDurations.length} глав` });
    
    for (let i = 0; i < podcast.chapters.length; i++) {
        const chapter = podcast.chapters[i];
        const chapterNum = String(i + 1).padStart(2, '0');
        const audioDuration = chapterDurations[i];
        log({ type: 'info', message: `  📁 Глава ${chapterNum}: "${chapter.title}" (${audioDuration.toFixed(1)}s)` });
        const chapterFolder = zipFolder.folder(`chapters/chapter_${chapterNum}`);
        if (!chapterFolder) continue;
        
        try {
            // 1. Add chapter audio (speech)
            if (chapter.audioBlob) {
                chapterFolder.file('audio.wav', chapter.audioBlob);
                log({ type: 'info', message: `    ✅ Аудио главы добавлено` });
            }
            
            // 2. Generate and add chapter subtitles
            const chapterSrt = generateChapterSrt(chapter, 0);
            chapterFolder.file('subtitles.srt', chapterSrt);
            log({ type: 'info', message: `    ✅ Субтитры сгенерированы` });
            
            // 3. Download and trim background music
            if (chapter.backgroundMusic) {
                try {
                    log({ type: 'info', message: `    🎵 Скачивание музыки: "${chapter.backgroundMusic.name}"` });
                    const musicUrl = chapter.backgroundMusic.audio.replace(/^http:\/\//, 'https://');
                    const musicBlob = await downloadAndTrimAudio(
                        musicUrl,
                        audioDuration,
                        'music',
                        log
                    );
                    chapterFolder.file('music.wav', musicBlob);
                    log({ type: 'info', message: `    ✅ Музыка добавлена и обрезана до ${audioDuration.toFixed(1)}s` });
                } catch (e: any) {
                    log({ type: 'error', message: `    ❌ Не удалось скачать музыку: ${e.message}` });
                }
            }
            
            // 4. Add chapter images (Robust Blob Handling)
            const imagesFolder = chapterFolder.folder('images');
            let imageCount = 0;
            if (chapter.backgroundImages && chapter.backgroundImages.length > 0) {
                // New format with blobs
                for (let imgIdx = 0; imgIdx < chapter.backgroundImages.length; imgIdx++) {
                    const img = chapter.backgroundImages[imgIdx];
                    
                    if (img.blob && img.blob.size > 0) {
                        try {
                            const mimeType = img.blob.type || 'image/png';
                            const ext = mimeType.split('/')[1] || 'png';
                            const imgNum = String(imgIdx + 1).padStart(3, '0');
                            const filename = `${imgNum}.${ext}`;
                            
                            imagesFolder?.file(filename, img.blob);
                            imageCount++;
                            log({ type: 'info', message: `    ✅ Изображение (Blob) добавлено: ${filename}` });
                        } catch (e) {
                            log({ type: 'error', message: `    ❌ Ошибка сохранения blob ${imgIdx + 1}` });
                        }
                    } else if (img.url && !img.blob) {
                        // Fallback to fetching by URL if blob is missing
                        try {
                            log({ type: 'info', message: `    ⚠️ Blob утерян, скачиваю по URL ${imgIdx + 1}...` });
                            const response = await fetchWithCorsFallback(img.url);
                            if (response.ok) {
                                const blob = await response.blob();
                                const ext = blob.type.split('/')[1] || 'png';
                                const imgNum = String(imgIdx + 1).padStart(3, '0');
                                imagesFolder?.file(`${imgNum}.${ext}`, blob);
                                imageCount++;
                            }
                        } catch (e) {
                            log({ type: 'error', message: `    ❌ Ошибка скачивания изображения ${imgIdx + 1}` });
                        }
                    }
                }
            } else if (chapter.images && chapter.images.length > 0) {
                // Legacy format
                log({ type: 'info', message: `    ⚠️ Используется устаревший формат images (data URLs)` });
                for (let imgIdx = 0; imgIdx < chapter.images.length; imgIdx++) {
                    const imgDataUrl = chapter.images[imgIdx];
                    try {
                        const blob = await dataUrlToBlob(imgDataUrl);
                        const imgNum = String(imgIdx + 1).padStart(3, '0');
                        imagesFolder?.file(`${imgNum}.png`, blob);
                        imageCount++;
                    } catch (e) {
                        log({ type: 'error', message: `    ❌ Ошибка конвертации изображения ${imgIdx + 1}` });
                    }
                }
            }
            
            // 5. Download and trim SFX using stored timings and blobs
            const sfxFolder = chapterFolder.folder('sfx');
            // Prefer using pre-calculated timings if available
            let sfxTimings = chapter.sfxTimings || [];
            
            // Fallback calculation if sfxTimings is missing (legacy/error recovery)
            if (sfxTimings.length === 0) {
                let timeCursor = 0;
                for (const line of chapter.script) {
                    if (line.speaker.toUpperCase() === 'SFX' && line.soundEffect) {
                        sfxTimings.push({
                            name: line.soundEffect.name,
                            startTime: Math.round(timeCursor * 100) / 100,
                            duration: MAX_SFX_DURATION,
                            volume: line.soundEffectVolume ?? 0.7,
                            filePath: `sfx/${sanitizeFileName(line.soundEffect.name)}.wav`
                        });
                    } else if (line.text) {
                        timeCursor += line.text.length / CHARS_PER_SECOND;
                    }
                }
            }

            const finalSfxTimings: SfxTiming[] = [];
            
            for (const timing of sfxTimings) {
                // Find the SFX object in script to get URL and blob
                const matchingLine = chapter.script.find(l => l.soundEffect?.name === timing.name);
                const sfx = matchingLine?.soundEffect;
                const sfxBlob = matchingLine?.soundEffectBlob;
                
                if (sfx) {
                    let sfxBlobToUse: Blob | null = null;
                    
                    // 🆕 Проверяем сначала blob в ScriptLine
                    if (sfxBlob && sfxBlob.size > 0) {
                        sfxBlobToUse = sfxBlob;
                        log({ type: 'info', message: `    🔊 Используем загруженный blob для SFX: "${sfx.name}" (${(sfxBlob.size / 1024).toFixed(1)}KB)` });
                    } 
                    // Fallback: пробуем blob в самом SoundEffect
                    else if (sfx.blob && sfx.blob.size > 0) {
                        sfxBlobToUse = sfx.blob;
                        log({ type: 'info', message: `    🔊 Используем blob из SoundEffect: "${sfx.name}" (${(sfx.blob.size / 1024).toFixed(1)}KB)` });
                    }
                    // Иначе скачиваем по URL
                    else {
                        const sfxUrl = getBestSfxUrl(sfx);
                        if (sfxUrl) {
                            try {
                                log({ type: 'info', message: `    🔊 Скачивание SFX по URL: "${sfx.name}"` });
                                sfxBlobToUse = await downloadAndTrimAudio(
                                    sfxUrl,
                                    MAX_SFX_DURATION,
                                    'sfx',
                                    log
                                );
                            } catch (e: any) {
                                log({ type: 'error', message: `      ❌ Не удалось скачать SFX "${sfx.name}": ${e.message}` });
                            }
                        }
                    }
                    
                    // Если получили blob (из любого источника)
                    if (sfxBlobToUse) {
                        // Use filename from timing or generate new one
                        const sfxFileName = timing.filePath.split('/').pop() || `${sanitizeFileName(sfx.name)}.wav`;
                        sfxFolder?.file(sfxFileName, sfxBlobToUse);
                        
                        finalSfxTimings.push({
                            ...timing,
                            duration: Math.min(MAX_SFX_DURATION, audioDuration - timing.startTime) // Clamp to chapter end
                        });
                    }
                }
            }
            
            if (finalSfxTimings.length > 0) {
                log({ type: 'info', message: `    ✅ Добавлено ${finalSfxTimings.length} звуковых эффектов` });
            } else {
                log({ type: 'info', message: `    ⚠️ SFX не найдены или не загружены` });
            }
            
            // 6. Create chapter metadata
            // Correct Image Duration Logic: Audio Length / Image Count, clamped between 2s and 20s
            let calculatedImageDuration = 5;
            if (imageCount > 0 && audioDuration > 0) {
                const rawDuration = audioDuration / imageCount;
                calculatedImageDuration = Math.max(2, Math.min(20, rawDuration));
                // Ensure the metadata uses float for better precision
                log({ type: 'info', message: `    ⏱️ Image Duration: ${calculatedImageDuration.toFixed(2)}s (Raw: ${rawDuration.toFixed(2)}s)` });
            }

            const metadata: ChapterMetadata = {
                chapterNumber: i + 1,
                title: chapter.title,
                audioDuration: audioDuration,
                imageDuration: calculatedImageDuration,
                imageCount: imageCount,
                musicVolume: chapter.backgroundMusicVolume ?? podcast.backgroundMusicVolume,
                sfxTimings: finalSfxTimings
            };
            chapterFolder.file('metadata.json', JSON.stringify(metadata, null, 2));
            log({ type: 'info', message: `    ✅ Метаданные главы созданы` });
        } catch (error: any) {
            log({ type: 'error', message: `  ❌ Ошибка обработки главы ${chapterNum}: ${error.message}` });
        }
    }
    
    // 6. Export YouTube Thumbnails
    if (podcast.youtubeThumbnails && podcast.youtubeThumbnails.length > 0) {
        const thumbnailsFolder = zipFolder.folder('thumbnails');
        log({ type: 'info', message: `📸 Экспорт обложек YouTube...` });
        
        for (let i = 0; i < podcast.youtubeThumbnails.length; i++) {
            const thumbnail = podcast.youtubeThumbnails[i];
            try {
                const blob = await dataUrlToBlob(thumbnail.dataUrl);
                const sanitizedName = sanitizeFileName(thumbnail.styleName);
                const fileName = `thumbnail_${String(i + 1).padStart(2, '0')}_${sanitizedName}.png`;
                
                thumbnailsFolder?.file(fileName, blob);
                log({ 
                    type: 'info', 
                    message: `    ✅ Обложка сохранена: ${fileName} (${(blob.size / 1024).toFixed(1)}KB)` 
                });
            } catch (e: any) {
                log({ 
                    type: 'error', 
                    message: `    ❌ Ошибка сохранения обложки ${i + 1}: ${e.message}` 
                });
            }
        }
        
        log({ 
            type: 'info', 
            message: `✅ Экспортировано ${podcast.youtubeThumbnails.length} обложек YouTube` 
        });
    }

    // 7. Enhanced project metadata with YouTube data
    const projectMetadata = {
        title: podcast.selectedTitle || podcast.topic,
        totalChapters: podcast.chapters.length,
        totalDuration: chapterDurations.reduce((sum, d) => sum + d, 0),
        description: podcast.description,
        keywords: podcast.seoKeywords,
        
        // YouTube metadata
        youtube: {
            titleOptions: podcast.youtubeTitleOptions,
            selectedTitle: podcast.selectedTitle,
            description: podcast.description,
            tags: podcast.seoKeywords,
            thumbnailCount: podcast.youtubeThumbnails?.length || 0,
            language: podcast.language
        }
    };
    zipFolder.file('project_metadata.json', JSON.stringify(projectMetadata, null, 2));
    log({ type: 'info', message: `✅ YouTube метаданные добавлены в project_metadata.json` });

    // 8. Create YouTube upload info file
    const youtubeInfo = `
===========================================
YouTube Upload Information
===========================================

📌 Title:
${podcast.selectedTitle || podcast.topic}

📝 Description:
${podcast.description}

🏷️ Tags:
${podcast.seoKeywords.join(', ')}

🎨 Thumbnails Available:
${podcast.youtubeThumbnails?.map((t, i) => `  ${i + 1}. ${t.styleName}`).join('\n') || '  No thumbnails'}

⏱️ Video Duration: ${Math.ceil(chapterDurations.reduce((sum, d) => sum + d, 0) / 60)} minutes

📂 Video File: ${(podcast.selectedTitle || podcast.topic).replace(/[<>:"/\\|?*]/g, '_')}.mp4
📸 Thumbnails Folder: thumbnails/
`;

    zipFolder.file('youtube_upload_info.txt', youtubeInfo);
    log({ type: 'info', message: `✅ YouTube upload info создан` });
    
    const assemblyScript = generateChapterBasedAssemblyScript(podcast.chapters.length);
    zipFolder.file('assemble_video.bat', assemblyScript);
    log({ type: 'info', message: `✅ Скрипт сборки видео (BAT) добавлен для "${podcast.selectedTitle || podcast.topic}"` });
    
    // Also add Python script (more reliable)
    const pythonScript = generatePythonAssemblyScript(podcast.chapters.length);
    zipFolder.file('assemble_video.py', pythonScript);
    zipFolder.file('py.bat', PYTHON_LAUNCHER_BAT);
    log({ type: 'info', message: `✅ Скрипт сборки видео (Python) добавлен для "${podcast.selectedTitle || podcast.topic}"` });
    
    log({ type: 'info', message: `🎉 Упаковка проекта "${podcast.selectedTitle || podcast.topic}" завершена!` });
};

export const packageProjectByChapters = async (
    podcast: Podcast,
    log: LogFunction
): Promise<Blob> => {
    log({ type: 'info', message: '🎬 Начало упаковки проекта по главам...' });
    const zip = new JSZip();
    await packageProjectToFolder(podcast, zip, log);
    log({ type: 'info', message: '🎉 Упаковка завершена! Генерация ZIP...' });
    return zip.generateAsync({ type: 'blob' });
};

const getBestSfxUrl = (sfx: any): string | null => {
    const candidates = [
        sfx.previews?.['preview-hq-mp3'],
        sfx.previews?.['preview-hq-ogg'],
        sfx.previews?.['preview-lq-mp3'],
    ].filter(Boolean);
    return candidates[0]?.replace(/^http:\/\//, 'https://') || null;
};

const downloadAndTrimAudio = async (
    url: string,
    maxDuration: number,
    type: 'music' | 'sfx',
    log: LogFunction
): Promise<Blob> => {
    if (!url || !url.startsWith('https://')) {
        throw new Error(`Invalid URL for ${type}: ${url}`);
    }
    const response = await fetchWithCorsFallback(url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const contentType = response.headers.get('content-type');
    if (contentType && (contentType.includes('text/html') || contentType.includes('application/json'))) {
        throw new Error(`Invalid content type: ${contentType}. Expected audio.`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    let audioBuffer: AudioBuffer;
    try {
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    } catch (e) {
        throw new Error(`Failed to decode ${type} audio`);
    }
    if (audioBuffer.duration <= maxDuration) {
        return audioBufferToWavBlob(audioBuffer);
    }
    const trimmedDuration = maxDuration;
    const fadeOutDuration = 1.0;
    const offlineContext = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        Math.ceil(trimmedDuration * audioBuffer.sampleRate),
        audioBuffer.sampleRate
    );
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    const gainNode = offlineContext.createGain();
    gainNode.gain.setValueAtTime(1.0, 0);
    gainNode.gain.setValueAtTime(1.0, trimmedDuration - fadeOutDuration);
    gainNode.gain.linearRampToValueAtTime(0, trimmedDuration);
    source.connect(gainNode);
    gainNode.connect(offlineContext.destination);
    source.start(0, 0, trimmedDuration);
    const renderedBuffer = await offlineContext.startRendering();
    return audioBufferToWavBlob(renderedBuffer);
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
    view.setUint16(20, 1, true);
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

const cleanSubtitleText = (text: string): string => {
    return text
        // Fix common mojibake (encoding corruption) issues
        .replace(/â€"/g, '—')
        .replace(/â€"/g, '–')
        .replace(/â€œ/g, '"')
        .replace(/â€/g, '"')
        .replace(/â€™/g, "'")
        .replace(/â€˜/g, "'")
        .replace(/â€¦/g, '...')
        .replace(/â€\x9D/g, '"')
        .replace(/â€\x9C/g, '"')
        .replace(/â€\x99/g, "'")
        .replace(/â€\x98/g, "'")
        // Remove control characters except newline, carriage return, and tab
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        // Normalize whitespace but preserve line structure
        .replace(/[ \t]+/g, ' ')
        // Remove excessive line breaks
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

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

const sanitizeFileName = (name: string): string => {
    return name
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '_')
        .toLowerCase()
        .substring(0, 50);
};

const generateChapterBasedAssemblyScript = (chapterCount: number): string => {
    return `@echo off
REM ============================================
REM CRITICAL: Keep window open on any error
REM ============================================
if not "%1"=="KEEPOPEN" (
    cmd /k "%~f0" KEEPOPEN
    exit /b
)

setlocal enabledelayedexpansion

echo ===================================================
echo Chapter-Based Video Assembly (High Quality + SFX)
echo ===================================================
echo.
echo [INFO] Script started at: %DATE% %TIME%
echo [INFO] Working directory: %CD%
echo [INFO] If you see this message, script is running!
echo.

REM --- AUTO-DETECT FFMPEG ---
set "FFMPEG_EXEC=ffmpeg"
set "FFPROBE_EXEC=ffprobe"

where ffmpeg >nul 2>nul
if %errorlevel% equ 0 (
    echo [INFO] Found FFmpeg in system PATH.
    goto :check_dependencies_done
)

if exist "ffmpeg.exe" (
    set "FFMPEG_EXEC=ffmpeg.exe"
    set "FFPROBE_EXEC=ffprobe.exe"
    echo [INFO] Found FFmpeg in current directory.
    goto :check_dependencies_done
)

REM Common installation paths
if exist "C:\ffmpeg\bin\ffmpeg.exe" (
    set "FFMPEG_EXEC=C:\ffmpeg\bin\ffmpeg.exe"
    set "FFPROBE_EXEC=C:\ffmpeg\bin\ffprobe.exe"
    echo [INFO] Found FFmpeg in C:\ffmpeg\bin
    goto :check_dependencies_done
)

echo [ERROR] FFmpeg not found! 
echo Please install FFmpeg and add to PATH, or copy ffmpeg.exe and ffprobe.exe to this folder.
pause
exit /b 1

:check_dependencies_done

REM Check PowerShell
where powershell >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] PowerShell not found.
    pause
    exit /b 1
)

REM Create temp folder
mkdir temp_videos 2>nul

REM Test FFmpeg with a simple command
echo [DEBUG] Testing FFmpeg...
"!FFMPEG_EXEC!" -version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] FFmpeg test failed! Cannot execute FFmpeg.
    pause
    exit /b 1
)
echo [SUCCESS] FFmpeg is working.
echo.

REM Check project structure
if not exist "chapters" (
    echo [ERROR] 'chapters' folder not found! Make sure you're running this from the project root.
    pause
    exit /b 1
)
echo [SUCCESS] Chapters folder found.
echo.

REM Process each chapter
for /L %%i in (1,1,${chapterCount}) do (
    set "chapter_num=0%%i"
    set "chapter_num=!chapter_num:~-2!"
    set "chapter_dir=chapters\chapter_!chapter_num!"
    
    echo.
    echo [INFO] Processing Chapter !chapter_num!...
    
    if not exist "!chapter_dir!" (
        echo [WARNING] Chapter !chapter_num! not found, skipping...
        goto :skip_chapter
    )
    
    if not exist "!chapter_dir!\metadata.json" (
        echo [ERROR] Metadata missing for chapter !chapter_num!
        goto :skip_chapter
    )
    
    set "img_count=0"
    for %%f in ("!chapter_dir!\images\*.png") do set /a img_count+=1
    
    if !img_count! equ 0 (
        echo [WARNING] No images found for chapter !chapter_num!
        goto :skip_chapter
    )
    
    REM Get audio duration using ffprobe
    set "duration="
    for /f "usebackq tokens=*" %%d in (`"!FFPROBE_EXEC!" -v error -show_entries format^=duration -of default^=noprint_wrappers^=1:nokey^=1 "!chapter_dir!\audio.wav" 2^>nul`) do set "duration=%%d"
    
    if not defined duration (
        echo [WARNING] Could not determine audio duration. Skipping chapter.
        goto :skip_chapter
    )

    REM Calculate image duration using PowerShell (with proper escaping)
    powershell -NoProfile -Command "$d = [math]::Round([double]!duration! / [int]!img_count!, 2); if ($d -lt 2) { $d = 2 }; if ($d -gt 20) { $d = 20 }; Write-Output $d" > temp_img_dur.txt
    set /p img_duration=<temp_img_dur.txt
    del temp_img_dur.txt
    
    echo [INFO] Chapter duration: !duration!s, Image duration: !img_duration!s each
    
    (for %%f in ("!chapter_dir!\images\*.png") do (
        echo file '%%f'
        echo duration !img_duration!
    )) > temp_concat_!chapter_num!.txt
    
    set "filter_complex=[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v]"
    set "inputs=-f concat -safe 0 -i temp_concat_!chapter_num!.txt -i "!chapter_dir!\audio.wav""
    set "maps=-map [v] -map 1:a"
    
    set "sfx_count=0"
    for %%f in ("!chapter_dir!\sfx\*.wav") do set /a sfx_count+=1
    
    if !sfx_count! gtr 0 (
        echo [INFO] Found !sfx_count! SFX files...
        
        set "sfx_inputs="
        set "sfx_input_count=2"
        set "sfx_filter="
        
        for %%f in ("!chapter_dir!\sfx\*.wav") do (
            set "sfx_inputs=!sfx_inputs! -i "%%f""
            set /a sfx_input_count+=1
        )
        
        if exist "!chapter_dir!\metadata.json" (
            REM Use PowerShell script file to avoid brace escaping issues
            echo $metadata = Get-Content '!chapter_dir!\metadata.json' -Raw ^| ConvertFrom-Json; > temp_ps_script.ps1
            echo $sfxIndex = 0; >> temp_ps_script.ps1
            echo $sfxFiles = Get-ChildItem '!chapter_dir!\sfx\*.wav' ^| Sort-Object Name; >> temp_ps_script.ps1
            echo foreach ($timing in $metadata.sfxTimings) { >> temp_ps_script.ps1
            echo     if ($sfxIndex -lt $sfxFiles.Count) { >> temp_ps_script.ps1
            echo         $delayMs = [math]::Round($timing.startTime * 1000); >> temp_ps_script.ps1
            echo         $volume = if ($timing.volume) { $timing.volume } else { 0.3 }; >> temp_ps_script.ps1
            echo         Write-Output "[2:a]adelay=$delayMs^|$delayMs,volume=$volume[sfx$sfxIndex a]"; >> temp_ps_script.ps1
            echo         $sfxIndex++; >> temp_ps_script.ps1
            echo     } >> temp_ps_script.ps1
            echo } >> temp_ps_script.ps1
            powershell -NoProfile -ExecutionPolicy Bypass -File temp_ps_script.ps1 > temp_sfx_filters.txt 2>nul
            del temp_ps_script.ps1 2>nul
            
            if exist temp_sfx_filters.txt (
                set "first_sfx=1"
                for /f "usebackq tokens=*" %%a in (temp_sfx_filters.txt) do (
                    if !first_sfx! equ 1 (
                        set "sfx_filter=%%a"
                        set "first_sfx=0"
                    ) else (
                        set "sfx_filter=!sfx_filter!;%%a"
                    )
                )
            )
            del temp_sfx_filters.txt 2>nul
        )
        
        if !sfx_count! equ 1 (
            set "inputs=!inputs! !sfx_inputs!"
            if defined sfx_filter (
                set "filter_complex=!filter_complex!;!sfx_filter!;[1:a][sfx0a]amix=inputs=2:duration=first[a]"
            ) else (
                set "filter_complex=!filter_complex!;[1:a][2:a]amix=inputs=2:duration=first[a]"
            )
        ) else if !sfx_count! gtr 1 (
            set "inputs=!inputs! !sfx_inputs!"
            if defined sfx_filter (
                set "mix_inputs=[1:a]"
                for /L %%n in (0,1,!sfx_count!) do (
                    if %%n lss !sfx_count! set "mix_inputs=!mix_inputs![sfx%%na]"
                )
                set /a total_inputs=!sfx_count!+1
                set "filter_complex=!filter_complex!;!sfx_filter!;!mix_inputs!amix=inputs=!total_inputs!:duration=first[a]"
            ) else (
                set "amix_inputs=!sfx_input_count!"
                for /L %%n in (1,1,!sfx_count!) do (
                    set "filter_complex=!filter_complex![%%n:a]"
                )
                set "filter_complex=!filter_complex!amix=inputs=!amix_inputs!:duration=first[a]"
            )
        )
        set "maps=-map [v] -map [a]"
    ) else (
        set "filter_complex=!filter_complex!;[1:a]acopy[a]"
        set "maps=-map [v] -map [a]"
    )
    
    REM Track which audio output we're using
    set "audio_out=[a]"
    
    if exist "!chapter_dir!\music.wav" (
        echo [INFO] Adding music...
        set "inputs=!inputs! -i "!chapter_dir!\music.wav""
        set "filter_complex=!filter_complex!;[a]amix=inputs=2:duration=first:weights=1 0.3[final_audio]"
        set "audio_out=[final_audio]"
    )
    
    REM TEMPORARY: Skip subtitles for debugging - uncomment below to enable
    REM Check if subtitles file exists
    if not exist "!chapter_dir!\subtitles.srt" (
        echo [WARNING] Subtitles file not found for chapter !chapter_num!, skipping subtitles...
        set "maps=-map [v] -map !audio_out!"
    ) else (
        echo [INFO] Subtitles found, but temporarily DISABLED for debugging...
        echo [INFO] To enable subtitles, uncomment the subtitle filter code in bat file.
        set "maps=-map [v] -map !audio_out!"
        
        REM UNCOMMENT BELOW TO ENABLE SUBTITLES:
        REM echo [INFO] Adding subtitles for chapter !chapter_num!...
        REM set "subtitle_path=%CD%\!chapter_dir!\subtitles.srt"
        REM set "subtitle_path=!subtitle_path:\=/!"
        REM for /f "tokens=1* delims=:" %%a in ("!subtitle_path!") do (
        REM     if not "%%b"=="" set "subtitle_path=%%a\:/%%b"
        REM )
        REM set "filter_complex=!filter_complex!;[v]subtitles='!subtitle_path!':charenc=UTF-8:force_style='FontName=Arial,FontSize=24,PrimaryColour=&Hffffff,OutlineColour=&H000000,Outline=2,Bold=1'[vout]"
        REM set "maps=-map [vout] -map !audio_out!"
    )
    
    echo [DEBUG] Filter complex length: !filter_complex:~0,200!...
    echo [DEBUG] Maps: !maps!
    echo [DEBUG] Starting FFmpeg for chapter !chapter_num!...
    
    "!FFMPEG_EXEC!" -y !inputs! ^
        -filter_complex "!filter_complex!" ^
        !maps! ^
        -c:v libx264 -preset medium -crf 20 ^
        -c:a aac -b:a 192k ^
        -shortest ^
        temp_videos\chapter_!chapter_num!.mp4
    
    set "ffmpeg_exit=!errorlevel!"
    if !ffmpeg_exit! neq 0 (
        echo.
        echo [ERROR] ==========================================
        echo [ERROR] Failed to process chapter !chapter_num!
        echo [ERROR] FFmpeg exit code: !ffmpeg_exit!
        echo [ERROR] ==========================================
        echo.
        echo [DEBUG] Filter complex was:
        echo !filter_complex!
        echo.
        pause
    ) else (
        echo [SUCCESS] Chapter !chapter_num! complete
    )
    
    :skip_chapter
)

echo.
echo [INFO] Concatenating chapters...

(for /L %%i in (1,1,${chapterCount}) do (
    set "chapter_num=0%%i"
    set "chapter_num=!chapter_num:~-2!"
    if exist "temp_videos\chapter_!chapter_num!.mp4" (
        echo file 'temp_videos/chapter_!chapter_num!.mp4'
    )
)) > final_concat.txt

"!FFMPEG_EXEC!" -y -f concat -safe 0 -i final_concat.txt -c copy final_video.mp4

if %errorlevel% equ 0 (
    echo.
    echo [SUCCESS] Video created: final_video.mp4
    echo.
) else (
    echo [ERROR] Failed to create final video
    goto :error
)

echo [INFO] Cleaning up...
rmdir /s /q temp_videos 2>nul
del temp_concat_*.txt 2>nul
del final_concat.txt 2>nul

echo.
echo Done!
pause
exit /b 0

:error
echo.
echo ==========================================
echo [FATAL ERROR] Video assembly failed!
echo ==========================================
echo.
echo Please review the error messages above.
echo.
echo Common issues:
echo 1. Missing FFmpeg or FFmpeg not in PATH
echo 2. Missing chapter files (audio.wav, images, etc.)
echo 3. Corrupted audio/image files
echo 4. Insufficient disk space
echo.
pause
exit /b 1
`;
};

const PYTHON_LAUNCHER_BAT = `@echo off
REM Simple launcher for Python script
REM Keeps window open on errors

python assemble_video.py

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Python script failed with exit code %errorlevel%
    pause
    exit /b %errorlevel%
)

exit /b 0
`;

const generatePythonAssemblyScript = (chapterCount: number): string => {
    return `#!/usr/bin/env python3
"""
Video Assembly Script - Creates video from chapters with SFX, music, and subtitles
Works on Windows, macOS, and Linux
"""

import os
import sys
import json
import re
import subprocess
import shutil
from pathlib import Path
from typing import Optional, List, Tuple

# Configuration
TEMP_VIDEOS_DIR = "temp_videos"
FPS = 30
OUTPUT_RESOLUTION = "1920:1080"
VIDEO_CODEC = "libx264"
VIDEO_PRESET = "medium"
VIDEO_CRF = "20"
AUDIO_CODEC = "aac"
AUDIO_BITRATE = "192k"


def find_ffmpeg() -> Optional[str]:
    """Find FFmpeg executable in system PATH or common locations"""
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        return ffmpeg
    
    common_paths = [
        r"C:\\ffmpeg\\bin\\ffmpeg.exe",
        r"C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
        "ffmpeg.exe"
    ]
    
    for path in common_paths:
        if os.path.exists(path):
            return path
    
    return None


def find_ffprobe() -> Optional[str]:
    """Find FFprobe executable"""
    ffprobe = shutil.which("ffprobe")
    if ffprobe:
        return ffprobe
    
    common_paths = [
        r"C:\\ffmpeg\\bin\\ffprobe.exe",
        r"C:\\Program Files\\ffmpeg\\bin\\ffprobe.exe",
        "ffprobe.exe"
    ]
    
    for path in common_paths:
        if os.path.exists(path):
            return path
    
    return None


def get_audio_duration(ffprobe: str, audio_file: str) -> Optional[float]:
    """Get audio duration in seconds using ffprobe"""
    try:
        cmd = [
            ffprobe,
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            audio_file
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        duration = float(result.stdout.strip())
        return duration
    except (subprocess.CalledProcessError, ValueError) as e:
        print(f"[WARNING] Could not determine audio duration: {e}")
        return None


def calculate_image_duration(audio_duration: float, image_count: int) -> float:
    """Calculate duration per image (min 2s, max 20s)"""
    if image_count == 0:
        return 2.0
    duration = audio_duration / image_count
    return max(2.0, min(20.0, round(duration, 2)))


def get_chapter_images(chapter_dir: Path) -> List[Path]:
    """Get all PNG/JPG images from chapter directory"""
    images_dir = chapter_dir / "images"
    if not images_dir.exists():
        return []
    
    images = []
    for ext in ["*.png", "*.jpg", "*.jpeg"]:
        images.extend(images_dir.glob(ext))
    
    return sorted(images, key=lambda x: x.name)


def create_concat_file(images: List[Path], image_duration: float, output_file: Path):
    """Create FFmpeg concat file for images"""
    with open(output_file, "w", encoding="utf-8") as f:
        for img in images:
            # Use absolute path - simplest and most reliable
            # FFmpeg on Windows accepts Windows paths with backslashes
            img_path = str(img.absolute())

            # Escape single quotes only
            img_path = img_path.replace("'", "'\\\\''")

            f.write(f"file '{img_path}'\\n")
            f.write(f"duration {image_duration}\\n")


def parse_sfx_timings(metadata_file: Path) -> List[dict]:
    """Parse SFX timings from metadata.json"""
    try:
        with open(metadata_file, "r", encoding="utf-8") as f:
            metadata = json.load(f)
            return metadata.get("sfxTimings", [])
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"[WARNING] Could not parse SFX timings: {e}")
        return []


def build_ffmpeg_command(
    ffmpeg: str,
    chapter_dir: Path,
    chapter_num: int,
    concat_file: Path,
    output_file: Path,
    audio_duration: float,
    music_fallback: Optional[Path] = None
) -> List[str]:
    """Build FFmpeg command for chapter processing"""
    
    inputs = [
        "-f", "concat",
        "-safe", "0",
        "-i", str(concat_file),
        "-i", str(chapter_dir / "audio.wav")
    ]
    
    filter_parts = []
    
    filter_parts.append(
        "[0:v]scale={}:force_original_aspect_ratio=decrease,"
        "pad={}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={}[v]".format(
            OUTPUT_RESOLUTION, OUTPUT_RESOLUTION, FPS
        )
    )
    
    audio_inputs = ["[1:a]"]
    audio_label = "[1:a]"
    
    sfx_dir = chapter_dir / "sfx"
    sfx_files = sorted(sfx_dir.glob("*.wav")) if sfx_dir.exists() else []
    
    if sfx_files:
        print(f"[INFO] Found {len(sfx_files)} SFX files...")
        sfx_timings = parse_sfx_timings(chapter_dir / "metadata.json")
        
        for idx, sfx_file in enumerate(sfx_files):
            inputs.extend(["-i", str(sfx_file)])
            
            if idx < len(sfx_timings):
                timing = sfx_timings[idx]
                delay_ms = int(timing.get("startTime", 0) * 1000)
                volume = timing.get("volume", 0.3)
                
                filter_parts.append(
                    "[{}:a]adelay={}|{},volume={}[sfx{}a]".format(
                        idx + 2, delay_ms, delay_ms, volume, idx
                    )
                )
                audio_inputs.append(f"[sfx{idx}a]")
            else:
                audio_inputs.append(f"[{idx + 2}:a]")
        
        if len(audio_inputs) > 1:
            filter_parts.append(
                "".join(audio_inputs) + f"amix=inputs={len(audio_inputs)}:duration=first[a]"
            )
            audio_label = "[a]"
    
    music_file = chapter_dir / "music.wav"
    local_music = chapter_dir / "music.wav"
    music_source: Optional[Path] = None
    if local_music.exists():
        music_source = local_music
    elif music_fallback and music_fallback.exists():
        music_source = music_fallback
        print(f"[INFO] Using fallback background music from: {music_source}")

    if music_source:
        print(f"[INFO] Adding background music...")
        inputs.extend(["-i", str(music_source)])
        
        # Mix with music (main audio louder, music ~2% громкости)
        music_input_idx = len(sfx_files) + 2
        if audio_label == "[a]":
            filter_parts.append(f"{audio_label}amix=inputs=2:duration=first:weights=1 0.02[final_audio]")
        else:
            filter_parts.append(f"{audio_label}[{music_input_idx}:a]amix=inputs=2:duration=first:weights=1 0.02[final_audio]")
        audio_label = "[final_audio]"
    else:
        if audio_label != "[1:a]":
            filter_parts.append(f"{audio_label}acopy[a]")
            audio_label = "[a]"
    
    subtitle_file = chapter_dir / "subtitles.srt"
    if subtitle_file.exists():
        print(f"[INFO] Adding subtitles...")
        subtitle_path = str(subtitle_file.absolute()).replace("\\\\", "/")
        if ":" in subtitle_path:
            parts = subtitle_path.split(":", 1)
            subtitle_path = parts[0] + "\\\\:" + parts[1]
        
        filter_parts.append(
            "[v]subtitles='{}':charenc=UTF-8:"
            "force_style='FontName=Arial,FontSize=24,PrimaryColour=&Hffffff,"
            "OutlineColour=&H000000,Outline=2,Bold=1'[vout]".format(subtitle_path)
        )
        video_label = "[vout]"
    else:
        video_label = "[v]"
    
    filter_complex = ";".join(filter_parts)
    
    cmd = [
        ffmpeg,
        "-y",
    ] + inputs + [
        "-filter_complex", filter_complex,
        "-map", video_label,
        "-map", audio_label,
        "-c:v", VIDEO_CODEC,
        "-preset", VIDEO_PRESET,
        "-crf", VIDEO_CRF,
        "-pix_fmt", "yuv420p",  # Required for compatibility (most players need this)
        "-profile:v", "high",  # H.264 high profile for better compatibility
        "-level", "4.0",  # H.264 level 4.0 for wide compatibility
        "-c:a", AUDIO_CODEC,
        "-b:a", AUDIO_BITRATE,
        "-ar", "48000",  # Sample rate for audio (standard)
        "-movflags", "+faststart",  # Enable fast start for web playback
        "-shortest",
        str(output_file)
    ]
    
    return cmd


def process_chapter(
    ffmpeg: str,
    ffprobe: str,
    chapter_dir: Path,
    chapter_num: int,
    temp_dir: Path,
    music_fallback: Optional[Path] = None,
) -> bool:
    """Process a single chapter"""
    print(f"\\n{'='*50}")
    print(f"Processing Chapter {chapter_num:02d}...")
    print(f"{'='*50}")
    
    audio_file = chapter_dir / "audio.wav"
    if not audio_file.exists():
        print(f"[WARNING] Audio file not found for chapter {chapter_num:02d}, skipping...")
        return False
    
    metadata_file = chapter_dir / "metadata.json"
    if not metadata_file.exists():
        print(f"[WARNING] Metadata not found for chapter {chapter_num:02d}, skipping...")
        return False
    
    images = get_chapter_images(chapter_dir)
    if not images:
        print(f"[WARNING] No images found for chapter {chapter_num:02d}, skipping...")
        return False
    
    print(f"[INFO] Found {len(images)} images")
    
    audio_duration = get_audio_duration(ffprobe, str(audio_file))
    if audio_duration is None:
        print(f"[WARNING] Could not determine audio duration, skipping...")
        return False
    
    print(f"[INFO] Audio duration: {audio_duration:.2f} seconds")
    
    image_duration = calculate_image_duration(audio_duration, len(images))
    print(f"[INFO] Image duration: {image_duration:.2f} seconds each")
    
    concat_file = temp_dir / f"temp_concat_{chapter_num:02d}.txt"
    create_concat_file(images, image_duration, concat_file)
    
    output_file = temp_dir / f"chapter_{chapter_num:02d}.mp4"
    
    cmd = build_ffmpeg_command(
        ffmpeg, chapter_dir, chapter_num, concat_file, output_file, audio_duration, music_fallback
    )
    
    print(f"[INFO] Starting FFmpeg encoding...")
    
    try:
        subprocess.run(cmd, check=True)
        print(f"[SUCCESS] Chapter {chapter_num:02d} completed!")
        return True
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] Failed to process chapter {chapter_num:02d}")
        print(f"[ERROR] FFmpeg exit code: {e.returncode}")
        return False


def get_video_title() -> str:
    """Get video title from project_metadata.json"""
    metadata_file = Path("project_metadata.json")
    if metadata_file.exists():
        try:
            with open(metadata_file, "r", encoding="utf-8") as f:
                metadata = json.load(f)
                # Try youtube.selectedTitle first, then title
                title = metadata.get("youtube", {}).get("selectedTitle") or metadata.get("title", "final_video")
                return title
        except (FileNotFoundError, json.JSONDecodeError, KeyError):
            pass
    return "final_video"


def sanitize_filename(filename: str) -> str:
    """Remove invalid characters from filename"""
    # Remove invalid characters for Windows/Linux filenames
    filename = re.sub(r'[<>:\"/\\|?*]', '_', filename)
    # Remove leading/trailing dots and spaces
    filename = filename.strip('. ')
    # Limit length
    if len(filename) > 200:
        filename = filename[:200]
    return filename


def concatenate_chapters(ffmpeg: str, temp_dir: Path, output_file: Path, num_chapters: int = ${chapterCount}) -> bool:
    """Concatenate all chapter videos"""
    print(f"\\n{'='*50}")
    print("Concatenating chapters...")
    print(f"{'='*50}")
    
    concat_file = Path("final_concat.txt")
    with open(concat_file, "w", encoding="utf-8") as f:
        for i in range(1, num_chapters + 1):
            chapter_video = temp_dir / f"chapter_{i:02d}.mp4"
            if chapter_video.exists():
                path = str(chapter_video).replace("\\\\", "/")
                f.write(f"file '{path}'\\n")
    
    if concat_file.stat().st_size == 0:
        print("[ERROR] No chapter videos found for concatenation!")
        return False
    
    cmd = [
        ffmpeg,
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", str(concat_file),
        "-c", "copy",
        str(output_file)
    ]
    
    try:
        subprocess.run(cmd, check=True)
        print(f"[SUCCESS] Final video created: {output_file}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] Failed to concatenate chapters: {e}")
        return False


def cleanup(temp_dir: Path):
    """Clean up temporary files"""
    print("\\n[INFO] Cleaning up temporary files...")
    
    try:
        if temp_dir.exists():
            shutil.rmtree(temp_dir)
        
        concat_files = list(Path(".").glob("temp_concat_*.txt"))
        concat_files.append(Path("final_concat.txt"))
        
        for file in concat_files:
            if file.exists():
                file.unlink()
        
        print("[SUCCESS] Cleanup completed")
    except Exception as e:
        print(f"[WARNING] Cleanup error: {e}")


def main():
    """Main function"""
    print("="*60)
    print("Chapter-Based Video Assembly (Python Version)")
    print("="*60)
    print()
    
    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        print("[ERROR] FFmpeg not found!")
        print("Please install FFmpeg and add it to your PATH,")
        print("or place ffmpeg.exe in this directory.")
        input("\\nPress Enter to exit...")
        sys.exit(1)
    
    print(f"[SUCCESS] Found FFmpeg: {ffmpeg}")
    
    ffprobe = find_ffprobe()
    if not ffprobe:
        print("[ERROR] FFprobe not found!")
        input("\\nPress Enter to exit...")
        sys.exit(1)
    
    print(f"[SUCCESS] Found FFprobe: {ffprobe}")
    
    chapters_dir = Path("chapters")
    if not chapters_dir.exists():
        print("[ERROR] 'chapters' folder not found!")
        print("Make sure you're running this script from the project root.")
        input("\\nPress Enter to exit...")
        sys.exit(1)
    
    print(f"[SUCCESS] Found chapters directory")
    print()
    
    temp_dir = Path(TEMP_VIDEOS_DIR)
    temp_dir.mkdir(exist_ok=True)
    
    # Determine number of chapters
    num_chapters = ${chapterCount}

    # Find fallback music (first available music.wav in chapters)
    music_fallback: Optional[Path] = None
    for i in range(1, num_chapters + 1):
        candidate = chapters_dir / f"chapter_{i:02d}" / "music.wav"
        if candidate.exists():
            music_fallback = candidate
            print(f"[INFO] Fallback music source detected: {music_fallback}")
            break

    successful_chapters = []
    
    for i in range(1, num_chapters + 1):
        chapter_dir = chapters_dir / f"chapter_{i:02d}"
        
        if not chapter_dir.exists():
            print(f"[WARNING] Chapter {i:02d} directory not found, skipping...")
            continue
        
        success = process_chapter(ffmpeg, ffprobe, chapter_dir, i, temp_dir, music_fallback)
        if success:
            successful_chapters.append(i)
    
    if not successful_chapters:
        print("\\n[ERROR] No chapters were processed successfully!")
        cleanup(temp_dir)
        input("\\nPress Enter to exit...")
        sys.exit(1)
    
    # Get video title and create output filename
    video_title = get_video_title()
    safe_title = sanitize_filename(video_title)
    output_file = Path(f"{safe_title}.mp4")

    print(f"[INFO] Output file will be: {output_file}")

    success = concatenate_chapters(ffmpeg, temp_dir, output_file, num_chapters)
    
    if not success:
        cleanup(temp_dir)
        input("\\nPress Enter to exit...")
        sys.exit(1)
    
    cleanup(temp_dir)
    
    print("\\n" + "="*60)
    print("[SUCCESS] Video assembly completed!")
    print(f"[SUCCESS] Output: {output_file.absolute()}")
    print("="*60)
    print()
    input("Press Enter to exit...")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\\n\\n[INFO] Interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\\n[FATAL ERROR] {e}")
        import traceback
        traceback.print_exc()
        input("\\nPress Enter to exit...")
        sys.exit(1)
`;
};
