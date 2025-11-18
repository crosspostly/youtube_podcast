// ffmpeg.worker.ts

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

// Use stable CDN URLs for FFmpeg core files to ensure reliability across all environments.
const coreURL = "https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm/ffmpeg-core.js";
const wasmURL = "https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm/ffmpeg-core.wasm";
const workerURL = "https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm/ffmpeg-core.worker.js";


// Simplified types for worker context to avoid circular dependencies
interface PodcastData {
  selectedTitle: string;
}

interface WorkerRunData {
  podcast: PodcastData;
  audioBlob: Blob;
  srtBlob: Blob;
  imageUrls: string[];
  imageDurations: number[];
  totalDuration: number;
}

enum WorkerMessageType {
    LOG = 'log',
    PROGRESS = 'progress',
    DONE = 'done',
    ERROR = 'error',
}

let ffmpeg: FFmpeg | null = null;
// FIX: Declare isCancellationRequested in the worker's scope.
let isCancellationRequested = false;

const log = (data: { type: string; message: string; data?: any }) => {
    self.postMessage({ type: WorkerMessageType.LOG, data });
};

const progress = (progress: number, message: string) => {
    self.postMessage({ type: WorkerMessageType.PROGRESS, data: { progress, message } });
};

const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
};

// Helper to convert data URL to Uint8Array
function dataURLToUint8Array(dataURL: string): Uint8Array {
    const [header, base64] = dataURL.split(',');
    if (!base64) {
        throw new Error('Invalid dataURL format');
    }
    const binaryStr = atob(base64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
}


async function run({ podcast, audioBlob, srtBlob, imageUrls, imageDurations, totalDuration }: WorkerRunData): Promise<Blob> {
    progress(0.02, '1/6 Загрузка видео-движка в Worker...');
    log({ type: 'info', message: 'Загрузка FFmpeg в Web Worker...' });

    if (!ffmpeg) {
        ffmpeg = new FFmpeg();
        ffmpeg.on('log', ({ message }) => {
            log({ type: 'info', message: `[FFMPEG] ${message}` });
        });
        await ffmpeg.load({
            coreURL: await toBlobURL(coreURL, 'text/javascript'),
            wasmURL: await toBlobURL(wasmURL, 'application/wasm'),
            workerURL: await toBlobURL(workerURL, 'text/javascript'),
        });
    }
    log({ type: 'info', message: 'FFmpeg в Worker загружен.' });

    progress(0.15, '2/6 Запись данных в память...');
    await ffmpeg.writeFile('audio.wav', await fetchFile(audioBlob));
    await ffmpeg.writeFile('subtitles.srt', await fetchFile(srtBlob));

    for (let i = 0; i < imageUrls.length; i++) {
        const p = 0.15 + (i / imageUrls.length) * 0.20;
        progress(p, `2/6 Запись данных в память (${i + 1}/${imageUrls.length})...`);
        try {
            const imageName = `image-${String(i).padStart(3, '0')}.png`;
            const imageUrl = imageUrls[i];
            
            let data: Uint8Array;
            if (imageUrl.startsWith('data:')) {
                data = dataURLToUint8Array(imageUrl);
                // Clear base64 from memory after processing
                imageUrls[i] = '';
            } else {
                data = await fetchFile(imageUrl);
            }
            
            await ffmpeg.writeFile(imageName, data);
        } catch(e) {
            log({type: 'error', message: `FFmpeg не смог записать изображение ${i+1}.`, data: e});
            throw new Error(`FFmpeg failed to process a pre-validated image: ${imageUrls[i]}`);
        }
    }

    const filterComplex: string[] = [];
    const videoStreams: string[] = [];
    const ffmpegInputArgs: string[] = [];

    imageUrls.forEach((_, i) => {
        ffmpegInputArgs.push('-loop', '1', '-t', String(imageDurations[i]), '-i', `image-${String(i).padStart(3, '0')}.png`);
        filterComplex.push(`[${i}:v]scale=1280:720,format=pix_fmts=yuv420p,zoompan=z='min(zoom+0.001,1.1)':d=${Math.ceil(30 * imageDurations[i])}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'[v${i}]`);
        videoStreams.push(`[v${i}]`);
    });

    filterComplex.push(`${videoStreams.join('')}concat=n=${imageUrls.length}:v=1:a=0[concatv]`);
    
    // Improved subtitle styling for maximum readability
    const subtitleStyle = "'FontName=Inter,FontSize=32,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,BorderStyle=1,Outline=4,Shadow=2'";
    filterComplex.push(`[concatv]subtitles=subtitles.srt:force_style=${subtitleStyle}[outv]`);
    
    const ffmpegArgs = [
        ...ffmpegInputArgs, '-i', 'audio.wav',
        '-filter_complex', filterComplex.join(';'),
        '-map', '[outv]', '-map', `${imageUrls.length}:a`,
        '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k', '-shortest',
        'output.mp4'
    ];

    progress(0.35, '3a/6 Применение zoom-эффектов к изображениям...');
    log({ type: 'info', message: '🎬 Применение zoom-эффектов и подготовка изображений...' });
    
    let lastLoggedPercent = 0;
    ffmpeg.on('progress', ({ progress: p, time }) => {
        if (isCancellationRequested) return;
        const currentProgress = Math.min(1, Math.max(0, p));
        const processedTime = time / 1000000;
        const progressPercent = Math.round(currentProgress * 100);
        
        // Calculate detailed stage based on progress
        let stageMessage = `3/6 Рендеринг видео...`;
        let stageProgress = 0.35 + (currentProgress * 0.55);
        
        if (progressPercent < 20) {
            stageMessage = `3b/6 Склейка видеодорожки...`;
            stageProgress = 0.40 + (currentProgress * 0.15);
        } else if (progressPercent < 40) {
            stageMessage = `3c/6 Наложение субтитров...`;
            stageProgress = 0.55 + (currentProgress * 0.15);
        } else if (progressPercent < 70) {
            stageMessage = `3d/6 Микширование аудио...`;
            stageProgress = 0.70 + (currentProgress * 0.20);
        } else {
            stageMessage = `3e/6 Кодирование в MP4...`;
            stageProgress = 0.85 + (currentProgress * 0.10);
        }
        
        progress(
            stageProgress,
            `${stageMessage} ${progressPercent}% (${formatTime(processedTime)} / ${formatTime(totalDuration)})`
        );
        
        // Log progress every 15% to avoid spamming the logs
        if (progressPercent % 15 === 0 && progressPercent !== lastLoggedPercent) {
            log({ 
                type: 'info', 
                message: `🎬 ${stageMessage} ${progressPercent}%: ${formatTime(processedTime)} / ${formatTime(totalDuration)}` 
            });
            lastLoggedPercent = progressPercent;
        }
    });

    await ffmpeg.exec(ffmpegArgs);

    progress(0.95, '4/6 Финальная обработка...');
    log({ type: 'info', message: '🎬 Финальная обработка и очистка временных файлов...' });
    const data = await ffmpeg.readFile('output.mp4');
    
    for (let i = 0; i < imageUrls.length; i++) {
        await ffmpeg.deleteFile(`image-${String(i).padStart(3, '0')}.png`);
    }
    await ffmpeg.deleteFile('audio.wav');
    await ffmpeg.deleteFile('subtitles.srt');
    await ffmpeg.deleteFile('output.mp4');
    
    ffmpeg.off('progress', ()=>{});
    progress(1, '6/6 Видео готово!');
    log({ type: 'info', message: '✅ Видео успешно сгенерировано!' });
    return new Blob([(data as Uint8Array).buffer], { type: 'video/mp4' });
}

self.onmessage = async (event: MessageEvent) => {
    const { type, data } = event.data;

    if (type === 'run') {
        // FIX: Reset cancellation flag on a new run.
        isCancellationRequested = false;
        try {
            const result = await run(data);
            self.postMessage({ type: WorkerMessageType.DONE, data: result });
        } catch (error: any) {
            // FIX: Don't report an error if it was a user-initiated cancellation.
            if (!isCancellationRequested) {
                log({ type: 'error', message: 'Ошибка в FFmpeg Worker', data: error.message });
                self.postMessage({ type: WorkerMessageType.ERROR, data: { message: error.message } });
            }
        }
    } else if (type === 'cancel') {
        // FIX: Set cancellation flag when cancel message is received.
        isCancellationRequested = true;
        log({ type: 'info', message: 'Получена команда отмены в Worker.' });
        if (ffmpeg) {
            try {
                // terminate() is synchronous and may throw if already terminated.
                ffmpeg.terminate();
                log({ type: 'info', message: 'FFmpeg terminated.' });
            } catch (e) {
                log({ type: 'warning', message: 'Не удалось завершить FFmpeg, возможно, он уже завершился.', data: e });
            }
            ffmpeg = null;
        }
    }
};
