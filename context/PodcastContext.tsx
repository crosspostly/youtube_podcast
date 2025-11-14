import React, { createContext, useContext } from 'react';
import { useHistory } from '../hooks/useHistory';
import { usePodcast } from '../hooks/usePodcast';
import type { Podcast, ImageMode } from '../types';

type UseHistoryReturn = ReturnType<typeof useHistory>;
type UsePodcastReturn = ReturnType<typeof usePodcast>;

interface PodcastContextType extends UseHistoryReturn, UsePodcastReturn {
    setPodcast: (podcast: Podcast | null) => void;
    apiKeys: { gemini: string; openRouter: string; freesound: string; unsplash?: string; pexels?: string; };
    defaultFont: string; // Expose defaultFont in the context
    imageMode: ImageMode;
    warning: string | null;
}

const PodcastContext = createContext<PodcastContextType | undefined>(undefined);

interface PodcastProviderProps {
    children: React.ReactNode;
    apiKeys: { gemini: string; openRouter: string; freesound: string; unsplash?: string; pexels?: string; };
    defaultFont: string;
    imageMode: ImageMode;
}

export const PodcastProvider: React.FC<PodcastProviderProps> = ({ children, apiKeys, defaultFont, imageMode }) => {
    const historyHook = useHistory();
    const podcastHook = usePodcast(historyHook.updateHistoryWithPodcast, apiKeys, defaultFont, imageMode);

    const value = {
        ...historyHook,
        ...podcastHook,
        setPodcast: (podcast: Podcast | null) => {
            podcastHook.setPodcastState(podcast);
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