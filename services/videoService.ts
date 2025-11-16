// services/videoService.ts

import type { Podcast, LogEntry } from '../types';
import { generateSrtFile } from './srtService';

let worker: Worker | null = null;
let isCancellationRequested = false;

// Fallback placeholder base64 for broken images
const FALLBACK_PLACEHOLDER_BASE64 = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4MCIgaGVpZ2h0PSI3MjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEyODAiIGhlaWdodD0iNzIwIiBmaWxsPSIjMzc0MTUxIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSI0MCIgZmlsbD0iI2RlZGVkZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkltYWdlIFVubmF2YWlsYWJsZTwvdGV4dD48L3N2Zz4=';


const loadImage = (src: string): Promise<HTMLImageElement> => {
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


export const cancelFfmpeg = () => {
    isCancellationRequested = true;
    if (worker) {
        worker.postMessage({ type: 'cancel' });
        worker.terminate();
        worker = null;
    }
};

export const generateVideo = async (
    podcast: Podcast,
    audioBlob: Blob,
    onProgress: (progress: number, message: string) => void,
    log: (entry: Omit<LogEntry, 'timestamp'>) => void,
    manualDurations?: number[]
): Promise<Blob> => {
    isCancellationRequested = false;

    return new Promise(async (resolve, reject) => {
        try {
            onProgress(0.01, '1/5 Подготовка ресурсов...');

            const allGeneratedImages = podcast.chapters.flatMap(c => c.generatedImages || []);
            if (allGeneratedImages.length === 0) {
                return reject(new Error("Для генерации видео нет доступных изображений."));
            }

            log({ type: 'info', message: `Проверка доступности ${allGeneratedImages.length} изображений...` });
            const loadedImageResults = await Promise.allSettled(allGeneratedImages.map(img => loadImage(img.url)));

            const imageUrls: string[] = [];
            
            loadedImageResults.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    // FIX: Cast to any to bypass potential TS definition issue for 'src' property.
                    imageUrls.push((result.value as any).src);
                } else {
                    log({ type: 'warning', message: `Не удалось загрузить изображение ${index + 1}, используется placeholder.`, data: result.reason });
                    imageUrls.push(FALLBACK_PLACEHOLDER_BASE64);
                }
            });

            let totalDuration: number;
            let imageDurations: number[];

            if (manualDurations && manualDurations.length === imageUrls.length) {
                log({ type: 'info', message: `Используется ручной режим расстановки времени.` });
                imageDurations = manualDurations;
                totalDuration = imageDurations.reduce((sum, d) => sum + d, 0);
            } else {
                log({ type: 'info', message: `Используется автоматический режим расстановки времени.` });
                try {
                    // FIX: Cast to any to bypass potential TS definition issue for 'AudioContext' property.
                    const audioContext = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
                    const audioBuffer = await audioContext.decodeAudioData(await audioBlob.arrayBuffer());
                    totalDuration = audioBuffer.duration;
                    imageDurations = Array(imageUrls.length).fill(totalDuration / imageUrls.length);
                } catch (e) {
                    return reject(new Error(`Не удалось декодировать аудио: ${(e as Error).message}`));
                }
            }

            const srtBlob = await generateSrtFile(podcast, log);

            if (worker) {
                worker.terminate();
            }
            worker = new Worker(new URL('../ffmpeg.worker.ts', import.meta.url), { type: 'module' });
            
            worker.onmessage = (event) => {
                const { type, data } = event.data;
                switch (type) {
                    case 'progress':
                        onProgress(data.progress, data.message);
                        break;
                    case 'log':
                        log(data);
                        break;
                    case 'done':
                        resolve(data);
                        if(worker) {
                            worker.terminate();
                            worker = null;
                        }
                        break;
                    case 'error':
                        reject(new Error(data.message || 'Ошибка в FFmpeg Worker'));
                        if(worker) {
                            worker.terminate();
                            worker = null;
                        }
                        break;
                }
            };

            worker.onerror = (err) => {
                reject(new Error(`Worker error: ${err.message}`));
                if(worker) {
                    worker.terminate();
                    worker = null;
                }
            };

            const podcastData = {
                 selectedTitle: podcast.selectedTitle,
            };
            
            worker.postMessage({
                type: 'run',
                data: {
                    podcast: podcastData,
                    audioBlob,
                    srtBlob,
                    imageUrls,
                    imageDurations,
                    totalDuration
                }
            });
        } catch (e) {
            reject(e);
        }
    });
};