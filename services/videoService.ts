// Enhanced video service with image protection

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { Podcast, LogEntry } from '../types';
import { generateSrtFile } from './srtService';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;
type ProgressCallback = (progress: number, message: string) => void;

const FFMPEG_CORE_URL = 'https://aistudiocdn.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js';
const FFMPEG_WASM_URL = 'https://aistudiocdn.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm';
const FFMPEG_WORKER_URL = 'https://aistudiocdn.com/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.worker.js';

let ffmpeg: FFmpeg | null = null;
let isCancellationRequested = false;

// Fallback placeholder base64 for broken images
const FALLBACK_PLACEHOLDER_BASE64 = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4MCIgaGVpZ2h0PSI3MjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEyODAiIGhlaWdodD0iNzIwIiBmaWxsPSIjMzc0MTUxIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSI0MCIgZmlsbD0iI2RlZGVkZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIFVubmF2YWlsYWJsZTwvdGV4dD48L3N2Zz4=';

export const cancelFfmpeg = () => {
    isCancellationRequested = true;
    if (ffmpeg) {
        try {
            ffmpeg.terminate();
        } catch (e) {
            console.warn("Could not terminate FFmpeg, it might have already finished.", e);
        }
    }
};

// FIX: Cannot find name 'HTMLImageElement'. Changed return type to 'any'.
const loadImage = (src: string): Promise<any> => {
    return new Promise((resolve, reject) => {
        const img = new (window as any).Image();
        img.crossOrigin = 'anonymous';
        
        const timeout = setTimeout(() => {
            reject(new Error(`Image load timeout (10s): ${src.substring(0, 100)}...`));
        }, 10000);
        
        img.onload = () => {
            clearTimeout(timeout);
            if (img.naturalWidth === 0 || img.naturalHeight === 0) {
                reject(new Error(`Invalid image dimensions (0x0): ${src.substring(0, 100)}...`));
            } else {
                resolve(img);
            }
        };
        
        img.onerror = (err) => {
            clearTimeout(timeout);
            reject(new Error(`Failed to load image: ${src.substring(0, 100)}...`));
        };
        
        img.src = src;
    });
};

const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
};


export const generateVideo = async (
    podcast: Podcast,
    audioBlob: Blob,
    onProgress: ProgressCallback,
    log: LogFunction,
    manualDurations?: number[]
): Promise<Blob> => {
    isCancellationRequested = false;
    
    // --- 1. Initialization ---
    onProgress(0, '1/5 Загрузка видео-движка...');
    log({ type: 'info', message: 'Загрузка FFmpeg...' });
    
    if (!ffmpeg) {
        ffmpeg = new FFmpeg();
        ffmpeg.on('log', ({ message }) => {
            log({ type: 'info', message: `[FFMPEG] ${message}` });
        });
        await ffmpeg.load({
            coreURL: await toBlobURL(FFMPEG_CORE_URL, 'text/javascript'),
            wasmURL: await toBlobURL(FFMPEG_WASM_URL, 'application/wasm'),
            workerURL: await toBlobURL(FFMPEG_WORKER_URL, 'text/javascript'),
        });
    }
    log({ type: 'info', message: 'FFmpeg загружен.' });
    
    // --- 2. Prepare Assets & Pacing ---
    onProgress(0.05, '2/5 Подготовка ресурсов...');
    
    const allGeneratedImages = podcast.chapters.flatMap(c => c.generatedImages || []);
    if (allGeneratedImages.length === 0) {
        throw new Error("Для генерации видео нет доступных изображений.");
    }
    
    log({ type: 'info', message: `Проверка доступности ${allGeneratedImages.length} изображений...` });
    
    const loadedImageResults = await Promise.allSettled(allGeneratedImages.map(img => loadImage(img.url)));
    
    // FIX: Cannot find name 'HTMLImageElement'. Changed array type to 'any[]'.
    const imagesToUse: any[] = [];
    const placeholderImage = await loadImage(FALLBACK_PLACEHOLDER_BASE64);
    
    loadedImageResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            imagesToUse.push(result.value);
        } else {
            log({ type: 'warning', message: `Не удалось загрузить изображение ${index + 1}, используется placeholder.`, data: result.reason });
            imagesToUse.push(placeholderImage);
        }
    });

    let totalDuration: number;
    let imageDurations: number[];

    if (manualDurations && manualDurations.length === imagesToUse.length) {
        log({ type: 'info', message: `Используется ручной режим расстановки времени.` });
        imageDurations = manualDurations;
        totalDuration = imageDurations.reduce((sum, d) => sum + d, 0);
    } else {
        log({ type: 'info', message: `Используется автоматический режим расстановки времени.` });
        const audioContext = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
        const audioBuffer = await audioContext.decodeAudioData(await audioBlob.arrayBuffer());
        totalDuration = audioBuffer.duration;
        imageDurations = Array(imagesToUse.length).fill(totalDuration / imagesToUse.length);
    }

    // --- 3. Write Assets to FFmpeg Memory ---
    await ffmpeg.writeFile('audio.wav', await fetchFile(audioBlob));
    await ffmpeg.writeFile('subtitles.srt', await fetchFile(await generateSrtFile(podcast, log)));
    
    for (let i = 0; i < imagesToUse.length; i++) {
        const progress = 0.15 + (i / imagesToUse.length) * 0.15;
        onProgress(progress, `3/5 Запись данных в память (${i + 1}/${imagesToUse.length})...`);
        const canvas = (window as any).document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imagesToUse[i], 0, 0, 1280, 720);
        const blob = await new Promise<Blob|null>(resolve => canvas.toBlob(resolve, 'image/png'));
        await ffmpeg.writeFile(`image-${String(i).padStart(3, '0')}.png`, await fetchFile(blob!));
    }

    // --- 4. Build & Execute FFmpeg Command ---
    const filterComplex: string[] = [];
    const videoStreams: string[] = [];
    const ffmpegInputArgs: string[] = [];

    imagesToUse.forEach((_, i) => {
        ffmpegInputArgs.push('-loop', '1', '-t', String(imageDurations[i]), '-i', `image-${String(i).padStart(3, '0')}.png`);
        filterComplex.push(`[${i}:v]scale=1280:720,format=pix_fmts=yuv420p,zoompan=z='min(zoom+0.001,1.1)':d=${Math.ceil(30 * imageDurations[i])}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'[v${i}]`);
        videoStreams.push(`[v${i}]`);
    });

    filterComplex.push(`${videoStreams.join('')}concat=n=${imagesToUse.length}:v=1:a=0[concatv]`);
    filterComplex.push(`[concatv]subtitles=subtitles.srt:force_style='FontName=Inter,FontSize=32,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,BorderStyle=3,Outline=4,Shadow=2'[outv]`);
    
    const ffmpegArgs = [
        ...ffmpegInputArgs, '-i', 'audio.wav',
        '-filter_complex', filterComplex.join(';'),
        '-map', '[outv]', '-map', `${imagesToUse.length}:a`,
        '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k', '-shortest',
        'output.mp4'
    ];

    onProgress(0.35, '4/5 Рендеринг видео...');
    ffmpeg.on('progress', ({ progress, time }) => {
        if (isCancellationRequested) return;
        const currentProgress = Math.min(1, Math.max(0, progress));
        const processedTime = time / 1000000; // time is in microseconds
        onProgress(
            0.35 + (currentProgress * 0.6),
            `4/5 Рендеринг видео... ${Math.round(currentProgress * 100)}% (${formatTime(processedTime)} / ${formatTime(totalDuration)})`
        );
    });

    try {
        await ffmpeg.exec(ffmpegArgs);
    } catch(error: any) {
        if (isCancellationRequested) {
            log({type: 'info', message: 'Генерация видео отменена пользователем.'});
            throw new Error('cancelled'); // Specific error for cancellation
        }
        throw error; // Re-throw other errors
    }

    // --- 5. Retrieve & Cleanup ---
    onProgress(0.95, '5/5 Финальная обработка...');
    const data = await ffmpeg.readFile('output.mp4');
    
    // Cleanup
    for (let i = 0; i < imagesToUse.length; i++) {
        await ffmpeg.deleteFile(`image-${String(i).padStart(3, '0')}.png`);
    }
    await ffmpeg.deleteFile('audio.wav');
    await ffmpeg.deleteFile('subtitles.srt');
    await ffmpeg.deleteFile('output.mp4');
    
    ffmpeg.off('progress', ()=>{});
    onProgress(1, 'Видео готово!');
    return new Blob([(data as Uint8Array).buffer], { type: 'video/mp4' });
};
