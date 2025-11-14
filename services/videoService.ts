import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { Podcast, LogEntry } from '../types';
import { generateSrtFile } from './srtService';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;
type ProgressCallback = (progress: number, message: string) => void;

// Все компоненты FFmpeg должны быть из пакета @ffmpeg/core для совместимости
const FFMPEG_CORE_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js';
const FFMPEG_WASM_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm';
const FFMPEG_WORKER_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.worker.js';


let ffmpeg: FFmpeg | null = null;

// Загрузка изображения с обработкой CORS
const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        // FIX: Prefix `Image` with `window.` to resolve missing DOM type error.
        const img = new (window as any).Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(new Error(`Failed to load image: ${src.substring(0, 100)}...`));
        img.src = src;
    });
};

export const generateVideo = async (
    podcast: Podcast,
    audioBlob: Blob,
    onProgress: ProgressCallback,
    log: LogFunction,
    manualDurations?: number[]
): Promise<Blob> => {
    
    // --- 1. Initialization ---
    onProgress(0, 'Загрузка видео-движка FFmpeg...');
    log({ type: 'info', message: 'Загрузка FFmpeg...' });
    
    if (!ffmpeg) {
        ffmpeg = new FFmpeg();
        ffmpeg.on('log', ({ message }) => {
            log({ type: 'info', message: `[FFMPEG] ${message}` });
        });
        
        // toBlobURL создает локальные blob-ссылки, что решает проблемы CORS и SharedArrayBuffer
        await ffmpeg.load({
            coreURL: await toBlobURL(FFMPEG_CORE_URL, 'text/javascript'),
            wasmURL: await toBlobURL(FFMPEG_WASM_URL, 'application/wasm'),
            workerURL: await toBlobURL(FFMPEG_WORKER_URL, 'text/javascript'),
        });
    }
    log({ type: 'info', message: 'FFmpeg загружен.' });
    
    // --- 2. Prepare Assets & Pacing ---
    onProgress(0.05, 'Подготовка ресурсов и анализ темпа...');
    
    let totalDuration: number;
    let imagesToUse: HTMLImageElement[];
    let imageDurations: number[];

    const allGeneratedImages = podcast.chapters.flatMap(c => c.generatedImages || []);
    if (allGeneratedImages.length === 0) throw new Error("Для генерации видео нет доступных изображений.");
    const loadedImages = await Promise.all(allGeneratedImages.map(loadImage));

    if (manualDurations && manualDurations.length === loadedImages.length) {
        // MANUAL PACING
        log({ type: 'info', message: `Используется ручной режим расстановки времени.` });
        onProgress(0.1, 'Применение ручных настроек времени...');
        imagesToUse = loadedImages;
        imageDurations = manualDurations;
        totalDuration = imageDurations.reduce((sum, d) => sum + d, 0);
        log({ type: 'info', message: `Ручной режим: ${imagesToUse.length} сцен, общая длительность видео ${totalDuration.toFixed(1)}с.` });
    } else {
        // AUTOMATIC PACING
        log({ type: 'info', message: `Используется автоматический режим расстановки времени.` });
        onProgress(0.1, 'Анализ темпа повествования...');
        
        // Кроссбраузерная поддержка AudioContext
        // FIX: Prefix `AudioContext` with `window.` to resolve missing DOM type error.
        const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) {
            throw new Error('Web Audio API не поддерживается в этом браузере');
        }
        
        const audioContext = new AudioContextClass();
        const audioBuffer = await audioContext.decodeAudioData(await audioBlob.arrayBuffer());
        totalDuration = audioBuffer.duration;
        
        const MIN_IMAGE_DURATION = 4;
        const MAX_IMAGE_DURATION = 15;
        
        let autoImagesToUse = [...loadedImages];
        let finalImageDuration = totalDuration / autoImagesToUse.length;

        if (finalImageDuration > MAX_IMAGE_DURATION) {
            const loopsNeeded = Math.ceil(finalImageDuration / MAX_IMAGE_DURATION);
            const originalImages = [...autoImagesToUse];
            for (let i = 1; i < loopsNeeded; i++) {
                autoImagesToUse.push(...originalImages);
            }
        }

        finalImageDuration = totalDuration / autoImagesToUse.length;
        if (finalImageDuration < MIN_IMAGE_DURATION) {
            let imagesNeeded = Math.floor(totalDuration / MIN_IMAGE_DURATION);
            if (imagesNeeded > 0 && imagesNeeded < autoImagesToUse.length) {
                const step = autoImagesToUse.length / imagesNeeded;
                autoImagesToUse = Array.from({ length: imagesNeeded }, (_, i) => autoImagesToUse[Math.floor(i * step)]);
            } else if (imagesNeeded <= 0) {
                autoImagesToUse = [autoImagesToUse[0]];
            }
        }
        
        imagesToUse = autoImagesToUse;
        finalImageDuration = totalDuration / imagesToUse.length;
        imageDurations = Array(imagesToUse.length).fill(finalImageDuration);
        log({ type: 'info', message: `Авто-режим: ${imagesToUse.length} сцен по ~${finalImageDuration.toFixed(1)}с.` });
    }

    // --- 3. Write Assets to FFmpeg Memory ---
    onProgress(0.15, 'Запись ресурсов в память FFmpeg...');
    await ffmpeg.writeFile('audio.wav', await fetchFile(audioBlob));
    const srtBlob = await generateSrtFile(podcast, log);
    await ffmpeg.writeFile('subtitles.srt', await fetchFile(srtBlob));
    
    // STABILITY IMPROVEMENT: Write images sequentially instead of all at once.
    // This prevents a massive memory spike by not creating all image blobs concurrently.
    for (let i = 0; i < imagesToUse.length; i++) {
        const image = imagesToUse[i];
        const progress = 0.15 + (i / imagesToUse.length) * 0.15; // This stage takes 15% of progress
        onProgress(progress, `Запись изображения ${i + 1}/${imagesToUse.length}...`);
        
        // FIX: Prefix `document` with `window.` to resolve missing DOM type error.
        const canvas = (window as any).document.createElement('canvas');
        // FIX: Cast image to `any` to access width/height properties.
        canvas.width = (image as any).width;
        canvas.height = (image as any).height;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        ctx.drawImage(image, 0, 0);
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
        if (blob) {
            await ffmpeg!.writeFile(`image-${String(i).padStart(3, '0')}.png`, await fetchFile(blob));
        }
    }
    onProgress(0.3, 'Ресурсы записаны.');


    // --- 4. Build FFmpeg Command with Complex Filter ---
    const FPS = 30;
    const filterComplex: string[] = [];
    const videoStreams: string[] = [];
    const ffmpegInputArgs: string[] = [];

    imagesToUse.forEach((_, i) => {
        const inputIndex = i;
        const duration = imageDurations[i];
        ffmpegInputArgs.push('-loop', '1', '-t', String(duration), '-i', `image-${String(i).padStart(3, '0')}.png`);
        
        filterComplex.push(
            `[${inputIndex}:v] ` +
            `scale=1280:720, ` +
            `format=pix_fmts=yuv420p, ` +
            `zoompan=z='min(zoom+0.001,1.1)':d=${Math.ceil(FPS * duration)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)' ` +
            `[v${i}]`
        );
        videoStreams.push(`[v${i}]`);
    });

    filterComplex.push(`${videoStreams.join('')}concat=n=${imagesToUse.length}:v=1:a=0[concatv]`);
    filterComplex.push(`[concatv]subtitles=subtitles.srt:force_style='FontName=Inter,FontSize=32,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,BorderStyle=3,Outline=4,Shadow=2'[outv]`);
    
    const finalFilterComplex = filterComplex.join(';');

    const ffmpegArgs = [
        ...ffmpegInputArgs,
        '-i', 'audio.wav',
        '-filter_complex', finalFilterComplex,
        '-map', '[outv]',
        '-map', `${imagesToUse.length}:a`,
        '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k',
        '-shortest',
        'output.mp4'
    ];

    // --- 5. Execute FFmpeg ---
    onProgress(0.35, 'Запуск видео-рендеринга...');
    log({ type: 'request', message: 'Запуск команды FFmpeg', data: ffmpegArgs.join(' ') });
    
    ffmpeg.on('progress', ({ progress, time }) => {
        const ffmpegProgress = time / totalDuration;
        onProgress(0.35 + (ffmpegProgress * 0.6), `Компиляция видео... ${Math.round(ffmpegProgress * 100)}%`);
    });

    await ffmpeg.exec(ffmpegArgs);
    
    log({ type: 'info', message: 'Команда FFmpeg завершена.' });
    onProgress(0.95, 'Финальная обработка...');

    // --- 6. Retrieve & Return Video ---
    const data = await ffmpeg.readFile('output.mp4');
    const videoBlob = new Blob([(data as Uint8Array).buffer], { type: 'video/mp4' });

    // --- 7. Cleanup ---
    log({ type: 'info', message: 'Очистка временных файлов...' });
    const deletionPromises = imagesToUse.map((_, i) => ffmpeg!.deleteFile(`image-${String(i).padStart(3, '0')}.png`));
    deletionPromises.push(ffmpeg!.deleteFile('audio.wav'));
    deletionPromises.push(ffmpeg!.deleteFile('subtitles.srt'));
    deletionPromises.push(ffmpeg!.deleteFile('output.mp4'));
    await Promise.all(deletionPromises);
    log({ type: 'info', message: 'Очистка завершена.' });
    
    ffmpeg.off('progress', () => {});
    onProgress(1, 'Видео готово!');
    return videoBlob;
};