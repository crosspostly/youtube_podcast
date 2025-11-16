import React, { createContext, useContext } from 'react';
import { useHistory } from '../hooks/useHistory';
import { usePodcast } from '../hooks/usePodcast';
import type { Podcast, ImageMode, StockPhotoPreference, ApiKeys } from '../types';

type UseHistoryReturn = ReturnType<typeof useHistory>;
type UsePodcastReturn = ReturnType<typeof usePodcast>;

// FIX: Cleaned up type by removing redundant properties (`warning`, `startAutomatedProject`)
// that are already inherited from `UsePodcastReturn`. This makes the type definition
// accurate and prevents mismatches between the type and the actual context value.
type PodcastContextType = UseHistoryReturn & Omit<UsePodcastReturn, 'setPodcast'> & {
    setPodcast: (podcast: Podcast | null) => void;
    apiKeys: ApiKeys;
    defaultFont: string;
    imageMode: ImageMode;
};

const PodcastContext = createContext<PodcastContextType | undefined>(undefined);

interface PodcastProviderProps {
    children: React.ReactNode;
    apiKeys: ApiKeys;
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

    return <PodcastContext.Provider value={value as any}>{children}</PodcastContext.Provider>;
};

export const usePodcastContext = () => {
    const context = useContext(PodcastContext);
    if (context === undefined) {
        throw new Error('usePodcastContext must be used within a PodcastProvider');
    }
    return context;
};