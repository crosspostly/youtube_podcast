

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
                const { chapters, ...podcastRest } = p;
                
                // Start with a base object that excludes large or non-serializable top-level fields
                const serializablePodcast: any = { ...podcastRest };
        
                // Process chapters: always remove audioBlob, conditionally remove generatedImages
                serializablePodcast.chapters = chapters.map(({ audioBlob, generatedImages, ...chapterRest }) => {
                    if (saveMediaInHistory) {
                        return { generatedImages, ...chapterRest }; // Keep images
                    }
                    return chapterRest; // Discard images
                });
        
                // Conditionally remove top-level thumbnails
                if (!saveMediaInHistory) {
                    delete serializablePodcast.youtubeThumbnails;
                }
        
                return serializablePodcast;
            });
        
            try {
                localStorage.setItem('podcastHistory', JSON.stringify(serializableHistory));
            } catch (e) {
                log({ type: 'error', message: 'Ошибка localStorage: хранилище переполнено.', data: e });
            }
        };

        setHistory(prevHistory => {
            // Remove the old version if it exists and add the new one to the top
            const otherHistory = prevHistory.filter(p => p.id !== podcastToSave.id);
            const newHistory = [podcastToSave, ...otherHistory];
            updateLocalStorage(newHistory);
            return newHistory;
        });
    }, [saveMediaInHistory]);
    
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