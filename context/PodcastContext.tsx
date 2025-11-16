import React, { createContext, useContext } from 'react';
import { useHistory } from '../hooks/useHistory';
import { usePodcast } from '../hooks/usePodcast';
import type { Podcast, ImageMode, StockPhotoPreference } from '../types';

type UseHistoryReturn = ReturnType<typeof useHistory>;
type UsePodcastReturn = ReturnType<typeof usePodcast>;

interface PodcastContextType extends UseHistoryReturn, UsePodcastReturn {
    setPodcast: (podcast: Podcast | null) => void;
    apiKeys: { gemini: string; freesound: string; unsplash?: string; pexels?: string; };
    defaultFont: string; // Expose defaultFont in the context
    imageMode: ImageMode;
    warning: string | null;
    startAutomatedProject: (topic: string) => Promise<void>;
}

const PodcastContext = createContext<PodcastContextType | undefined>(undefined);

interface PodcastProviderProps {
    children: React.ReactNode;
    apiKeys: { 
        gemini: string; 
        freesound: string;
        unsplash?: string;
        pexels?: string;
    };
    defaultFont: string;
    imageMode: ImageMode;
    stockPhotoPreference?: StockPhotoPreference;
}

export const PodcastProvider: React.FC<PodcastProviderProps> = ({ 
    children, 
    apiKeys, 
    defaultFont, 
    imageMode, 
    stockPhotoPreference 
}) => {
    const historyHook = useHistory();
    const podcastHook = usePodcast(historyHook.updateHistoryWithPodcast, apiKeys, defaultFont, imageMode, stockPhotoPreference);

    const value = {
        ...historyHook,
        ...podcastHook,
        setPodcast: (podcast: Podcast | null) => {
            podcastHook.setPodcast(podcast);
            if(podcast) {
                historyHook.updateHistoryWithPodcast(podcast);
            }
        },
        apiKeys,
        defaultFont, // Add defaultFont to the context value
        imageMode,
    };

    return <PodcastContext.Provider value={value as PodcastContextType}>{children}</PodcastContext.Provider>;
};

export const usePodcastContext = () => {
    const context = useContext(PodcastContext);
    if (context === undefined) {
        throw new Error('usePodcastContext must be used within a PodcastProvider');
    }
    return context;
};