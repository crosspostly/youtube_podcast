import React, { useState, useCallback } from 'react';
import type { Podcast, LogEntry, YoutubeThumbnail } from '../../types';

export const usePodcastState = (updateHistory: (podcast: Podcast) => void) => {
    const [podcast, setPodcastState] = useState<Podcast | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [loadingStatus, setLoadingStatus] = useState<{ label: string; status: 'pending' | 'in_progress' | 'completed' | 'error'; }[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [generationProgress, setGenerationProgress] = useState(0);
    const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
    const [isGeneratingChapter, setIsGeneratingChapter] = useState(false);
    const [isGenerationPaused, setIsGenerationPaused] = useState(false);
    const [editingThumbnail, setEditingThumbnail] = useState<YoutubeThumbnail | null>(null);

    const setPodcast = useCallback((updater: React.SetStateAction<Podcast | null>) => {
        setPodcastState(prev => {
            const newState = typeof updater === 'function' ? updater(prev) : updater;
            if (newState) {
                updateHistory(newState);
            }
            return newState;
        });
    }, [updateHistory]);

    const log = useCallback((entry: Omit<LogEntry, 'timestamp'>) => {
        setLogs(prev => [{ ...entry, timestamp: new Date().toISOString() }, ...prev]);
    }, []);

    return {
        podcast, setPodcast, setPodcastState,
        isLoading, setIsLoading,
        loadingStatus, setLoadingStatus,
        error, setError,
        logs, log, setLogs,
        generationProgress, setGenerationProgress,
        audioUrls, setAudioUrls,
        isGeneratingChapter, setIsGeneratingChapter,
        isGenerationPaused, setIsGenerationPaused,
        editingThumbnail, setEditingThumbnail,
    };
};
