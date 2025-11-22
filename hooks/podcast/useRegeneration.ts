import React, { useState } from 'react';
import { regenerateTextAssets } from '../../services/aiTextService';
import { generateStyleImages, generateYoutubeThumbnails } from '../../services/imageService';
import { generateChapterAudio } from '../../services/aiAudioService';
import type { Podcast, LogEntry, NarrationMode } from '../../types';

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;
type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;

type StartNewProjectFunc = (
    topic: string, 
    knowledgeBaseText: string, 
    creativeFreedom: boolean, 
    language: string, 
    totalDurationMinutes: number, 
    narrationMode: NarrationMode, 
    characterVoices: { [key: string]: string }, 
    monologueVoice: string, 
    initialImageCount: number,
    imageSource: 'ai' | 'stock'
) => void;

export const useRegeneration = (
    podcast: Podcast | null,
    setPodcast: (updater: React.SetStateAction<Podcast | null>) => void,
    log: LogFunction,
    setError: SetState<string | null>,
    startNewProject: StartNewProjectFunc,
    defaultFont: string,
    devMode: boolean
) => {
    const [isRegeneratingText, setIsRegeneratingText] = useState(false);
    const [isRegeneratingImages, setIsRegeneratingImages] = useState(false);
    const [isRegeneratingAudio, setIsRegeneratingAudio] = useState(false);

    const regenerateProject = () => {
        if (!podcast) return;
        if (window.confirm("Вы уверены, что хотите полностью пересоздать этот проект?")) {
            startNewProject(podcast.topic, podcast.knowledgeBaseText || '', podcast.creativeFreedom, podcast.language, podcast.totalDurationMinutes, podcast.narrationMode, podcast.characterVoices, podcast.monologueVoice, podcast.initialImageCount, podcast.imageSource);
        }
    };

    const regenerateText = async () => {
        if (!podcast) return;
        setIsRegeneratingText(true);
        try {
            const newTextAssets = await regenerateTextAssets(podcast.topic, podcast.creativeFreedom, podcast.language, log);
            const newSelectedTitle = newTextAssets.youtubeTitleOptions[0] || podcast.selectedTitle;
            setPodcast(p => p ? { ...p, ...newTextAssets, selectedTitle: newSelectedTitle, thumbnailText: newSelectedTitle } : null);
        } catch (err: any) {
            setError(err.message || 'Ошибка при обновлении текста.');
            log({ type: 'error', message: 'Ошибка при регенерации текста', data: err });
        } finally {
            setIsRegeneratingText(false);
        }
    };
    
    const regenerateImages = async () => {
        if (!podcast || !podcast.chapters[0]) return;
        setIsRegeneratingImages(true);
        try {
            const chapterVisuals = podcast.chapters[0].visualSearchPrompts || [podcast.topic];
            const newImages = await generateStyleImages(chapterVisuals, podcast.initialImageCount, log, devMode);
            
            setPodcast(p => {
                 if(!p) return null;
                 const updatedChapters = [...p.chapters];
                 updatedChapters[0] = {...updatedChapters[0], images: newImages };
                 return { ...p, chapters: updatedChapters };
            });
            
            if (newImages.length > 0 && podcast.designConcepts) {
                 const newThumbnails = await generateYoutubeThumbnails(newImages[0], podcast.thumbnailText, podcast.designConcepts, log, defaultFont);
                 setPodcast(p => p ? { ...p, youtubeThumbnails: newThumbnails } : null);
            }
        } catch (err: any) {
            setError(err.message || 'Ошибка при генерации изображений.');
            log({ type: 'error', message: 'Ошибка при регенерации изображений', data: err });
        } finally {
            setIsRegeneratingImages(false);
        }
    };

    const regenerateAllAudio = async () => {
        if (!podcast) return;
        setIsRegeneratingAudio(true);
        log({ type: 'info', message: 'Начало переозвучки всех глав.' });
        for (const chapter of podcast.chapters) {
            if (chapter.script && chapter.script.length > 0) {
                setPodcast(p => p ? { ...p, chapters: p.chapters.map(c => c.id === chapter.id ? { ...c, status: 'audio_generating' } : c) } : p);
                try {
                    const audioBlob = await generateChapterAudio(chapter.script, podcast.narrationMode, podcast.characterVoices, podcast.monologueVoice, log);
                    setPodcast(p => p ? { ...p, chapters: p.chapters.map(c => c.id === chapter.id ? { ...c, status: 'completed', audioBlob } : c) } : p);
                } catch (err: any) {
                    log({ type: 'error', message: `Ошибка при переозвучке главы ${chapter.title}`, data: err });
                    setPodcast(p => p ? { ...p, chapters: p.chapters.map(c => c.id === chapter.id ? { ...c, status: 'error', error: err.message || 'Ошибка озвучки' } : c) } : p);
                }
            }
        }
        log({ type: 'info', message: 'Переозвучка всех глав завершена.' });
        setIsRegeneratingAudio(false);
    };

    return {
        isRegeneratingText, isRegeneratingImages, isRegeneratingAudio,
        regenerateProject, regenerateText, regenerateImages, regenerateAllAudio,
    };
};
