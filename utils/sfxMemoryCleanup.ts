// utils/sfxMemoryCleanup.ts
import type { Podcast, ScriptLine, SoundEffect } from '../types';

/**
 * Очищает blob'ы SFX из памяти для предотвращения утечек.
 * @param podcast Подкаст для очистки
 * @returns Количество очищенных blob'ов
 */
export const cleanupSfxBlobs = (podcast: Podcast): number => {
    let cleanedCount = 0;
    let totalSizeMB = 0;

    // Очистка blob'ов в ScriptLine
    podcast.chapters.forEach(chapter => {
        chapter.script.forEach(line => {
            if (line.soundEffectBlob) {
                const sizeMB = line.soundEffectBlob.size / (1024 * 1024);
                totalSizeMB += sizeMB;
                line.soundEffectBlob = undefined;
                line.soundEffectDownloaded = false;
                cleanedCount++;
                console.log(`🧹 Cleaned SFX blob from line: ${line.text.substring(0, 30)}... (${sizeMB.toFixed(2)}MB)`);
            }
        });
    });

    // Очистка blob'ов в SoundEffect
    podcast.chapters.forEach(chapter => {
        chapter.script.forEach(line => {
            if (line.soundEffect?.blob) {
                const sizeMB = line.soundEffect.blob.size / (1024 * 1024);
                totalSizeMB += sizeMB;
                line.soundEffect.blob = undefined;
                line.soundEffect.downloaded = false;
                cleanedCount++;
                console.log(`🧹 Cleaned SoundEffect blob: ${line.soundEffect.name} (${sizeMB.toFixed(2)}MB)`);
            }
        });
    });

    console.log(`🧹 SFX Memory Cleanup: ${cleanedCount} blobs cleared, ${totalSizeMB.toFixed(2)}MB freed`);
    return cleanedCount;
};

/**
 * Очищает blob'ы только для конкретной главы.
 * @param chapter Глава для очистки
 * @returns Количество очищенных blob'ов
 */
export const cleanupChapterSfxBlobs = (chapter: any): number => {
    let cleanedCount = 0;
    let totalSizeMB = 0;

    chapter.script?.forEach((line: ScriptLine) => {
        if (line.soundEffectBlob) {
            const sizeMB = line.soundEffectBlob.size / (1024 * 1024);
            totalSizeMB += sizeMB;
            line.soundEffectBlob = undefined;
            line.soundEffectDownloaded = false;
            cleanedCount++;
        }

        if (line.soundEffect?.blob) {
            const sizeMB = line.soundEffect.blob.size / (1024 * 1024);
            totalSizeMB += sizeMB;
            line.soundEffect.blob = undefined;
            line.soundEffect.downloaded = false;
            cleanedCount++;
        }
    });

    console.log(`🧹 Chapter SFX Cleanup: ${cleanedCount} blobs cleared, ${totalSizeMB.toFixed(2)}MB freed`);
    return cleanedCount;
};

/**
 * Получает статистику использования памяти SFX blob'ами.
 * @param podcast Подкаст для анализа
 * @returns Статистика использования памяти
 */
export const getSfxMemoryStats = (podcast: Podcast): { count: number; sizeMB: number; details: Array<{name: string; sizeMB: number}> } => {
    let count = 0;
    let totalSizeMB = 0;
    const details: Array<{name: string; sizeMB: number}> = [];

    podcast.chapters.forEach(chapter => {
        chapter.script.forEach(line => {
            if (line.soundEffectBlob) {
                const sizeMB = line.soundEffectBlob.size / (1024 * 1024);
                count++;
                totalSizeMB += sizeMB;
                details.push({
                    name: line.text.substring(0, 30) || 'Unknown',
                    sizeMB
                });
            }

            if (line.soundEffect?.blob) {
                const sizeMB = line.soundEffect.blob.size / (1024 * 1024);
                count++;
                totalSizeMB += sizeMB;
                details.push({
                    name: line.soundEffect.name,
                    sizeMB
                });
            }
        });
    });

    return { count, sizeMB: totalSizeMB, details };
};

/**
 * Принудительная сборка мусора если доступна.
 */
export const forceGarbageCollection = () => {
    if (typeof window !== 'undefined' && (window as any).gc) {
        (window as any).gc();
        console.log('🗑️ Forced garbage collection');
    }
};