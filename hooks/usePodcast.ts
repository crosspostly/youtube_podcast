import { safeLower, parseErrorMessage } from '../utils/safeLower-util';
import { cleanupPodcastImages, forceGarbageCollection } from '../utils/memoryCleanup';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { generatePodcastBlueprint, generateNextChapterScript, generateChapterAudio, combineAndMixAudio, regenerateTextAssets, generateThumbnailDesignConcepts, convertWavToMp3, findMusicWithAi, findMusicManually } from '../services/ttsService';
import { findSfxForScript, findSfxManually, findSfxWithAi } from '../services/sfxService';
import { generateSrtFile } from '../services/srtService';
// Fix: Aliased imports to avoid name collision with functions inside the hook.
import { generateStyleImages, generateYoutubeThumbnails, regenerateSingleImage as regenerateSingleImageApi, generateMoreImages as generateMoreImagesApi } from '../services/imageService';
import { generateVideo as generateVideoService, cancelFfmpeg } from '../services/videoService';
import { exportProjectToLocalCLI } from '../services/videoExportService';
import type { Podcast, Chapter, LogEntry, YoutubeThumbnail, NarrationMode, MusicTrack, ScriptLine, SoundEffect, ImageMode, GeneratedImage, StockPhotoPreference, ChapterStatus, ThumbnailDesignConcept, ApiKeys } from '../types';
import { TEST_PODCAST_BLUEPRINT } from '../services/testData';


interface LoadingStatus {
    label: string;
    status: 'pending' | 'in_progress' | 'completed' | 'error';
}

const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = (window as any).document.createElement('a');
    a.href = url;
    a.download = filename;
    (window as any).document.body.appendChild(a);
    a.click();
    (window as any).document.body.removeChild(a);
    URL.revokeObjectURL(url);
};


export const usePodcast = (
    updateHistory: (podcast: Podcast) => void,
    apiKeys: ApiKeys,
    defaultFont: string,
    imageMode: ImageMode = 'generate',
    stockPhotoPreference: StockPhotoPreference = 'unsplash'
) => {
    const [podcast, setPodcastState] = useState<Podcast | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [loadingStatus, setLoadingStatus] = useState<LoadingStatus[]>([]);
    const [error, setErrorState] = useState<string | null>(null);
    const [warning, setWarning] = useState<string | null>(null);
    const [logs, setLogs] = useState<LogEntry[]>([]);

    const [generationProgress, setGenerationProgress] = useState(0);
    const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
    const [isGenerationPaused, setIsGenerationPaused] = useState(false);
    const [isRegeneratingText, setIsRegeneratingText] = useState(false);
    
    // Per-chapter image generation states
    const [regeneratingImage, setRegeneratingImage] = useState<{ chapterId: string; index: number } | null>(null);
    const [generatingMoreImages, setGeneratingMoreImages] = useState<string | null>(null);
    
    const [isRegeneratingAudio, setIsRegeneratingAudio] = useState(false);
    const [editingThumbnail, setEditingThumbnail] = useState<YoutubeThumbnail | null>(null);

    const [isConvertingToMp3, setIsConvertingToMp3] = useState(false);
    const [isGeneratingSrt, setIsGeneratingSrt] = useState(false);
    const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
    const [videoGenerationProgress, setVideoGenerationProgress] = useState<{ progress: number, message: string }>({ progress: 0, message: '' });
    const [isRegeneratingThumbnails, setIsRegeneratingThumbnails] = useState(false);


    const setPodcast = useCallback((updater: React.SetStateAction<Podcast | null>) => {
        setPodcastState(prev => {
            const newState = typeof updater === 'function' ? updater(prev) : updater;
            if (newState) {
                // Migration: Convert old string thumbnailBaseImage to GeneratedImage object
                if (newState.thumbnailBaseImage && typeof newState.thumbnailBaseImage === 'string') {
                    newState.thumbnailBaseImage = {
                        url: newState.thumbnailBaseImage,
                        source: 'generated'
                    };
                }
                
                // Migration: Set selectedThumbnail to first thumbnail if not set
                if (newState.youtubeThumbnails && newState.youtubeThumbnails.length > 0 && !newState.selectedThumbnail) {
                    newState.selectedThumbnail = newState.youtubeThumbnails[0];
                }
                
                updateHistory(newState);
            }
            return newState;
        });
    }, [updateHistory]);
    
    const setError = useCallback((message: string | null) => {
        setWarning(null); // Clear any warnings when a final error is set
        setErrorState(message);
    }, []);

    const log = useCallback((entry: Omit<LogEntry, 'timestamp'> & { showToUser?: boolean }) => {
        const { showToUser, ...logEntry } = entry;
        setLogs(prev => [{ ...logEntry, timestamp: new Date().toISOString() } as LogEntry, ...prev]);
        if (showToUser) {
            setErrorState(null); // Clear final error to avoid replacing the loading screen
            setWarning(entry.message);
        }
    }, [setWarning]);

    useEffect(() => {
        const newUrls: Record<string, string> = {};
        podcast?.chapters.forEach(chapter => {
            if (chapter.audioBlob) {
                newUrls[chapter.id] = URL.createObjectURL(chapter.audioBlob);
            }
        });
        setAudioUrls(newUrls);
        return () => { Object.values(newUrls).forEach(url => URL.revokeObjectURL(url)); };
    }, [podcast?.chapters]);

     const updateChapterState = useCallback((chapterId: string, status: Chapter['status'], data: Partial<Omit<Chapter, 'id' | 'status'>> = {}) => {
        setPodcast(p => {
            if (!p) return null;
            const updatedChapters = p.chapters.map(c => c.id === chapterId ? { ...c, status, ...data, error: data.error || undefined } : c);
            return { ...p, chapters: updatedChapters };
        });
    }, [setPodcast]);

    const handleGenerateChapter = useCallback(async (chapterId: string) => {
        if (!podcast) return;
        const chapterIndex = podcast.chapters.findIndex(c => c.id === chapterId);
        if (chapterIndex === -1) return;
    
        try {
            // Step 1: Generate Script
            updateChapterState(chapterId, 'script_generating');
            const chapterData = await generateNextChapterScript(podcast.topic, podcast.selectedTitle, podcast.characters, podcast.chapters.slice(0, chapterIndex), chapterIndex, podcast.totalDurationMinutes, podcast.knowledgeBaseText || '', podcast.creativeFreedom, podcast.language, podcast.narrationMode, log, apiKeys);
            
            // Step 2: Find Music
            const scriptText = chapterData.script.map(line => line.text).join(' ');
            const musicTracks = await findMusicWithAi(scriptText, log, apiKeys);
            const backgroundMusic = musicTracks.length > 0 ? musicTracks[0] : undefined;

            updateChapterState(chapterId, 'generating', { 
                script: chapterData.script, 
                title: chapterData.title, 
                imagePrompts: chapterData.imagePrompts,
                backgroundMusic
            });

            // Step 3 & 4: ПАРАЛЛЕЛЬНО генерируем изображения И аудио
            const [newImages, audioBlob] = await Promise.allSettled([
                generateStyleImages(chapterData.imagePrompts, podcast.initialImageCount, log, apiKeys, imageMode, stockPhotoPreference),
                generateChapterAudio(chapterData.script, podcast.narrationMode, podcast.characterVoices, podcast.monologueVoice, log, apiKeys)
            ]);

            // Обработка результатов
            const images = newImages.status === 'fulfilled' ? newImages.value : [];
            const audio = audioBlob.status === 'fulfilled' ? audioBlob.value : null;

            if (images.length === 0) {
                log({ type: 'warning', message: 'Изображения не сгенерированы, но аудио готово' });
            }

            if (!audio) {
                const reason = audioBlob.status === 'rejected' ? audioBlob.reason?.message || audioBlob.reason : 'Unknown error';
                log({ type: 'error', message: `Ошибка генерации аудио: ${reason}` });
                throw new Error(`Не удалось сгенерировать аудио для главы: ${reason}`);
            }

            updateChapterState(chapterId, 'completed', { 
                generatedImages: images, 
                audioBlob: audio 
            });

        } catch (err: any) {
            const friendlyError = parseErrorMessage(err);
            log({type: 'error', message: `Ошибка при генерации главы ${chapterIndex + 1}`, data: { friendlyMessage: friendlyError, originalError: err }});
            updateChapterState(chapterId, 'error', { error: friendlyError });
        }
    }, [podcast, log, updateChapterState, apiKeys, imageMode, stockPhotoPreference]);
    
    const startNewProject = useCallback(async (topic: string, knowledgeBaseText: string, creativeFreedom: boolean, language: string, totalDurationMinutes: number, narrationMode: NarrationMode, characterVoicePrefs: { [key: string]: string }, monologueVoice: string, initialImageCount: number) => {
        if (!topic.trim()) { setError('Введите название проекта.'); return; }
        
        setIsLoading(true);
        setError(null);
        setWarning(null);
        setPodcastState(null);
        setLogs([]);
        setGenerationProgress(0);
        setIsGenerationPaused(false);

        const initialSteps: LoadingStatus[] = [
            { label: 'Создание концепции проекта...', status: 'pending' },
            { label: 'Подготовка студии...', status: 'pending' },
        ];
        setLoadingStatus(initialSteps);

        const updateStatus = (label: string, status: LoadingStatus['status']) => {
            setLoadingStatus(prev => prev.map(step => step.label === label ? { ...step, status } : step));
        };

        const waitIfPaused = async () => {
            return new Promise(resolve => {
                const interval = setInterval(() => {
                    if (!isGenerationPaused) {
                        clearInterval(interval);
                        resolve(null);
                    }
                }, 300);
            });
        };

        try {
            updateStatus('Создание концепции проекта...', 'in_progress');
            log({ type: 'info', message: 'Запрос на создание концепции проекта и первой главы.' });

            const blueprint = await generatePodcastBlueprint(topic, knowledgeBaseText, creativeFreedom, language, totalDurationMinutes, narrationMode, log, apiKeys, initialImageCount);
            
            updateStatus('Создание концепции проекта...', 'completed');
            setGenerationProgress(50);

            const totalChapters = Math.max(1, Math.ceil(totalDurationMinutes / 7));

            const finalCharacterVoices: { [key: string]: string } = {};
            if (blueprint.characters.length > 0 && characterVoicePrefs.character1) finalCharacterVoices[blueprint.characters[0].name] = characterVoicePrefs.character1;
            if (blueprint.characters.length > 1 && characterVoicePrefs.character2) finalCharacterVoices[blueprint.characters[1].name] = characterVoicePrefs.character2;

            const chapters: Chapter[] = [
                { id: crypto.randomUUID(), ...blueprint.chapters[0], status: 'script_completed' as ChapterStatus },
                ...Array.from({ length: totalChapters - 1 }, (_, i) => ({
                    id: crypto.randomUUID(), title: `Глава ${i + 2}`, script: [], status: 'pending' as ChapterStatus, imagePrompts: [], selectedBgIndex: 0
                }))
            ];

            const initialPodcast: Podcast = {
                id: crypto.randomUUID(), ...blueprint, topic, selectedTitle: blueprint.youtubeTitleOptions[0] || topic, language,
                chapters, knowledgeBaseText, creativeFreedom, totalDurationMinutes, narrationMode,
                characterVoices: finalCharacterVoices, monologueVoice, initialImageCount, backgroundMusicVolume: 0.02, videoPacingMode: 'auto',
            };
            
            updateStatus('Подготовка студии...', 'in_progress');
            setPodcast(initialPodcast);
            setGenerationProgress(100);
            setIsLoading(false);

            // This self-invoking async function runs in the background.
            (async () => {
                let podcastForProcessing = { ...initialPodcast };
                log({ type: 'info', message: 'Начало фоновой генерации остальных глав и ассетов.' });

                // --- PRIORITY GENERATION: CHAPTER 1 ASSETS & THUMBNAILS ---
                const firstChapter = podcastForProcessing.chapters[0];
                if (firstChapter) {
                    try {
                        log({ type: 'info', message: `Приоритетная генерация ассетов для Главы 1...` });
                        updateChapterState(firstChapter.id, 'generating');

                        const [audioResult, imageResult, musicResult] = await Promise.allSettled([
                            generateChapterAudio(firstChapter.script, narrationMode, finalCharacterVoices, monologueVoice, log, apiKeys),
                            generateStyleImages(firstChapter.imagePrompts, initialImageCount, log, apiKeys, imageMode, stockPhotoPreference),
                            findMusicWithAi(firstChapter.script.map(l => l.text).join(' '), log, apiKeys)
                        ]);

                        const audioBlob = audioResult.status === 'fulfilled' ? audioResult.value : null;
                        const generatedImages = imageResult.status === 'fulfilled' ? imageResult.value : [];
                        const backgroundMusic = musicResult.status === 'fulfilled' ? (musicResult.value[0] || undefined) : undefined;
                        
                        if (audioResult.status === 'rejected') throw new Error(`Audio generation failed: ${audioResult.reason?.message || audioResult.reason}`);
                        
                        const chapterUpdateData = { audioBlob, generatedImages, backgroundMusic };
                        podcastForProcessing = {
                            ...podcastForProcessing,
                            chapters: podcastForProcessing.chapters.map(c => c.id === firstChapter.id ? { ...c, ...chapterUpdateData, status: 'completed' as ChapterStatus } : c)
                        };
                        updateChapterState(firstChapter.id, 'completed', chapterUpdateData);
                        
                        // --- GENERATE THUMBNAILS (ASAP) ---
                        const thumbnailBaseImage = generatedImages[0];
                        if (thumbnailBaseImage) {
                             log({ type: 'info', message: 'Генерация обложек...' });
                             try {
                                const designConcepts = await generateThumbnailDesignConcepts(podcastForProcessing.topic, podcastForProcessing.language, log, apiKeys);
                                const youtubeThumbnails = await generateYoutubeThumbnails(thumbnailBaseImage.url, podcastForProcessing.selectedTitle, designConcepts, log, defaultFont);
                                log({ type: 'response', message: 'Обложки успешно сгенерированы.' });
                                
                                const thumbnailData = { thumbnailBaseImage, designConcepts, youtubeThumbnails, selectedThumbnail: youtubeThumbnails[0] || undefined };
                                podcastForProcessing = { ...podcastForProcessing, ...thumbnailData };
                                setPodcast(p => p ? { ...p, ...thumbnailData } : null);

                             } catch (thumbError) {
                                log({ type: 'error', message: 'Ошибка при ранней генерации обложек.', data: thumbError });
                             }
                        }
                    } catch (err: any) {
                        const friendlyError = parseErrorMessage(err);
                        log({ type: 'error', message: `Ошибка при приоритетной генерации Главы 1`, data: { friendlyMessage: friendlyError, originalError: err } });
                        updateChapterState(firstChapter.id, 'error', { error: friendlyError });
                    }
                }
                
                // --- BACKGROUND GENERATION FOR REMAINING CHAPTERS ---
                for (let i = 1; i < totalChapters; i++) {
                     if (isGenerationPaused) {
                        log({ type: 'info', message: 'Генерация приостановлена пользователем.' });
                        await waitIfPaused();
                        log({ type: 'info', message: 'Генерация возобновлена.' });
                    }

                    const currentChapter = podcastForProcessing.chapters[i];
                    if (!currentChapter || currentChapter.status !== 'pending') continue;

                    const chapterId = currentChapter.id;
                    try {
                        updateChapterState(chapterId, 'script_generating');
                        log({ type: 'info', message: `Генерация сценария для главы ${i + 1}...` });
                        
                        const chapterData = await generateNextChapterScript(topic, podcastForProcessing.selectedTitle, podcastForProcessing.characters, podcastForProcessing.chapters.slice(0, i), i, totalDurationMinutes, knowledgeBaseText, creativeFreedom, language, narrationMode, log, apiKeys);
                        
                        podcastForProcessing.chapters[i] = { ...currentChapter, ...chapterData, status: 'script_completed' };
                        updateChapterState(chapterId, 'script_completed', chapterData);
                        log({ type: 'response', message: `Сценарий для главы ${i + 1} успешно сгенерирован.` });

                        if (isGenerationPaused) await waitIfPaused();
                        updateChapterState(chapterId, 'generating');
                        
                        const [audioResult, imageResult, musicResult] = await Promise.allSettled([
                            generateChapterAudio(chapterData.script, narrationMode, finalCharacterVoices, monologueVoice, log, apiKeys),
                            generateStyleImages(chapterData.imagePrompts, initialImageCount, log, apiKeys, imageMode, stockPhotoPreference),
                            findMusicWithAi(chapterData.script.map(l => l.text).join(' '), log, apiKeys)
                        ]);
                        
                        const audioBlob = audioResult.status === 'fulfilled' ? audioResult.value : null;
                        if (audioResult.status === 'rejected') throw new Error(`Audio generation failed: ${audioResult.reason?.message || audioResult.reason}`);

                        const chapterAssetData = {
                            audioBlob,
                            generatedImages: imageResult.status === 'fulfilled' ? imageResult.value : [],
                            backgroundMusic: musicResult.status === 'fulfilled' ? (musicResult.value[0] || undefined) : undefined,
                        };
                        podcastForProcessing.chapters[i] = { ...podcastForProcessing.chapters[i], ...chapterAssetData, status: 'completed' };
                        updateChapterState(chapterId, 'completed', chapterAssetData);
                        log({ type: 'response', message: `Ассеты для главы ${i + 1} успешно сгенерированы.` });

                    } catch (err: any) {
                         const friendlyError = parseErrorMessage(err);
                        log({ type: 'error', message: `Ошибка при генерации главы ${i + 1}`, data: { friendlyMessage: friendlyError, originalError: err } });
                        updateChapterState(chapterId, 'error', { error: friendlyError });
                    }
                }
                 log({ type: 'info', message: 'Фоновая генерация всех глав завершена.' });

                 // --- FINAL THUMBNAIL ATTEMPT (FALLBACK) ---
                 if (!podcastForProcessing.youtubeThumbnails || podcastForProcessing.youtubeThumbnails.length === 0) {
                    log({ type: 'warning', message: 'Ранняя генерация обложек не удалась, повторная попытка...' });
                     try {
                        const baseImg = podcastForProcessing.chapters.flatMap(c => c.generatedImages || []).find(img => img.url);
                        if (baseImg) {
                            const concepts = podcastForProcessing.designConcepts || await generateThumbnailDesignConcepts(podcastForProcessing.topic, podcastForProcessing.language, log, apiKeys);
                            const thumbs = await generateYoutubeThumbnails(baseImg.url, podcastForProcessing.selectedTitle, concepts, log, defaultFont);
                            
                            const fallbackThumbnailData = { youtubeThumbnails: thumbs, selectedThumbnail: thumbs[0], thumbnailBaseImage: baseImg };
                            podcastForProcessing = { ...podcastForProcessing, ...fallbackThumbnailData };
                            setPodcast(p => p ? { ...p, ...fallbackThumbnailData } : null);
                            log({ type: 'response', message: 'Обложки успешно сгенерированы в fallback-режиме.' });
                        }
                    } catch(e) {
                       log({type: 'error', message: 'Финальная попытка генерации обложек провалилась', data: e});
                    }
                 }
            })();

        } catch (err: any) {
            const friendlyError = parseErrorMessage(err);
            setLoadingStatus(prev => prev.map(s => s.status === 'in_progress' ? { ...s, status: 'error' as const } : s));
            setError(friendlyError);
            log({ type: 'error', message: 'Критическая ошибка при инициализации проекта', data: { friendlyMessage: friendlyError, originalError: err } });
            setIsLoading(false);
        }
    }, [log, setPodcast, apiKeys, defaultFont, setError, isGenerationPaused, imageMode, stockPhotoPreference, updateChapterState]);

    const startAutomatedProject = async (topic: string) => {
        if (!topic.trim()) {
            setError('Введите тему для автоматической генерации.');
            return;
        }
        
        setIsLoading(true);
        setError(null);
        setWarning(null);
        setPodcastState(null);
        setLogs([]);
        setGenerationProgress(0);

        const allSteps = [
            "Создание концепции", "Генерация всех сценариев", "Генерация ассетов (Глава 1)", 
            "Создание обложек", "Генерация остальных ассетов",
            "Сборка аудиодорожки", "Сборка видео", "Подготовка пакета"
        ];
        
        setLoadingStatus(allSteps.map(label => ({ label, status: 'pending' })));

        const updateStatus = (label: string, status: LoadingStatus['status']) => {
            setLoadingStatus(prev => {
                const newStatus = [...prev];
                const stepIndex = newStatus.findIndex(s => s.label === label);
                if (stepIndex > -1) {
                    if (newStatus[stepIndex].status !== 'error') {
                        newStatus[stepIndex].status = status;
                    }
                    if (status === 'in_progress' || status === 'completed') {
                        for (let i = 0; i < stepIndex; i++) {
                            if (newStatus[i].status !== 'error') newStatus[i].status = 'completed';
                        }
                    }
                }
                const completedCount = newStatus.filter(s => s.status === 'completed').length;
                setGenerationProgress((completedCount / newStatus.length) * 100);
                return newStatus;
            });
        };

        try {
            let podcastForProcessing: Podcast;
            const defaultDuration = 5;
            const defaultLang = 'ru';
            const defaultMode: NarrationMode = 'dialogue';

            updateStatus("Создание концепции", 'in_progress');
            const blueprint = await generatePodcastBlueprint(topic, '', true, defaultLang, defaultDuration, defaultMode, log, apiKeys, 3);
            
            const totalChapters = Math.max(1, Math.ceil(defaultDuration / 7));
            const chapters: Chapter[] = [
                { id: crypto.randomUUID(), ...blueprint.chapters[0], status: 'script_completed' as ChapterStatus },
                ...Array.from({ length: totalChapters - 1 }, (_, i) => ({ id: crypto.randomUUID(), title: `Глава ${i + 2}`, script: [], status: 'pending' as ChapterStatus, imagePrompts: [], selectedBgIndex: 0 }))
            ];
            
            podcastForProcessing = {
                id: crypto.randomUUID(), ...blueprint, topic, selectedTitle: blueprint.youtubeTitleOptions[0] || topic, language: defaultLang, chapters, knowledgeBaseText: '', creativeFreedom: true, totalDurationMinutes: defaultDuration, narrationMode: defaultMode, characterVoices: { [blueprint.characters[0]?.name || 'Narrator']: 'Puck', [blueprint.characters[1]?.name || 'Expert']: 'Zephyr' }, monologueVoice: 'Puck', initialImageCount: 3, backgroundMusicVolume: 0.02, videoPacingMode: 'auto',
            };
            setPodcast(podcastForProcessing);
            updateStatus("Создание концепции", 'completed');

            updateStatus("Генерация всех сценариев", 'in_progress');
            const scriptChapters = await Promise.all(
                podcastForProcessing.chapters.map(async (chapter, i) => {
                    if (i === 0) return chapter;
                    const chapterData = await generateNextChapterScript(topic, podcastForProcessing.selectedTitle, podcastForProcessing.characters, podcastForProcessing.chapters.slice(0, i), i, defaultDuration, '', true, defaultLang, defaultMode, log, apiKeys);
                    return { ...chapter, ...chapterData, status: 'script_completed' as ChapterStatus };
                })
            );
            podcastForProcessing = { ...podcastForProcessing, chapters: scriptChapters };
            setPodcast(podcastForProcessing);
            updateStatus("Генерация всех сценариев", 'completed');

            // --- ASSETS - CHAPTER 1 (PRIORITY) ---
            updateStatus("Генерация ассетов (Глава 1)", 'in_progress');
            const firstChapter = podcastForProcessing.chapters[0];
            const [audioResult, imageResult, musicResult] = await Promise.allSettled([
                generateChapterAudio(firstChapter.script, podcastForProcessing.narrationMode, podcastForProcessing.characterVoices, podcastForProcessing.monologueVoice, log, apiKeys),
                generateStyleImages(firstChapter.imagePrompts, podcastForProcessing.initialImageCount, log, apiKeys, 'generate', 'auto'),
                findMusicWithAi(firstChapter.script.map(l => l.text).join(' '), log, apiKeys)
            ]);
            
            podcastForProcessing.chapters[0] = { ...firstChapter, audioBlob: audioResult.status === 'fulfilled' ? audioResult.value : undefined, generatedImages: imageResult.status === 'fulfilled' ? imageResult.value : [], backgroundMusic: musicResult.status === 'fulfilled' ? musicResult.value[0] : undefined, status: audioResult.status === 'fulfilled' ? 'completed' : 'error', error: audioResult.status === 'rejected' ? parseErrorMessage(audioResult.reason) : undefined };
            setPodcast(podcastForProcessing);
            updateStatus("Генерация ассетов (Глава 1)", 'completed');

            // --- THUMBNAILS (EARLY) ---
            updateStatus("Создание обложек", 'in_progress');
            const thumbnailBaseImage = podcastForProcessing.chapters[0]?.generatedImages?.find(img => img.url);
            if (thumbnailBaseImage) {
                const designConcepts = await generateThumbnailDesignConcepts(topic, defaultLang, log, apiKeys);
                const thumbnails = await generateYoutubeThumbnails(thumbnailBaseImage.url, podcastForProcessing.selectedTitle, designConcepts, log, defaultFont);
                podcastForProcessing = { ...podcastForProcessing, thumbnailBaseImage, designConcepts, youtubeThumbnails: thumbnails, selectedThumbnail: thumbnails[0] };
                setPodcast(podcastForProcessing);
            }
            updateStatus("Создание обложек", 'completed');

            // --- ASSETS - REMAINING CHAPTERS ---
            updateStatus("Генерация остальных ассетов", 'in_progress');
            const remainingChapters = podcastForProcessing.chapters.slice(1);
            if (remainingChapters.length > 0) {
                const assetResults = await Promise.all(remainingChapters.map(async (chapter) => {
                    const [audioRes, imageRes, musicRes] = await Promise.allSettled([
                        generateChapterAudio(chapter.script, podcastForProcessing.narrationMode, podcastForProcessing.characterVoices, podcastForProcessing.monologueVoice, log, apiKeys),
                        generateStyleImages(chapter.imagePrompts, podcastForProcessing.initialImageCount, log, apiKeys, 'generate', 'auto'),
                        findMusicWithAi(chapter.script.map(l => l.text).join(' '), log, apiKeys)
                    ]);
                    return { chapter, audioRes, imageRes, musicRes };
                }));
                const processedRemaining = assetResults.map(({ chapter, audioRes, imageRes, musicRes }) => ({ ...chapter, audioBlob: audioRes.status === 'fulfilled' ? audioRes.value : undefined, generatedImages: imageRes.status === 'fulfilled' ? imageRes.value : [], backgroundMusic: musicRes.status === 'fulfilled' ? musicRes.value[0] : undefined, status: audioRes.status === 'fulfilled' ? 'completed' as ChapterStatus : 'error' as ChapterStatus, error: audioRes.status === 'rejected' ? parseErrorMessage(audioRes.reason) : undefined }));
                podcastForProcessing.chapters = [podcastForProcessing.chapters[0], ...processedRemaining];
                setPodcast(podcastForProcessing);
            }
            updateStatus("Генерация остальных ассетов", 'completed');

            // --- FINAL ARTIFACTS ---
            updateStatus("Сборка аудиодорожки", 'in_progress');
            const finalAudioBlob = await combineAndMixAudio(podcastForProcessing, log);
            updateStatus("Сборка аудиодорожки", 'completed');

            updateStatus("Сборка видео", 'in_progress');
            const videoBlob = await generateVideoService(podcastForProcessing, finalAudioBlob, (progress) => {
                const stepIndex = allSteps.indexOf("Сборка видео");
                const baseProgress = (stepIndex / allSteps.length) * 100;
                setGenerationProgress(baseProgress + (progress * (100 / allSteps.length)));
            }, log);
            updateStatus("Сборка видео", 'completed');

            updateStatus("Подготовка пакета", 'in_progress');
            const srtBlob = await generateSrtFile(podcastForProcessing, log);
            const metadata = { title: podcastForProcessing.selectedTitle, description: podcastForProcessing.description, tags: podcastForProcessing.seoKeywords };
            const metadataBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
            
            const thumbnailBlob = podcastForProcessing.selectedThumbnail?.dataUrl ? await (await fetch(podcastForProcessing.selectedThumbnail.dataUrl)).blob() : null;
            
            const sanitizedTitle = safeLower(podcastForProcessing.selectedTitle.replace(/[^a-z0-9а-яё]/gi, '_'));
            downloadBlob(videoBlob, `${sanitizedTitle}.mp4`);
            if (thumbnailBlob) downloadBlob(thumbnailBlob, `${sanitizedTitle}_thumbnail.png`);
            downloadBlob(srtBlob, `${sanitizedTitle}.srt`);
            downloadBlob(metadataBlob, `${sanitizedTitle}_metadata.json`);
            updateStatus("Подготовка пакета", 'completed');
            
            log({type: 'info', message: '✅ Автоматическая генерация завершена. Все файлы скачаны.'});
            
        } catch (err: any) {
            const friendlyError = parseErrorMessage(err);
            setLoadingStatus(prev => prev.map(s => s.status === 'in_progress' ? { ...s, status: 'error' } : s));
            setError(friendlyError);
            log({ type: 'error', message: 'Критическая ошибка при автоматической генерации проекта', data: err });
        } finally {
            setIsLoading(false);
            setPodcast(null);
        }
    };
    
    const startVideoTest = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setWarning(null);
        setPodcastState(null);
        setLogs([]);
        log({ type: 'info', message: 'Запуск теста видео-движка с эталонными данными.' });

        const testSteps: LoadingStatus[] = [
            { label: 'Загрузка тестового проекта', status: 'in_progress' },
            { label: 'Генерация аудио для Главы 1', status: 'pending' },
            { label: 'Генерация аудио для Главы 2', status: 'pending' },
            { label: 'Сборка проекта', status: 'pending' }
        ];
        setLoadingStatus(testSteps);
        
        const updateStatus = (label: string, status: LoadingStatus['status']) => {
            setLoadingStatus(prev => prev.map(step => step.label === label ? { ...step, status } : step));
        };

        try {
            const newPodcast: Podcast = {
                id: `test-${crypto.randomUUID()}`,
                topic: "Тест Видео-движка: Тайна Маяка",
                selectedTitle: "Тест: Тайна Маяка",
                language: 'Русский',
                totalDurationMinutes: 2, // Approximate
                narrationMode: 'dialogue',
                characterVoices: { 'Рассказчик': 'Puck', 'Историк': 'Zephyr' },
                monologueVoice: 'Puck',
                initialImageCount: 3,
                backgroundMusicVolume: 0.02,
                creativeFreedom: true,
                knowledgeBaseText: '',
                ...TEST_PODCAST_BLUEPRINT,
                chapters: TEST_PODCAST_BLUEPRINT.chapters.map(c => ({...c})), // Deep copy
                youtubeThumbnails: [],
                designConcepts: [],
                thumbnailBaseImage: TEST_PODCAST_BLUEPRINT.chapters[0].generatedImages?.[0],
                videoPacingMode: 'auto',
            };
            updateStatus('Загрузка тестового проекта', 'completed');
            
            updateStatus('Генерация аудио для Главы 1', 'in_progress');
            updateStatus('Генерация аудио для Главы 2', 'in_progress');

            const audioPromises = newPodcast.chapters.map(async (chapter, index) => {
                const label = `Генерация аудио для Главы ${index + 1}`;
                try {
                    const audioBlob = await generateChapterAudio(
                        chapter.script,
                        newPodcast.narrationMode,
                        newPodcast.characterVoices,
                        newPodcast.monologueVoice,
                        log,
                        apiKeys
                    );
                    updateStatus(label, 'completed');
                    return { ...chapter, status: 'completed' as const, audioBlob };
                } catch (err) {
                    updateStatus(label, 'error');
                    throw err;
                }
            });

            const completedChapters = await Promise.all(audioPromises);
            newPodcast.chapters = completedChapters;
            
            updateStatus('Сборка проекта', 'in_progress');
            log({ type: 'info', message: 'Все аудиодорожки для теста сгенерированы. Загрузка в студию...' });
            setPodcast(newPodcast);
            updateStatus('Сборка проекта', 'completed');

        } catch (err: any) {
            const friendlyError = parseErrorMessage(err);
            setError(friendlyError);
            log({ type: 'error', message: 'Тест видео-движка провален', data: { friendlyMessage: friendlyError, originalError: err } });
        } finally {
            setIsLoading(false);
        }
    }, [log, setPodcast, apiKeys, setError]);

    const combineAndDownload = async (format: 'wav' | 'mp3' = 'wav') => {
        if (!podcast || podcast.chapters.some(c => c.status !== 'completed' || !c.audioBlob)) return;
        
        const setLoading = format === 'mp3' ? setIsConvertingToMp3 : setIsLoading;
        setLoading(true);
        setLoadingStatus([{ label: 'Сборка и микширование аудио...', status: 'in_progress' }]);

        try {
            let finalBlob = await combineAndMixAudio(podcast, log);
            let extension = 'wav';

            if (format === 'mp3') {
                setLoadingStatus([{ label: 'Конвертация в MP3...', status: 'in_progress' }]);
                finalBlob = await convertWavToMp3(finalBlob, log);
                extension = 'mp3';
            }

            downloadBlob(finalBlob, `${safeLower(podcast.selectedTitle.replace(/[^a-z0-9а-яё]/gi, '_'))}.${extension}`);

            log({ type: 'response', message: `✅ Аудио экспортировано (${format})` });
            
            const cleanedMB = cleanupPodcastImages(podcast);
            if (cleanedMB > 0) log({ type: 'info', message: `🧹 Очищено ${cleanedMB.toFixed(2)} МБ памяти` });
            
        } catch (err: any) {
            const friendlyError = parseErrorMessage(err);
            setError(friendlyError);
            log({type: 'error', message: `Ошибка при сборке и экспорте (${format})`, data: { friendlyMessage: friendlyError, originalError: err }});
            cleanupPodcastImages(podcast);
        } finally {
            setLoading(false);
            setLoadingStatus([]);
        }
    };

    const generateSrt = async () => {
        if (!podcast) return;
        setIsGeneratingSrt(true);
        try {
            const srtBlob = await generateSrtFile(podcast, log);
            downloadBlob(srtBlob, `${safeLower(podcast.selectedTitle.replace(/[^a-z0-9а-яё]/gi, '_'))}.srt`);
        } catch (err: any) {
            const friendlyError = parseErrorMessage(err);
            setError(friendlyError);
            log({type: 'error', message: 'Ошибка при генерации SRT', data: { friendlyMessage: friendlyError, originalError: err }});
        } finally {
            setIsGeneratingSrt(false);
        }
    };
    
    const generateVideo = async (podcastToRender: Podcast) => {
        setIsGeneratingVideo(true);
        setVideoGenerationProgress({ progress: 0, message: 'Подготовка...' });
        try {
            const finalAudioBlob = await combineAndMixAudio(podcastToRender, log);

            const manualDurations = podcastToRender.videoPacingMode === 'manual'
                ? podcastToRender.chapters.flatMap(c => c.imageDurations || Array(c.generatedImages?.length || 0).fill(60))
                : undefined;
            
            const videoBlob = await generateVideoService(
                podcastToRender, finalAudioBlob,
                (progress, message) => setVideoGenerationProgress({ progress, message }),
                log, manualDurations
            );

            downloadBlob(videoBlob, `${safeLower(podcastToRender.selectedTitle.replace(/[^a-z0-9а-яё]/gi, '_'))}.mp4`);

            log({ type: 'response', message: '✅ Видео успешно создано' });
            const cleanedMB = cleanupPodcastImages(podcastToRender);
            log({ type: 'info', message: `🧹 Очищено ${cleanedMB.toFixed(2)} МБ памяти` });
            forceGarbageCollection();
            
        } catch (err: any) {
            if (safeLower(err.message).includes('cancelled')) {
                log({type: 'info', message: 'Генерация видео отменена пользователем.'});
            } else {
                const friendlyError = parseErrorMessage(err);
                setError(friendlyError);
                log({type: 'error', message: 'Ошибка при генерации видео', data: { friendlyMessage: friendlyError, originalError: err }});
            }
            const cleanedMB = cleanupPodcastImages(podcastToRender);
            log({ type: 'info', message: `🧹 Память очищена (${cleanedMB.toFixed(2)} МБ)` });
        } finally {
            setIsGeneratingVideo(false);
            setVideoGenerationProgress({ progress: 0, message: '' });
        }
    };

    const generateVideoLocally = useCallback(async () => {
        if (!podcast) return;
        
        if (podcast.chapters.some(c => c.status !== 'completed' || !c.audioBlob)) {
            setError('Все главы должны быть завершены с аудио перед созданием видео');
            return;
        }

        setIsGeneratingVideo(true);
        setVideoGenerationProgress({ progress: 0, message: 'Экспорт проекта...' });
        setError(null);
        
        try {
            log({ type: 'info', message: '📤 Отправка материалов на локальный сервер...' });
            
            const projectId = await exportProjectToLocalCLI(podcast);
            
            log({ type: 'info', message: `✅ Материалы отправлены. Project ID: ${projectId}` });
            log({ type: 'info', message: '🎬 Сборка видео началась на локальном FFmpeg...' });
            log({ type: 'info', message: '⏳ Это может занять 3-5 минут...' });
            
            setVideoGenerationProgress({ progress: 1, message: 'Видео создаётся на локальном сервере...' });
            
        } catch (err: any) {
            const friendlyError = parseErrorMessage(err);
            setError(friendlyError);
            log({ type: 'error', message: 'Ошибка экспорта проекта', data: err });
        } finally {
            setIsGeneratingVideo(false);
        }
    }, [podcast, log, setError]);

    const cancelVideoGeneration = () => {
        cancelFfmpeg();
        setIsGeneratingVideo(false);
        setVideoGenerationProgress({ progress: 0, message: 'Отмена...' });
    };

    const handleGenerateFullVideo = () => {
        if (!podcast || podcast.chapters.some(c => c.status !== 'completed' || !c.audioBlob)) return;
        generateVideo(podcast);
    };

    const handleGeneratePartialVideo = () => {
        if (!podcast) return;
        const completedChapters = podcast.chapters.filter(c => c.status === 'completed' && c.audioBlob);
        if (completedChapters.length === 0) {
            setError('Нет ни одной завершенной главы для создания видео.');
            return;
        }
        const partialPodcast = { ...podcast, chapters: completedChapters };
        generateVideo(partialPodcast);
    };

    const saveThumbnail = (updatedThumbnail: YoutubeThumbnail) => {
        setPodcast(p => {
            if (!p || !p.youtubeThumbnails) return p;
            return { ...p, youtubeThumbnails: p.youtubeThumbnails.map(t => t.styleName === updatedThumbnail.styleName ? updatedThumbnail : t) };
        });
    };

    const setChapterMusic = useCallback((chapterId: string, music: MusicTrack, applyToAll: boolean = false) => {
        setPodcast(p => {
            if (!p) return null;
            if (applyToAll) {
                const updatedChapters = p.chapters.map(c => ({...c, backgroundMusic: music }));
                return { ...p, chapters: updatedChapters };
            } else {
                const updatedChapters = p.chapters.map(c => c.id === chapterId ? { ...c, backgroundMusic: music } : c);
                return { ...p, chapters: updatedChapters };
            }
        });
    }, [setPodcast]);

    const setGlobalMusicVolume = useCallback((volume: number) => {
        setPodcast(p => p ? { ...p, backgroundMusicVolume: volume } : null);
    }, [setPodcast]);

    const setChapterMusicVolume = useCallback((chapterId: string, volume: number | null) => {
        setPodcast(p => {
            if (!p) return null;
            const updatedChapters = p.chapters.map(c => {
                if (c.id === chapterId) {
                    const newChapter = { ...c };
                    if (volume === null) {
                        delete newChapter.backgroundMusicVolume; // Reset to global
                    } else {
                        newChapter.backgroundMusicVolume = volume;
                    }
                    return newChapter;
                }
                return c;
            });
            return { ...p, chapters: updatedChapters };
        });
    }, [setPodcast]);

    const setVideoPacingMode = useCallback((mode: 'auto' | 'manual') => {
        setPodcast(p => {
            if (!p) return null;
            if (mode === 'manual' && p.videoPacingMode !== 'manual') {
                // Initialize durations if switching to manual for the first time
                const updatedChapters = p.chapters.map(c => {
                    const imageCount = c.generatedImages?.length || 0;
                    const durations = c.imageDurations && c.imageDurations.length === imageCount 
                        ? c.imageDurations 
                        : Array(imageCount).fill(60); // Default to 60s as requested
                    return { ...c, imageDurations: durations };
                });
                return { ...p, videoPacingMode: mode, chapters: updatedChapters };
            }
            return { ...p, videoPacingMode: mode };
        });
    }, [setPodcast]);
    
    const setImageDuration = useCallback((chapterId: string, imageIndex: number, duration: number) => {
        setPodcast(p => {
            if (!p) return null;
            const updatedChapters = p.chapters.map(c => {
                if (c.id === chapterId) {
                    const newDurations = [...(c.imageDurations || [])];
                    newDurations[imageIndex] = duration > 0 ? duration : 1; // Ensure duration is at least 1
                    return { ...c, imageDurations: newDurations };
                }
                return c;
            });
            return { ...p, chapters: updatedChapters };
        });
    }, [setPodcast]);

    const regenerateProject = () => {
        if (!podcast) return;
        // @ts-ignore - Fix for Property 'confirm' does not exist on type 'Window'.
        if ((window as any).confirm('Вы уверены, что хотите полностью пересоздать этот проект? Весь текущий прогресс будет потерян.')) {
            startNewProject(
                podcast.topic,
                podcast.knowledgeBaseText || '',
                podcast.creativeFreedom,
                podcast.language,
                podcast.totalDurationMinutes,
                podcast.narrationMode,
                podcast.characterVoices,
                podcast.monologueVoice,
                podcast.initialImageCount
            );
        }
    };
    
    const handleTitleSelection = useCallback(async (title: string, force: boolean = false) => {
        if (!podcast || (!force && podcast.selectedTitle === title)) return;

        // If design concepts and base image exist, regenerate thumbnails
        if (podcast.designConcepts && podcast.thumbnailBaseImage) {
            try {
                const newThumbnails = await generateYoutubeThumbnails(podcast.thumbnailBaseImage.url, title, podcast.designConcepts, log, defaultFont);
                setPodcast(p => p ? { 
                    ...p, 
                    selectedTitle: title, 
                    youtubeThumbnails: newThumbnails,
                    selectedThumbnail: newThumbnails[0] || undefined 
                } : null);
            } catch (err) {
                const friendlyError = parseErrorMessage(err);
                setError(friendlyError);
                log({ type: 'error', message: 'Не удалось обновить обложки после смены заголовка', data: { friendlyMessage: friendlyError, originalError: err } });
            }
        } else {
            // Otherwise, just update the title
            setPodcast(p => p ? { ...p, selectedTitle: title } : null);
        }

    }, [podcast, log, setPodcast, defaultFont, setError]);

    const setThumbnailBaseImage = useCallback(async (image: GeneratedImage) => {
        if (!podcast) return;

        if (podcast.thumbnailBaseImage?.url === image.url) return;

        // If design concepts exist, regenerate thumbnails with the new base image
        if (podcast.designConcepts) {
             try {
                const newThumbnails = await generateYoutubeThumbnails(image.url, podcast.selectedTitle, podcast.designConcepts, log, defaultFont);
                setPodcast(p => p ? { 
                    ...p, 
                    thumbnailBaseImage: image,
                    youtubeThumbnails: newThumbnails,
                    selectedThumbnail: newThumbnails[0] || undefined
                } : null);
             } catch (err) {
                const friendlyError = parseErrorMessage(err);
                setError(friendlyError);
                log({ type: 'error', message: 'Не удалось перерисовать обложки с новым фоном', data: { friendlyMessage: friendlyError, originalError: err } });
             }
        } else {
            // Otherwise, just set the base image
            setPodcast(p => p ? { ...p, thumbnailBaseImage: image } : null);
        }
    }, [podcast, log, setPodcast, defaultFont, setError]);


    const regenerateText = async () => {
        if (!podcast) return;
        setIsRegeneratingText(true);
        try {
            const newTextAssets = await regenerateTextAssets(podcast.topic, podcast.knowledgeBaseText || '', podcast.creativeFreedom, podcast.language, log, apiKeys);
            const newTitle = newTextAssets.youtubeTitleOptions[0] || podcast.selectedTitle;
            setPodcast(p => p ? { ...p, ...newTextAssets } : null);
            await handleTitleSelection(newTitle, true); // Force thumbnail regeneration
        } catch (err) {
             const friendlyError = parseErrorMessage(err);
             setError(friendlyError);
             log({ type: 'error', message: 'Ошибка при регенерации текста', data: { friendlyMessage: friendlyError, originalError: err } });
        } finally {
            setIsRegeneratingText(false);
        }
    };
    
    const regenerateChapterImages = async (chapterId: string) => {
        const chapter = podcast?.chapters.find(c => c.id === chapterId);
        if (!podcast || !chapter) return;
        
        updateChapterState(chapterId, 'images_generating');
        try {
            const newImages = await generateStyleImages(chapter.imagePrompts, 3, log, apiKeys, imageMode, stockPhotoPreference);
            const newDurations = podcast.videoPacingMode === 'manual' ? Array(newImages.length).fill(60) : undefined;
            updateChapterState(chapterId, 'completed', { generatedImages: newImages, imageDurations: newDurations });
        } catch (err) {
             const friendlyError = parseErrorMessage(err);
             log({ type: 'error', message: `Ошибка при регенерации изображений для главы ${chapter.title}`, data: { friendlyMessage: friendlyError, originalError: err } });
             updateChapterState(chapterId, 'error', { error: friendlyError });
        }
    };

    // FIX: Made this function more type-safe to resolve assignment errors.
    const regenerateAllAudio = async () => {
        if (!podcast) return;
        setIsRegeneratingAudio(true);
        log({ type: 'info', message: 'Начало переозвучки всех глав.' });
    
        setPodcast(p => p ? { ...p, chapters: p.chapters.map(c => (c.script && c.script.length > 0) ? { ...c, status: 'audio_generating' } : c) } : null);
    
        const chapterPromises = podcast.chapters.map(async (chapter) => {
            if (chapter.script && chapter.script.length > 0) {
                try {
                    const audioBlob = await generateChapterAudio(chapter.script, podcast.narrationMode, podcast.characterVoices, podcast.monologueVoice, log, apiKeys);
                    return { chapterId: chapter.id, status: 'completed' as const, audioBlob, error: undefined };
                } catch (err: any) {
                    log({ type: 'error', message: `Ошибка при переозвучке главы ${chapter.title}`, data: err });
                    return { chapterId: chapter.id, status: 'error' as const, error: err.message || 'Ошибка озвучки', audioBlob: undefined };
                }
            }
            return { chapterId: chapter.id, status: chapter.status, audioBlob: chapter.audioBlob, error: chapter.error };
        });
    
        const results = await Promise.all(chapterPromises);
    
        setPodcast(p => {
            if (!p) return null;
            const updatedChapters: Chapter[] = p.chapters.map(chapter => {
                const result = results.find(res => res.chapterId === chapter.id);
                if (result) {
                    const { status, audioBlob, error } = result;
                    return { ...chapter, status, audioBlob, error: error ?? undefined };
                }
                return chapter;
            });
            return { ...p, chapters: updatedChapters };
        });
    
        log({ type: 'info', message: 'Переозвучка всех глав завершена.' });
        setIsRegeneratingAudio(false);
    };

    // FIX: Made this function more type-safe and fixed an unused variable bug.
    const regenerateAllImages = async () => {
        if (!podcast) return;
        log({ type: 'info', message: 'Начало регенерации всех изображений.' });

        setPodcast(p => p ? { ...p, chapters: p.chapters.map(c => ({ ...c, status: 'images_generating' })) } : null);
    
        const chapterPromises = podcast.chapters.map(async (chapter) => {
            try {
                const newImages = await generateStyleImages(chapter.imagePrompts, 3, log, apiKeys, imageMode, stockPhotoPreference);
                let imageDurations: number[] | undefined;
                if (podcast.videoPacingMode === 'manual') {
                    imageDurations = Array(newImages.length).fill(60);
                }
                return { chapterId: chapter.id, status: 'completed' as const, generatedImages: newImages, imageDurations };
            } catch (err: any) {
                log({ type: 'error', message: `Ошибка при регенерации изображений для главы ${chapter.title}`, data: err });
                return { chapterId: chapter.id, status: 'error' as const, error: err.message || 'Ошибка генерации изображений' };
            }
        });

        const results = await Promise.all(chapterPromises);

        setPodcast(p => {
            if (!p) return null;
            const updatedChapters: Chapter[] = p.chapters.map(chapter => {
                const result = results.find(res => res.chapterId === chapter.id);
                if (result) {
                    if (result.status === 'completed') {
                        return { 
                             ...chapter,
                             status: 'completed',
                             generatedImages: result.generatedImages,
                             imageDurations: result.imageDurations,
                             error: undefined,
                        };
                    } else if (result.status === 'error') {
                        return { ...chapter, status: 'error', error: result.error };
                    }
                }
                return chapter;
            });
            return { ...p, chapters: updatedChapters };
        });

        log({ type: 'info', message: 'Регенерация всех изображений завершена.' });
    };

    const regenerateSingleImage = async (chapterId: string, index: number) => {
        const chapter = podcast?.chapters.find(c => c.id === chapterId);
        if (!podcast || !chapter || !chapter.imagePrompts[index]) return;

        if (regeneratingImage !== null) {
            log({type: 'warning', message: 'Другое изображение уже регенерируется. Пожалуйста, подождите.'});
            return;
        }
        
        setRegeneratingImage({ chapterId, index });
        try {
            const newImage = await regenerateSingleImageApi(chapter.imagePrompts[index], log, apiKeys, imageMode, stockPhotoPreference);
            setPodcast(p => {
                if (!p) return null;
                const updatedChapters = p.chapters.map(c => {
                    if (c.id === chapterId) {
                        const newImages = [...(c.generatedImages || [])];
                        newImages[index] = newImage;
                        return { ...c, generatedImages: newImages };
                    }
                    return c;
                });
                return { ...p, chapters: updatedChapters };
            });
        } catch(err: any) {
            const friendlyError = parseErrorMessage(err);
            setError(friendlyError);
            log({ type: 'error', message: `Ошибка при регенерации изображения ${index + 1}.`, data: { friendlyMessage: friendlyError, originalError: err } });
        } finally {
            setRegeneratingImage(null);
        }
    };
    
    const generateMoreImages = async (chapterId: string) => {
        const chapter = podcast?.chapters.find(c => c.id === chapterId);
        if (!podcast || !chapter) return;

        if (generatingMoreImages !== null) {
            log({type: 'warning', message: 'Уже идет генерация дополнительных изображений. Пожалуйста, подождите.'});
            return;
        }

        setGeneratingMoreImages(chapterId);
        try {
            const newImages = await generateMoreImagesApi(chapter.imagePrompts, log, apiKeys, imageMode, stockPhotoPreference);
            setPodcast(p => {
                 if (!p) return null;
                 const updatedChapters = p.chapters.map(c => {
                    if (c.id === chapterId) {
                        const existingImages = c.generatedImages || [];
                        const allImages = [...existingImages, ...newImages];
                        let newDurations = c.imageDurations;
                        if (p.videoPacingMode === 'manual') {
                             const newImageDurations = Array(newImages.length).fill(60);
                             newDurations = [...((c.imageDurations?.length === existingImages.length) ? c.imageDurations : Array(existingImages.length).fill(60)), ...newImageDurations];
                        }
                        return { ...c, generatedImages: allImages, imageDurations: newDurations };
                    }
                    return c;
                });
                return { ...p, chapters: updatedChapters };
            });
        } catch(err: any) {
            const friendlyError = parseErrorMessage(err);
            setError(friendlyError);
            log({ type: 'error', message: 'Ошибка при генерации доп. изображений', data: { friendlyMessage: friendlyError, originalError: err } });
        } finally {
            setGeneratingMoreImages(null);
        }
    };
    
    const regenerateChapterAudio = async (chapterId: string) => {
        const chapter = podcast?.chapters.find(c => c.id === chapterId);
        if (!podcast || !chapter || !chapter.script.length) return;

        updateChapterState(chapterId, 'audio_generating');
        try {
            const audioBlob = await generateChapterAudio(chapter.script, podcast.narrationMode, podcast.characterVoices, podcast.monologueVoice, log, apiKeys);
            updateChapterState(chapterId, 'completed', { audioBlob });
             log({ type: 'response', message: `Аудио для главы "${chapter.title}" успешно пересоздано.` });
        } catch (err: any) {
            const friendlyError = parseErrorMessage(err);
            log({ type: 'error', message: `Ошибка при пересоздании аудио для главы "${chapter.title}"`, data: { friendlyMessage: friendlyError, originalError: err } });
            updateChapterState(chapterId, 'error', { error: friendlyError });
        }
    };
    
    const regenerateThumbnails = async () => {
        if (!podcast) return;
        setIsRegeneratingThumbnails(true);
        log({ type: 'info', message: 'Принудительная регенерация обложек...' });
        try {
            let baseImage = podcast.thumbnailBaseImage;
            
            if (!baseImage || !baseImage.url) {
                log({type: 'info', message: 'Фоновое изображение для обложки не найдено, поиск по главам...'});
                baseImage = podcast.chapters.flatMap(c => c.generatedImages || []).find(img => img.url);
            }
            
            if (!baseImage || !baseImage.url) {
                log({type: 'warning', message: 'Не найдены фоновые изображения. Попытка сгенерировать их для первой главы...'});
                const firstChapter = podcast.chapters[0];
                if (!firstChapter) throw new Error('В проекте нет глав для генерации изображений.');

                updateChapterState(firstChapter.id, 'images_generating');
                const newImages = await generateStyleImages(firstChapter.imagePrompts, podcast.initialImageCount, log, apiKeys, imageMode, stockPhotoPreference);
                if (newImages.length === 0) {
                     updateChapterState(firstChapter.id, 'error', { error: 'Не удалось сгенерировать изображения.' });
                     throw new Error('Не удалось сгенерировать фоновые изображения для создания обложек.');
                }
                log({type: 'info', message: 'Изображения для первой главы созданы. Используем первое как фон для обложки.'});
                baseImage = newImages[0];
                
                // Update state with newly generated images
                setPodcast(p => {
                    if (!p) return null;
                    const updatedChapters = p.chapters.map(c => c.id === firstChapter.id ? { ...c, generatedImages: newImages, status: 'completed' } : c);
                    return { ...p, chapters: updatedChapters, thumbnailBaseImage: baseImage };
                });
            }

            let concepts = podcast.designConcepts;
            if (!concepts || concepts.length === 0) {
                 log({type: 'info', message: 'Дизайн-концепции не найдены, генерируем заново...'});
                 concepts = await generateThumbnailDesignConcepts(podcast.topic, podcast.language, log, apiKeys);
            }

            const newThumbnails = await generateYoutubeThumbnails(baseImage.url, podcast.selectedTitle, concepts, log, defaultFont);
            
            setPodcast(p => p ? { ...p, thumbnailBaseImage: baseImage, designConcepts: concepts, youtubeThumbnails: newThumbnails, selectedThumbnail: newThumbnails[0] || undefined } : null);
            log({type: 'response', message: 'Обложки успешно пересозданы.'});
        } catch (err: any) {
            const friendlyError = parseErrorMessage(err);
            setError(friendlyError);
            log({ type: 'error', message: 'Ошибка при регенерации обложек', data: { friendlyMessage: friendlyError, originalError: err } });
        } finally {
            setIsRegeneratingThumbnails(false);
        }
    };

    const manualTtsScript = useMemo(() => {
        if (!podcast) return "Генерация сценария...";
        const completedChapters = podcast.chapters.filter(c => c.status === 'completed' && c.script?.length > 0);
        if (completedChapters.length === 0) return "Сценарий будет доступен после завершения глав.";
        
        return `Style Instructions: Read aloud in a warm, welcoming tone.

${completedChapters.map((c, i) =>
    `ГЛАВА ${i + 1}: ${c.title.toUpperCase()}

${c.script.map(line => 
    line.speaker.toUpperCase() === 'SFX' 
        ? `[SFX: ${line.text}]` 
        : `${line.speaker}: ${line.text}`
).join('\n')}`
).join('\n\n---\n\n')}`;
    }, [podcast?.chapters]);

    const subtitleText = useMemo(() => {
        return podcast ? podcast.chapters
            .filter(c => c.status === 'completed' && c.script)
            .flatMap(c => c.script)
            .filter(line => line.speaker.toUpperCase() !== 'SFX')
            .map(line => line.text)
            .join('\n') : '';
    }, [podcast?.chapters]);

    const findMusicForChapter = useCallback(async (chapterId: string): Promise<MusicTrack[]> => {
        if (!podcast) return [];
        const chapter = podcast.chapters.find(c => c.id === chapterId);
        if (!chapter) return [];

        try {
            const scriptText = chapter.script.map(line => line.text).join(' ');
            const query = scriptText.trim() ? scriptText : podcast.topic;
            const tracks = await findMusicWithAi(query, log, apiKeys);
            if (tracks.length === 0) {
                 log({type: 'info', message: `Подходящая музыка для главы "${chapter.title}" не найдена.`});
            }
            return tracks;
        } catch(err: any) {
            const friendlyError = parseErrorMessage(err);
            setError(friendlyError);
            log({ type: 'error', message: 'Ошибка при поиске музыки.', data: { friendlyMessage: friendlyError, originalError: err } });
            return [];
        }
    }, [podcast, log, apiKeys, setError]);
    
    const findMusicManuallyForChapter = useCallback(async (query: string): Promise<MusicTrack[]> => {
        if (!podcast) return [];
        try {
            const tracks = await findMusicManually(query, log);
            if (tracks.length > 0) {
                log({type: 'response', message: 'Музыкальные треки по ручному запросу успешно получены.'});
            } else {
                log({type: 'info', message: 'По ручному запросу музыка не найдена.'});
            }
            return tracks;
        } catch (err: any) {
            const friendlyError = parseErrorMessage(err);
            setError(friendlyError);
            log({ type: 'error', message: 'Ошибка при ручном поиске музыки.', data: { friendlyMessage: friendlyError, originalError: err } });
            return [];
        }
    }, [podcast, log, setError]);
    
    const findSfxForLine = useCallback(async (chapterId: string, lineIndex: number): Promise<SoundEffect[]> => {
        if (!podcast) return [];
        const chapter = podcast.chapters.find(c => c.id === chapterId);
        const line = chapter?.script[lineIndex];
        if (!line || line.speaker.toUpperCase() !== 'SFX') return [];
        
        // 1. Try embedded search tags first
        if (line.searchTags) {
            try {
                log({ type: 'info', message: `Поиск SFX для "${line.text}" по встроенным тегам: "${line.searchTags}"` });
                return await findSfxManually(line.searchTags, log, apiKeys.freesound);
            } catch (err) {
                 log({ type: 'error', message: `Ошибка поиска SFX по встроенным тегам`, data: err });
                 // Fall through to AI search
            }
        }
        
        // 2. Fallback to AI search
        try {
            log({ type: 'warning', message: `SFX "${line.text}" не имеет встроенных тегов, используем AI-генерацию как fallback...` });
            return await findSfxWithAi(line.text, log, apiKeys);
        } catch (err: any) {
             log({ type: 'error', message: 'Ошибка поиска SFX с ИИ', data: err });
             return [];
        }
    }, [podcast, log, apiKeys]);
    
    const findSfxManuallyForLine = useCallback(async (query: string): Promise<SoundEffect[]> => {
        try {
            return await findSfxManually(query, log, apiKeys.freesound);
        } catch (err: any) {
            log({ type: 'error', message: 'Ошибка ручного поиска SFX', data: err });
            return [];
        }
    }, [log, apiKeys]);
    
    const setSfxForLine = (chapterId: string, lineIndex: number, sfx: SoundEffect | null) => {
        setPodcast(p => p ? { ...p, chapters: p.chapters.map(c => {
            if (c.id !== chapterId) return c;
            const newScript = [...c.script];
            const line = newScript[lineIndex];
            if (line) {
                newScript[lineIndex] = { ...line, soundEffect: sfx || undefined };
            }
            return { ...c, script: newScript };
        })} : null);
    };

    const setSfxVolume = (chapterId: string, lineIndex: number, volume: number) => {
        setPodcast(p => p ? { ...p, chapters: p.chapters.map(c => {
            if (c.id !== chapterId) return c;
            const newScript = [...c.script];
            const line = newScript[lineIndex];
            if (line) {
                newScript[lineIndex] = { ...line, soundEffectVolume: volume };
            }
            return { ...c, script: newScript };
        })} : null);
    };


    return {
        podcast,
        setPodcast,
        isLoading,
        loadingStatus,
        error,
        setError,
        warning,
        logs,
        log,
        generationProgress,
        audioUrls,
        isGenerationPaused,
        setIsGenerationPaused,
        isRegeneratingText,
        isRegeneratingAudio,
        editingThumbnail,
        setEditingThumbnail,
        isConvertingToMp3,
        isGeneratingSrt,
        isGeneratingVideo,
        videoGenerationProgress,
        isRegeneratingThumbnails,
        startNewProject,
        startAutomatedProject,
        startVideoTest,
        handleGenerateChapter,
        combineAndDownload,
        generateVideo: handleGenerateFullVideo,
        generateVideoLocally,
        generatePartialVideo: handleGeneratePartialVideo,
        cancelVideoGeneration,
        saveThumbnail,
        regenerateProject,
        regenerateText,
        regenerateChapterImages,
        regenerateAllAudio,
        regenerateAllImages,
        regenerateSingleImage,
        generateMoreImages,
        handleTitleSelection,
        setGlobalMusicVolume,
        setChapterMusicVolume,
        manualTtsScript,
        subtitleText,
        generateSrt,
        setChapterMusic,
        findMusicForChapter,
        findMusicManuallyForChapter,
        findSfxForLine,
        findSfxManuallyForLine,
        setSfxForLine,
        setSfxVolume,
        setThumbnailBaseImage,
        setVideoPacingMode,
        setImageDuration,
        regenerateChapterAudio,
        regenerateThumbnails,
        regeneratingImage,
        generatingMoreImages
    };
};
