import React, { useEffect, useCallback } from 'react';
import { generateNextChapterScript } from '../../services/aiTextService';
import { findSfxForScript } from '../../services/sfxService';
import { findMusicManually } from '../../services/musicService';
import { generateStyleImages } from '../../services/imageService';
import { searchStockPhotos } from '../../services/stockPhotoService';
import { generateChapterAudio } from '../../services/aiAudioService';
import type { Podcast, Chapter, LogEntry } from '../../types';

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;
type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;

export const useChapterGeneration = (
    podcast: Podcast | null,
    setPodcast: (updater: React.SetStateAction<Podcast | null>) => void,
    isLoading: boolean,
    isGeneratingChapter: boolean,
    setIsGeneratingChapter: SetState<boolean>,
    isGenerationPaused: boolean,
    log: LogFunction,
    devMode: boolean
) => {
    const handleGenerateChapter = useCallback(async (chapterId: string) => {
        if (!podcast) return;
        const chapterIndex = podcast.chapters.findIndex(c => c.id === chapterId);
        if (chapterIndex === -1) return;

        const updateChapterState = (id: string, status: Chapter['status'], data: Partial<Omit<Chapter, 'id' | 'status'>> = {}) => {
            setPodcast(p => {
                if (!p) return null;
                const updatedChapters = p.chapters.map(c => c.id === id ? { ...c, status, ...data, error: data.error || undefined } : c);
                return { ...p, chapters: updatedChapters };
            });
        };
    
        try {
            updateChapterState(chapterId, 'script_generating');
            const chapterScriptData = await generateNextChapterScript(podcast.topic, podcast.selectedTitle, podcast.characters, podcast.chapters.slice(0, chapterIndex), chapterIndex, podcast.knowledgeBaseText || '', podcast.creativeFreedom, podcast.language, log);
            
            const populatedScript = await findSfxForScript(chapterScriptData.script, log);
            const musicTracks = chapterScriptData.musicSearchKeywords ? await findMusicManually(chapterScriptData.musicSearchKeywords, log) : [];
            const backgroundMusic = musicTracks.length > 0 ? musicTracks[0] : undefined;
            
            updateChapterState(chapterId, 'audio_generating', { script: populatedScript, title: chapterScriptData.title, backgroundMusic });
            
            const chapterVisuals = chapterScriptData.visualSearchPrompts || [podcast.topic];
            const chapterImagesPromise = podcast.imageSource === 'ai'
                 ? generateStyleImages(chapterVisuals, podcast.initialImageCount, log, devMode)
                 : searchStockPhotos(chapterVisuals[0] || podcast.topic, log);

            const [audioBlob, chapterImages] = await Promise.all([
                 generateChapterAudio(populatedScript, podcast.narrationMode, podcast.characterVoices, podcast.monologueVoice, log),
                 chapterImagesPromise
            ]);

            updateChapterState(chapterId, 'completed', { audioBlob, images: chapterImages, visualSearchPrompts: chapterScriptData.visualSearchPrompts });

        } catch (err: any) {
            const errorMessage = err.message || 'Неизвестная ошибка при генерации главы.';
            log({type: 'error', message: `Ошибка при генерации главы ${chapterIndex + 1}`, data: err});
            updateChapterState(chapterId, 'error', { error: errorMessage });
        }
    }, [podcast, setPodcast, log, devMode]);

    useEffect(() => {
        const pendingChapter = podcast?.chapters.find(c => c.status === 'pending');
        if (pendingChapter && !isLoading && !isGeneratingChapter && !isGenerationPaused) {
            setIsGeneratingChapter(true);
            handleGenerateChapter(pendingChapter.id).finally(() => setIsGeneratingChapter(false));
        }
    }, [podcast?.chapters, isLoading, isGeneratingChapter, isGenerationPaused, handleGenerateChapter, setIsGeneratingChapter]);

    return { handleGenerateChapter };
};
