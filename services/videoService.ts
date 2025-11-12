


import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import type { Podcast, LogEntry } from '../types';
import { generateSrtFile } from './srtService';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;
type ProgressCallback = (progress: number, message: string) => void;

// Paths to local FFmpeg assets. These must be populated in the /public directory.
const CORE_URL = '/public/ffmpeg-core.js';
const WASM_URL = '/public/ffmpeg-core.wasm';
const WORKER_URL = '/public/worker.js';


let ffmpeg: FFmpeg | null = null;

// FIX: Change Image to any to resolve type error
const loadImage = (src: string): Promise<any> => {
    return new Promise((resolve, reject) => {
        // FIX: Use window.Image for browser environment
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
    log: LogFunction
): Promise<Blob> => {
    
    // --- 1. Initialization ---
    onProgress(0, 'Загрузка видео-движка FFmpeg...');
    log({ type: 'info', message: 'Загрузка FFmpeg...' });
    if (!ffmpeg) {
        ffmpeg = new FFmpeg();
        ffmpeg.on('log', ({ message }) => {
            log({ type: 'info', message: `[FFMPEG] ${message}` });
        });
        // FIX: Load FFmpeg from local, same-origin paths to prevent all CORS issues.
        await ffmpeg.load({
            coreURL: CORE_URL,
            wasmURL: WASM_URL,
            workerURL: WORKER_URL,
        });
    }
    log({ type: 'info', message: 'FFmpeg загружен.' });
    
    // --- 2. Prepare Assets ---
    onProgress(0.05, 'Подготовка аудио и изображений...');
    // FIX: Use (window as any).AudioContext for browser environment
    const audioContext = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
    try {
        const audioBuffer = await audioContext.decodeAudioData(await audioBlob.arrayBuffer());
        const totalDuration = audioBuffer.duration;
    
        const allGeneratedImages = podcast.chapters.flatMap(c => c.generatedImages || []);
        if (allGeneratedImages.length === 0) {
            throw new Error("Для генерации видео нет доступных изображений.");
        }

        const loadedImages = await Promise.all(allGeneratedImages.map(loadImage));

        // --- 3. Director Logic for Pacing ---
        onProgress(0.1, 'Анализ темпа повествования...');
        const MIN_IMAGE_DURATION = 4;
        const MAX_IMAGE_DURATION = 15;
        
        let imagesToUse = [...loadedImages];
        let finalImageDuration = totalDuration / imagesToUse.length;

        if (finalImageDuration > MAX_IMAGE_DURATION) {
            const loopsNeeded = Math.ceil(finalImageDuration / MAX_IMAGE_DURATION);
            const originalImages = [...imagesToUse];
            for (let i = 1; i < loopsNeeded; i++) {
                imagesToUse.push(...originalImages);
            }
        }

        finalImageDuration = totalDuration / imagesToUse.length;
        if (finalImageDuration < MIN_IMAGE_DURATION) {
            let imagesNeeded = Math.floor(totalDuration / MIN_IMAGE_DURATION);
            if (imagesNeeded > 0 && imagesNeeded < imagesToUse.length) {
                const step = imagesToUse.length / imagesNeeded;
                imagesToUse = Array.from({ length: imagesNeeded }, (_, i) => imagesToUse[Math.floor(i * step)]);
            } else if (imagesNeeded <= 0) {
                imagesToUse = [imagesToUse[0]];
            }
        }
        finalImageDuration = totalDuration / imagesToUse.length;
        log({ type: 'info', message: `Режиссерский анализ завершен: ${imagesToUse.length} сцен по ~${finalImageDuration.toFixed(1)}с.` });

        // --- 4. Write Assets to FFmpeg Memory ---
        onProgress(0.15, 'Запись ресурсов в память FFmpeg...');
        const assetWritePromises: Promise<any>[] = [];
        
        assetWritePromises.push(ffmpeg.writeFile('audio.wav', await fetchFile(audioBlob)));
        
        const srtBlob = await generateSrtFile(podcast, log);
        assetWritePromises.push(ffmpeg.writeFile('subtitles.srt', await fetchFile(srtBlob)));
        
        for (let i = 0; i < imagesToUse.length; i++) {
            // FIX: Use window.document for browser environment
            const canvas = (window as any).document.createElement('canvas');
            canvas.width = imagesToUse[i].width;
            canvas.height = imagesToUse[i].height;
            const ctx = canvas.getContext('2d');
            if (!ctx) continue;
            ctx.drawImage(imagesToUse[i], 0, 0);
            const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
            if (blob) {
                assetWritePromises.push(ffmpeg.writeFile(`image-${String(i).padStart(3, '0')}.png`, await fetchFile(blob)));
            }
        }
        await Promise.all(assetWritePromises);
        onProgress(0.3, 'Ресурсы записаны.');

        // --- 5. Build FFmpeg Command with Complex Filter ---
        const FPS = 30;
        const filterComplex: string[] = [];
        const videoStreams: string[] = [];

        imagesToUse.forEach((_, i) => {
            const inputIndex = i;
            filterComplex.push(
                `[${inputIndex}:v] ` +
                `scale=1280:720, ` +
                `format=pix_fmts=yuv420p, ` +
                `zoompan=z='min(zoom+0.001,1.1)':d=${FPS * finalImageDuration}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)' ` +
                `[v${i}]`
            );
            videoStreams.push(`[v${i}]`);
        });

        filterComplex.push(`${videoStreams.join('')}concat=n=${imagesToUse.length}:v=1:a=0[concatv]`);
        filterComplex.push(`[concatv]subtitles=subtitles.srt:force_style='FontName=Inter,FontSize=32,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,BorderStyle=3,Outline=4,Shadow=2'[outv]`);
        
        const finalFilterComplex = filterComplex.join(';');

        const ffmpegArgs = [
            ...imagesToUse.map((_, i) => ['-loop', '1', '-t', String(finalImageDuration), '-i', `image-${String(i).padStart(3, '0')}.png`]).flat(),
            '-i', 'audio.wav',
            '-filter_complex', finalFilterComplex,
            '-map', '[outv]',
            '-map', `${imagesToUse.length}:a`,
            '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '192k',
            '-shortest',
            'output.mp4'
        ];

        // --- 6. Execute FFmpeg ---
        onProgress(0.35, 'Запуск видео-рендеринга...');
        log({ type: 'request', message: 'Запуск команды FFmpeg', data: ffmpegArgs.join(' ') });
        
        ffmpeg.on('progress', ({ progress, time }) => {
            const ffmpegProgress = time / totalDuration;
            onProgress(0.35 + (ffmpegProgress * 0.6), `Компиляция видео... ${Math.round(ffmpegProgress * 100)}%`);
        });

        await ffmpeg.exec(ffmpegArgs);
        
        log({ type: 'info', message: 'Команда FFmpeg завершена.' });
        onProgress(0.95, 'Финальная обработка...');

        const data = await ffmpeg.readFile('output.mp4');
        const videoBlob = new Blob([(data as Uint8Array).buffer], { type: 'video/mp4' });

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

    } catch(error) {
        log({ type: 'error', message: 'Критическая ошибка в видео-движке', data: error });
        throw error;
    }
};