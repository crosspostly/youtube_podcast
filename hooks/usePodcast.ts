import { safeLower } from '../utils/safeLower-util';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { generatePodcastBlueprint, generateNextChapterScript, generateChapterAudio, regenerateTextAssets, generateThumbnailDesignConcepts, findMusicWithAi, findMusicManually, findSfxWithAi, findSfxManually, findSfxBatchWithAi } from '../services/ttsService';
// Fix: Aliased imports to avoid name collision with functions inside the hook.
import { generateStyleImages, generateYoutubeThumbnails, regenerateSingleImage as regenerateSingleImageApi, generateMoreImages as generateMoreImagesApi } from '../services/imageService';
import type { Podcast, Chapter, LogEntry, YoutubeThumbnail, NarrationMode, MusicTrack, ScriptLine, SoundEffect } from '../types';
import { TEST_PODCAST_BLUEPRINT } from '../services/testData';


interface LoadingStatus {
    label: string;
    status: 'pending' | 'in_progress' | 'completed' | 'error';
}

export const usePodcast = (
    updateHistory: (podcast: Podcast) => void,
    apiKeys: { gemini: string; openRouter: string, freesound: string },
    defaultFont: string
) => {
    const [podcast, setPodcastState] = useState<Podcast | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [loadingStatus, setLoadingStatus] = useState<LoadingStatus[]>([]);
    const [error, setError] = useState<string | null>(null);
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

    const podcastRef = React.useRef(podcast);
    useEffect(() => {
        podcastRef.current = podcast;
    }, [podcast]);

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


    const generateImagesForChapter = useCallback(async (chapterId: string, imagePrompts: string[]) => {
        if (!imagePrompts || imagePrompts.length === 0) return [];

        try {
            const newImages = await generateStyleImages(imagePrompts, podcastRef.current?.initialImageCount || 3, log, apiKeys);
            return newImages;
        } catch (err: any) {
            const chapterTitle = podcastRef.current?.chapters.find(c => c.id === chapterId)?.title || `ID: ${chapterId}`;
            log({type: 'error', message: `Ошибка при генерации изображений для главы ${chapterTitle}`, data: err});
            updateChapterState(chapterId, 'error', { error: "Ошибка генерации изображений" });
            throw err;
        }
    }, [updateChapterState, log, apiKeys]);

    const generateChapterAssets = useCallback(async (chapterId: string, script: ScriptLine[], imagePrompts: string[]) => {
        const currentPodcast = podcastRef.current;
        if (!currentPodcast || !script || script.length === 0) return;

        try {
            updateChapterState(chapterId, 'audio_generating');
            
            const scriptText = script.map(line => line.text).join(' ');
            
            const [musicTracks, newImages, audioBlob] = await Promise.all([
                findMusicWithAi(scriptText, log, apiKeys.gemini),
                generateImagesForChapter(chapterId, imagePrompts),
                generateChapterAudio(script, currentPodcast.narrationMode, currentPodcast.characterVoices, currentPodcast.monologueVoice, log, apiKeys.gemini)
            ]);
            
            const backgroundMusic = musicTracks.length > 0 ? musicTracks[0] : undefined;
            
            updateChapterState(chapterId, 'completed', { 
                audioBlob,
                generatedImages: newImages || [],
                backgroundMusic
            });
            
            const chapterIndex = currentPodcast.chapters.findIndex(c => c.id === chapterId);
            if (chapterIndex === 0 && podcastRef.current && (!podcastRef.current.youtubeThumbnails || podcastRef.current.youtubeThumbnails.length === 0)) {
                log({ type: 'info', message: 'Первая глава готова, запускаем генерацию обложек.' });
                const baseImage = newImages && newImages.length > 0 ? newImages[0] : undefined;
                if (baseImage) {
                    try {
                        const designConcepts = await generateThumbnailDesignConcepts(podcastRef.current.topic, podcastRef.current.language, log, apiKeys.gemini);
                        const youtubeThumbnails = await generateYoutubeThumbnails(baseImage, podcastRef.current.selectedTitle, designConcepts, log, defaultFont);
                        setPodcast(p => p ? { ...p, youtubeThumbnails, designConcepts, thumbnailBaseImage: baseImage } : null);
                    } catch (thumbError) {
                        log({ type: 'error', message: 'Не удалось сгенерировать обложки.', data: thumbError });
                    }
                }
            }

        } catch (err: any) {
             const chapterIndex = currentPodcast.chapters.findIndex(c => c.id === chapterId);
             const errorMessage = err.message || 'Неизвестная ошибка при генерации ресурсов главы.';
             log({type: 'error', message: `Ошибка при генерации ресурсов для главы ${chapterIndex + 1}`, data: err});
             updateChapterState(chapterId, 'error', { error: errorMessage });
        }

    }, [log, updateChapterState, generateImagesForChapter, apiKeys, setPodcast, defaultFont]);


    const handleGenerateChapter = useCallback(async (chapterId: string) => {
        const currentPodcast = podcastRef.current;
        if (!currentPodcast) return;
        const chapterIndex = currentPodcast.chapters.findIndex(c => c.id === chapterId);
        if (chapterIndex === -1) return;
    
        try {
            // Step 1: Generate Script (and image prompts)
            updateChapterState(chapterId, 'script_generating');
            const chapterData = await generateNextChapterScript(currentPodcast.topic, currentPodcast.selectedTitle, currentPodcast.characters, currentPodcast.chapters.slice(0, chapterIndex), chapterIndex, currentPodcast.totalDurationMinutes, currentPodcast.knowledgeBaseText || '', currentPodcast.creativeFreedom, currentPodcast.language, log, { gemini: apiKeys.gemini, freesound: apiKeys.freesound });
            
            setPodcast(p => {
                if (!p) return null;
                const newChapters = p.chapters.map(c => c.id === chapterId ? {
                    ...c, 
                    script: chapterData.script, 
                    title: chapterData.title, 
                    imagePrompts: chapterData.imagePrompts,
                } : c);
                return {...p, chapters: newChapters};
            });

            // Step 2: Generate assets in parallel, passing fresh data to avoid stale state
            await generateChapterAssets(chapterId, chapterData.script, chapterData.imagePrompts);

        } catch (err: any) {
            const errorMessage = err.message || 'Неизвестная ошибка при генерации главы.';
            log({type: 'error', message: `Ошибка при генерации главы ${chapterIndex + 1}`, data: err});
            updateChapterState(chapterId, 'error', { error: errorMessage });
        }
    }, [log, updateChapterState, generateChapterAssets, apiKeys, setPodcast]);

    useEffect(() => {
        const pendingChapter = podcast?.chapters.find(c => c.status === 'pending');
        // IMPORTANT: The first chapter is now handled by startNewProject, so this effect only runs for subsequent chapters.
        if (pendingChapter && podcast && podcast.chapters.findIndex(c => c.id === pendingChapter.id) > 0 && !isLoading && !isGeneratingChapter && !isGenerationPaused) {
            setIsGeneratingChapter(true);
            handleGenerateChapter(pendingChapter.id).finally(() => setIsGeneratingChapter(false));
        }
    }, [podcast?.chapters, handleGenerateChapter, isLoading, isGeneratingChapter, isGenerationPaused]);

    const startNewProject = useCallback(async (topic: string, knowledgeBaseText: string, creativeFreedom: boolean, language: string, totalDurationMinutes: number, narrationMode: NarrationMode, characterVoicePrefs: { [key: string]: string }, monologueVoice: string, initialImageCount: number) => {
        if (!topic.trim()) { setError('Введите название проекта.'); return; }
        setIsLoading(true);
        setError(null);
        setPodcastState(null); // Set directly to avoid saving empty state to history
        setLogs([]);
        setGenerationProgress(0);
        setIsGenerationPaused(false);

        setLoadingStatus([{ label: 'Анализ темы и создание концепции...', status: 'in_progress' }]);
        
        try {
            const blueprint = await generatePodcastBlueprint(topic, knowledgeBaseText, creativeFreedom, language, totalDurationMinutes, log, { gemini: apiKeys.gemini, freesound: apiKeys.freesound });
            
            const finalCharacterVoices: { [key: string]: string } = {};
            if (blueprint.characters.length > 0 && characterVoicePrefs.character1) {
                finalCharacterVoices[blueprint.characters[0].name] = characterVoicePrefs.character1;
            }
            if (blueprint.characters.length > 1 && characterVoicePrefs.character2) {
                finalCharacterVoices[blueprint.characters[1].name] = characterVoicePrefs.character2;
            }

            const selectedTitle = blueprint.youtubeTitleOptions[0] || topic;
            
            const CHAPTER_DURATION_MIN = 7;
            const totalChapters = Math.max(1, Math.ceil(totalDurationMinutes / CHAPTER_DURATION_MIN));
            
            const firstChapter: Chapter = { ...blueprint.chapters[0], status: 'audio_generating' }; // Status is now audio_generating
            
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
                youtubeThumbnails: [],
                designConcepts: [], knowledgeBaseText: knowledgeBaseText,
                creativeFreedom: creativeFreedom, totalDurationMinutes: totalDurationMinutes,
                narrationMode, characterVoices: finalCharacterVoices, monologueVoice,
                backgroundMusicVolume: 0.02, initialImageCount,
                videoPacingMode: 'auto',
            };
            
            setPodcast(newPodcast);

            // Fire and forget: start generating assets for the first chapter in the background, passing fresh data
            generateChapterAssets(firstChapter.id, firstChapter.script, firstChapter.imagePrompts);

        } catch (err: any) {
            setLoadingStatus([{ label: 'Ошибка при создании концепции', status: 'error' }]);
            setError(err.message || 'Произошла неизвестная ошибка.');
            log({ type: 'error', message: 'Критическая ошибка при инициализации проекта', data: err });
        } finally {
            setIsLoading(false);
        }
    }, [log, setPodcast, apiKeys, generateChapterAssets]);

    const startVideoTest = useCallback(async () => {
        setIsLoading(true);
        setError(null);
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
                        apiKeys.gemini
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
            setError(err.message || 'Ошибка во время подготовки тестового проекта.');
            log({ type: 'error', message: 'Тест видео-движка провален', data: err });
        } finally {
            setIsLoading(false);
        }
    }, [log, setPodcast, apiKeys.gemini]);

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
            const newThumbnails = await generateYoutubeThumbnails(podcast.thumbnailBaseImage, newTitle, podcast.designConcepts, log, defaultFont);
            setPodcast(p => p ? { ...p, selectedTitle: newTitle, youtubeThumbnails: newThumbnails } : null);
        } catch (err: any) {
            setError("Ошибка при обновлении обложек.");
            log({ type: 'error', message: 'Не удалось обновить обложки после смены заголовка', data: err });
        }
    }, [podcast, log, setPodcast, defaultFont]);
    
     const setThumbnailBaseImage = useCallback(async (imageUrl: string) => {
        if (!podcast || podcast.thumbnailBaseImage === imageUrl) return;

        if (!podcast.designConcepts) {
            setPodcast(p => p ? { ...p, thumbnailBaseImage: imageUrl } : null);
            return;
        };

        try {
             const newThumbnails = await generateYoutubeThumbnails(imageUrl, podcast.selectedTitle, podcast.designConcepts, log, defaultFont);
             setPodcast(p => p ? { ...p, thumbnailBaseImage: imageUrl, youtubeThumbnails: newThumbnails } : null);
        } catch(err: any) {
            setError("Ошибка при смене фонового изображения для обложек.");
            log({ type: 'error', message: 'Не удалось перерисовать обложки с новым фоном', data: err });
        }
    }, [podcast, log, setPodcast, defaultFont]);

    const regenerateText = async () => {
        if (!podcast) return;
        setIsRegeneratingText(true);
        try {
            const newTextAssets = await regenerateTextAssets(podcast.topic, podcast.knowledgeBaseText || '', podcast.creativeFreedom, podcast.language, log, apiKeys.gemini);
            const newSelectedTitle = newTextAssets.youtubeTitleOptions[0] || podcast.selectedTitle;
            setPodcast(p => p ? { ...p, ...newTextAssets } : null); // Update text first
            await handleTitleSelection(newSelectedTitle, true); // Then update thumbnails
        } catch (err: any) {
            setError(err.message || 'Ошибка при обновлении текста.');
            log({ type: 'error', message: 'Ошибка при регенерации текста', data: err });
        } finally {
            setIsRegeneratingText(false);
        }
    };

    const regenerateChapterImages = async (chapterId: string) => {
        const chapter = podcastRef.current?.chapters.find(c => c.id === chapterId);
        if (!podcastRef.current || !chapter) return;
        
        updateChapterState(chapterId, 'images_generating');
        try {
            const newImages = await generateStyleImages(chapter.imagePrompts, 3, log, apiKeys);
            // Reset durations when all images are regenerated in manual mode
            const newDurations = podcastRef.current?.videoPacingMode === 'manual' ? Array(newImages.length).fill(60) : undefined;
            updateChapterState(chapterId, 'completed', { generatedImages: newImages, imageDurations: newDurations }); // Assuming it goes back to completed
        } catch (err: any) {
            log({type: 'error', message: `Ошибка при регенерации изображений для главы ${chapter.title}`, data: err});
            updateChapterState(chapterId, 'error', { error: "Ошибка регенерации изображений" });
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
                    const audioBlob = await generateChapterAudio( chapter.script, podcast.narrationMode, podcast.characterVoices, podcast.monologueVoice, log, apiKeys.gemini);
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

    const regenerateSingleImage = async (chapterId: string, index: number) => {
        const chapter = podcast?.chapters.find(c => c.id === chapterId);
        if (!podcast || !chapter || !chapter.imagePrompts[index]) return;

        setRegeneratingImage({ chapterId, index });
        try {
            const newImageSrc = await regenerateSingleImageApi(chapter.imagePrompts[index], log, apiKeys);
            
            setPodcast(p => {
                if (!p) return null;
                const newChapters = p.chapters.map(c => {
                    if (c.id === chapterId) {
                        const newImages = [...(c.generatedImages || [])];
                        newImages[index] = newImageSrc;
                        return {...c, generatedImages: newImages};
                    }
                    return c;
                });
                return {...p, chapters: newChapters};
            });
            
        } catch (err: any) {
            setError(err.message || `Ошибка при регенерации изображения ${index + 1}.`);
            log({ type: 'error', message: `Ошибка при регенерации изображения ${index + 1}.`, data: err });
        } finally {
            setRegeneratingImage(null);
        }
    };

    const generateMoreImages = async (chapterId: string) => {
        const chapter = podcast?.chapters.find(c => c.id === chapterId);
        if (!podcast || !chapter) return;

        setGeneratingMoreImages(chapterId);
        try {
            const newImages = await generateMoreImagesApi(chapter.imagePrompts, log, apiKeys);
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
            setError(err.message || 'Ошибка при генерации доп. изображений.');
            log({ type: 'error', message: 'Ошибка при генерации доп. изображений', data: err });
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
            const tracks = await findMusicWithAi(query, log, apiKeys.gemini);
            if (tracks.length === 0) {
                log({ type: 'info', message: `Подходящая музыка для главы "${chapter.title}" не найдена.` });
            }
            return tracks;
        } catch (err: any) {
            setError(err.message || "Ошибка при поиске музыки.");
            log({type: 'error', message: 'Ошибка при поиске музыки.', data: err});
            return [];
        }
    }, [podcast, log, apiKeys.gemini, setError]);

    const findMusicManuallyForChapter = useCallback(async (keywords: string): Promise<MusicTrack[]> => {
        if (!podcast) return [];
        try {
            const tracks = await findMusicManually(keywords, log);
             if (tracks.length === 0) {
                log({ type: 'info', message: `Подходящая музыка по запросу "${keywords}" не найдена.` });
            }
            return tracks;
        } catch (err: any) {
            setError(err.message || "Ошибка при поиске музыки.");
            log({type: 'error', message: 'Ошибка при ручном поиске музыки.', data: err});
            return [];
        }
    }, [podcast, log, setError]);

    // --- SFX Management ---
    const findSfxForLine = async (chapterId: string, lineIndex: number): Promise<SoundEffect[]> => {
        if (!podcast) return [];
        const line = podcast.chapters.find(c => c.id === chapterId)?.script[lineIndex];
        if (!line || line.speaker.toUpperCase() !== 'SFX') return [];
        try {
            return await findSfxWithAi(line.text, log, { gemini: apiKeys.gemini, freesound: apiKeys.freesound });
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
        logs, log,
        audioUrls,
        isGenerationPaused, setIsGenerationPaused,
        editingThumbnail, setEditingThumbnail,
        isRegeneratingText, isRegeneratingAudio,
        regeneratingImage, generatingMoreImages,
        startNewProject, handleGenerateChapter, 
        saveThumbnail, regenerateProject, regenerateText,
        regenerateChapterImages, regenerateAllAudio, regenerateSingleImage,
        generateMoreImages, handleTitleSelection, setGlobalMusicVolume, setChapterMusicVolume,
        manualTtsScript, subtitleText, setChapterMusic,
        findMusicForChapter,
        findMusicManuallyForChapter,
        findSfxForLine, findSfxManuallyForLine, setSfxForLine, setSfxVolume,
        setThumbnailBaseImage,
        startVideoTest,
        setVideoPacingMode, setImageDuration,
    };
};