import type { Podcast, GeneratedImage } from '../types';

/**
 * Подсчитывает примерный размер base64 строки в МБ
 */
const estimateBase64Size = (base64Url: string): number => {
    if (!base64Url || !base64Url.startsWith('data:image')) return 0;
    
    // Убираем data:image/...;base64, префикс
    const base64Data = base64Url.split(',')[1] || '';
    
    // Размер в байтах (base64 на ~33% больше оригинала)
    const sizeBytes = (base64Data.length * 3) / 4;
    
    // Конвертируем в МБ
    return sizeBytes / (1024 * 1024);
};

/**
 * Очищает base64-изображения из памяти для одной GeneratedImage
 */
const cleanupGeneratedImage = (img: GeneratedImage): number => {
    if (!img.url || !img.url.startsWith('data:image')) return 0;
    
    const sizeMB = estimateBase64Size(img.url);
    
    // Удаляем base64, оставляем метаданные (photographer, source, license)
    img.url = '';
    
    return sizeMB;
};

/**
 * Очищает все base64-изображения из podcast после генерации видео
 * @returns Количество освобождённых МБ памяти
 */
export const cleanupPodcastImages = (podcast: Podcast): number => {
    let totalCleaned = 0;
    
    // Очистка изображений в главах
    podcast.chapters.forEach(chapter => {
        if (chapter.generatedImages && chapter.generatedImages.length > 0) {
            chapter.generatedImages.forEach(img => {
                totalCleaned += cleanupGeneratedImage(img);
            });
        }
    });
    
    // Очистка thumbnail
    if (podcast.thumbnailBaseImage?.url?.startsWith('data:image')) {
        totalCleaned += estimateBase64Size(podcast.thumbnailBaseImage.url);
        podcast.thumbnailBaseImage.url = '';
    }
    
    // Очистка youtubeThumbnails (если массив)
    if (podcast.youtubeThumbnails && podcast.youtubeThumbnails.length > 0) {
        podcast.youtubeThumbnails.forEach(thumb => {
            if (thumb.dataUrl?.startsWith('data:image')) {
                totalCleaned += estimateBase64Size(thumb.dataUrl);
                thumb.dataUrl = '';
            }
        });
    }
    
    return totalCleaned;
};

/**
 * Принудительный вызов garbage collector (если доступен)
 * Работает только в некоторых окружениях с флагом --expose-gc
 */
export const forceGarbageCollection = () => {
    if (typeof (global as any).gc === 'function') {
        (global as any).gc();
    } else if (typeof (window as any).gc === 'function') {
        (window as any).gc();
    }
};
