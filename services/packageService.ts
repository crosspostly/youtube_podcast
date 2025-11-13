import type { Podcast, LogEntry } from '../types';
import { combineAndMixAudio } from './ttsService';
import { generateSrtFile } from './srtService';
import { generateFfmpegCommandParts } from './ffmpegCommandBuilder';
import { safeLower } from '../utils/safeLower-util';

declare const JSZip: any;

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;

const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    // FIX: Cast `window` to `any` to access `document` because DOM types are missing in the environment.
    const a = (window as any).document.createElement('a');
    a.href = url;
    a.download = filename;
    // FIX: Cast `window` to `any` to access `document` because DOM types are missing in the environment.
    (window as any).document.body.appendChild(a);
    a.click();
    // FIX: Cast `window` to `any` to access `document` because DOM types are missing in the environment.
    (window as any).document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

export const createAssemblyPackage = async (podcast: Podcast, log: LogFunction): Promise<void> => {
    log({ type: 'info', message: 'Начало создания пакета для локальной сборки.' });

    if (typeof JSZip === 'undefined') {
        throw new Error('Библиотека JSZip не загружена. Проверьте подключение в index.html.');
    }

    const zip = new JSZip();
    const slug = safeLower(podcast.selectedTitle.replace(/[^a-z0-9а-яё]/gi, '_'));

    // 1. Generate and add final mixed audio
    log({ type: 'info', message: 'Сборка финальной аудиодорожки...' });
    const audioBlob = await combineAndMixAudio(podcast);
    zip.file('audio.wav', audioBlob);

    // 2. Generate and add SRT subtitles
    log({ type: 'info', message: 'Генерация SRT субтитров...' });
    const srtBlob = await generateSrtFile(podcast, log);
    zip.file('subtitles.srt', srtBlob);

    // 3. Add all images, renamed sequentially
    log({ type: 'info', message: 'Добавление изображений...' });
    const imagesFolder = zip.folder('images');
    const allImages = podcast.chapters.flatMap(c => c.generatedImages || []);
    for (let i = 0; i < allImages.length; i++) {
        const imgData = allImages[i].split(',')[1];
        if (imagesFolder) {
            imagesFolder.file(`img_${String(i).padStart(3, '0')}.png`, imgData, { base64: true });
        }
    }

    // 4. Add all unique SFX files
    log({ type: 'info', message: 'Добавление звуковых эффектов...' });
    const sfxFolder = zip.folder('sfx');
    const uniqueSfx = new Map<number, { url: string, name: string }>();
    podcast.chapters.forEach(c => c.script.forEach(l => {
        if (l.soundEffect && !uniqueSfx.has(l.soundEffect.id)) {
            uniqueSfx.set(l.soundEffect.id, { url: l.soundEffect.previews['preview-hq-mp3'], name: l.soundEffect.name });
        }
    }));

    for (const [id, sfx] of uniqueSfx.entries()) {
        try {
            const proxyUrl = `/api/audio-proxy?url=${encodeURIComponent(sfx.url)}`;
            const response = await fetch(proxyUrl);
            const sfxBlob = await response.blob();
            if (sfxFolder) {
                 sfxFolder.file(`sfx_${id}.mp3`, sfxBlob);
            }
        } catch (e) {
            log({type: 'error', message: `Не удалось скачать SFX: ${sfx.name}`, data: e});
        }
    }

    // 5. Generate FFmpeg instructions
    log({ type: 'info', message: 'Генерация "рецепта" для FFmpeg...' });
    // FIX: Use `(window as any)` to access AudioContext to resolve missing DOM type error.
    const audioContext = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
    const totalDuration = (await audioContext.decodeAudioData(await audioBlob.arrayBuffer())).duration;
    
    const commandParts = generateFfmpegCommandParts(podcast, totalDuration);
    zip.file('ffmpeg_instructions.txt', commandParts.filterComplex);

    // 6. Generate assembly scripts
    log({ type: 'info', message: 'Генерация сборочных скриптов...' });

    const ffmpegCommand = [
        'ffmpeg -y',
        ...commandParts.imageInputArgs,
        ...commandParts.sfxInputArgs,
        '-i "audio.wav"',
        '-filter_complex_script "ffmpeg_instructions.txt"',
        '-map "[outv]"',
        `-map "${commandParts.finalAudioMap}"`,
        '-c:v libx264 -preset fast -pix_fmt yuv420p',
        '-c:a aac -b:a 192k',
        '-shortest',
        'output.mp4'
    ].join(' ');

    const batScript = `@echo off
echo Checking for FFmpeg...
ffmpeg -version >nul 2>&1
if %errorlevel% neq 0 (
    echo FFmpeg not found. Please install it from https://ffmpeg.org/download.html
    pause
    exit /b
)
echo Unzipping assets...
powershell -command "Expand-Archive -Path '${slug}_assets.zip' -DestinationPath '.' -Force"
echo Assembling video... This may take a while.
${ffmpegCommand}
echo Video assembly complete! Find your video as output.mp4
pause
`;
    
    const shScript = `#!/bin/bash
echo "Checking for FFmpeg..."
if ! command -v ffmpeg &> /dev/null
then
    echo "FFmpeg not found. Please install it from https://ffmpeg.org/download.html"
    exit
fi
echo "Unzipping assets..."
unzip -o "${slug}_assets.zip"
echo "Assembling video... This may take a while."
${ffmpegCommand}
echo "Video assembly complete! Find your video as output.mp4"
`;

    // 7. Download everything
    log({ type: 'info', message: 'Создание ZIP-архива...' });
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(zipBlob, `${slug}_assets.zip`);
    downloadBlob(new Blob([batScript], { type: 'text/plain' }), 'assemble.bat');
    downloadBlob(new Blob([shScript], { type: 'text/plain' }), 'assemble.sh');

    log({ type: 'response', message: 'Пакет для сборки успешно скачан.' });
};
