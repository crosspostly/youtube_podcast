import { useEffect } from 'react';
import { usePodcastState } from './podcast/usePodcastState';
import { useProjectGeneration } from './podcast/useProjectGeneration';
import { useChapterGeneration } from './podcast/useChapterGeneration';
import { useAssetManagement } from './podcast/useAssetManagement';
import { useRegeneration } from './podcast/useRegeneration';
import { useThumbnailManagement } from './podcast/useThumbnailManagement';
import { useExport } from './podcast/useExport';
import { useQueue } from './podcast/useQueue';
import type { Podcast } from '../types';

export const usePodcast = (
    updateHistory: (podcast: Podcast) => void,
    defaultFont: string,
    devMode: boolean
) => {
    // 1. Core State Management
    const state = usePodcastState(updateHistory);
    const { podcast, setPodcast, log, setError, setLogs, setIsLoading, setLoadingStatus, setGenerationProgress, setPodcastState } = state;

    // 2. Project Creation Logic
    const generation = useProjectGeneration(log, setPodcast, setLoadingStatus, setGenerationProgress, defaultFont, devMode);

    // 3. Chapter Generation Logic (for continuous generation)
    const chapterGeneration = useChapterGeneration(
        podcast, setPodcast, state.isLoading,
        state.isGeneratingChapter, state.setIsGeneratingChapter,
        state.isGenerationPaused, log, devMode
    );
    
    // 4. Asset Management (Music, SFX)
    const assets = useAssetManagement(podcast, setPodcast, log, setError);

    // 5. Regeneration Logic
    const regeneration = useRegeneration(podcast, setPodcast, log, setError, generation.startNewProject, defaultFont, devMode);

    // 6. Thumbnail and Title Management
    const thumbnails = useThumbnailManagement(podcast, setPodcast);

    // 7. Exporting and Packaging Logic
    const exporting = useExport(podcast, log, setError, devMode);

    // 8. Queue Management (Content Factory)
    const queue = useQueue(state.isLoading, generation.createPodcastData, log, setError);

    // Effect to wire up audio URLs when chapters change
    useEffect(() => {
        const newUrls: Record<string, string> = {};
        podcast?.chapters.forEach(chapter => {
            if (chapter.audioBlob) {
                newUrls[chapter.id] = URL.createObjectURL(chapter.audioBlob);
            }
        });
        state.setAudioUrls(newUrls);
        return () => { Object.values(newUrls).forEach(url => URL.revokeObjectURL(url)); };
    }, [podcast?.chapters, state.setAudioUrls]);
    
    // UI-facing start function that wraps generation logic with UI state updates
    const startNewProjectUI = async (...args: Parameters<typeof generation.startNewProject>) => {
        setIsLoading(true);
        setError(null);
        setPodcastState(null);
        setLogs([]);
        setGenerationProgress(0);
        state.setIsGenerationPaused(false);
        try {
            await generation.startNewProject(...args);
        } catch (err: any) {
             setError(err.message || 'Произошла неизвестная ошибка.');
             log({ type: 'error', message: 'Критическая ошибка при инициализации проекта', data: err });
        } finally {
            setIsLoading(false);
        }
    };
    
    // Return a unified interface from all composed hooks
    return {
        ...state,
        ...assets,
        ...regeneration,
        ...thumbnails,
        ...exporting,
        ...queue,
        startNewProject: startNewProjectUI,
        startQuickTest: generation.startQuickTest,
        handleGenerateChapter: chapterGeneration.handleGenerateChapter,
    };
};
