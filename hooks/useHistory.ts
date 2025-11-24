
import { useState, useCallback, useEffect } from 'react';
import type { Podcast, LogEntry } from '../types';

const log = (entry: Omit<LogEntry, 'timestamp'>) => {
    console.log(`[${entry.type}] ${entry.message}`, entry.data || '');
};

export const useHistory = () => {
    const [history, setHistory] = useState<Podcast[]>([]);
    // We disable saving media by default and effectively enforce it to prevent app crashes
    const [saveMediaInHistory, setSaveMediaInHistory] = useState<boolean>(false);

    useEffect(() => {
        try {
            const storedHistory = localStorage.getItem('podcastHistory');
            if (storedHistory) {
                setHistory(JSON.parse(storedHistory));
            }
        } catch (e) {
            console.error("Failed to load history from localStorage", e);
            // If loading fails (likely due to corruption or size), clear it to restore app functionality
            localStorage.removeItem('podcastHistory');
        }
    }, []);

    const updateHistoryWithPodcast = useCallback((podcastToSave: Podcast) => {
        const updateLocalStorage = (newHistory: Podcast[]) => {
            // Create a lightweight version of the history for localStorage
            const serializableHistory = newHistory.map(p => {
                const { chapters, ...podcastRest } = p;
                
                // Deep clean the podcast object to remove all Blob and Base64 image data
                const serializablePodcast: any = {
                    ...podcastRest,
                    chapters: chapters.map((chapter) => {
                         // Destructure to separate heavy assets from metadata
                         const { audioBlob, images, backgroundImages, ...chapterRest } = chapter;
                         
                         // Return only metadata. 
                         // We deliberately DO NOT save images/blobs to localStorage anymore.
                         // Saving 3MB+ strings crashes the browser storage reliably.
                         return { 
                             ...chapterRest,
                             // Keep generatedImages array only if it contains URLs (not base64), 
                             // but usually for AI gen it's base64/blob, so we strip it.
                             // We can keep 'images' if they are short URLs, but to be safe we strip.
                         };
                    })
                };
        
                // Explicitly remove top-level heavy assets
                delete serializablePodcast.generatedImages;
                delete serializablePodcast.youtubeThumbnails;
                delete serializablePodcast.designConcepts; 
        
                return serializablePodcast;
            });
        
            try {
                const jsonString = JSON.stringify(serializableHistory);
                // Check size before saving (approximate)
                if (jsonString.length > 4500000) {
                    log({ type: 'error', message: 'Внимание: История слишком велика для сохранения. Старые проекты могут быть удалены.' });
                    // In a real app, we would implement LRU eviction here.
                }
                localStorage.setItem('podcastHistory', jsonString);
            } catch (e) {
                // This is the specific fix for the user's "files > 1mb" error
                log({ type: 'error', message: 'Ошибка сохранения истории: превышен лимит хранилища браузера. Медиа-файлы не сохранены.', data: e });
            }
        };

        setHistory(prevHistory => {
            const otherHistory = prevHistory.filter(p => p.id !== podcastToSave.id);
            const newHistory = [podcastToSave, ...otherHistory];
            
            // Limit history to last 10 items to prevent creeping growth
            const trimmedHistory = newHistory.slice(0, 10);
            
            updateLocalStorage(trimmedHistory);
            return trimmedHistory;
        });
    }, []);
    
    const clearHistory = () => {
        setHistory([]);
        localStorage.removeItem('podcastHistory');
    };

    return {
        history,
        setHistory, 
        updateHistoryWithPodcast,
        clearHistory,
        saveMediaInHistory,
        setSaveMediaInHistory
    };
};
