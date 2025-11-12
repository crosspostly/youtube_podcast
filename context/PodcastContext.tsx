import React, { createContext, useContext } from 'react';
import { useHistory } from '../hooks/useHistory';
import { usePodcast } from '../hooks/usePodcast';
import type { Podcast } from '../types';

type UseHistoryReturn = ReturnType<typeof useHistory>;
type UsePodcastReturn = ReturnType<typeof usePodcast>;

interface PodcastContextType extends UseHistoryReturn, UsePodcastReturn {
    setPodcast: (podcast: Podcast | null) => void;
    apiKeys: { gemini: string; openRouter: string; freesound: string; };
    defaultFont: string; // Expose defaultFont in the context
}

const PodcastContext = createContext<PodcastContextType | undefined>(undefined);

interface PodcastProviderProps {
    children: React.ReactNode;
    apiKeys: { gemini: string; openRouter: string; freesound: string; };
    defaultFont: string;
}

export const PodcastProvider: React.FC<PodcastProviderProps> = ({ children, apiKeys, defaultFont }) => {
    const historyHook = useHistory();
    const podcastHook = usePodcast(historyHook.updateHistoryWithPodcast, apiKeys, defaultFont);

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