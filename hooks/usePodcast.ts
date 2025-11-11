import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { generatePodcastBlueprint, generateNextChapterScript, generateChapterAudio, combineAndMixAudio, regenerateTextAssets, generateThumbnailDesignConcepts, convertWavToMp3, generateSrtFile, findMusicWithAi, findMusicManually, findSfxWithAi, findSfxManually } from '../services/ttsService';
// Fix: Aliased imports to avoid name collision with functions inside the hook.
import { generateStyleImages, generateYoutubeThumbnails, regenerateSingleImage as regenerateSingleImageApi, generateMoreImages as generateMoreImagesApi } from '../services/imageService';
import type { Podcast, Chapter, LogEntry, YoutubeThumbnail, NarrationMode, MusicTrack, ScriptLine, SoundEffect } from '../types';

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
    const [isRegeneratingImages, setIsRegeneratingImages] = useState(false);
    const [isRegeneratingAudio, setIsRegeneratingAudio] = useState(false);
    const [regeneratingImageIndex, setRegeneratingImageIndex] = useState<number | null>(null);
    const [isGeneratingMoreImages, setIsGeneratingMoreImages] = useState(false);
    const [editingThumbnail, setEditingThumbnail] = useState<YoutubeThumbnail | null>(null);

    const [isConvertingToMp3, setIsConvertingToMp3] = useState(false);
    const [isGeneratingSrt, setIsGeneratingSrt] = useState(false);


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
            const chapterScriptData = await generateNextChapterScript(podcast.topic, podcast.selectedTitle, podcast.characters, podcast.chapters.slice(0, chapterIndex), chapterIndex, podcast.knowledgeBaseText || '', podcast.creativeFreedom, podcast.language, log, { gemini: apiKeys.gemini, freesound: apiKeys.freesound });
            
            // Automatically find music for the new chapter
            const scriptText = chapterScriptData.script.map(line => line.text).join(' ');
            const musicTracks = await findMusicWithAi(scriptText, log, apiKeys.gemini);
            const backgroundMusic = musicTracks.length > 0 ? musicTracks[0] : undefined;
            
            updateChapterState(chapterId, 'audio_generating', { script: chapterScriptData.script, title: chapterScriptData.title, backgroundMusic });
            
            const audioBlob = await generateChapterAudio(chapterScriptData.script, podcast.narrationMode, podcast.characterVoices, podcast.monologueVoice, log, apiKeys.gemini);
            updateChapterState(chapterId, 'completed', { audioBlob });

        } catch (err: any) {
            const errorMessage = err.message || 'Неизвестная ошибка при генерации главы.';
            log({type: 'error', message: `Ошибка при генерации главы ${chapterIndex + 1}`, data: err});
            updateChapterState(chapterId, 'error', { error: errorMessage });
        }
    }, [podcast, log, setPodcast, apiKeys]);

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
        setPodcastState(null); // Set directly to avoid saving empty state to history
        setLogs([]);
        setGenerationProgress(0);
        setIsGenerationPaused(false);

        const initialSteps: LoadingStatus[] = [
            { label: 'Анализ темы и создание концепции', status: 'pending' },
            { label: 'Подбор музыки и SFX для первой главы', status: 'pending' },
            { label: 'Озвучивание первой главы', status: 'pending' },
            { label: 'Генерация фоновых изображений', status: 'pending' },
            { label: 'Разработка дизайн-концепций обложек', status: 'pending' },
            { label: 'Создание вариантов обложек для YouTube', status: 'pending' }
        ];
        setLoadingStatus(initialSteps);
    
        const updateStatus = (label: string, status: LoadingStatus['status']) => {
            setLoadingStatus(prev => prev.map(step => step.label === label ? { ...step, status } : step));
        };
        
        try {
            updateStatus('Анализ темы и создание концепции', 'in_progress');
            const blueprint = await generatePodcastBlueprint(topic, knowledgeBaseText, creativeFreedom, language, log, { gemini: apiKeys.gemini, freesound: apiKeys.freesound });
            updateStatus('Анализ темы и создание концепции', 'completed');
            setGenerationProgress(15);
            
            updateStatus('Подбор музыки и SFX для первой главы', 'in_progress');
            const firstChapterScriptText = blueprint.chapters[0].script.map(line => line.text).join(' ');
            const musicTracks = await findMusicWithAi(firstChapterScriptText, log, apiKeys.gemini);
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

            updateStatus('Озвучивание первой главы', 'in_progress');
            updateStatus('Генерация фоновых изображений', 'in_progress');

            const [firstChapterAudio, generatedImages] = await Promise.all([
                generateChapterAudio(blueprint.chapters[0].script, narrationMode, finalCharacterVoices, monologueVoice, log, apiKeys.gemini),
                generateStyleImages(blueprint.imagePrompts, initialImageCount, log, apiKeys)
            ]);

            updateStatus('Озвучивание первой главы', 'completed');
            setGenerationProgress(p => p + 25);
            updateStatus('Генерация фоновых изображений', 'completed');
            setGenerationProgress(p => p + 20);

            updateStatus('Разработка дизайн-концепций обложек', 'in_progress');
            const designConcepts = await generateThumbnailDesignConcepts(topic, language, log, apiKeys.gemini);
            updateStatus('Разработка дизайн-концепций обложек', 'completed');
            setGenerationProgress(p => p + 10);
            
            const selectedTitle = blueprint.youtubeTitleOptions[0] || topic;
            
            updateStatus('Создание вариантов обложек для YouTube', 'in_progress');
            const youtubeThumbnails = generatedImages.length > 0 ? await generateYoutubeThumbnails(generatedImages[0], selectedTitle, designConcepts, log, defaultFont) : [];
            updateStatus('Создание вариантов обложек для YouTube', 'completed');
            setGenerationProgress(100);

            const newPodcast: Podcast = {
                id: crypto.randomUUID(), ...blueprint, topic, selectedTitle, language,
                chapters: [{ ...blueprint.chapters[0], status: 'completed', audioBlob: firstChapterAudio }],
                generatedImages: generatedImages || [], youtubeThumbnails: youtubeThumbnails || [],
                designConcepts: designConcepts || [], knowledgeBaseText: knowledgeBaseText,
                creativeFreedom: creativeFreedom, totalDurationMinutes: totalDurationMinutes,
                narrationMode, characterVoices: finalCharacterVoices, monologueVoice,
                selectedBgIndex: 0, backgroundMusicVolume: 0.02, initialImageCount,
            };
            const CHAPTER_DURATION_MIN = 5;
            const totalChapters = Math.max(1, Math.ceil(totalDurationMinutes / CHAPTER_DURATION_MIN));
            for (let i = 1; i < totalChapters; i++) {
                newPodcast.chapters.push({ id: crypto.randomUUID(), title: `Глава ${i + 1}`, script: [], status: 'pending' });
            }
            setPodcast(newPodcast);
        } catch (err: any) {
            setLoadingStatus(prev => {
                const currentStepIndex = prev.findIndex(s => s.status === 'in_progress');
                if (currentStepIndex !== -1) {
                    const newStatus = [...prev];
                    newStatus[currentStepIndex] = { ...newStatus[currentStepIndex], status: 'error' };
                    return newStatus;
                }
                return prev;
            });
            setError(err.message || 'Произошла неизвестная ошибка.');
            log({ type: 'error', message: 'Критическая ошибка при инициализации проекта', data: err });
        } finally {
            setIsLoading(false);
        }
    }, [log, setPodcast, apiKeys, defaultFont]);

    const combineAndDownload = async (format: 'wav' | 'mp3' = 'wav') => {
        if (!podcast || podcast.chapters.some(c => c.status !== 'completed' || !c.audioBlob)) return;
        
        const setLoading = format === 'mp3' ? setIsConvertingToMp3 : setIsLoading;
        setLoading(true);
        setLoadingStatus([{ label: 'Сборка и микширование аудио...', status: 'in_progress' }]);

        try {
            let finalBlob = await combineAndMixAudio(podcast);
            let extension = 'wav';

            if (format === 'mp3') {
                setLoadingStatus([{ label: 'Конвертация в MP3...', status: 'in_progress' }]);
                finalBlob = await convertWavToMp3(finalBlob, log);
                extension = 'mp3';
            }

            const url = URL.createObjectURL(finalBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${podcast.selectedTitle.replace(/[^a-z0-9а-яё]/gi, '_').toLowerCase()}.${extension}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err: any) {
            setError('Ошибка при сборке аудиофайла.');
            log({type: 'error', message: `Ошибка при сборке и экспорте (${format})`, data: err});
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
            const a = document.createElement('a');
            a.href = url;
            a.download = `${podcast.selectedTitle.replace(/[^a-z0-9а-яё]/gi, '_').toLowerCase()}.srt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err: any) {
            setError('Ошибка при создании SRT файла.');
            log({type: 'error', message: 'Ошибка при генерации SRT', data: err});
        } finally {
            setIsGeneratingSrt(false);
        }
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


    const regenerateProject = () => {
        if (!podcast) return;
        if (window.confirm("Вы уверены, что хотите полностью пересоздать этот проект?")) {
            startNewProject(podcast.topic, podcast.knowledgeBaseText || '', podcast.creativeFreedom, podcast.language, podcast.totalDurationMinutes, podcast.narrationMode, podcast.characterVoices, podcast.monologueVoice, podcast.initialImageCount);
        }
    };

    const handleTitleSelection = useCallback(async (newTitle: string, forceUpdate = false) => {
        if (!podcast || (!forceUpdate && podcast.selectedTitle === newTitle)) return;
        setPodcast(p => p ? { ...p, selectedTitle: newTitle } : null);
        
        const currentBgIndex = podcast.selectedBgIndex || 0;
        if (!podcast.designConcepts || !podcast.generatedImages?.[currentBgIndex]) return;
        try {
            const newThumbnails = await generateYoutubeThumbnails(podcast.generatedImages[currentBgIndex], newTitle, podcast.designConcepts, log, defaultFont);
            setPodcast(p => p ? { ...p, youtubeThumbnails: newThumbnails } : null);
        } catch (err: any) {
            setError("Ошибка при обновлении обложек.");
            log({ type: 'error', message: 'Не удалось обновить обложки после смены заголовка', data: err });
        }
    }, [podcast, log, setPodcast, defaultFont]);
    
    const handleBgSelection = useCallback(async (index: number) => {
        if (!podcast || podcast.selectedBgIndex === index) return;
        
        if (!podcast.designConcepts || !podcast.generatedImages?.[index]) return;
        try {
             const newThumbnails = await generateYoutubeThumbnails(podcast.generatedImages[index], podcast.selectedTitle, podcast.designConcepts, log, defaultFont);
             // Update both index and thumbnails at once
             setPodcast(p => p ? { ...p, selectedBgIndex: index, youtubeThumbnails: newThumbnails } : null);
        } catch(err: any) {
            setError("Ошибка при смене фонового изображения.");
            log({ type: 'error', message: 'Не удалось перерисовать обложки с новым фоном', data: err });
        }
    }, [podcast, log, setPodcast, defaultFont]);

    const regenerateText = async () => {
        if (!podcast) return;
        setIsRegeneratingText(true);
        try {
            const newTextAssets = await regenerateTextAssets(podcast.topic, podcast.knowledgeBaseText || '', podcast.creativeFreedom, podcast.language, log, apiKeys.gemini);
            const newSelectedTitle = newTextAssets.youtubeTitleOptions[0] || podcast.selectedTitle;
            setPodcast(p => p ? { ...p, ...newTextAssets, selectedTitle: newSelectedTitle } : null);
            await handleTitleSelection(newSelectedTitle, true);
        } catch (err: any) {
            setError(err.message || 'Ошибка при обновлении текста.');
            log({ type: 'error', message: 'Ошибка при регенерации текста', data: err });
        } finally {
            setIsRegeneratingText(false);
        }
    };
    
    const regenerateImages = async () => {
        if (!podcast || !podcast.designConcepts) return;
        setIsRegeneratingImages(true);
        try {
            const newImages = await generateStyleImages(podcast.imagePrompts, podcast.initialImageCount, log, apiKeys);
            const currentBgIndex = podcast.selectedBgIndex || 0;
            const bgImage = newImages[currentBgIndex] || newImages[0];
            const newThumbnails = bgImage ? await generateYoutubeThumbnails(bgImage, podcast.selectedTitle, podcast.designConcepts, log, defaultFont) : [];
            setPodcast(p => p ? { ...p, generatedImages: newImages, youtubeThumbnails: newThumbnails } : null);
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
                setPodcast(p => {
                    if (!p) return null;
                    return { ...p, chapters: p.chapters.map(c => c.id === chapter.id ? { ...c, status: 'audio_generating' as Chapter['status'] } : c) };
                });
                try {
                    const audioBlob = await generateChapterAudio(chapter.script, podcast.narrationMode, podcast.characterVoices, podcast.monologueVoice, log, apiKeys.gemini);
                    setPodcast(p => {
                        if (!p) return null;
                        return { ...p, chapters: p.chapters.map(c => c.id === chapter.id ? { ...c, status: 'completed' as Chapter['status'], audioBlob } : c) };
                    });
                } catch (err: any) {
                    log({ type: 'error', message: `Ошибка при переозвучке главы ${chapter.title}`, data: err });
                    setPodcast(p => {
                        if (!p) return null;
                        return { ...p, chapters: p.chapters.map(c => c.id === chapter.id ? { ...c, status: 'error' as Chapter['status'], error: err.message || 'Ошибка озвучки' } : c) };
                    });
                }
            }
        }
        log({ type: 'info', message: 'Переозвучка всех глав завершена.' });
        setIsRegeneratingAudio(false);
    };

    const regenerateSingleImage = async (index: number) => {
        if (!podcast || !podcast.imagePrompts[index] || !podcast.designConcepts) return;
        setRegeneratingImageIndex(index);
        try {
            const newImageSrc = await regenerateSingleImageApi(podcast.imagePrompts[index], log, apiKeys);
            let newThumbnails = podcast.youtubeThumbnails || [];
            
            if (index === podcast.selectedBgIndex) {
                 newThumbnails = await generateYoutubeThumbnails(newImageSrc, podcast.selectedTitle, podcast.designConcepts, log, defaultFont);
            }
            
            setPodcast(p => {
                if (!p) return null;
                const newImages = [...(p.generatedImages || [])];
                newImages[index] = newImageSrc;
                return {...p, generatedImages: newImages, youtubeThumbnails: newThumbnails};
            });
            
        } catch (err: any) {
            setError(err.message || `Ошибка при регенерации изображения ${index + 1}.`);
            log({ type: 'error', message: `Ошибка при регенерации изображения ${index + 1}.`, data: err });
        } finally {
            setRegeneratingImageIndex(null);
        }
    };

    const generateMoreImages = async () => {
        if (!podcast) return;
        setIsGeneratingMoreImages(true);
        try {
            const newImages = await generateMoreImagesApi(podcast.imagePrompts, log, apiKeys);
            setPodcast(p => p ? { ...p, generatedImages: [...(p.generatedImages || []), ...newImages] } : p);
        } catch (err: any) {
            setError(err.message || 'Ошибка при генерации доп. изображений.');
            log({ type: 'error', message: 'Ошибка при генерации доп. изображений', data: err });
        } finally {
            setIsGeneratingMoreImages(false);
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
            const chapterIdx = p.chapters.findIndex(c => c.id === chapterId);
            if (chapterIdx === -1) return p;
            
            const newChapters = [...p.chapters];
            const newScript = [...newChapters[chapterIdx].script];
            newScript[lineIndex] = { ...newScript[lineIndex], soundEffect: sfx || undefined };
            newChapters[chapterIdx] = { ...newChapters[chapterIdx], script: newScript };

            return { ...p, chapters: newChapters };
        });
    };

    const setSfxVolume = (chapterId: string, lineIndex: number, volume: number) => {
         setPodcast(p => {
            if (!p) return null;
            const chapterIdx = p.chapters.findIndex(c => c.id === chapterId);
            if (chapterIdx === -1) return p;
            
            const newChapters = [...p.chapters];
            const newScript = [...newChapters[chapterIdx].script];
            newScript[lineIndex] = { ...newScript[lineIndex], soundEffectVolume: volume };
            newChapters[chapterIdx] = { ...newChapters[chapterIdx], script: newScript };

            return { ...p, chapters: newChapters };
        });
    };


    return {
        podcast, setPodcastState, 
        isLoading, loadingStatus, generationProgress, error, setError,
        logs, log,
        audioUrls,
        isGenerationPaused, setIsGenerationPaused,
        editingThumbnail, setEditingThumbnail,
        isRegeneratingText, isRegeneratingImages, isRegeneratingAudio,
        regeneratingImageIndex, isGeneratingMoreImages,
        isConvertingToMp3, isGeneratingSrt,
        startNewProject, handleGenerateChapter, combineAndDownload,
        saveThumbnail, regenerateProject, regenerateText,
        regenerateImages, regenerateAllAudio, regenerateSingleImage,
        generateMoreImages, handleTitleSelection, handleBgSelection, setGlobalMusicVolume, setChapterMusicVolume,
        manualTtsScript, subtitleText, generateSrt, setChapterMusic,
        findMusicForChapter,
        findMusicManuallyForChapter,
        findSfxForLine, findSfxManuallyForLine, setSfxForLine, setSfxVolume,
    };
};