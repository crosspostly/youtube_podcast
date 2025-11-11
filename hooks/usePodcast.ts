import { useState, useCallback, useEffect, useMemo } from 'react';
import { generatePodcastBlueprint, generateNextChapterScript, generateChapterAudio, combineWavBlobs, regenerateTextAssets, generateThumbnailDesignConcepts } from '../services/ttsService';
// Fix: Aliased imports to avoid name collision with functions inside the hook.
import { generateStyleImages, generateYoutubeThumbnails, regenerateSingleImage as regenerateSingleImageApi, generateMoreImages as generateMoreImagesApi } from '../services/imageService';
import type { Podcast, Chapter, LogEntry, YoutubeThumbnail, NarrationMode } from '../types';

export const usePodcast = (
    apiKeys: { gemini: string; openRouter: string },
    updateHistory: (podcast: Podcast) => void,
    defaultFont: string
) => {
    const [podcast, setPodcastState] = useState<Podcast | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [loadingStep, setLoadingStep] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [logs, setLogs] = useState<LogEntry[]>([]);

    const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
    const [isGeneratingChapter, setIsGeneratingChapter] = useState(false);
    const [isGenerationPaused, setIsGenerationPaused] = useState(false);
    const [isRegeneratingText, setIsRegeneratingText] = useState(false);
    const [isRegeneratingImages, setIsRegeneratingImages] = useState(false);
    const [isRegeneratingAudio, setIsRegeneratingAudio] = useState(false);
    const [regeneratingImageIndex, setRegeneratingImageIndex] = useState<number | null>(null);
    const [isGeneratingMoreImages, setIsGeneratingMoreImages] = useState(false);
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

        const updateChapterState = (id: string, status: Chapter['status'], data: Partial<Chapter> = {}) => {
            setPodcast(p => {
                if (!p) return null;
                const updatedChapters = p.chapters.map(c => c.id === id ? { ...c, status, ...data, error: data.error || undefined } : c);
                return { ...p, chapters: updatedChapters };
            });
        };
    
        try {
            updateChapterState(chapterId, 'script_generating');
            const chapterScriptData = await generateNextChapterScript(podcast.topic, podcast.selectedTitle, podcast.characters, podcast.chapters.slice(0, chapterIndex), chapterIndex, podcast.knowledgeBaseText || '', podcast.creativeFreedom, podcast.language, log, apiKeys.gemini);
            updateChapterState(chapterId, 'audio_generating', { script: chapterScriptData.script, title: chapterScriptData.title });
            const audioBlob = await generateChapterAudio(chapterScriptData.script, podcast.narrationMode, podcast.characterVoices, podcast.monologueVoice, log, apiKeys.gemini);
            updateChapterState(chapterId, 'completed', { audioBlob });
        } catch (err: any) {
            const errorMessage = err.message || 'Неизвестная ошибка при генерации главы.';
            log({type: 'error', message: `Ошибка при генерации главы ${chapterIndex + 1}`, data: err});
            updateChapterState(chapterId, 'error', { error: errorMessage });
        }
    }, [podcast, log, apiKeys.gemini, setPodcast]);

    useEffect(() => {
        const pendingChapter = podcast?.chapters.find(c => c.status === 'pending');
        if (pendingChapter && !isLoading && !isGeneratingChapter && !isGenerationPaused) {
            setIsGeneratingChapter(true);
            handleGenerateChapter(pendingChapter.id).finally(() => setIsGeneratingChapter(false));
        }
    }, [podcast?.chapters, handleGenerateChapter, isLoading, isGeneratingChapter, isGenerationPaused]);

    const startNewProject = useCallback(async (topic: string, knowledgeBaseText: string, creativeFreedom: boolean, language: string, totalDurationMinutes: number, narrationMode: NarrationMode, characterVoicePrefs: { [key: string]: string }, monologueVoice: string) => {
        if (!topic.trim()) { setError('Введите название проекта.'); return; }
        setIsLoading(true);
        setError(null);
        setPodcastState(null); // Set directly to avoid saving empty state to history
        setLogs([]);
        setIsGenerationPaused(false);
        
        try {
            setLoadingStep("Создание концепции, заголовков и первой главы...");
            const blueprint = await generatePodcastBlueprint(topic, knowledgeBaseText, creativeFreedom, language, log, apiKeys.gemini);
            
            const finalCharacterVoices: { [key: string]: string } = {};
            if (blueprint.characters.length > 0 && characterVoicePrefs.character1) {
                finalCharacterVoices[blueprint.characters[0].name] = characterVoicePrefs.character1;
            }
            if (blueprint.characters.length > 1 && characterVoicePrefs.character2) {
                finalCharacterVoices[blueprint.characters[1].name] = characterVoicePrefs.character2;
            }

            setLoadingStep("Озвучивание, генерация изображений и дизайна...");
            const [firstChapterAudio, generatedImages, designConcepts] = await Promise.all([
                generateChapterAudio(blueprint.chapters[0].script, narrationMode, finalCharacterVoices, monologueVoice, log, apiKeys.gemini),
                generateStyleImages(blueprint.imagePrompts, log, apiKeys.gemini, apiKeys.openRouter),
                generateThumbnailDesignConcepts(topic, language, log, apiKeys.gemini)
            ]);
            const selectedTitle = blueprint.youtubeTitleOptions[0] || topic;
            setLoadingStep("Создание обложек для YouTube...");
            const youtubeThumbnails = generatedImages.length > 0 ? await generateYoutubeThumbnails(generatedImages[0], selectedTitle, designConcepts, log, defaultFont) : [];
            
            const newPodcast: Podcast = {
                id: crypto.randomUUID(), ...blueprint, topic, selectedTitle, language,
                chapters: [{ ...blueprint.chapters[0], status: 'completed', audioBlob: firstChapterAudio }],
                generatedImages: generatedImages || [], youtubeThumbnails: youtubeThumbnails || [],
                designConcepts: designConcepts || [], knowledgeBaseText: knowledgeBaseText,
                creativeFreedom: creativeFreedom, totalDurationMinutes: totalDurationMinutes,
                narrationMode, characterVoices: finalCharacterVoices, monologueVoice,
                selectedBgIndex: 0
            };
            const CHAPTER_DURATION_MIN = 5;
            const totalChapters = Math.max(1, Math.ceil(totalDurationMinutes / CHAPTER_DURATION_MIN));
            for (let i = 1; i < totalChapters; i++) {
                newPodcast.chapters.push({ id: crypto.randomUUID(), title: `Глава ${i + 1}`, script: [], status: 'pending' });
            }
            setPodcast(newPodcast);
        } catch (err: any) {
            setError(err.message || 'Произошла неизвестная ошибка.');
            log({ type: 'error', message: 'Критическая ошибка при инициализации проекта', data: err });
        } finally {
            setIsLoading(false);
            setLoadingStep('');
        }
    }, [log, apiKeys, setPodcast, defaultFont]);

    const combineAndDownload = async () => {
        if (!podcast || podcast.chapters.some(c => c.status !== 'completed' || !c.audioBlob)) return;
        setLoadingStep("Сборка финального аудиофайла...");
        setIsLoading(true);
        try {
            const blobs = podcast.chapters.map(c => c.audioBlob).filter((b): b is Blob => !!b);
            const finalBlob = await combineWavBlobs(blobs);
            const url = URL.createObjectURL(finalBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${podcast.selectedTitle.replace(/[^a-z0-9а-яё]/gi, '_').toLowerCase()}.wav`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err: any) {
            setError('Ошибка при сборке аудиофайла.');
            log({type: 'error', message: 'Ошибка при сборке WAV', data: err});
        } finally {
            setIsLoading(false);
            setLoadingStep("");
        }
    };
    
    const saveThumbnail = (updatedThumbnail: YoutubeThumbnail) => {
        setPodcast(p => {
            if (!p || !p.youtubeThumbnails) return p;
            return { ...p, youtubeThumbnails: p.youtubeThumbnails.map(t => t.styleName === updatedThumbnail.styleName ? updatedThumbnail : t) };
        });
    };

    const regenerateProject = () => {
        if (!podcast) return;
        if (window.confirm("Вы уверены, что хотите полностью пересоздать этот проект?")) {
            startNewProject(podcast.topic, podcast.knowledgeBaseText || '', podcast.creativeFreedom, podcast.language, podcast.totalDurationMinutes, podcast.narrationMode, podcast.characterVoices, podcast.monologueVoice);
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
            const newImages = await generateStyleImages(podcast.imagePrompts, log, apiKeys.gemini, apiKeys.openRouter);
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
            const newImageSrc = await regenerateSingleImageApi(podcast.imagePrompts[index], log, apiKeys.gemini, apiKeys.openRouter);
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
            const newImages = await generateMoreImagesApi(podcast.imagePrompts, log, apiKeys.gemini, apiKeys.openRouter);
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

    return {
        podcast, setPodcastState, 
        isLoading, loadingStep, error, setError,
        logs, log,
        audioUrls,
        isGenerationPaused, setIsGenerationPaused,
        editingThumbnail, setEditingThumbnail,
        isRegeneratingText, isRegeneratingImages, isRegeneratingAudio,
        regeneratingImageIndex, isGeneratingMoreImages,
        startNewProject, handleGenerateChapter, combineAndDownload,
        saveThumbnail, regenerateProject, regenerateText,
        regenerateImages, regenerateAllAudio, regenerateSingleImage,
        generateMoreImages, handleTitleSelection, handleBgSelection,
        manualTtsScript, subtitleText,
    };
};
