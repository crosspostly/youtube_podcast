import React, { createContext, useContext } from 'react';
import { useHistory } from '../hooks/useHistory';
import { usePodcast } from '../hooks/usePodcast';
import type { Podcast } from '../types';

// This helper function combines the hooks and ensures their states are linked.
const useCombinedState = (defaultFont: string) => {
    const historyHook = useHistory();
    const podcastHook = usePodcast(historyHook.updateHistoryWithPodcast, defaultFont);

    // This override ensures history is always updated when the podcast state is set from any component.
    const setPodcast = (podcast: Podcast | null) => {
        podcastHook.setPodcastState(podcast);
        if(podcast) {
            historyHook.updateHistoryWithPodcast(podcast);
        }
    };
    
    // The history hook's setHistory is renamed to avoid conflicts with podcast's setter.
    // It's used for loading a full podcast object from the history list.
    const setPodcastInHistory = (podcast: Podcast | null) => {
        setPodcast(podcast);
    };

    return {
        ...historyHook,
        ...podcastHook,
        setPodcast: setPodcastInHistory,
    };
}

// By inferring the type from the combined hook, we ensure that any new function or state
// is automatically available in the context without manual type updates. This prevents crashes.
type PodcastContextType = ReturnType<typeof useCombinedState>;

const PodcastContext = createContext<PodcastContextType | undefined>(undefined);

interface PodcastProviderProps {
    children: React.ReactNode;
    defaultFont: string;
}

export const PodcastProvider: React.FC<PodcastProviderProps> = ({ children, defaultFont }) => {
    const value = useCombinedState(defaultFont);
    return <PodcastContext.Provider value={value}>{children}</PodcastContext.Provider>;
};

export const usePodcastContext = () => {
    const context = useContext(PodcastContext);
    if (context === undefined) {
        throw new Error('usePodcastContext must be used within a PodcastProvider');
    }
    return context;
};