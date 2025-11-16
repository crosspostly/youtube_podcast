// ffmpeg.worker.ts

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

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

const FFMPEG_CORE_URL = 'https://aistudiocdn.com/@ffmpeg/core-mt@0.12.6/dist/esm/ffmpeg-core.js';
const FFMPEG_WASM_URL = 'https://aistudiocdn.com/@ffmpeg/core-mt@0.12.6/dist/esm/ffmpeg-core.wasm';
const FFMPEG_WORKER_URL = 'https://aistudiocdn.com/@ffmpeg/core-mt@0.12.6/dist/esm/ffmpeg-core.worker.js';

let ffmpeg: FFmpeg | null = null;

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

async function run({ podcast, audioBlob, srtBlob, imageUrls, imageDurations, totalDuration }: WorkerRunData): Promise<Blob> {
    progress(0.02, '1/5 Загрузка видео-движка в Worker...');
    log({ type: 'info', message: 'Загрузка FFmpeg в Web Worker...' });

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
    log({ type: 'info', message: 'FFmpeg в Worker загружен.' });

    progress(0.15, '2/5 Запись данных в память...');
    await ffmpeg.writeFile('audio.wav', await fetchFile(audioBlob));
    await ffmpeg.writeFile('subtitles.srt', await fetchFile(srtBlob));

    for (let i = 0; i < imageUrls.length; i++) {
        const p = 0.15 + (i / imageUrls.length) * 0.20;
        progress(p, `2/5 Запись изображения (${i + 1}/${imageUrls.length})...`);
        try {
            await ffmpeg.writeFile(`image-${String(i).padStart(3, '0')}.png`, await fetchFile(imageUrls[i]));
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
    filterComplex.push(`[concatv]subtitles=subtitles.srt:force_style='FontName=Inter,FontSize=32,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,BorderStyle=3,Outline=4,Shadow=2'[outv]`);
    
    const ffmpegArgs = [
        ...ffmpegInputArgs, '-i', 'audio.wav',
        '-filter_complex', filterComplex.join(';'),
        '-map', '[outv]', '-map', `${imageUrls.length}:a`,
        '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k', '-shortest',
        'output.mp4'
    ];

    progress(0.35, '3/5 Рендеринг видео...');
    ffmpeg.on('progress', ({ progress: p, time }) => {
        const currentProgress = Math.min(1, Math.max(0, p));
        const processedTime = time / 1000000;
        progress(
            0.35 + (currentProgress * 0.6),
            `3/5 Рендеринг видео... ${Math.round(currentProgress * 100)}% (${formatTime(processedTime)} / ${formatTime(totalDuration)})`
        );
    });

    await ffmpeg.exec(ffmpegArgs);

    progress(0.95, '4/5 Финальная обработка...');
    const data = await ffmpeg.readFile('output.mp4');
    
    for (let i = 0; i < imageUrls.length; i++) {
        await ffmpeg.deleteFile(`image-${String(i).padStart(3, '0')}.png`);
    }
    await ffmpeg.deleteFile('audio.wav');
    await ffmpeg.deleteFile('subtitles.srt');
    await ffmpeg.deleteFile('output.mp4');
    
    ffmpeg.off('progress', ()=>{});
    progress(1, '5/5 Видео готово!');
    return new Blob([(data as Uint8Array).buffer], { type: 'video/mp4' });
}

self.onmessage = async (event: MessageEvent) => {
    const { type, data } = event.data;

    if (type === 'run') {
        try {
            const result = await run(data);
            self.postMessage({ type: WorkerMessageType.DONE, data: result });
        } catch (error: any) {
            log({ type: 'error', message: 'Ошибка в FFmpeg Worker', data: error.message });
            self.postMessage({ type: WorkerMessageType.ERROR, data: { message: error.message } });
        }
    } else if (type === 'cancel') {
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
