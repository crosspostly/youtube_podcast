
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import JSZip from 'jszip';
import { generatePodcastBlueprint, generateQuickTestBlueprint, generateNextChapterScript, regenerateTextAssets, generateThumbnailDesignConcepts, generateContentPlan } from '../services/aiTextService';
import { generateChapterAudio } from '../services/aiAudioService';
import { combineAndMixAudio, convertWavToMp3, generateSrtFile, getChapterDurations } from '../services/audioUtils';
import { findMusicManually, findMusicWithAi } from '../services/musicService';
import { findSfxForScript, findSfxManually, findSfxWithAi } from '../services/sfxService';
import { generateStyleImages, generateYoutubeThumbnails, regenerateSingleImage as regenerateSingleImageApi, generateMoreImages as generateMoreImagesApi } from '../services/imageService';
import { searchStockPhotos, getOnePhotoFromEachStockService } from '../services/stockPhotoService';
import type { Podcast, Chapter, LogEntry, YoutubeThumbnail, NarrationMode, MusicTrack, ScriptLine, DetailedContentIdea, QueuedProject, SoundEffect } from '../types';

interface LoadingStatus {
    label: string;
    status: 'pending' | 'in_progress' | 'completed' | 'error';
}

export const usePodcast = (
    updateHistory: (podcast: Podcast) => void,
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
    const [isZipping, setIsZipping] = useState(false);
    
    const [projectQueue, setProjectQueue] = useState<QueuedProject[]>([]);
    const [isQueueRunning, setIsQueueRunning] = useState(false);

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

    // --- CORE GENERATION LOGIC (Headless) ---
    const createPodcastData = async (
        topic: string,
        knowledgeBaseText: string,
        creativeFreedom: boolean,
        language: string,
        totalDurationMinutes: number,
        narrationMode: NarrationMode,
        characterVoicePrefs: { [key: string]: string },
        monologueVoice: string,
        imagesPerChapter: number, // Renamed for clarity
        imageSource: 'ai' | 'stock',
        generateAllChapters: boolean, // New flag to force full generation
        updateStatus?: (label: string, status: LoadingStatus['status']) => void,
        updateProgress?: (progress: number | ((prev: number) => number)) => void
    ): Promise<Podcast> => {
        const localUpdateStatus = updateStatus || (() => {});
        const localUpdateProgress = updateProgress || (() => {});

        const imageStepLabel = imageSource === 'ai' ? `Генерация ${imagesPerChapter} изображений для Главы 1` : `Поиск ${imagesPerChapter} стоковых фото для Главы 1`;

        localUpdateStatus('Анализ темы и создание концепции', 'in_progress');
        const blueprint = await generatePodcastBlueprint(topic, knowledgeBaseText, creativeFreedom, language, log);
        localUpdateStatus('Анализ темы и создание концепции', 'completed');
        localUpdateProgress(10);
        
        localUpdateStatus('Подбор музыки и SFX для первой главы', 'in_progress');
        const firstChapter = blueprint.chapters[0];
        const populatedScript = await findSfxForScript(firstChapter.script, log);
        firstChapter.script = populatedScript;
        
        if (firstChapter.musicSearchKeywords) {
            const musicTracks = await findMusicManually(firstChapter.musicSearchKeywords, log);
            if (musicTracks.length > 0) {
                firstChapter.backgroundMusic = musicTracks[0];
            }
        }
        localUpdateStatus('Подбор музыки и SFX для первой главы', 'completed');
        localUpdateProgress(20);

        const finalCharacterVoices: { [key: string]: string } = {};
        
        // Voice assignment logic:
        // 1. If Blueprint has AI suggested voice, prioritize it if User set preference to "auto".
        // 2. Fallback to User specific preference if set.
        // 3. Fallback to Defaults (Zephyr/Puck)
        
        if (blueprint.characters.length > 0) {
             const char1 = blueprint.characters[0];
             if (characterVoicePrefs.character1 && characterVoicePrefs.character1 !== 'auto') {
                 finalCharacterVoices[char1.name] = characterVoicePrefs.character1;
             } else if (char1.suggestedVoiceId) {
                 finalCharacterVoices[char1.name] = char1.suggestedVoiceId;
             } else {
                 finalCharacterVoices[char1.name] = 'Puck'; // Default male
             }
        }
        
        if (blueprint.characters.length > 1) {
             const char2 = blueprint.characters[1];
             if (characterVoicePrefs.character2 && characterVoicePrefs.character2 !== 'auto') {
                 finalCharacterVoices[char2.name] = characterVoicePrefs.character2;
             } else if (char2.suggestedVoiceId) {
                 finalCharacterVoices[char2.name] = char2.suggestedVoiceId;
             } else {
                 finalCharacterVoices[char2.name] = 'Zephyr'; // Default female
             }
        }

        localUpdateStatus('Озвучивание первой главы', 'in_progress');
        localUpdateStatus(imageStepLabel, 'in_progress');

        // CHAPTER 1 IMAGE GENERATION
        // Use specific visual prompts for this chapter if available
        const chapter1Visuals = firstChapter.visualSearchPrompts || blueprint.visualSearchPrompts || [topic];
        log({ type: 'info', message: `Генерация изображений для Главы 1 (Количество: ${imagesPerChapter})` });
        
        const imagePromise = imageSource === 'ai'
            ? generateStyleImages(chapter1Visuals, imagesPerChapter, log)
            : searchStockPhotos(chapter1Visuals[0] || topic, log);

        const [firstChapterAudio, generatedImages] = await Promise.all([
            generateChapterAudio(firstChapter.script, narrationMode, finalCharacterVoices, monologueVoice, log),
            imagePromise
        ]);

        localUpdateStatus('Озвучивание первой главы', 'completed');
        localUpdateProgress(p => p + 15);
        localUpdateStatus(imageStepLabel, 'completed');
        localUpdateProgress(p => p + 15);

        localUpdateStatus('Разработка дизайн-концепций обложек', 'in_progress');
        const designConcepts = await generateThumbnailDesignConcepts(topic, language, log);
        localUpdateStatus('Разработка дизайн-концепций обложек', 'completed');
        localUpdateProgress(p => p + 10);
        
        const selectedTitle = blueprint.youtubeTitleOptions[0] || topic;
        
        localUpdateStatus('Создание вариантов обложек для YouTube', 'in_progress');
        // Use the first generated image for thumbnails
        const youtubeThumbnails = generatedImages.length > 0 ? await generateYoutubeThumbnails(generatedImages[0], selectedTitle, designConcepts, log, defaultFont) : [];
        localUpdateStatus('Создание вариантов обложек для YouTube', 'completed');
        localUpdateProgress(60); // Up to 60% for basic setup

        const newPodcast: Podcast = {
            id: crypto.randomUUID(),
            ...blueprint,
            topic,
            selectedTitle,
            language,
            chapters: [{ 
                ...firstChapter, 
                status: 'completed', 
                audioBlob: firstChapterAudio,
                images: generatedImages // Store images SPECIFICALLY in the chapter
            }],
            generatedImages: generatedImages, // Keeping for legacy fallback
            youtubeThumbnails: youtubeThumbnails || [],
            designConcepts: designConcepts || [],
            knowledgeBaseText: knowledgeBaseText,
            creativeFreedom: creativeFreedom,
            totalDurationMinutes: totalDurationMinutes,
            narrationMode,
            characterVoices: finalCharacterVoices,
            monologueVoice,
            selectedBgIndex: 0,
            backgroundMusicVolume: 0.07,
            initialImageCount: imagesPerChapter,
            imageSource,
        };

        const CHAPTER_DURATION_MIN = 5;
        const totalChapters = Math.max(1, Math.ceil(totalDurationMinutes / CHAPTER_DURATION_MIN));
        for (let i = 1; i < totalChapters; i++) {
            newPodcast.chapters.push({ id: crypto.randomUUID(), title: `Глава ${i + 1}`, script: [], status: 'pending' });
        }

        // *** LOGIC FOR FULL GENERATION (QUEUE MODE) ***
        if (generateAllChapters && totalChapters > 1) {
            log({ type: 'info', message: `[Auto-Mode] Запуск генерации оставшихся ${totalChapters - 1} глав...` });
            
            const progressPerChapter = 40 / (totalChapters - 1); // Remaining 40% progress distributed

            for (let i = 1; i < newPodcast.chapters.length; i++) {
                const currentChapterId = newPodcast.chapters[i].id;
                const previousChapters = newPodcast.chapters.slice(0, i);
                
                // 1. Script Generation
                log({ type: 'info', message: `[Auto-Mode] Генерация сценария для Главы ${i + 1}` });
                localUpdateStatus(`Генерация сценария: Глава ${i + 1}`, 'in_progress');
                
                try {
                    const chapterScriptData = await generateNextChapterScript(
                        topic, selectedTitle, blueprint.characters, previousChapters, i, 
                        knowledgeBaseText, creativeFreedom, language, log
                    );

                    // 2. SFX & Music Finding
                    const populatedScript = await findSfxForScript(chapterScriptData.script, log);
                    let backgroundMusic: MusicTrack | undefined = undefined;
                    if (chapterScriptData.musicSearchKeywords) {
                         const musicTracks = await findMusicManually(chapterScriptData.musicSearchKeywords, log);
                         if (musicTracks.length > 0) backgroundMusic = musicTracks[0];
                    }

                    // 3. Audio Generation & Image Generation (Parallel)
                    log({ type: 'info', message: `[Auto-Mode] Озвучивание и Генерация Картинок для Главы ${i + 1}` });
                    localUpdateStatus(`Производство: Глава ${i + 1}`, 'in_progress');
                    
                    // Generate images specifically for THIS chapter
                    const chapterVisuals = chapterScriptData.visualSearchPrompts || [topic];
                    const chapterImagesPromise = imageSource === 'ai'
                        ? generateStyleImages(chapterVisuals, imagesPerChapter, log)
                        : searchStockPhotos(chapterVisuals[0] || topic, log);

                    const [audioBlob, chapterImages] = await Promise.all([
                        generateChapterAudio(populatedScript, narrationMode, finalCharacterVoices, monologueVoice, log),
                        chapterImagesPromise
                    ]);

                    // 5. Update Chapter in Object
                    newPodcast.chapters[i] = {
                        id: currentChapterId,
                        title: chapterScriptData.title,
                        script: populatedScript,
                        musicSearchKeywords: chapterScriptData.musicSearchKeywords,
                        visualSearchPrompts: chapterScriptData.visualSearchPrompts,
                        images: chapterImages, // Specific images for this chapter
                        backgroundMusic,
                        audioBlob,
                        status: 'completed'
                    };

                    log({ type: 'info', message: `[Auto-Mode] Глава ${i + 1} готова.` });
                    localUpdateProgress(p => Math.min(99, p + progressPerChapter));

                } catch (err: any) {
                    log({ type: 'error', message: `[Auto-Mode] Ошибка в Главе ${i + 1}. Прерывание.`, data: err });
                    newPodcast.chapters[i].status = 'error';
                    newPodcast.chapters[i].error = err.message || 'Unknown error';
                    throw err; // Re-throw to stop the process
                }
            }
        }
        
        localUpdateProgress(100);
        localUpdateStatus('Готово', 'completed');

        return newPodcast;
    };

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
            
            // Generate images specific to this chapter during regeneration
            // Using the stored setting for image count
            const chapterVisuals = chapterScriptData.visualSearchPrompts || [podcast.topic];
            const chapterImagesPromise = podcast.imageSource === 'ai'
                 ? generateStyleImages(chapterVisuals, podcast.initialImageCount, log)
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
    }, [podcast, log, setPodcast]);

    useEffect(() => {
        const pendingChapter = podcast?.chapters.find(c => c.status === 'pending');
        if (pendingChapter && !isLoading && !isGeneratingChapter && !isGenerationPaused) {
            setIsGeneratingChapter(true);
            handleGenerateChapter(pendingChapter.id).finally(() => setIsGeneratingChapter(false));
        }
    }, [podcast?.chapters, handleGenerateChapter, isLoading, isGeneratingChapter, isGenerationPaused]);

    // Interactive Start
    const startNewProject = useCallback(async (topic: string, knowledgeBaseText: string, creativeFreedom: boolean, language: string, totalDurationMinutes: number, narrationMode: NarrationMode, characterVoicePrefs: { [key: string]: string }, monologueVoice: string, initialImageCount: number, imageSource: 'ai' | 'stock') => {
        if (!topic.trim()) { setError('Введите название проекта.'); return; }
        
        setIsLoading(true);
        setError(null);
        setPodcastState(null);
        setLogs([]);
        setGenerationProgress(0);
        setIsGenerationPaused(false);

        const imageStepLabel = imageSource === 'ai' ? `Генерация изображений` : `Поиск стоковых фото`;
        const initialSteps: LoadingStatus[] = [
            { label: 'Анализ темы и создание концепции', status: 'pending' },
            { label: 'Подбор музыки и SFX для первой главы', status: 'pending' },
            { label: 'Озвучивание первой главы', status: 'pending' },
            { label: imageStepLabel, status: 'pending' },
            { label: 'Разработка дизайн-концепций обложек', status: 'pending' },
            { label: 'Создание вариантов обложек для YouTube', status: 'pending' }
        ];
        setLoadingStatus(initialSteps);
    
        const updateStatus = (label: string, status: LoadingStatus['status']) => {
            setLoadingStatus(prev => prev.map(step => step.label === label ? { ...step, status } : step));
        };
        
        try {
            // Pass false for generateAllChapters in interactive mode
            const newPodcast = await createPodcastData(
                topic, knowledgeBaseText, creativeFreedom, language, totalDurationMinutes, narrationMode, characterVoicePrefs, monologueVoice, initialImageCount, imageSource,
                false, 
                updateStatus,
                setGenerationProgress
            );
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
    }, [log, setPodcast, defaultFont]);

    const combineAndDownload = async (format: 'wav' | 'mp3' = 'wav', podcastOverride?: Podcast) => {
        const targetPodcast = podcastOverride || podcast;
        if (!targetPodcast || targetPodcast.chapters.some(c => c.status !== 'completed' || !c.audioBlob)) return null;
        
        const setLoading = !podcastOverride ? (format === 'mp3' ? setIsConvertingToMp3 : setIsLoading) : () => {};
        if (!podcastOverride) setLoading(true);
        
        if (!podcastOverride) setLoadingStatus([{ label: 'Сборка и микширование аудио...', status: 'in_progress' }]);

        try {
            let finalBlob = await combineAndMixAudio(targetPodcast);
            let extension = 'wav';

            if (format === 'mp3') {
                if (!podcastOverride) setLoadingStatus([{ label: 'Конвертация в MP3...', status: 'in_progress' }]);
                finalBlob = await convertWavToMp3(finalBlob, log);
                extension = 'mp3';
            }
            
            // If headless (override provided), return the blob
            if (podcastOverride) return finalBlob;

            const url = URL.createObjectURL(finalBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${targetPodcast.selectedTitle.replace(/[^a-z0-9а-яё]/gi, '_').toLowerCase()}.${extension}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err: any) {
            if (!podcastOverride) setError('Ошибка при сборке аудиофайла.');
            log({type: 'error', message: `Ошибка при сборке и экспорте (${format})`, data: err});
            throw err;
        } finally {
            if (!podcastOverride) {
                setLoading(false);
                setLoadingStatus([]);
            }
        }
    };

    const generateSrt = async (podcastOverride?: Podcast) => {
        const targetPodcast = podcastOverride || podcast;
        if (!targetPodcast) return null;
        if (!podcastOverride) setIsGeneratingSrt(true);
        try {
            const srtBlob = await generateSrtFile(targetPodcast, log);
            
            if (podcastOverride) return srtBlob;

            const url = URL.createObjectURL(srtBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${targetPodcast.selectedTitle.replace(/[^a-z0-9а-яё]/gi, '_').toLowerCase()}.srt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err: any) {
            if (!podcastOverride) setError('Ошибка при создании SRT файла.');
            log({type: 'error', message: 'Ошибка при генерации SRT', data: err});
            throw err;
        } finally {
            if (!podcastOverride) setIsGeneratingSrt(false);
        }
    };

    const downloadProjectAsZip = async (podcastOverride?: Podcast) => {
        const targetPodcast = podcastOverride || podcast;
        // Basic validation: must have at least one completed chapter
        if (!targetPodcast || !targetPodcast.chapters.some(c => c.status === 'completed' && c.audioBlob)) {
            log({ type: 'error', message: 'Попытка скачать ZIP для пустого или незавершенного проекта.' });
            return;
        }
        
        if (!podcastOverride) setIsZipping(true);
        log({ type: 'info', message: `Начало сборки ZIP-архива для проекта: ${targetPodcast.selectedTitle}` });

        try {
            const zip = new JSZip();

            // 1. Audio and Subtitles
            const finalAudioWav = await combineAndMixAudio(targetPodcast);
            const srtBlob = await generateSrtFile(targetPodcast, log);
            zip.file('final_audio.wav', finalAudioWav);
            zip.file('subtitles.srt', srtBlob);
            log({ type: 'info', message: 'Аудио и субтитры добавлены в архив.' });

            // 2. Images (Now organized per chapter + Thumbnails)
            const imageFolder = zip.folder('images');
            
            // Add generated thumbnails
            if (targetPodcast.youtubeThumbnails) {
                const thumbFolder = zip.folder('thumbnails');
                 for (const thumb of targetPodcast.youtubeThumbnails) {
                    const response = await fetch(thumb.dataUrl);
                    const blob = await response.blob();
                    thumbFolder?.file(`${thumb.styleName.replace(/[^a-z0-9]/gi, '_')}.png`, blob);
                }
            }

            // Add chapter images
            for (let i = 0; i < targetPodcast.chapters.length; i++) {
                const chapter = targetPodcast.chapters[i];
                if (chapter.images && chapter.images.length > 0) {
                     const chapterFolder = imageFolder?.folder(`chapter_${i + 1}`);
                     let imgCount = 1;
                     for (const imgSrc of chapter.images) {
                         try {
                             const response = await fetch(imgSrc);
                             const blob = await response.blob();
                             const ext = response.headers.get('content-type')?.includes('png') ? 'png' : 'jpeg';
                             chapterFolder?.file(`img_${String(imgCount).padStart(2, '0')}.${ext}`, blob);
                             imgCount++;
                         } catch (e) {
                             console.error("Failed to add image to zip", e);
                         }
                    }
                }
            }

            // 3. YouTube Details
            const detailsContent = `=================================\n    YouTube Video Details\n=================================\n\nTITLE:\n${targetPodcast.selectedTitle}\n\n---------------------------------\n\nDESCRIPTION:\n${targetPodcast.description}\n\n---------------------------------\n\nTAGS / KEYWORDS:\n${targetPodcast.seoKeywords.join(', ')}\n`;
            zip.file('youtube_details.txt', detailsContent);

            // 4. Generate and Download
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${targetPodcast.selectedTitle.replace(/[^a-z0-9а-яё]/gi, '_').toLowerCase()}_videopack.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            log({ type: 'info', message: `ZIP-архив скачан для: ${targetPodcast.selectedTitle}` });

        } catch (err: any) {
            if (!podcastOverride) setError('Ошибка при создании ZIP-архива.');
            log({ type: 'error', message: 'Ошибка при сборке ZIP-архива', data: err });
        } finally {
             if (!podcastOverride) setIsZipping(false);
        }
    };

    // --- QUEUE PROCESSING ---
    const processQueue = useCallback(async () => {
        if (!isQueueRunning || projectQueue.length === 0) {
            if (projectQueue.length === 0) setIsQueueRunning(false);
            return;
        }
    
        const currentProject = projectQueue[0];
        const pending = projectQueue.find(p => p.status === 'pending');
        
        // If nothing is strictly pending, check if everything is done
        if (!pending) {
             if (currentProject.status === 'completed' || currentProject.status === 'error') {
                 setIsQueueRunning(false);
                 log({ type: 'info', message: 'Очередь производства завершена.' });
                 return;
             }
        }

        const itemToRun = projectQueue[0];
        if (itemToRun.status !== 'pending') return;
        
        setProjectQueue(q => q.map(p => p.id === itemToRun.id ? { ...p, status: 'in_progress' } : p));
        
        log({ type: 'info', message: `>>> STARTING QUEUE ITEM: ${itemToRun.title}` });

        try {
            // Headless generation WITH generateAllChapters = true
            // Using hardcoded defaults for queue, but could be configurable
            const generatedPodcast = await createPodcastData(
                itemToRun.title,
                itemToRun.knowledgeBase,
                true, // Creative Freedom
                'English', // Default language
                20, // Duration
                'dialogue', // Narration
                { character1: 'auto', character2: 'auto' }, // Voices - AUTO for queue
                'Puck',
                5, // Images per chapter (hardcoded for now, could pass from startContentPipeline)
                'ai', // Image source
                true, // Force FULL GENERATION of all chapters
                (l, s) => {}, // No status UI updates
                (p) => {} // No progress UI updates
            );

            log({ type: 'info', message: `>>> GENERATION COMPLETE FOR: ${itemToRun.title}. Starting ZIP download...` });
            
            await downloadProjectAsZip(generatedPodcast);
            
            setProjectQueue(q => {
                const updated = q.map(p => p.id === itemToRun.id ? { ...p, status: 'completed' } : p);
                const [, ...remaining] = updated;
                return remaining as QueuedProject[];
            });
            
            log({ type: 'info', message: `>>> COMPLETED & DOWNLOADED: ${itemToRun.title}` });

        } catch (error: any) {
            setProjectQueue(q => {
                 const updated = q.map(p => p.id === itemToRun.id ? { ...p, status: 'error' } : p);
                 const [, ...remaining] = updated;
                 return remaining as QueuedProject[];
            });
            log({ type: 'error', message: `Ошибка при создании проекта из очереди: "${itemToRun.title}"`, data: error });
        }
        
    }, [isQueueRunning, projectQueue, log, defaultFont]);
    
    useEffect(() => {
        if (isQueueRunning && projectQueue.length > 0 && projectQueue[0].status === 'pending') {
            processQueue();
        } else if (isQueueRunning && projectQueue.length === 0) {
             setIsQueueRunning(false);
             log({ type: 'info', message: 'Все задачи в очереди выполнены.' });
        }
    }, [isQueueRunning, projectQueue, processQueue, log]); 

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
                return { ...p, chapters: p.chapters.map(c => ({...c, backgroundMusic: music })) };
            } else {
                return { ...p, chapters: p.chapters.map(c => c.id === chapterId ? { ...c, backgroundMusic: music } : c) };
            }
        });
    }, [setPodcast]);

    const setGlobalMusicVolume = useCallback((volume: number) => {
        setPodcast(p => p ? { ...p, backgroundMusicVolume: volume } : null);
    }, [setPodcast]);

    const setChapterMusicVolume = useCallback((chapterId: string, volume: number | null) => {
        setPodcast(p => {
            if (!p) return null;
            return { ...p, chapters: p.chapters.map(c => {
                if (c.id !== chapterId) return c;
                const newChapter = { ...c };
                if (volume === null) delete newChapter.backgroundMusicVolume;
                else newChapter.backgroundMusicVolume = volume;
                return newChapter;
            }) };
        });
    }, [setPodcast]);

    const regenerateProject = () => {
        if (!podcast) return;
        if (window.confirm("Вы уверены, что хотите полностью пересоздать этот проект?")) {
            startNewProject(podcast.topic, podcast.knowledgeBaseText || '', podcast.creativeFreedom, podcast.language, podcast.totalDurationMinutes, podcast.narrationMode, podcast.characterVoices, podcast.monologueVoice, podcast.initialImageCount, podcast.imageSource);
        }
    };

    const handleTitleSelection = useCallback(async (newTitle: string, forceUpdate = false) => {
        if (!podcast || (!forceUpdate && podcast.selectedTitle === newTitle)) return;
        setPodcast(p => p ? { ...p, selectedTitle: newTitle } : null);
        
        // Fallback logic: use first image of first chapter for new thumbnails
        const baseImage = podcast.chapters[0]?.images?.[0];
        
        if (!podcast.designConcepts || !baseImage) return;
        try {
            const newThumbnails = await generateYoutubeThumbnails(baseImage, newTitle, podcast.designConcepts, log, defaultFont);
            setPodcast(p => p ? { ...p, youtubeThumbnails: newThumbnails } : null);
        } catch (err: any) {
            setError("Ошибка при обновлении обложек.");
            log({ type: 'error', message: 'Не удалось обновить обложки после смены заголовка', data: err });
        }
    }, [podcast, log, setPodcast, defaultFont]);
    
    const handleBgSelection = useCallback(async (index: number) => {
        // Legacy logic kept for API compatibility, but mostly replaced by per-chapter images
        setPodcast(p => p ? { ...p, selectedBgIndex: index } : null);
    }, [setPodcast]);

    const regenerateText = async () => {
        if (!podcast) return;
        setIsRegeneratingText(true);
        try {
            const newTextAssets = await regenerateTextAssets(podcast.topic, podcast.creativeFreedom, podcast.language, log);
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
        // This is now a legacy "regenerate ALL" button. 
        // Better to focus on per-chapter regeneration via handleGenerateChapter.
        // For safety, we regenerate Chapter 1's images.
        if (!podcast || !podcast.chapters[0]) return;
        setIsRegeneratingImages(true);
        try {
            const chapterVisuals = podcast.chapters[0].visualSearchPrompts || [podcast.topic];
            const newImages = await generateStyleImages(chapterVisuals, podcast.initialImageCount, log);
            
            setPodcast(p => {
                 if(!p) return null;
                 const updatedChapters = [...p.chapters];
                 updatedChapters[0] = {...updatedChapters[0], images: newImages };
                 return { ...p, chapters: updatedChapters };
            });
            
            // Update thumbnail if needed
            if (newImages.length > 0 && podcast.designConcepts) {
                 const newThumbnails = await generateYoutubeThumbnails(newImages[0], podcast.selectedTitle, podcast.designConcepts, log, defaultFont);
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

    const regenerateSingleImage = async (index: number) => {
        // Deprecated/No-op in the new per-chapter flow via global button
        // This functionality is now handled by "Regenerate Chapter" which regenerates images for that chapter.
        log({ type: 'info', message: 'Пожалуйста, используйте кнопку "Пересоздать главу" для обновления изображений.' });
    };

    const generateMoreImages = async () => {
         // Deprecated in favor of per-chapter control
          log({ type: 'info', message: 'Пожалуйста, используйте кнопку "Пересоздать главу" для обновления изображений.' });
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
            const tracks = await findMusicWithAi(query, log);
            if (tracks.length === 0) {
                log({ type: 'info', message: `Подходящая музыка для главы "${chapter.title}" не найдена.` });
            }
            return tracks;
        } catch (err: any) {
            setError(err.message || "Ошибка при поиске музыки.");
            log({type: 'error', message: 'Ошибка при поиске музыки.', data: err});
            return [];
        }
    }, [podcast, log, setError]);

    const findMusicManuallyForChapter = useCallback(async (keywords: string): Promise<MusicTrack[]> => {
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
    }, [log, setError]);

    const findSfxForLine = async (chapterId: string, lineIndex: number): Promise<SoundEffect[]> => {
        if (!podcast) return [];
        const line = podcast.chapters.find(c => c.id === chapterId)?.script[lineIndex];
        if (!line || line.speaker.toUpperCase() !== 'SFX') return [];
        try {
            return await findSfxWithAi(line.text, log);
        } catch (e: any) {
            log({ type: 'error', message: 'Ошибка поиска SFX с ИИ', data: e });
            return [];
        }
    };
    
    const findSfxManuallyForLine = useCallback(async (keywords: string): Promise<SoundEffect[]> => {
        try {
            return await findSfxManually(keywords, log);
        } catch (e: any) {
            log({ type: 'error', message: 'Ошибка ручного поиска SFX', data: e });
            return [];
        }
    }, [log]);

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

    const startQuickTest = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setPodcastState(null);
        setLogs([]);
        setGenerationProgress(0);
        setIsGenerationPaused(false);
        
        setLoadingStatus([{ label: 'Создание плана для быстрого теста...', status: 'in_progress' }]);

        try {
            const blueprint = await generateQuickTestBlueprint('Mysterious Signal from Deep Space', 'English', log);
            
            setLoadingStatus(prev => prev.map(s => s.status === 'in_progress' ? { ...s, status: 'completed' as const } : s));
            setLoadingStatus(prev => [...prev, { label: 'Получение тестовых изображений...', status: 'in_progress' as const }]);

            const testImages = await getOnePhotoFromEachStockService(blueprint.visualSearchPrompts[0] || 'Space mystery', log);
            
            const firstChapter = blueprint.chapters[0];
            
            setLoadingStatus(prev => prev.map(s => s.status === 'in_progress' ? { ...s, status: 'completed' as const } : s));
            setLoadingStatus(prev => [...prev, { label: 'Генерация аудио (быстрый тест)...', status: 'in_progress' as const }]);

            const char1 = blueprint.characters[0]?.name || 'Host';
            const char2 = blueprint.characters[1]?.name || 'Expert';

            const audioBlob = await generateChapterAudio(
                firstChapter.script, 
                'dialogue', 
                { [char1]: 'Puck', [char2]: 'Zephyr' }, 
                'Puck', 
                log
            );

            const completedChapter: Chapter = {
                ...firstChapter,
                status: 'completed',
                audioBlob,
                images: testImages // Quick test images
            };

            const newPodcast: Podcast = {
                id: crypto.randomUUID(),
                ...blueprint,
                topic: 'Quick Test: Deep Space',
                selectedTitle: blueprint.youtubeTitleOptions[0],
                description: blueprint.description,
                seoKeywords: blueprint.seoKeywords,
                visualSearchPrompts: blueprint.visualSearchPrompts,
                characters: blueprint.characters,
                sources: [],
                language: 'English',
                chapters: [completedChapter],
                generatedImages: testImages,
                youtubeThumbnails: [],
                designConcepts: [],
                knowledgeBaseText: '',
                creativeFreedom: true,
                totalDurationMinutes: 1,
                narrationMode: 'dialogue',
                characterVoices: { [char1]: 'Puck', [char2]: 'Zephyr' },
                monologueVoice: 'Puck',
                selectedBgIndex: 0,
                backgroundMusicVolume: 0.05,
                initialImageCount: testImages.length,
                imageSource: 'stock'
            };
            
            setPodcast(newPodcast);
            setLoadingStatus([]);

        } catch (err: any) {
            setError(err.message || 'Быстрый тест не удался.');
            log({ type: 'error', message: 'Quick Test failed', data: err });
            setLoadingStatus(prev => prev.map(s => s.status === 'in_progress' ? { ...s, status: 'error' as const } : s));
        } finally {
            setIsLoading(false);
        }
    }, [log, setPodcast]);

    const startContentPipeline = useCallback(async (count: number) => {
        if (isLoading || isQueueRunning) return;
        setIsLoading(true);
        try {
            const ideas = await generateContentPlan(count, log);
            const newQueueItems: QueuedProject[] = ideas.map(idea => ({
                id: crypto.randomUUID(),
                status: 'pending',
                title: idea.title,
                knowledgeBase: `Historical Fact: ${idea.historicalFact}\nTwist: ${idea.lovecraftianTwist}\nStructure: ${idea.scriptStructure.join('\n')}\nTone: ${idea.dialogueTone}`
            }));
            
            setProjectQueue(prev => [...prev, ...newQueueItems]);
            setIsQueueRunning(true);
            log({ type: 'info', message: `В очередь добавлено ${count} проектов.` });
        } catch (err: any) {
            setError('Не удалось создать контент-план.');
            log({ type: 'error', message: 'Content pipeline failed', data: err });
        } finally {
            setIsLoading(false);
        }
    }, [isLoading, isQueueRunning, log]);

    return {
        podcast, setPodcastState, 
        isLoading, loadingStatus, generationProgress, error, setError,
        logs, log,
        audioUrls,
        isGenerationPaused, setIsGenerationPaused,
        editingThumbnail, setEditingThumbnail,
        isRegeneratingText, isRegeneratingImages, isRegeneratingAudio,
        regeneratingImageIndex, isGeneratingMoreImages,
        isConvertingToMp3, isGeneratingSrt, isZipping,
        startNewProject, startQuickTest,
        startContentPipeline, projectQueue, isQueueRunning,
        handleGenerateChapter, combineAndDownload, downloadProjectAsZip,
        saveThumbnail, regenerateProject, regenerateText,
        regenerateImages, regenerateAllAudio, regenerateSingleImage,
        generateMoreImages, handleTitleSelection, handleBgSelection, setGlobalMusicVolume, setChapterMusicVolume,
        manualTtsScript, subtitleText, generateSrt, setChapterMusic,
        findMusicForChapter,
        findMusicManuallyForChapter,
        findSfxForLine, findSfxManuallyForLine, setSfxForLine, setSfxVolume,
    };
};
