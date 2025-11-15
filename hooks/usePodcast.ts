import { safeLower, parseErrorMessage } from '../utils/safeLower-util';
import { cleanupPodcastImages, forceGarbageCollection } from '../utils/memoryCleanup';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { generatePodcastBlueprint, generateNextChapterScript, generateChapterAudio, combineAndMixAudio, regenerateTextAssets, generateThumbnailDesignConcepts, convertWavToMp3, findMusicWithAi, findMusicManually } from '../services/ttsService';
import { findSfxWithAi, findSfxManually } from '../services/sfxService';
import { generateSrtFile } from '../services/srtService';
// Fix: Aliased imports to avoid name collision with functions inside the hook.
import { generateStyleImages, generateYoutubeThumbnails, regenerateSingleImage as regenerateSingleImageApi, generateMoreImages as generateMoreImagesApi } from '../services/imageService';
import { generateVideo as generateVideoService, cancelFfmpeg } from '../services/videoService';
import type { Podcast, Chapter, LogEntry, YoutubeThumbnail, NarrationMode, MusicTrack, ScriptLine, SoundEffect, ImageMode, GeneratedImage, StockPhotoPreference } from '../types';
import { TEST_PODCAST_BLUEPRINT } from '../services/testData';


interface LoadingStatus {
    label: string;
    status: 'pending' | 'in_progress' | 'completed' | 'error';
}

export const usePodcast = (
    updateHistory: (podcast: Podcast) => void,
    apiKeys: { gemini: string; freesound: string, unsplash?: string, pexels?: string },
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
    }, [podcast, log, updateChapterState, apiKeys, imageMode]);
    
    const startNewProject = useCallback(async (topic: string, knowledgeBaseText: string, creativeFreedom: boolean, language: string, totalDurationMinutes: number, narrationMode: NarrationMode, characterVoicePrefs: { [key: string]: string }, monologueVoice: string, initialImageCount: number) => {
        if (!topic.trim()) { setError('Введите название проекта.'); return; }
        setIsLoading(true);
        setError(null);
        setWarning(null);
        setPodcastState(null);
        setLogs([]);
        setGenerationProgress(0);
        setIsGenerationPaused(false);
    
        const CHAPTER_DURATION_MIN = 7;
        const totalChapters = Math.max(1, Math.ceil(totalDurationMinutes / CHAPTER_DURATION_MIN));
    
        const initialSteps: LoadingStatus[] = [
            // FIX: Explicitly cast status strings to their literal types using 'as const' to prevent them from being widened to the general 'string' type, resolving a TypeScript error.
            { label: 'Создание концепции и сценария главы 1', status: 'pending' as const },
            ...Array.from({ length: totalChapters - 1 }, (_, i) => ({ label: `Генерация сценария главы ${i + 2}`, status: 'pending' as const })),
            { label: 'Параллельная генерация аудио', status: 'pending' as const },
            { label: 'Параллельная генерация изображений', status: 'pending' as const },
            { label: 'Создание обложек', status: 'pending' as const },
        ];
        setLoadingStatus(initialSteps);
    
        const updateStatus = (label: string, status: LoadingStatus['status']) => {
            setLoadingStatus(prev => prev.map(step => step.label === label ? { ...step, status } : step));
        };
    
        try {
            // --- PHASE 0: Blueprint ---
            updateStatus('Создание концепции и сценария главы 1', 'in_progress');
            const blueprint = await generatePodcastBlueprint(topic, knowledgeBaseText, creativeFreedom, language, totalDurationMinutes, narrationMode, log, apiKeys, initialImageCount);
            updateStatus('Создание концепции и сценария главы 1', 'completed');
            setGenerationProgress(100 / (totalChapters + 2));
    
            const finalCharacterVoices: { [key: string]: string } = {};
            if (blueprint.characters.length > 0 && characterVoicePrefs.character1) finalCharacterVoices[blueprint.characters[0].name] = characterVoicePrefs.character1;
            if (blueprint.characters.length > 1 && characterVoicePrefs.character2) finalCharacterVoices[blueprint.characters[1].name] = characterVoicePrefs.character2;
    
            const chapters: Chapter[] = [
                // FIX: Explicitly cast status string to its literal type using 'as const' to prevent it from being widened to the general 'string' type, resolving a TypeScript assignment error.
                { id: crypto.randomUUID(), ...blueprint.chapters[0], status: 'script_completed' as const },
                ...Array.from({ length: totalChapters - 1 }, (_, i) => ({
                    id: crypto.randomUUID(), title: `Глава ${i + 2}`, script: [], status: 'pending' as const, imagePrompts: [], selectedBgIndex: 0
                }))
            ];
    
            let tempPodcast: Podcast = {
                id: crypto.randomUUID(), ...blueprint, topic, selectedTitle: blueprint.youtubeTitleOptions[0] || topic, language,
                chapters, knowledgeBaseText, creativeFreedom, totalDurationMinutes, narrationMode,
                characterVoices: finalCharacterVoices, monologueVoice, initialImageCount, backgroundMusicVolume: 0.02, videoPacingMode: 'auto',
            };
            setPodcast(tempPodcast);
    
            // --- PHASE 1: Sequential Script Generation ---
            for (let i = 1; i < totalChapters; i++) {
                if (isGenerationPaused) { await new Promise(resolve => { const interval = setInterval(() => { if (!isGenerationPaused) { clearInterval(interval); resolve(null); }}, 500); });}
                updateStatus(`Генерация сценария главы ${i + 2}`, 'in_progress');
                const chapterData = await generateNextChapterScript(topic, tempPodcast.selectedTitle, tempPodcast.characters, tempPodcast.chapters.slice(0, i), i, totalDurationMinutes, knowledgeBaseText, creativeFreedom, language, narrationMode, log, apiKeys);
                tempPodcast.chapters[i] = { ...tempPodcast.chapters[i], ...chapterData, status: 'script_completed' };
                setPodcast({ ...tempPodcast });
                updateStatus(`Генерация сценария главы ${i + 2}`, 'completed');
                setGenerationProgress(p => p + 100 / (totalChapters + 2));
            }
    
            // --- PHASE 2: Parallel Asset Generation (Refactored to prevent race conditions) ---
            updateStatus('Параллельная генерация аудио', 'in_progress');
            updateStatus('Параллельная генерация изображений', 'in_progress');

            const assetPromises = tempPodcast.chapters.map(chapter => 
                Promise.allSettled([
                    generateChapterAudio(chapter.script, narrationMode, finalCharacterVoices, monologueVoice, log, apiKeys),
                    generateStyleImages(chapter.imagePrompts, initialImageCount, log, apiKeys, imageMode, stockPhotoPreference),
                    findMusicWithAi(chapter.script.map(l => l.text).join(' '), log, apiKeys)
                ]).then(([audioResult, imageResult, musicResult]) => ({
                    chapterId: chapter.id,
                    audioBlob: audioResult.status === 'fulfilled' ? audioResult.value : null,
                    generatedImages: imageResult.status === 'fulfilled' ? imageResult.value : [],
                    backgroundMusic: musicResult.status === 'fulfilled' ? (musicResult.value[0] || undefined) : undefined,
                    audioError: audioResult.status === 'rejected' ? audioResult.reason : null,
                    imageError: imageResult.status === 'rejected' ? imageResult.reason : null,
                    musicError: musicResult.status === 'rejected' ? musicResult.reason : null,
                }))
            );
            
            const assetResults = await Promise.all(assetPromises);

            // Update the local tempPodcast object with all results before setting state
            tempPodcast.chapters = tempPodcast.chapters.map(chapter => {
                const result = assetResults.find(r => r.chapterId === chapter.id);
                if (!result) return chapter;

                if (result.audioError) {
                    log({ type: 'error', message: `Ошибка аудио для главы "${chapter.title}"`, data: result.audioError });
                    return { ...chapter, status: 'error' as const, error: 'Ошибка генерации аудио' };
                }
                if (result.imageError) {
                    log({ type: 'warning', message: `Ошибка изображений для главы "${chapter.title}"`, data: result.imageError });
                }
                if (result.musicError) {
                    log({ type: 'warning', message: `Ошибка музыки для главы "${chapter.title}"`, data: result.musicError });
                }
                
                return {
                    ...chapter,
                    audioBlob: result.audioBlob || undefined,
                    generatedImages: result.generatedImages,
                    backgroundMusic: result.backgroundMusic,
                };
            });

            // Set state once with the updated local object
            setPodcast({ ...tempPodcast });
            
            updateStatus('Параллельная генерация аудио', 'completed');
            updateStatus('Параллельная генерация изображений', 'completed');
            setGenerationProgress(p => p + 100 / (totalChapters + 2));

            // --- FINALIZATION ---
            updateStatus('Создание обложек', 'in_progress');
            // Use the up-to-date local variable, NOT a stale ref, to prevent race conditions
            const finalPodcastState = tempPodcast;
            
            const thumbnailBaseImage = finalPodcastState.chapters.flatMap(c => c.generatedImages || [])[0];
            const designConcepts = await generateThumbnailDesignConcepts(topic, language, log, apiKeys);
            const youtubeThumbnails = thumbnailBaseImage?.url ? await generateYoutubeThumbnails(thumbnailBaseImage.url, finalPodcastState.selectedTitle, designConcepts, log, defaultFont) : [];
            updateStatus('Создание обложек', 'completed');
            setGenerationProgress(100);

            // Final state update with all generated assets
            setPodcast({
                ...finalPodcastState,
                chapters: finalPodcastState.chapters.map(c => c.status !== 'error' ? { ...c, status: 'completed' as const } : c),
                thumbnailBaseImage,
                designConcepts,
                youtubeThumbnails,
            });
    
        } catch (err: any) {
            const friendlyError = parseErrorMessage(err);
            setLoadingStatus(prev => prev.map(s => s.status === 'in_progress' ? { ...s, status: 'error' as const } : s));
            setError(friendlyError);
            log({ type: 'error', message: 'Критическая ошибка при инициализации проекта', data: { friendlyMessage: friendlyError, originalError: err } });
        } finally {
            setIsLoading(false);
        }
    }, [log, setPodcast, apiKeys, defaultFont, setError, isGenerationPaused, imageMode, stockPhotoPreference, updateChapterState]);

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

            const url = URL.createObjectURL(finalBlob);
            // FIX: Cast `window` to `any` to access `document` because DOM types are missing in the environment.
            const a = (window as any).document.createElement('a');
            a.href = url;
            a.download = `${safeLower(podcast.selectedTitle.replace(/[^a-z0-9а-яё]/gi, '_'))}.${extension}`;
            // FIX: Cast `window` to `any` to access `document` because DOM types are missing in the environment.
            (window as any).document.body.appendChild(a);
            a.click();
            // FIX: Cast `window` to `any` to access `document` because DOM types are missing in the environment.
            (window as any).document.body.removeChild(a);
            URL.revokeObjectURL(url);

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
            const url = URL.createObjectURL(srtBlob);
            const a = (window as any).document.createElement('a');
            a.href = url;
            a.download = `${safeLower(podcast.selectedTitle.replace(/[^a-z0-9а-яё]/gi, '_'))}.srt`;
            (window as any).document.body.appendChild(a);
            a.click();
            (window as any).document.body.removeChild(a);
            URL.revokeObjectURL(url);
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

            const url = URL.createObjectURL(videoBlob);
            const a = (window as any).document.createElement('a');
            a.href = url;
            a.download = `${safeLower(podcastToRender.selectedTitle.replace(/[^a-z0-9а-яё]/gi, '_'))}.mp4`;
            (window as any).document.body.appendChild(a);
            a.click();
            (window as any).document.body.removeChild(a);
            URL.revokeObjectURL(url);

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
                    newDurations[imageIndex] = duration > 0 ? duration : 1; // Ensure duration is at least 1s
                    return { ...c, imageDurations: newDurations };
                }
                return c;
            });
            return { ...p, chapters: updatedChapters };
        });
    }, [setPodcast]);

    const regenerateProject = () => {
        if (!podcast) return;
        if ((window as any).confirm("Вы уверены, что хотите полностью пересоздать этот проект?")) {
            startNewProject(podcast.topic, podcast.knowledgeBaseText || '', podcast.creativeFreedom, podcast.language, podcast.totalDurationMinutes, podcast.narrationMode, podcast.characterVoices, podcast.monologueVoice, podcast.initialImageCount);
        }
    };

    const handleTitleSelection = useCallback(async (newTitle: string, forceUpdate = false) => {
        if (!podcast || (!forceUpdate && podcast.selectedTitle === newTitle)) return;
        
        if (!podcast.designConcepts || !podcast.thumbnailBaseImage) {
             setPodcast(p => p ? { ...p, selectedTitle: newTitle } : null);
             return;
        }

        try {
            const newThumbnails = await generateYoutubeThumbnails(podcast.thumbnailBaseImage.url, newTitle, podcast.designConcepts, log, defaultFont);
            setPodcast(p => p ? { ...p, selectedTitle: newTitle, youtubeThumbnails: newThumbnails } : null);
        } catch (err: any) {
            const friendlyError = parseErrorMessage(err);
            setError(friendlyError);
            log({ type: 'error', message: 'Не удалось обновить обложки после смены заголовка', data: { friendlyMessage: friendlyError, originalError: err } });
        }
    }, [podcast, log, setPodcast, defaultFont, setError]);
    
     const setThumbnailBaseImage = useCallback(async (image: GeneratedImage) => {
        if (!podcast || podcast.thumbnailBaseImage?.url === image.url) return;

        if (!podcast.designConcepts) {
            setPodcast(p => p ? { ...p, thumbnailBaseImage: image } : null);
            return;
        };

        try {
             const newThumbnails = await generateYoutubeThumbnails(image.url, podcast.selectedTitle, podcast.designConcepts, log, defaultFont);
             setPodcast(p => p ? { ...p, thumbnailBaseImage: image, youtubeThumbnails: newThumbnails } : null);
        } catch(err: any) {
            const friendlyError = parseErrorMessage(err);
            setError(friendlyError);
            log({ type: 'error', message: 'Не удалось перерисовать обложки с новым фоном', data: { friendlyMessage: friendlyError, originalError: err } });
        }
    }, [podcast, log, setPodcast, defaultFont, setError]);

    const regenerateText = async () => {
        if (!podcast) return;
        setIsRegeneratingText(true);
        try {
            const newTextAssets = await regenerateTextAssets(podcast.topic, podcast.knowledgeBaseText || '', podcast.creativeFreedom, podcast.language, log, apiKeys);
            const newSelectedTitle = newTextAssets.youtubeTitleOptions[0] || podcast.selectedTitle;
            setPodcast(p => p ? { ...p, ...newTextAssets } : null); // Update text first
            await handleTitleSelection(newSelectedTitle, true); // Then update thumbnails
        } catch (err: any) {
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
            const newDurations = podcast?.videoPacingMode === 'manual' ? Array(newImages.length).fill(60) : undefined;
            updateChapterState(chapterId, 'completed', { generatedImages: newImages, imageDurations: newDurations });
        } catch (err: any) {
            const friendlyError = parseErrorMessage(err);
            log({type: 'error', message: `Ошибка при регенерации изображений для главы ${chapter.title}`, data: { friendlyMessage: friendlyError, originalError: err }});
            updateChapterState(chapterId, 'error', { error: friendlyError });
        }
    };
    

    const regenerateAllAudio = async () => {
        if (!podcast) return;
        setIsRegeneratingAudio(true);
        log({ type: 'info', message: 'Начало переозвучки всех глав.' });
    
        setPodcast(p => {
            if (!p) return null;
            return { ...p, chapters: p.chapters.map(c => c.script && c.script.length > 0 ? { ...c, status: 'audio_generating' } : c) };
        });
    
        type ChapterResult = { chapterId: string; status: Chapter['status']; audioBlob?: Blob; error?: string; };
    
        const regenerationPromises = podcast.chapters.map(async (chapter): Promise<ChapterResult> => {
            if (chapter.script && chapter.script.length > 0) {
                try {
                    const audioBlob = await generateChapterAudio( chapter.script, podcast.narrationMode, podcast.characterVoices, podcast.monologueVoice, log, apiKeys);
                    return { chapterId: chapter.id, status: 'completed', audioBlob };
                } catch (err: any) {
                    log({ type: 'error', message: `Ошибка при переозвучке главы ${chapter.title}`, data: err });
                    return { chapterId: chapter.id, status: 'error', error: err.message || 'Ошибка озвучки' };
                }
            }
            return { chapterId: chapter.id, status: chapter.status }; // No change
        });
    
        const results = await Promise.all(regenerationPromises);
    
        setPodcast(p => {
            if (!p) return null;
            const updatedChapters = p.chapters.map(chapter => {
                const result = results.find(r => r.chapterId === chapter.id);
                return result ? { ...chapter, status: result.status, audioBlob: result.audioBlob, error: result.error } : chapter;
            });
            return { ...p, chapters: updatedChapters };
        });
    
        log({ type: 'info', message: 'Переозвучка всех глав завершена.' });
        setIsRegeneratingAudio(false);
    };

    const regenerateAllImages = async () => {
        if (!podcast) return;
        log({ type: 'info', message: 'Начало регенерации всех изображений.' });
        
        setPodcast(p => {
            if (!p) return null;
            return { ...p, chapters: p.chapters.map(c => ({ ...c, status: 'images_generating' })) };
        });

        type ChapterResult = { chapterId: string; status: Chapter['status']; generatedImages?: GeneratedImage[]; error?: string; };

        const regenerationPromises = podcast.chapters.map(async (chapter): Promise<ChapterResult> => {
            try {
                const newImages = await generateStyleImages(chapter.imagePrompts, 3, log, apiKeys, imageMode, stockPhotoPreference);
                if (podcast.videoPacingMode === 'manual') {
                    const newDurations = Array(newImages.length).fill(60);
                }
                return { chapterId: chapter.id, status: 'completed', generatedImages: newImages };
            } catch (err: any) {
                log({ type: 'error', message: `Ошибка при регенерации изображений для главы ${chapter.title}`, data: err });
                return { chapterId: chapter.id, status: 'error', error: err.message || 'Ошибка генерации изображений' };
            }
        });

        const results = await Promise.all(regenerationPromises);

        setPodcast(p => {
            if (!p) return null;
            const updatedChapters = p.chapters.map(chapter => {
                const result = results.find(r => r.chapterId === chapter.id);
                if (result) {
                    const updatedChapter = { ...chapter, status: result.status, error: result.error };
                    if (result.generatedImages) {
                        updatedChapter.generatedImages = result.generatedImages;
                        if (podcast.videoPacingMode === 'manual') {
                            updatedChapter.imageDurations = Array(result.generatedImages.length).fill(60);
                        }
                    }
                    return updatedChapter;
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
            log({ type: 'warning', message: 'Другое изображение уже регенерируется. Пожалуйста, подождите.' });
            return;
        }

        setRegeneratingImage({ chapterId, index });
        try {
            const newImage = await regenerateSingleImageApi(chapter.imagePrompts[index], log, apiKeys, imageMode, stockPhotoPreference);
            
            setPodcast(p => {
                if (!p) return null;
                const newChapters = p.chapters.map(c => {
                    if (c.id === chapterId) {
                        const newImages = [...(c.generatedImages || [])];
                        newImages[index] = newImage;
                        return {...c, generatedImages: newImages};
                    }
                    return c;
                });
                return {...p, chapters: newChapters};
            });
            
        } catch (err: any) {
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
            log({ type: 'warning', message: 'Уже идет генерация дополнительных изображений. Пожалуйста, подождите.' });
            return;
        }

        setGeneratingMoreImages(chapterId);
        try {
            const newImages = await generateMoreImagesApi(chapter.imagePrompts, log, apiKeys, imageMode, stockPhotoPreference);
            setPodcast(p => {
                if (!p) return null;
                const newChapters = p.chapters.map(c => {
                    if (c.id === chapterId) {
                        const existingImages = c.generatedImages || [];
                        const updatedImages = [...existingImages, ...newImages];
                        let updatedDurations = c.imageDurations;
                        if (p.videoPacingMode === 'manual') {
                            const newImageDurations = Array(newImages.length).fill(60);
                            const oldDurations = c.imageDurations?.length === existingImages.length ? c.imageDurations : Array(existingImages.length).fill(60);
                            updatedDurations = [...oldDurations, ...newImageDurations];
                        }
                        return { ...c, generatedImages: updatedImages, imageDurations: updatedDurations };
                    }
                    return c;
                });
                return { ...p, chapters: newChapters };
            });
        } catch (err: any) {
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
            const audioBlob = await generateChapterAudio(
                chapter.script,
                podcast.narrationMode,
                podcast.characterVoices,
                podcast.monologueVoice,
                log,
                apiKeys
            );
            updateChapterState(chapterId, 'completed', { audioBlob });
            log({ type: 'response', message: `Аудио для главы "${chapter.title}" успешно пересоздано.` });
        } catch (err: any) {
            const friendlyError = parseErrorMessage(err);
            log({ type: 'error', message: `Ошибка при пересоздании аудио для главы "${chapter.title}"`, data: { friendlyMessage: friendlyError, originalError: err } });
            updateChapterState(chapterId, 'error', { error: friendlyError });
        }
    };

    const manualTtsScript = useMemo(() => {
        if (!podcast) return 'Генерация сценария...';
        const completedChapters = podcast.chapters.filter(c => c.status === 'completed' && c.script?.length > 0);
        if (completedChapters.length === 0) return 'Сценарий будет доступен после завершения глав.';
        return "Style Instructions: Read aloud in a warm, welcoming tone.\n\n" + completedChapters.map((chapter, index) => `ГЛАВА ${index + 1}: ${chapter.title.toUpperCase()}\n\n` + chapter.script.map(line => line.speaker.toUpperCase() === 'SFX' ? `[SFX: ${line.text}]` : `${line.speaker}: ${line.text}`).join('\n')).join('\n\n---\n\n');
    }, [podcast?.chapters]);

    const subtitleText = useMemo(() => {
        if (!podcast) return '';
        return podcast.chapters.filter(c => c.status === 'completed' && c.script).flatMap(c => c.script).filter(line => line.speaker.toUpperCase() !== 'SFX').map(line => line.text).join('\n');
    }, [podcast?.chapters]);

    const findMusicForChapter = useCallback(async (chapterId: string): Promise<MusicTrack[]> => {
        if (!podcast) return [];
        const chapter = podcast.chapters.find(c => c.id === chapterId);
        if (!chapter) return [];

        try {
            const scriptText = chapter.script.map(l => l.text).join(' ');
            const query = scriptText.trim() ? scriptText : podcast.topic;
            const tracks = await findMusicWithAi(query, log, apiKeys);
            if (tracks.length === 0) {
                log({ type: 'info', message: `Подходящая музыка для главы "${chapter.title}" не найдена.` });
            }
            return tracks;
        } catch (err: any) {
            const friendlyError = parseErrorMessage(err);
            setError(friendlyError);
            log({type: 'error', message: 'Ошибка при поиске музыки.', data: { friendlyMessage: friendlyError, originalError: err }});
            return [];
        }
    }, [podcast, log, apiKeys, setError]);

    const findMusicManuallyForChapter = useCallback(async (keywords: string): Promise<MusicTrack[]> => {
        if (!podcast) return [];
        try {
            const tracks = await findMusicManually(keywords, log);
             if (tracks.length > 0) {
                log({ type: 'response', message: 'Музыкальные треки по ручному запросу успешно получены.' });
            } else {
                log({ type: 'info', message: 'По ручному запросу музыка не найдена.' });
            }
            return tracks;
        } catch (err: any) {
            const friendlyError = parseErrorMessage(err);
            setError(friendlyError);
            log({type: 'error', message: 'Ошибка при ручном поиске музыки.', data: { friendlyMessage: friendlyError, originalError: err }});
            return [];
        }
    }, [podcast, log, setError]);

    // --- SFX Management ---
    const findSfxForLine = async (chapterId: string, lineIndex: number): Promise<SoundEffect[]> => {
        if (!podcast) return [];
        const line = podcast.chapters.find(c => c.id === chapterId)?.script[lineIndex];
        if (!line || line.speaker.toUpperCase() !== 'SFX') return [];
        
        if (line.searchTags) {
            try {
                log({ type: 'info', message: `Поиск SFX для "${line.text}" по встроенным тегам: "${line.searchTags}"` });
                return await findSfxManually(line.searchTags, log, apiKeys.freesound);
            } catch (e: any) {
                log({ type: 'error', message: 'Ошибка поиска SFX по встроенным тегам', data: e });
                return [];
            }
        }
        
        try {
            log({ type: 'warning', message: `SFX "${line.text}" не имеет встроенных тегов, используем AI-генерацию как fallback...` });
            return await findSfxWithAi(line.text, log, apiKeys);
        } catch (e: any) {
            log({ type: 'error', message: 'Ошибка поиска SFX с ИИ', data: e });
            return [];
        }
    };
    
    const findSfxManuallyForLine = async (keywords: string): Promise<SoundEffect[]> => {
        try {
            return await findSfxManually(keywords, log, apiKeys.freesound);
        } catch (e: any) {
            log({ type: 'error', message: 'Ошибка ручного поиска SFX', data: e });
            return [];
        }
    };

    const setSfxForLine = (chapterId: string, lineIndex: number, sfx: SoundEffect | null) => {
        setPodcast(p => {
            if (!p) return null;
            return {
                ...p,
                chapters: p.chapters.map(chapter => {
                    if (chapter.id !== chapterId) return chapter;
                    const newScript = [...chapter.script];
                    const oldLine = newScript[lineIndex];
                    if (oldLine) {
                        newScript[lineIndex] = { ...oldLine, soundEffect: sfx || undefined };
                    }
                    return { ...chapter, script: newScript };
                })
            };
        });
    };

    const setSfxVolume = (chapterId: string, lineIndex: number, volume: number) => {
         setPodcast(p => {
            if (!p) return null;
            return {
                ...p,
                chapters: p.chapters.map(chapter => {
                    if (chapter.id !== chapterId) return chapter;
                    const newScript = [...chapter.script];
                    const oldLine = newScript[lineIndex];
                    if (oldLine) {
                        newScript[lineIndex] = { ...oldLine, soundEffectVolume: volume };
                    }
                    return { ...chapter, script: newScript };
                })
            };
        });
    };


    return {
        podcast, setPodcast: setPodcastState, 
        isLoading, loadingStatus, generationProgress, error, setError,
        warning,
        logs, log,
        audioUrls,
        isGenerationPaused, setIsGenerationPaused,
        editingThumbnail, setEditingThumbnail,
        isRegeneratingText, isRegeneratingAudio,
        regeneratingImage, generatingMoreImages,
        isConvertingToMp3, isGeneratingSrt, isGeneratingVideo, videoGenerationProgress,
        startNewProject, handleGenerateChapter, combineAndDownload, 
        generateVideo: handleGenerateFullVideo, generatePartialVideo: handleGeneratePartialVideo,
        cancelVideoGeneration,
        saveThumbnail, regenerateProject, regenerateText,
        regenerateChapterImages, regenerateAllAudio, regenerateAllImages, regenerateSingleImage,
        generateMoreImages, handleTitleSelection, setGlobalMusicVolume, setChapterMusicVolume,
        manualTtsScript, subtitleText, generateSrt, setChapterMusic,
        findMusicForChapter,
        findMusicManuallyForChapter,
        findSfxForLine, findSfxManuallyForLine, setSfxForLine, setSfxVolume,
        setThumbnailBaseImage,
        startVideoTest,
        setVideoPacingMode, setImageDuration,
        regenerateChapterAudio,
    };
};