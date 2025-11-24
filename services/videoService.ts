import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { Podcast, Chapter, LogEntry } from '../types';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => null;

export const createVideoInBrowser = async (
    podcast: Podcast,
    log: LogFunction
): Promise<Blob> => {
    log({ type: 'info', message: '🎬 Инициализация браузерного FFmpeg...' });
    
    const ffmpeg = new FFmpeg();
    
    // Set up logging
    ffmpeg.on('log', ({ message }) => {
        console.log('[FFmpeg]', message);
    });
    
    ffmpeg.on('progress', ({ progress }) => {
        log({ 
            type: 'info', 
            message: `⏳ Прогресс сборки: ${(progress * 100).toFixed(0)}%` 
        });
    });
    
    // Load FFmpeg
    try {
        await ffmpeg.load();
        log({ type: 'info', message: '✅ FFmpeg загружен' });
    } catch (error) {
        throw new Error(`Не удалось загрузить FFmpeg: ${error}`);
    }

    try {
        // 1. Upload all audio files
        log({ type: 'info', message: '📁 Загрузка аудиофайлов...' });
        for (let i = 0; i < podcast.chapters.length; i++) {
            const chapter = podcast.chapters[i];
            if (chapter.audioBlob) {
                const audioName = `chapter_${i}.wav`;
                await ffmpeg.writeFile(audioName, await fetchFile(chapter.audioBlob));
                log({ type: 'info', message: `    ✅ Глава ${i + 1}: аудио загружено` });
            }
        }

        // 2. Upload all images
        log({ type: 'info', message: '🖼️ Загрузка изображений...' });
        for (let i = 0; i < podcast.chapters.length; i++) {
            const chapter = podcast.chapters[i];
            if (chapter.backgroundImages && chapter.backgroundImages.length > 0) {
                for (let j = 0; j < chapter.backgroundImages.length; j++) {
                    const img = chapter.backgroundImages[j];
                    let imageBlob: Blob;
                    
                    if (img.blob) {
                        imageBlob = img.blob;
                    } else if (img.url) {
                        // Fetch image from URL
                        const response = await fetch(img.url);
                        imageBlob = await response.blob();
                    } else {
                        log({ 
                            type: 'error', 
                            message: `    ❌ Глава ${i + 1}, изображение ${j + 1}: нет данных` 
                        });
                        continue;
                    }
                    
                    const imageName = `chapter_${i}_img_${j}.png`;
                    await ffmpeg.writeFile(imageName, await fetchFile(imageBlob));
                    log({ 
                        type: 'info', 
                        message: `    ✅ Глава ${i + 1}, изображение ${j + 1}: загружено` 
                    });
                }
            }
        }

        // 3. Create individual chapter videos
        log({ type: 'info', message: '🎥 Создание видео глав...' });
        for (let i = 0; i < podcast.chapters.length; i++) {
            const chapter = podcast.chapters[i];
            const imageCount = chapter.backgroundImages?.length || 1;
            
            if (!chapter.audioBlob) {
                log({ 
                    type: 'error', 
                    message: `    ❌ Глава ${i + 1}: нет аудио, пропускаем` 
                });
                continue;
            }

            try {
                // Create concat file for images
                const concatList = Array.from({ length: imageCount }, (_, j) => 
                    `file 'chapter_${i}_img_${j}.png'`
                ).join('\n');
                
                await ffmpeg.writeFile(`concat_${i}.txt`, concatList);

                // Calculate image duration (aim for 5-10 seconds per image)
                const audioDuration = 30; // Default estimate
                const imageDuration = Math.max(2, Math.min(10, audioDuration / imageCount));

                // Create chapter video
                await ffmpeg.exec([
                    '-f', 'concat',
                    '-safe', '0',
                    '-i', `concat_${i}.txt`,
                    '-i', `chapter_${i}.wav`,
                    '-c:v', 'libx264',
                    '-tune', 'stillimage',
                    '-r', '30',
                    '-c:a', 'aac',
                    '-b:a', '192k',
                    '-shortest',
                    '-pix_fmt', 'yuv420p',
                    `chapter_${i}.mp4`
                ]);

                log({ 
                    type: 'info', 
                    message: `    ✅ Глава ${i + 1}: видео создано` 
                });
            } catch (error) {
                log({ 
                    type: 'error', 
                    message: `    ❌ Глава ${i + 1}: ошибка создания видео - ${error}` 
                });
            }
        }

        // 4. Concatenate all chapters
        log({ type: 'info', message: '🔗 Объединение всех глав...' });
        
        // Create final concat file
        const finalConcat = podcast.chapters
            .filter((_, i) => podcast.chapters[i].audioBlob)
            .map((_, i) => `file 'chapter_${i}.mp4'`)
            .join('\n');
        
        await ffmpeg.writeFile('final_concat.txt', finalConcat);

        // Concatenate all videos
        await ffmpeg.exec([
            '-f', 'concat',
            '-safe', '0',
            '-i', 'final_concat.txt',
            '-c', 'copy',
            'final_video.mp4'
        ]);

        log({ type: 'info', message: '✅ Финальное видео создано' });

        // 5. Get the final video
        const data = await ffmpeg.readFile('final_video.mp4');
        const videoBlob = new Blob([data], { type: 'video/mp4' });
        
        log({ 
            type: 'info', 
            message: `🎉 Видео готово: ${(videoBlob.size / 1024 / 1024).toFixed(1)} MB` 
        });

        return videoBlob;

    } catch (error) {
        throw new Error(`Ошибка создания видео: ${error}`);
    }
};