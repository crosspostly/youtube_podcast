
import React, { useEffect, useCallback } from 'react';
import { generateNextChapterScript } from '../../services/aiTextService';
import { findSfxForScript } from '../../services/sfxService';
import { findMusicManually } from '../../services/musicService';
import { generateStyleImages } from '../../services/imageService';
import { searchStockPhotos } from '../../services/stockPhotoService';
import { generateChapterAudio } from '../../services/aiAudioService';
import type { Podcast, Chapter, LogEntry, BackgroundImage, SfxTiming } from '../../types';

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;
type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;

const CHARS_PER_SECOND_SFX = 15;

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
            
            // Save initial script state
            updateChapterState(chapterId, 'audio_generating', { script: chapterScriptData.script, title: chapterScriptData.title });
            
            // Start image generation promise
            const chapterVisuals = chapterScriptData.visualSearchPrompts || [podcast.topic];
            const chapterImagesPromise = podcast.imageSource === 'ai'
                 ? generateStyleImages(chapterVisuals, podcast.initialImageCount, log, devMode)
                 : searchStockPhotos(chapterVisuals[0] || podcast.topic, log);
            
            // ✅ ПАРАЛЛЕЛЬНО: SFX обработка и генерация изображений
            log({ type: 'info', message: `⚡ Параллельный поиск SFX и генерация картинок...` });
            
            const [populatedScript, chapterImages] = await Promise.all([
                findSfxForScript(chapterScriptData.script, log),
                chapterImagesPromise
            ]);

            // Calculate SFX Timings immediately
            const sfxTimings: SfxTiming[] = [];
            let currentTime = 0;
            const sanitizeFileNameForSfx = (name: string) => (name || "").replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').toLowerCase().substring(0, 50);

            for (const line of populatedScript) {
                if (line.speaker.toUpperCase() === 'SFX' && line.soundEffect) {
                    sfxTimings.push({
                        name: line.soundEffect.name,
                        startTime: Math.round(currentTime * 100) / 100,
                        duration: Math.min(3, (line.text.length / 50) || 2),
                        volume: line.soundEffectVolume ?? 0.7,
                        filePath: `sfx/${sanitizeFileNameForSfx(line.soundEffect.name)}.wav`
                    });
                    log({ type: 'info', message: `🔊 SFX timing: "${line.soundEffect.name}" @ ${currentTime.toFixed(2)}s` });
                }
                if (line.text && line.speaker.toUpperCase() !== 'SFX') {
                    currentTime += (line.text.length / CHARS_PER_SECOND_SFX);
                }
            }
            log({ type: 'info', message: `✅ Собрано ${sfxTimings.length} SFX-таймингов для metadata` });
            
            const musicTracks = chapterScriptData.musicSearchKeywords ? await findMusicManually(chapterScriptData.musicSearchKeywords, log) : [];
            const backgroundMusic = musicTracks.length > 0 ? musicTracks[0] : undefined;
            
            // Save sfxTimings and images here
            updateChapterState(chapterId, 'audio_generating', { script: populatedScript, title: chapterScriptData.title, backgroundMusic, sfxTimings });

            // Generate audio (now that we have the populated script with SFX)
            const audioBlob = await generateChapterAudio(populatedScript, podcast.narrationMode, podcast.characterVoices, podcast.monologueVoice, log);

            let chapterUpdate: Partial<Omit<Chapter, 'id'|'status'>> = { audioBlob, visualSearchPrompts: chapterScriptData.visualSearchPrompts };

            if (podcast.imageSource === 'ai') {
                // Explicitly save backgroundImages with blobs
                chapterUpdate.backgroundImages = chapterImages as BackgroundImage[];
                log({ type: 'info', message: `📸 After generation: backgroundImages[0].blob size = ${(chapterImages as BackgroundImage[])?.[0]?.blob?.size || 0} bytes` });
            } else {
                chapterUpdate.images = chapterImages as string[];
            }

            updateChapterState(chapterId, 'completed', chapterUpdate);

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
