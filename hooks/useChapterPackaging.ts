// hooks/useChapterPackaging.ts
import { useState, useCallback } from 'react';
import type { Podcast, LogEntry } from '../types';
import { packageProjectByChapters } from '../services/chapterPackager';

interface UseChapterPackagingResult {
    isPackaging: boolean;
    packagingProgress: string;
    packageError: string | null;
    packageLogs: LogEntry[];
    downloadProjectByChapters: (podcast: Podcast) => Promise<void>;
    clearPackagingLogs: () => void;
}

/**
 * Hook for packaging and downloading podcast project organized by chapters
 * This creates a ZIP with improved structure where each chapter is self-contained
 */
export const useChapterPackaging = (): UseChapterPackagingResult => {
    const [isPackaging, setIsPackaging] = useState(false);
    const [packagingProgress, setPackagingProgress] = useState('');
    const [packageError, setPackageError] = useState<string | null>(null);
    const [packageLogs, setPackageLogs] = useState<LogEntry[]>([]);

    const addLog = useCallback((entry: Omit<LogEntry, 'timestamp'>) => {
        const logEntry: LogEntry = {
            ...entry,
            timestamp: new Date().toISOString()
        };
        setPackageLogs(prev => [...prev, logEntry]);
        
        // Update progress message for user
        if (entry.type === 'info') {
            setPackagingProgress(entry.message);
        }
    }, []);

    const clearPackagingLogs = useCallback(() => {
        setPackageLogs([]);
        setPackageError(null);
        setPackagingProgress('');
    }, []);

    const downloadProjectByChapters = useCallback(async (podcast: Podcast) => {
        setIsPackaging(true);
        setPackageError(null);
        setPackageLogs([]);
        setPackagingProgress('Начало упаковки проекта...');

        try {
            // Validate podcast has required data
            if (!podcast.chapters || podcast.chapters.length === 0) {
                throw new Error('Проект не содержит глав');
            }

            const missingAudio = podcast.chapters.filter(ch => !ch.audioBlob);
            if (missingAudio.length > 0) {
                throw new Error(`У ${missingAudio.length} глав отсутствует аудио`);
            }

            addLog({ 
                type: 'info', 
                message: `Упаковка проекта: "${podcast.selectedTitle || podcast.topic}"` 
            });
            addLog({ 
                type: 'info', 
                message: `Всего глав: ${podcast.chapters.length}` 
            });

            // Package project by chapters
            const zipBlob = await packageProjectByChapters(podcast, addLog);

            // Generate filename
            const sanitizedTitle = (podcast.selectedTitle || podcast.topic)
                .replace(/[^\w\s-]/g, '')
                .replace(/\s+/g, '_')
                .substring(0, 50);
            
            const timestamp = new Date().toISOString().split('T')[0];
            const filename = `${sanitizedTitle}_${timestamp}_chapters.zip`;

            // Download
            setPackagingProgress('Скачивание архива...');
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            addLog({ 
                type: 'info', 
                message: `✅ Архив скачан: ${filename}` 
            });
            setPackagingProgress('Готово!');

        } catch (error: any) {
            const errorMessage = error.message || 'Неизвестная ошибка';
            setPackageError(errorMessage);
            addLog({ 
                type: 'error', 
                message: `❌ Ошибка упаковки: ${errorMessage}`,
                data: error
            });
            setPackagingProgress('Ошибка упаковки');
        } finally {
            setIsPackaging(false);
        }
    }, [addLog]);

    return {
        isPackaging,
        packagingProgress,
        packageError,
        packageLogs,
        downloadProjectByChapters,
        clearPackagingLogs
    };
};
