import { useState, useCallback, useEffect } from 'react';
import type { Podcast, LogEntry } from '../types';

const log = (entry: Omit<LogEntry, 'timestamp'>) => {
    // In a real app, this should be connected to a proper logging context/service.
    console.log(`[${entry.type}] ${entry.message}`, entry.data || '');
};


export const useHistory = () => {
    const [history, setHistory] = useState<Podcast[]>([]);
    const [saveMediaInHistory, setSaveMediaInHistory] = useState<boolean>(false);

    useEffect(() => {
        try {
            const storedHistory = localStorage.getItem('podcastHistory');
            if (storedHistory) {
                setHistory(JSON.parse(storedHistory));
            }
        } catch (e) {
            console.error("Failed to load history from localStorage", e);
        }
    }, []);

    const updateHistoryWithPodcast = useCallback((podcastToSave: Podcast) => {
        // This function will be the one updating localStorage
        const updateLocalStorage = (newHistory: Podcast[]) => {
            const serializableHistory = newHistory.map(p => {
                // Destructure to remove media properties.
                const { chapters, youtubeThumbnails, thumbnailBaseImage, ...podcastRest } = p;
                
                const serializablePodcast: any = { ...podcastRest };
        
                // Process chapters: ALWAYS remove audioBlob and generatedImages to prevent storage overflow.
                serializablePodcast.chapters = chapters.map(({ audioBlob, generatedImages, ...chapterRest }) => {
                    return chapterRest;
                });
        
                return serializablePodcast;
            });
        
            try {
                localStorage.setItem('podcastHistory', JSON.stringify(serializableHistory));
            } catch (e: any) {
                log({ type: 'error', message: 'Ошибка localStorage: хранилище переполнено.', data: e });
                
                // If quota is still exceeded after stripping media, prune the history.
                if (e.name === 'QuotaExceededError' && newHistory.length > 1) {
                    log({ type: 'warning', message: 'Хранилище переполнено даже без медиа. Удаление старейшего проекта из истории...' });
                    updateLocalStorage(newHistory.slice(0, newHistory.length - 1)); // Recursive call
                }
            }
        };

        setHistory(prevHistory => {
            // Remove the old version if it exists and add the new one to the top
            const otherHistory = prevHistory.filter(p => p.id !== podcastToSave.id);
            const newHistory = [podcastToSave, ...otherHistory];
            updateLocalStorage(newHistory);
            return newHistory;
        });
    }, []);
    
    const clearHistory = () => {
        setHistory([]);
        localStorage.removeItem('podcastHistory');
    };

    return {
        history,
        setHistory, // Exposing setter for loading from history
        updateHistoryWithPodcast,
        clearHistory,
        saveMediaInHistory,
        setSaveMediaInHistory
    };
};