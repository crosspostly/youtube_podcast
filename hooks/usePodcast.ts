import { safeLower, parseErrorMessage } from '../utils/safeLower-util';
import { cleanupPodcastImages, forceGarbageCollection } from '../utils/memoryCleanup';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { generatePodcastBlueprint, generateNextChapterScript, generateChapterAudio, combineAndMixAudio, regenerateTextAssets, generateThumbnailDesignConcepts, convertWavToMp3, findMusicWithAi, findMusicManually } from '../services/ttsService';
import { findSfxWithAi, findSfxManually } from '../services/sfxService';
import { generateSrtFile } from '../services/srtService';
// Fix: Aliased imports to avoid name collision with functions inside the hook.
import { generateStyleImages, generateYoutubeThumbnails, regenerateSingleImage as regenerateSingleImageApi, generateMoreImages as generateMoreImagesApi } from '../services/imageService';
import { generateVideo as generateVideoService } from '../services/videoService';
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
    const [isGeneratingChapter, setIsGeneratingChapter] = useState(false);
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


    const generateImagesForChapter = useCallback(async (chapterId: string, imagePrompts: string[]): Promise<GeneratedImage[]> => {
        if (!imagePrompts || imagePrompts.length === 0) return [];

        try {
            const newImages = await generateStyleImages(imagePrompts, 3, log, apiKeys, imageMode, stockPhotoPreference);
            return newImages;
        } catch (err: any) {
            const chapterTitle = podcastRef.current?.chapters.find(c => c.id === chapterId)?.title || `ID: ${chapterId}`;
            const friendlyError = parseErrorMessage(err);
            log({type: 'error', message: `Ошибка при генерации изображений для главы ${chapterTitle}`, data: { friendlyMessage: friendlyError, originalError: err }});
            updateChapterState(chapterId, 'error', { error: friendlyError });
            return [];
        }
    }, [updateChapterState, log, apiKeys, imageMode]);


    const handleGenerateChapter = useCallback(async (chapterId: string) => {
        if (!podcast) return;
        const chapterIndex = podcast.chapters.findIndex(c => c.id === chapterId);
        if (chapterIndex === -1) return;
    
        try {
            // Step 1: Generate Script
            updateChapterState(chapterId, 'script_generating');
            const chapterData = await generateNextChapterScript(podcast.topic, podcast.selectedTitle, podcast.characters, podcast.chapters.slice(0, chapterIndex), chapterIndex, podcast.totalDurationMinutes, podcast.knowledgeBaseText || '', podcast.creativeFreedom, podcast.language, log, apiKeys);
            
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
                generateImagesForChapter(chapterId, chapterData.imagePrompts),
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
    }, [podcast, log, updateChapterState, generateImagesForChapter, apiKeys]);

    const podcastRef = React.useRef(podcast);
    useEffect(() => {
        podcastRef.current = podcast;
    }, [podcast]);

    useEffect(() => {
        const pendingChapter = podcast?.chapters.find(c => c.status === 'pending');
        if (pendingChapter && !isLoading && !isGeneratingChapter && !isGenerationPaused) {
            setIsGeneratingChapter(true);
            handleGenerateChapter(pendingChapter.id).finally(() => setIsGeneratingChapter(false));
        }
    }, [podcast?.chapters, handleGenerateChapter, isLoading, isGeneratingChapter, isGenerationPaused]);

    const startNewProject = useCallback(async (topic: string, knowledgeBaseText: string, creativeFreedom: boolean, language: string, totalDurationMinutes: number, narrationMode: NarrationMode, characterVoicePrefs: { [key: string]: string }, monologueVoice: string, initialImageCount: number) => {
        if (!topic.trim()) { setError('Введите название проекта.'); return; }
        setIsLoading(true);
        setError(null);
        setWarning(null);
        setPodcastState(null); // Set directly to avoid saving empty state to history
        setLogs([]);
        setGenerationProgress(0);
        setIsGenerationPaused(false);

        const initialSteps: LoadingStatus[] = [
            { label: 'Анализ темы и создание концепции', status: 'pending' },
            { label: 'Подбор музыки и SFX для первой главы', status: 'pending' },
            { label: 'Генерация изображений для первой главы', status: 'pending' },
            { label: 'Озвучивание первой главы', status: 'pending' },
            { label: 'Разработка дизайн-концепций обложек', status: 'pending' },
            { label: 'Создание вариантов обложек для YouTube', status: 'pending' }
        ];
        setLoadingStatus(initialSteps);
    
        const updateStatus = (label: string, status: LoadingStatus['status']) => {
            setLoadingStatus(prev => prev.map(step => step.label === label ? { ...step, status } : step));
        };
        
        try {
            updateStatus('Анализ темы и создание концепции', 'in_progress');
            const blueprint = await generatePodcastBlueprint(topic, knowledgeBaseText, creativeFreedom, language, totalDurationMinutes, log, apiKeys, initialImageCount);
            updateStatus('Анализ темы и создание концепции', 'completed');
            setGenerationProgress(15);
            
            updateStatus('Подбор музыки и SFX для первой главы', 'in_progress');
            const firstChapterScriptText = blueprint.chapters[0].script.map(line => line.text).join(' ');
            const musicTracks = await findMusicWithAi(firstChapterScriptText, log, apiKeys);
            if (musicTracks.length > 0) {
                blueprint.chapters[0].backgroundMusic = musicTracks[0];
            }
            updateStatus('Подбор музыки и SFX для первой главы', 'completed');
            setGenerationProgress(30);

            const finalCharacterVoices: { [key: string]: string } = {};
            if (blueprint.characters.length > 0 && characterVoicePrefs.character1) {
                finalCharacterVoices[blueprint.characters[0].name] = characterVoicePrefs.character1;
            }
            if (blueprint.characters.length > 1 && characterVoicePrefs.character2) {
                finalCharacterVoices[blueprint.characters[1].name] = characterVoicePrefs.character2;
            }

            updateStatus('Генерация изображений для первой главы', 'in_progress');
            const generatedImages = await generateStyleImages(blueprint.chapters[0].imagePrompts, initialImageCount, log, apiKeys, imageMode, stockPhotoPreference);
            blueprint.chapters[0].generatedImages = generatedImages;
            updateStatus('Генерация изображений для первой главы', 'completed');
            setGenerationProgress(p => p + 25);

            updateStatus('Озвучивание первой главы', 'in_progress');
            const firstChapterAudio = await generateChapterAudio(blueprint.chapters[0].script, narrationMode, finalCharacterVoices, monologueVoice, log, apiKeys);
            updateStatus('Озвучивание первой главы', 'completed');
            setGenerationProgress(p => p + 20);
            
            updateStatus('Разработка дизайн-концепций обложек', 'in_progress');
            const designConcepts = await generateThumbnailDesignConcepts(topic, language, log, apiKeys);
            updateStatus('Разработка дизайн-концепций обложек', 'completed');
            setGenerationProgress(p => p + 5);
            
            const selectedTitle = blueprint.youtubeTitleOptions[0] || topic;
            const thumbnailBaseImage = generatedImages.length > 0 ? generatedImages[0] : undefined;

            updateStatus('Создание вариантов обложек для YouTube', 'in_progress');
            const youtubeThumbnails = thumbnailBaseImage?.url ? await generateYoutubeThumbnails(thumbnailBaseImage.url, selectedTitle, designConcepts, log, defaultFont) : [];
            updateStatus('Создание вариантов обложек для YouTube', 'completed');
            setGenerationProgress(100);

            const CHAPTER_DURATION_MIN = 7;
            const totalChapters = Math.max(1, Math.ceil(totalDurationMinutes / CHAPTER_DURATION_MIN));
            const firstChapter: Chapter = { ...blueprint.chapters[0], status: 'completed', audioBlob: firstChapterAudio };
            
            // Refactored to use a functional approach instead of a loop with .push()
            const additionalChapters: Chapter[] = Array.from({ length: Math.max(0, totalChapters - 1) }, (_, i) => ({
                id: crypto.randomUUID(),
                title: `Глава ${i + 2}`,
                script: [],
                status: 'pending',
                imagePrompts: [],
                selectedBgIndex: 0
            }));

            const newPodcast: Podcast = {
                id: crypto.randomUUID(), ...blueprint, topic, selectedTitle, language,
                chapters: [firstChapter, ...additionalChapters],
                youtubeThumbnails: youtubeThumbnails || [],
                designConcepts: designConcepts || [], knowledgeBaseText: knowledgeBaseText,
                creativeFreedom: creativeFreedom, totalDurationMinutes: totalDurationMinutes,
                narrationMode, characterVoices: finalCharacterVoices, monologueVoice,
                backgroundMusicVolume: 0.02, initialImageCount, thumbnailBaseImage,
                videoPacingMode: 'auto',
            };
            
            setPodcast(newPodcast);
        } catch (err: any) {
            const friendlyError = parseErrorMessage(err);
            setLoadingStatus(prev => {
                const currentStepIndex = prev.findIndex(s => s.status === 'in_progress');
                if (currentStepIndex !== -1) {
                    const newStatus = [...prev];
                    newStatus[currentStepIndex] = { ...newStatus[currentStepIndex], status: 'error' };
                    return newStatus;
                }
                return prev;
            });
            setError(friendlyError);
            log({ type: 'error', message: 'Критическая ошибка при инициализации проекта', data: { friendlyMessage: friendlyError, originalError: err } });
        } finally {
            setIsLoading(false);
        }
    }, [log, setPodcast, apiKeys, defaultFont, setError]);

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
            
            // ✅ CLEANUP: Изображения больше не нужны после экспорта аудио
            const cleanedMB = cleanupPodcastImages(podcast);
            if (cleanedMB > 0) {
                log({ 
                    type: 'info', 
                    message: `🧹 Очищено ${cleanedMB.toFixed(2)} МБ памяти` 
                });
            }
            
        } catch (err: any) {
            const friendlyError = parseErrorMessage(err);
            setError(friendlyError);
            log({type: 'error', message: `Ошибка при сборке и экспорте (${format})`, data: { friendlyMessage: friendlyError, originalError: err }});
            
            // ✅ CLEANUP даже при ошибке
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
            // FIX: Cast `window` to `any` to access `document` because DOM types are missing in the environment.
            const a = (window as any).document.createElement('a');
            a.href = url;
            a.download = `${safeLower(podcast.selectedTitle.replace(/[^a-z0-9а-яё]/gi, '_'))}.srt`;
            // FIX: Cast `window` to `any` to access `document` because DOM types are missing in the environment.
            (window as any).document.body.appendChild(a);
            a.click();
            // FIX: Cast `window` to `any` to access `document` because DOM types are missing in the environment.
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
                podcastToRender,
                finalAudioBlob,
                (progress, message) => setVideoGenerationProgress({ progress, message }),
                log,
                manualDurations
            );

            const url = URL.createObjectURL(videoBlob);
            // FIX: Cast `window` to `any` to access `document` because DOM types are missing in the environment.
            const a = (window as any).document.createElement('a');
            a.href = url;
            a.download = `${safeLower(podcastToRender.selectedTitle.replace(/[^a-z0-9а-яё]/gi, '_'))}.mp4`;
            // FIX: Cast `window` to `any` to access `document` because DOM types are missing in the environment.
            (window as any).document.body.appendChild(a);
            a.click();
            // FIX: Cast `window` to `any` to access `document` because DOM types are missing in the environment.
            (window as any).document.body.removeChild(a);
            URL.revokeObjectURL(url);

            log({ type: 'response', message: '✅ Видео успешно создано' });
            
            // ✅ CLEANUP: Освобождаем память после успешной генерации
            const cleanedMB = cleanupPodcastImages(podcastToRender);
            log({ 
                type: 'info', 
                message: `🧹 Очищено ${cleanedMB.toFixed(2)} МБ памяти от base64 изображений` 
            });
            
            // Опционально: принудительная сборка мусора
            forceGarbageCollection();
            
        } catch (err: any) {
            const friendlyError = parseErrorMessage(err);
            setError(friendlyError);
            log({type: 'error', message: 'Ошибка при генерации видео', data: { friendlyMessage: friendlyError, originalError: err }});
            
            // ✅ CLEANUP даже при ошибке
            const cleanedMB = cleanupPodcastImages(podcastToRender);
            log({ 
                type: 'info', 
                message: `🧹 Память очищена (${cleanedMB.toFixed(2)} МБ) несмотря на ошибку` 
            });
        } finally {
            setIsGeneratingVideo(false);
        }
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
        // FIX: Cast `window` to `any` to access `confirm` because DOM types are missing in the environment.
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
        const chapter = podcastRef.current?.chapters.find(c => c.id === chapterId);
        if (!podcastRef.current || !chapter) return;
        
        updateChapterState(chapterId, 'images_generating');
        try {
            const newImages = await generateStyleImages(chapter.imagePrompts, 3, log, apiKeys, imageMode, stockPhotoPreference);
            // Reset durations when all images are regenerated in manual mode
            const newDurations = podcastRef.current?.videoPacingMode === 'manual' ? Array(newImages.length).fill(60) : undefined;
            updateChapterState(chapterId, 'completed', { generatedImages: newImages, imageDurations: newDurations }); // Assuming it goes back to completed
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
        
        // Set all chapters to images_generating status
        setPodcast(p => {
            if (!p) return null;
            return { ...p, chapters: p.chapters.map(c => ({ ...c, status: 'images_generating' })) };
        });

        type ChapterResult = { chapterId: string; status: Chapter['status']; generatedImages?: GeneratedImage[]; error?: string; };

        const regenerationPromises = podcast.chapters.map(async (chapter): Promise<ChapterResult> => {
            try {
                const newImages = await generateStyleImages(chapter.imagePrompts, 3, log, apiKeys, imageMode, stockPhotoPreference);
                const newDurations = podcast.videoPacingMode === 'manual' ? Array(newImages.length).fill(60) : undefined;
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

        // Prevent multiple simultaneous regenerations
        if (regeneratingImage !== null) {
            log({ type: 'warning', message: 'Другое изображение уже регенерируется. Пожалуйста, подождите.' });
            return;
        }

        setRegeneratingImage({ chapterId, index });
        try {
            const requestKey = `regenerate-${chapterId}-${index}`;
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

        // Prevent multiple simultaneous generations
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
             if (tracks.length === 0) {
                log({ type: 'info', message: `Подходящая музыка по запросу "${keywords}" не найдена.` });
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
        
        // First try to use embedded searchTags
        if (line.searchTags) {
            try {
                log({ type: 'info', message: `Поиск SFX для "${line.text}" по встроенным тегам: "${line.searchTags}"` });
                return await findSfxManually(line.searchTags, log, apiKeys.freesound);
            } catch (e: any) {
                log({ type: 'error', message: 'Ошибка поиска SFX по встроенным тегам', data: e });
                return [];
            }
        }
        
        // Fallback: use AI-generated keywords (this should rarely happen now)
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
        podcast, setPodcastState, 
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
    };
};