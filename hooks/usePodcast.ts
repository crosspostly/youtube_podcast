

import { safeLower, parseErrorMessage } from '../utils/safeLower-util';
import { cleanupPodcastImages, forceGarbageCollection } from '../utils/memoryCleanup';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { generatePodcastBlueprint, generateNextChapterScript, generateChapterAudio, combineAndMixAudio, regenerateTextAssets, generateThumbnailDesignConcepts, convertWavToMp3, findMusicWithAi, findMusicManually } from '../services/ttsService';
import { findSfxForScript, findSfxManually, findSfxWithAi } from '../services/sfxService';
import { generateSrtFile } from '../services/srtService';
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
    stockPhotoPreference: StockPhotoPreference = 'auto'
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
    const [isConvertingToMp3, setIsConvertingToMp3] = useState(false);
    const [isGeneratingSrt, setIsGeneratingSrt] = useState(false);
    const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
    const [videoGenerationProgress, setVideoGenerationProgress] = useState({ progress: 0, message: '' });
    const [editingThumbnail, setEditingThumbnail] = useState<YoutubeThumbnail | null>(null);
    const [isRegeneratingThumbnails, setIsRegeneratingThumbnails] = useState(false);

    const log = useCallback((entry: Omit<LogEntry, 'timestamp'>) => {
        setLogs(prev => [{ ...entry, timestamp: new Date().toISOString() }, ...prev]);
        if (entry.showToUser) {
            setWarning(entry.message);
        }
    }, []);

    const setError = useCallback((err: string | null) => {
        setErrorState(err);
        if (err) {
            log({ type: 'error', message: "Критическая ошибка", data: err });
        }
    }, [log]);
    
    const setPodcast = useCallback((p: Podcast | null) => {
        setPodcastState(p);
        if (p) {
            updateHistory(p);
        }
    }, [updateHistory]);

    const updateChapter = useCallback((chapterId: string, status: ChapterStatus, data: Partial<Chapter> = {}) => {
        setPodcastState(prev => {
            if (!prev) return null;
            const newPodcast = { 
                ...prev, 
                chapters: prev.chapters.map(c =>
                    c.id === chapterId ? { ...c, status, ...data, error: data.error || undefined } : c
                ) 
            };
            updateHistory(newPodcast);
            return newPodcast;
        });
    }, [updateHistory]);


    useEffect(() => {
        const urls: Record<string, string> = {};
        podcast?.chapters.forEach(chapter => {
            if (chapter.audioBlob) {
                urls[chapter.id] = URL.createObjectURL(chapter.audioBlob);
            }
        });
        setAudioUrls(urls);

        return () => {
            Object.values(urls).forEach(url => URL.revokeObjectURL(url));
        };
    }, [podcast?.chapters]);

    
    const handleGenerateChapter = useCallback(async (chapterId: string) => {
        if (!podcast) return;
        
        const chapterIndex = podcast.chapters.findIndex(c => c.id === chapterId);
        if (chapterIndex === -1) return;

        try {
            updateChapter(chapterId, "script_generating");
            
            const chapterScript = await generateNextChapterScript(
                podcast.topic,
                podcast.selectedTitle,
                podcast.characters,
                podcast.chapters.slice(0, chapterIndex),
                chapterIndex,
                podcast.totalDurationMinutes,
                podcast.knowledgeBaseText || '',
                podcast.creativeFreedom,
                podcast.language,
                podcast.narrationMode,
                log,
                apiKeys
            );

            const musicSearchText = chapterScript.script.map((line: ScriptLine) => line.text).join(' ');
            const music = await findMusicWithAi(musicSearchText, log, apiKeys);
            const backgroundMusic = music.length > 0 ? music[0] : undefined;
            
            updateChapter(chapterId, "generating", {
                script: chapterScript.script,
                title: chapterScript.title,
                imagePrompts: chapterScript.imagePrompts,
                backgroundMusic: backgroundMusic
            });

            const [imageResult, audioResult] = await Promise.allSettled([
                generateStyleImages(chapterScript.imagePrompts, podcast.initialImageCount, log, apiKeys, imageMode, stockPhotoPreference),
                generateChapterAudio(chapterScript.script, podcast.narrationMode, podcast.characterVoices, podcast.monologueVoice, log, apiKeys)
            ]);

            const generatedImages = imageResult.status === 'fulfilled' ? imageResult.value : [];
            const audioBlob = audioResult.status === 'fulfilled' ? audioResult.value : null;

            if (generatedImages.length === 0) {
                 log({type: 'warning', message: 'Изображения не сгенерированы, но аудио готово'});
            }
            if (!audioBlob) {
                const errorMsg = audioResult.status === 'rejected' ? (audioResult.reason as Error).message : 'Unknown error';
                throw (log({type: 'error', message: `Ошибка генерации аудио: ${errorMsg}`}), new Error('Failed to generate chapter audio: ' + errorMsg));
            }
            
            updateChapter(chapterId, "completed", { generatedImages, audioBlob });

        } catch (err) {
            const friendlyMessage = parseErrorMessage(err);
            log({ type: 'error', message: `Ошибка при генерации главы ${chapterIndex + 1}`, data: { friendlyMessage, originalError: err } });
            updateChapter(chapterId, "error", { error: friendlyMessage });
        }
    }, [podcast, log, apiKeys, imageMode, stockPhotoPreference, updateChapter]);


    const startNewProject = useCallback(async (
        topic: string, 
        knowledgeBaseText: string, 
        creativeFreedom: boolean, 
        language: string, 
        totalDurationMinutes: number, 
        narrationMode: NarrationMode, 
        characterVoices: { [key: string]: string }, 
        monologueVoice: string, 
        initialImageCount: number
    ) => {
        if (!topic.trim()) {
            setError("Введите название проекта.");
            return;
        }

        setIsLoading(true);
        setError(null);
        setWarning(null);
        setPodcast(null);
        setLogs([]);
        setGenerationProgress(0);
        setIsGenerationPaused(false);
        setLoadingStatus([
            { label: "Создание концепции проекта...", status: 'pending' },
            { label: "Подготовка студии...", status: 'pending' }
        ]);
        
        const updateStatus = (label: string, status: LoadingStatus['status']) => {
            setLoadingStatus(prev => prev.map(s => s.label === label ? { ...s, status } : s));
        };
        
        const pause = async () => {
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
            updateStatus("Создание концепции проекта...", 'in_progress');
            log({ type: 'info', message: "Запрос на создание концепции проекта и первой главы." });
            
            const blueprint = await generatePodcastBlueprint(
                topic, knowledgeBaseText, creativeFreedom, language, totalDurationMinutes, narrationMode, log, apiKeys, initialImageCount
            );
            
            updateStatus("Создание концепции проекта...", 'completed');
            setGenerationProgress(50);

            const totalChapters = Math.max(1, Math.ceil(totalDurationMinutes / 7));
            const characterVoiceMap: { [key: string]: string } = {};
            if (blueprint.characters.length > 0 && characterVoices.character1) {
                characterVoiceMap[blueprint.characters[0].name] = characterVoices.character1;
            }
            if (blueprint.characters.length > 1 && characterVoices.character2) {
                characterVoiceMap[blueprint.characters[1].name] = characterVoices.character2;
            }

            const initialChapters: Chapter[] = [
                { id: crypto.randomUUID(), ...blueprint.chapters[0], status: 'script_completed' },
                ...Array.from({ length: totalChapters - 1 }, (_, i) => ({
                    id: crypto.randomUUID(),
                    title: `Глава ${i + 2}`,
                    script: [],
                    status: 'pending' as ChapterStatus,
                    imagePrompts: [],
                    selectedBgIndex: 0
                }))
            ];
            
            const newPodcast: Podcast = {
                id: crypto.randomUUID(),
                ...blueprint,
                topic,
                selectedTitle: blueprint.youtubeTitleOptions[0] || topic,
                language,
                chapters: initialChapters,
                knowledgeBaseText,
                creativeFreedom,
                totalDurationMinutes,
                narrationMode,
                characterVoices: characterVoiceMap,
                monologueVoice,
                initialImageCount,
                backgroundMusicVolume: 0.02,
                videoPacingMode: 'auto'
            };
            
            updateStatus("Подготовка студии...", 'in_progress');
            setPodcast(newPodcast);
            setGenerationProgress(100);
            setIsLoading(false);

            (async () => {
                let currentPodcast = newPodcast;
                log({type: 'info', message: "Начало фоновой генерации остальных глав и ассетов."});

                // Process first chapter with high priority
                const firstChapter = currentPodcast.chapters[0];
                if (firstChapter) {
                    try {
                        log({type: 'info', message: "Приоритетная генерация ассетов для Главы 1..."});
                        updateChapter(firstChapter.id, 'generating');
                        const [audioResult, imageResult, musicResult] = await Promise.allSettled([
                            generateChapterAudio(firstChapter.script, narrationMode, characterVoiceMap, monologueVoice, log, apiKeys),
                            generateStyleImages(firstChapter.imagePrompts, initialImageCount, log, apiKeys, imageMode, stockPhotoPreference),
                            findMusicWithAi(firstChapter.script.map(l => l.text).join(' '), log, apiKeys)
                        ]);
                        
                        const audioBlob = audioResult.status === 'fulfilled' ? audioResult.value : null;
                        const generatedImages = imageResult.status === 'fulfilled' ? imageResult.value : [];
                        const backgroundMusic = musicResult.status === 'fulfilled' && musicResult.value.length > 0 ? musicResult.value[0] : undefined;
                        
                        if (audioResult.status === 'rejected') {
                            throw new Error(`Audio generation failed: ${(audioResult.reason as Error).message || audioResult.reason}`);
                        }
                        
                        const updateData = { audioBlob, generatedImages, backgroundMusic };
                        currentPodcast = {...currentPodcast, chapters: currentPodcast.chapters.map(c => c.id === firstChapter.id ? {...c, ...updateData, status: 'completed' as ChapterStatus} : c)};
                        updateChapter(firstChapter.id, 'completed', updateData);
                        
                        const thumbnailBaseImage = generatedImages[0];
                        if (thumbnailBaseImage) {
                            log({type: 'info', message: 'Генерация обложек...'});
                            try {
                                const designConcepts = await generateThumbnailDesignConcepts(currentPodcast.topic, currentPodcast.language, log, apiKeys);
                                const thumbnails = await generateYoutubeThumbnails(thumbnailBaseImage.url, currentPodcast.selectedTitle, designConcepts, log, defaultFont);
                                log({type: 'response', message: 'Обложки успешно сгенерированы.'});
                                const thumbnailUpdate = { thumbnailBaseImage, designConcepts, youtubeThumbnails: thumbnails, selectedThumbnail: thumbnails[0] || undefined };
                                currentPodcast = {...currentPodcast, ...thumbnailUpdate};
                                setPodcastState(p => { if (!p) return null; const newPodcast = {...p, ...thumbnailUpdate}; updateHistory(newPodcast); return newPodcast; });
                            } catch (e) {
                                log({type: 'error', message: 'Ошибка при ранней генерации обложек.', data: e});
                            }
                        }

                    } catch (err) {
                        const friendlyMessage = parseErrorMessage(err);
                        log({ type: 'error', message: "Ошибка при приоритетной генерации Главы 1", data: { friendlyMessage, originalError: err } });
                        updateChapter(firstChapter.id, 'error', { error: friendlyMessage });
                    }
                }

                // Process remaining chapters
                for (let i = 1; i < totalChapters; i++) {
                    if (isGenerationPaused) {
                        log({type: 'info', message: 'Генерация приостановлена пользователем.'});
                        await pause();
                        log({type: 'info', message: 'Генерация возобновлена.'});
                    }
                    
                    const chapter = currentPodcast.chapters[i];
                    if (!chapter || chapter.status !== 'pending') continue;
                    
                    const chapterId = chapter.id;

                    try {
                        updateChapter(chapterId, 'script_generating');
                        log({type: 'info', message: `Генерация сценария для главы ${i + 1}...`});
                        const chapterScript = await generateNextChapterScript(
                            topic, currentPodcast.selectedTitle, currentPodcast.characters, currentPodcast.chapters.slice(0, i),
                            i, totalDurationMinutes, knowledgeBaseText || '', creativeFreedom, language, narrationMode, log, apiKeys
                        );
                        currentPodcast.chapters[i] = { ...chapter, ...chapterScript, status: 'script_completed' };
                        updateChapter(chapterId, 'script_completed', chapterScript);
                        log({type: 'response', message: `Сценарий для главы ${i+1} успешно сгенерирован.`});
                        
                        if (isGenerationPaused) await pause();
                        
                        updateChapter(chapterId, 'generating');
                        const [audioResult, imageResult, musicResult] = await Promise.allSettled([
                            generateChapterAudio(chapterScript.script, narrationMode, characterVoiceMap, monologueVoice, log, apiKeys),
                            generateStyleImages(chapterScript.imagePrompts, initialImageCount, log, apiKeys, imageMode, stockPhotoPreference),
                            findMusicWithAi(chapterScript.script.map((l: ScriptLine) => l.text).join(' '), log, apiKeys)
                        ]);

                        const audioBlob = audioResult.status === 'fulfilled' ? audioResult.value : null;
                        if (audioResult.status === 'rejected') {
                            throw new Error(`Audio generation failed: ${(audioResult.reason as Error).message || audioResult.reason}`);
                        }

                        const updateData = {
                            audioBlob,
                            generatedImages: imageResult.status === 'fulfilled' ? imageResult.value : [],
                            backgroundMusic: musicResult.status === 'fulfilled' && musicResult.value.length > 0 ? musicResult.value[0] : undefined
                        };
                        currentPodcast.chapters[i] = {...currentPodcast.chapters[i], ...updateData, status: 'completed'};
                        updateChapter(chapterId, 'completed', updateData);
                        log({type: 'response', message: `Ассеты для главы ${i + 1} успешно сгенерированы.`});

                    } catch (err) {
                        const friendlyMessage = parseErrorMessage(err);
                        log({ type: 'error', message: `Ошибка при генерации главы ${i + 1}`, data: { friendlyMessage, originalError: err } });
                        updateChapter(chapterId, 'error', { error: friendlyMessage });
                    }
                }
                
                log({type: 'info', message: 'Фоновая генерация всех глав завершена.'});
                
                if (!currentPodcast.youtubeThumbnails || currentPodcast.youtubeThumbnails.length === 0) {
                     log({type: 'warning', message: 'Ранняя генерация обложек не удалась, повторная попытка...'});
                     try {
                        const thumbnailBaseImage = currentPodcast.chapters.flatMap(c => c.generatedImages || []).find(img => img.url);
                        if (thumbnailBaseImage) {
                            const designConcepts = currentPodcast.designConcepts || await generateThumbnailDesignConcepts(currentPodcast.topic, currentPodcast.language, log, apiKeys);
                            const thumbnails = await generateYoutubeThumbnails(thumbnailBaseImage.url, currentPodcast.selectedTitle, designConcepts, log, defaultFont);
                            const thumbnailUpdate = { youtubeThumbnails: thumbnails, selectedThumbnail: thumbnails[0], thumbnailBaseImage };
                            currentPodcast = {...currentPodcast, ...thumbnailUpdate};
                            setPodcastState(p => { if (!p) return null; const newPodcast = {...p, ...thumbnailUpdate}; updateHistory(newPodcast); return newPodcast; });
                            log({type: 'response', message: 'Обложки успешно сгенерированы в fallback-режиме.'});
                        }
                     } catch (e) {
                         log({type: 'error', message: 'Финальная попытка генерации обложек провалилась', data: e});
                     }
                }
            })();

        } catch (err) {
            const friendlyMessage = parseErrorMessage(err);
            setLoadingStatus(prev => prev.map(s => s.status === 'in_progress' ? { ...s, status: 'error' } : s));
            setError(friendlyMessage);
            log({ type: 'error', message: "Критическая ошибка при инициализации проекта", data: { friendlyMessage, originalError: err } });
            setIsLoading(false);
        }
    }, [log, setPodcast, setError, isGenerationPaused, updateChapter, apiKeys, defaultFont, imageMode, stockPhotoPreference, updateHistory]);
    
    const startAutomatedProject = useCallback(async (topic: string) => {
        // Dummy implementation for now, should be expanded
        if (!topic.trim()) {
            setError("Введите тему для автоматической генерации.");
            return;
        }
        await startNewProject(topic, '', true, 'ru', 5, 'dialogue', {character1: 'Puck', character2: 'Zephyr'}, 'Puck', 3);
    }, [startNewProject, setError]);


    const startVideoTest = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setWarning(null);
        setPodcast(null);
        setLogs([]);
        setGenerationProgress(0);
        log({ type: 'info', message: "Запуск теста видео-движка с эталонными данными." });

        setLoadingStatus([
            { label: "Загрузка тестового проекта", status: 'in_progress' },
            { label: "Генерация аудио для Главы 1", status: 'pending' },
            { label: "Генерация аудио для Главы 2", status: 'pending' },
            { label: "Сборка проекта", status: 'pending' },
        ]);

        const updateStatus = (label: string, status: LoadingStatus['status']) => {
            setLoadingStatus(prev => prev.map(s => s.label === label ? { ...s, status } : s));
        };
        
        try {
            const testPodcastData: Podcast = {
                id: `test-${crypto.randomUUID()}`,
                topic: "Тест Видео-движка: Тайна Маяка",
                selectedTitle: "Тест: Тайна Маяка",
                language: 'Русский',
                totalDurationMinutes: 2,
                narrationMode: 'dialogue',
                characterVoices: { 'Рассказчик': 'Puck', 'Историк': 'Zephyr' },
                monologueVoice: 'Puck',
                initialImageCount: 3,
                backgroundMusicVolume: 0.02,
                creativeFreedom: true,
                knowledgeBaseText: '',
                ...TEST_PODCAST_BLUEPRINT,
                chapters: TEST_PODCAST_BLUEPRINT.chapters.map(c => ({...c})), // deep copy chapters
                youtubeThumbnails: [],
                designConcepts: [],
                thumbnailBaseImage: TEST_PODCAST_BLUEPRINT.chapters[0].generatedImages?.[0],
                videoPacingMode: 'auto',
            };
            
            updateStatus("Загрузка тестового проекта", 'completed');
            updateStatus("Генерация аудио для Главы 1", 'in_progress');
            updateStatus("Генерация аудио для Главы 2", 'in_progress');

            const audioPromises = testPodcastData.chapters.map(async (chapter, index) => {
                const statusLabel = `Генерация аудио для Главы ${index + 1}`;
                try {
                    const audioBlob = await generateChapterAudio(chapter.script, testPodcastData.narrationMode, testPodcastData.characterVoices, testPodcastData.monologueVoice, log, apiKeys);
                    updateStatus(statusLabel, 'completed');
                    return { ...chapter, status: 'completed' as ChapterStatus, audioBlob };
                } catch (e) {
                    updateStatus(statusLabel, 'error');
                    throw e;
                }
            });

            const updatedChapters = await Promise.all(audioPromises);
            testPodcastData.chapters = updatedChapters;

            updateStatus("Сборка проекта", 'in_progress');
            log({ type: 'info', message: 'Все аудиодорожки для теста сгенерированы. Загрузка в студию...' });
            setPodcast(testPodcastData);
            updateStatus("Сборка проекта", 'completed');

        } catch (err) {
            const friendlyMessage = parseErrorMessage(err);
            setError(friendlyMessage);
            log({type: 'error', message: 'Тест видео-движка провален', data: {friendlyMessage, originalError: err}});
        } finally {
            setIsLoading(false);
        }

    }, [log, setPodcast, setError, apiKeys]);
    
    // ... all other functions will be implemented here
    const combineAndDownload = useCallback(async (format: 'wav' | 'mp3' = 'wav') => {
        if (!podcast || podcast.chapters.some(c => c.status !== 'completed' || !c.audioBlob)) return;
        
        const setIsProcessing = format === 'mp3' ? setIsConvertingToMp3 : () => {};
        setIsProcessing(true);
        
        setLoadingStatus([{label: "Сборка и микширование аудио...", status: 'in_progress'}]);

        try {
            let finalBlob = await combineAndMixAudio(podcast, log);
            let extension = 'wav';

            if (format === 'mp3') {
                setLoadingStatus([{label: "Конвертация в MP3...", status: 'in_progress'}]);
                finalBlob = await convertWavToMp3(finalBlob, log);
                extension = 'mp3';
            }
            
            const filename = `${safeLower(podcast.selectedTitle.replace(/[^a-z0-9а-яё]/gi, '_'))}.${extension}`;
            downloadBlob(finalBlob, filename);
            log({ type: 'response', message: `✅ Аудио экспортировано (${format})` });
            
            const cleanedSize = cleanupPodcastImages(podcast);
            if (cleanedSize > 0) {
                log({ type: 'info', message: `🧹 Очищено ${cleanedSize.toFixed(2)} МБ памяти` });
            }

        } catch(err) {
            const friendlyMessage = parseErrorMessage(err);
            setError(friendlyMessage);
            log({ type: 'error', message: `Ошибка при сборке и экспорте (${format})`, data: { friendlyMessage, originalError: err } });
            cleanupPodcastImages(podcast);
        } finally {
            setIsProcessing(false);
            setLoadingStatus([]);
        }
    }, [podcast, log, setError]);
    
    const generateSrt = useCallback(async () => {
        if (podcast) {
            setIsGeneratingSrt(true);
            try {
                const srtBlob = await generateSrtFile(podcast, log);
                downloadBlob(srtBlob, `${safeLower(podcast.selectedTitle.replace(/[^a-z0-9а-яё]/gi, '_'))}.srt`);
            } catch (err) {
                const friendlyMessage = parseErrorMessage(err);
                setError(friendlyMessage);
                log({ type: 'error', message: "Ошибка при генерации SRT", data: { friendlyMessage, originalError: err } });
            } finally {
                setIsGeneratingSrt(false);
            }
        }
    }, [podcast, log, setError]);

    const handleVideoGeneration = useCallback(async (targetPodcast: Podcast) => {
        if (targetPodcast.chapters.some(c => c.status !== 'completed' || !c.audioBlob)) {
            setError("Все главы должны быть завершены с аудио перед созданием видео");
            return;
        }
        setIsGeneratingVideo(true);
        setVideoGenerationProgress({ progress: 0, message: 'Подготовка...' });
        setError(null);
        try {
            const combinedAudio = await combineAndMixAudio(targetPodcast, log);
            const durations = targetPodcast.videoPacingMode === 'manual' 
                ? targetPodcast.chapters.flatMap(c => c.imageDurations || Array((c.generatedImages || []).length).fill(60))
                : undefined;

            const videoBlob = await generateVideoService(targetPodcast, combinedAudio, (progress, message) => setVideoGenerationProgress({ progress, message }), log, durations);
            downloadBlob(videoBlob, `${safeLower(targetPodcast.selectedTitle.replace(/[^a-z0-9а-яё]/gi, '_'))}.mp4`);
            log({ type: 'response', message: '✅ Видео успешно создано' });
            
            const cleanedSize = cleanupPodcastImages(targetPodcast);
            log({ type: 'info', message: `🧹 Очищено ${cleanedSize.toFixed(2)} МБ памяти` });
            forceGarbageCollection();

        } catch (err) {
            if (safeLower((err as Error).message).includes('cancelled')) {
                log({ type: 'info', message: 'Генерация видео отменена пользователем.' });
            } else {
                const friendlyMessage = parseErrorMessage(err);
                setError(friendlyMessage);
                log({ type: 'error', message: 'Ошибка при генерации видео', data: { friendlyMessage, originalError: err } });
            }
            const cleanedSize = cleanupPodcastImages(targetPodcast);
            log({ type: 'info', message: `Память очищена (${cleanedSize.toFixed(2)} МБ)` });
        } finally {
            setIsGeneratingVideo(false);
            setVideoGenerationProgress({ progress: 0, message: '' });
        }
    }, [log, setError]);
    
    const generateVideo = useCallback(() => {
        if (podcast) handleVideoGeneration(podcast);
    }, [podcast, handleVideoGeneration]);
    
    const generatePartialVideo = useCallback(() => {
        if (!podcast) return;
        const completedChapters = podcast.chapters.filter(c => c.status === 'completed' && c.audioBlob);
        if (completedChapters.length === 0) {
            setError("Нет ни одной завершенной главы для создания видео.");
            return;
        }
        const partialPodcast = { ...podcast, chapters: completedChapters };
        handleVideoGeneration(partialPodcast);
    }, [podcast, handleVideoGeneration, setError]);

    const generateVideoLocally = useCallback(async () => {
        if (!podcast) return;
        if (podcast.chapters.some(c => c.status !== 'completed' || !c.audioBlob)) {
            setError("Все главы должны быть завершены с аудио перед созданием видео");
            return;
        }
        setIsGeneratingVideo(true);
        setVideoGenerationProgress({ progress: 0, message: 'Экспорт проекта...' });
        setError(null);
        try {
            log({ type: 'info', message: '📤 Создание SRT файла для локальной сборки...' });
            const srtBlob = await generateSrtFile(podcast, log);

            log({ type: 'info', message: '📤 Отправка материалов на локальный сервер...' });
            const projectId = await exportProjectToLocalCLI(podcast, srtBlob);
            log({ type: 'info', message: `✅ Материалы отправлены. Project ID: ${projectId}` });
            log({ type: 'info', message: `🎬 Сборка видео началась на локальном FFmpeg...` });
            log({ type: 'info', message: `⏳ Это может занять 3-5 минут...` });
            setVideoGenerationProgress({ progress: 1, message: 'Видео создаётся на локальном сервере...' });
        } catch (err) {
            const friendlyMessage = parseErrorMessage(err);
            setError(friendlyMessage);
            log({ type: 'error', message: 'Ошибка экспорта проекта', data: err });
            setIsGeneratingVideo(false);
        } 
    }, [podcast, log, setError]);
    
    const cancelVideoGeneration = useCallback(() => {
        cancelFfmpeg();
        setIsGeneratingVideo(false);
        setVideoGenerationProgress({ progress: 0, message: 'Отмена...' });
    }, []);

    const saveThumbnail = useCallback((updatedThumbnail: YoutubeThumbnail) => {
        setPodcastState(p => {
            if (!p || !p.youtubeThumbnails) return p;
            const newPodcast = {
                ...p,
                youtubeThumbnails: p.youtubeThumbnails.map(t => t.styleName === updatedThumbnail.styleName ? updatedThumbnail : t),
            };
            updateHistory(newPodcast);
            return newPodcast;
        });
    }, [updateHistory]);

    const regenerateProject = useCallback(() => {
        if (podcast) {
            if ((window as any).confirm("Вы уверены, что хотите полностью пересоздать этот проект?")) {
                startNewProject(
                    podcast.topic,
                    podcast.knowledgeBaseText || "",
                    podcast.creativeFreedom,
                    podcast.language,
                    podcast.totalDurationMinutes,
                    podcast.narrationMode,
                    podcast.characterVoices,
                    podcast.monologueVoice,
                    podcast.initialImageCount
                );
            }
        }
    }, [podcast, startNewProject]);
    
    const handleTitleSelection = useCallback(async (title: string, forceUpdate: boolean = false) => {
        if (!podcast || (!forceUpdate && podcast.selectedTitle === title)) return;
        if (!podcast.designConcepts || !podcast.thumbnailBaseImage) {
            setPodcastState(p => { if (!p) return null; const newPodcast = { ...p, selectedTitle: title }; updateHistory(newPodcast); return newPodcast; });
            return;
        }
        try {
            const newThumbnails = await generateYoutubeThumbnails(podcast.thumbnailBaseImage.url, title, podcast.designConcepts, log, defaultFont);
            setPodcastState(p => { if (!p) return null; const newPodcast = { ...p, selectedTitle: title, youtubeThumbnails: newThumbnails, selectedThumbnail: newThumbnails[0] || undefined }; updateHistory(newPodcast); return newPodcast; });
        } catch (err) {
            const friendlyMessage = parseErrorMessage(err);
            setError(friendlyMessage);
            log({type: 'error', message: 'Не удалось обновить обложки после смены заголовка', data: {friendlyMessage, originalError: err}});
        }
    }, [podcast, log, defaultFont, updateHistory, setError]);

    const regenerateText = useCallback(async () => {
        if (podcast) {
            setIsRegeneratingText(true);
            try {
                const newAssets = await regenerateTextAssets(podcast.topic, podcast.knowledgeBaseText || '', podcast.creativeFreedom, podcast.language, log, apiKeys);
                const newTitle = newAssets.youtubeTitleOptions[0] || podcast.selectedTitle;
                setPodcastState(p => { if (!p) return null; const newPodcast = { ...p, ...newAssets }; updateHistory(newPodcast); return newPodcast; });
                await handleTitleSelection(newTitle, true);
            } catch (err) {
                const friendlyMessage = parseErrorMessage(err);
                setError(friendlyMessage);
                log({ type: 'error', message: 'Ошибка при регенерации текста', data: { friendlyMessage, originalError: err } });
            } finally {
                setIsRegeneratingText(false);
            }
        }
    }, [podcast, log, apiKeys, updateHistory, setError, handleTitleSelection]);

    const regenerateChapterImages = useCallback(async (chapterId: string) => {
        const chapter = podcast?.chapters.find(c => c.id === chapterId);
        if (!podcast || !chapter) return;
        
        updateChapter(chapterId, 'images_generating');
        try {
            const newImages = await generateStyleImages(chapter.imagePrompts, 3, log, apiKeys, imageMode, stockPhotoPreference);
            const imageDurations = podcast.videoPacingMode === 'manual' ? Array(newImages.length).fill(60) : undefined;
            updateChapter(chapterId, 'completed', { generatedImages: newImages, imageDurations });
        } catch (err) {
            const friendlyMessage = parseErrorMessage(err);
            log({ type: 'error', message: `Ошибка при регенерации изображений для главы ${chapter.title}`, data: { friendlyMessage, originalError: err } });
            updateChapter(chapterId, 'error', { error: friendlyMessage });
        }
    }, [podcast, log, apiKeys, updateChapter, imageMode, stockPhotoPreference]);

    const regenerateAllAudio = useCallback(async () => {
        if (!podcast) return;
        setIsRegeneratingAudio(true);
        log({ type: 'info', message: 'Начало переозвучки всех глав.' });
        
        setPodcastState(p => { if (!p) return null; const newPodcast = { ...p, chapters: p.chapters.map(c => c.script && c.script.length > 0 ? { ...c, status: 'audio_generating' as ChapterStatus } : c) }; updateHistory(newPodcast); return newPodcast; });
        
        const results = await Promise.allSettled(podcast.chapters.map(async (chapter) => {
            if (chapter.script && chapter.script.length > 0) {
                try {
                    const audioBlob = await generateChapterAudio(chapter.script, podcast.narrationMode, podcast.characterVoices, podcast.monologueVoice, log, apiKeys);
                    return { chapterId: chapter.id, status: 'completed' as const, audioBlob };
                } catch (e: any) {
                    log({ type: 'error', message: `Ошибка при переозвучке главы ${chapter.title}`, data: e });
                    return { chapterId: chapter.id, status: 'error' as const, error: e.message || 'Ошибка озвучки' };
                }
            }
            return { chapterId: chapter.id, status: chapter.status };
        }));

        setPodcastState(p => {
            if (!p) return null;
            const newChapters = p.chapters.map(chapter => {
                const result = results.find(res => (res as any).value?.chapterId === chapter.id);
                if (result?.status === 'fulfilled' && result.value) {
                    const { chapterId, ...updateData } = result.value;
                    return { ...chapter, ...updateData };
                }
                return chapter;
            });
            const newPodcast = { ...p, chapters: newChapters };
            updateHistory(newPodcast);
            return newPodcast;
        });
        
        log({ type: 'info', message: 'Переозвучка всех глав завершена.' });
        setIsRegeneratingAudio(false);
    }, [podcast, log, apiKeys, updateHistory]);
    
    const regenerateAllImages = useCallback(async () => {
        if (!podcast) return;
        log({ type: 'info', message: 'Начало регенерации всех изображений.' });
        setPodcastState(p => { if (!p) return null; const newPodcast = { ...p, chapters: p.chapters.map(c => ({...c, status: 'images_generating' as ChapterStatus})) }; updateHistory(newPodcast); return newPodcast; });
        
        const results = await Promise.allSettled(podcast.chapters.map(async (chapter) => {
            try {
                const newImages = await generateStyleImages(chapter.imagePrompts, 3, log, apiKeys, imageMode, stockPhotoPreference);
                return { chapterId: chapter.id, status: 'completed' as const, generatedImages: newImages };
            } catch (e: any) {
                log({ type: 'error', message: `Ошибка при регенерации изображений для главы ${chapter.title}`, data: e });
                return { chapterId: chapter.id, status: 'error' as const, error: e.message || 'Ошибка генерации изображений' };
            }
        }));

        setPodcastState(p => {
            if (!p) return null;
            const newChapters = p.chapters.map(chapter => {
                const result = results.find(res => (res as any).value?.chapterId === chapter.id);
                if (result?.status === 'fulfilled' && result.value) {
                    let updatedChapter: Chapter = { ...chapter, status: result.value.status, error: (result.value as any).error };
                    if (result.value.generatedImages) {
                        updatedChapter.generatedImages = result.value.generatedImages;
                        if (p.videoPacingMode === 'manual') {
                            updatedChapter.imageDurations = Array(result.value.generatedImages.length).fill(60);
                        }
                    }
                    return updatedChapter;
                }
                return chapter;
            });
            const newPodcast = { ...p, chapters: newChapters };
            updateHistory(newPodcast);
            return newPodcast;
        });

        log({ type: 'info', message: 'Регенерация всех изображений завершена.' });
    }, [podcast, log, apiKeys, updateHistory, imageMode, stockPhotoPreference]);

    const regenerateSingleImage = useCallback(async (chapterId: string, index: number) => {
        const chapter = podcast?.chapters.find(c => c.id === chapterId);
        if (!podcast || !chapter || !chapter.imagePrompts[index]) return;
        
        if (regeneratingImage) {
            log({type: 'warning', message: 'Другое изображение уже регенерируется. Пожалуйста, подождите.'});
            return;
        }

        setRegeneratingImage({ chapterId, index });
        try {
            const newImage = await regenerateSingleImageApi(chapter.imagePrompts[index], log, apiKeys, imageMode, stockPhotoPreference);
            setPodcastState(p => {
                if (!p) return null;
                const newChapters = p.chapters.map(c => {
                    if (c.id === chapterId) {
                        const newImages = [...c.generatedImages || []];
                        newImages[index] = newImage;
                        return { ...c, generatedImages: newImages };
                    }
                    return c;
                });
                const newPodcast = { ...p, chapters: newChapters };
                updateHistory(newPodcast);
                return newPodcast;
            });
        } catch (err) {
            const friendlyMessage = parseErrorMessage(err);
            setError(friendlyMessage);
            log({type: 'error', message: `Ошибка при регенерации изображения ${index + 1}.`, data: { friendlyMessage, originalError: err }});
        } finally {
            setRegeneratingImage(null);
        }
    }, [podcast, log, apiKeys, updateHistory, setError, regeneratingImage, imageMode, stockPhotoPreference]);
    
    const generateMoreImages = useCallback(async (chapterId: string) => {
        const chapter = podcast?.chapters.find(c => c.id === chapterId);
        if (!podcast || !chapter) return;
        
        if (generatingMoreImages) {
            log({type: 'warning', message: 'Уже идет генерация дополнительных изображений. Пожалуйста, подождите.'});
            return;
        }

        setGeneratingMoreImages(chapterId);
        try {
            const newImages = await generateMoreImagesApi(chapter.imagePrompts, log, apiKeys, imageMode, stockPhotoPreference);
            setPodcastState(p => {
                if (!p) return null;
                const newChapters = p.chapters.map(c => {
                    if (c.id === chapterId) {
                        const existingImages = c.generatedImages || [];
                        const updatedImages = [...existingImages, ...newImages];
                        let imageDurations = c.imageDurations;
                        if (p.videoPacingMode === 'manual') {
                            const newDurations = Array(newImages.length).fill(60);
                            imageDurations = [...(c.imageDurations?.length === existingImages.length ? c.imageDurations : Array(existingImages.length).fill(60)), ...newDurations];
                        }
                        return { ...c, generatedImages: updatedImages, imageDurations };
                    }
                    return c;
                });
                const newPodcast = { ...p, chapters: newChapters };
                updateHistory(newPodcast);
                return newPodcast;
            });
        } catch (err) {
            const friendlyMessage = parseErrorMessage(err);
            setError(friendlyMessage);
            log({type: 'error', message: 'Ошибка при генерации доп. изображений', data: { friendlyMessage, originalError: err }});
        } finally {
            setGeneratingMoreImages(null);
        }
    }, [podcast, log, apiKeys, updateHistory, setError, generatingMoreImages, imageMode, stockPhotoPreference]);

    const setThumbnailBaseImage = useCallback(async (image: GeneratedImage) => {
        if (!podcast || podcast.thumbnailBaseImage?.url === image.url) return;
        if (!podcast.designConcepts) {
            setPodcastState(p => { if (!p) return null; const newPodcast = { ...p, thumbnailBaseImage: image }; updateHistory(newPodcast); return newPodcast; });
            return;
        }
        try {
            const newThumbnails = await generateYoutubeThumbnails(image.url, podcast.selectedTitle, podcast.designConcepts, log, defaultFont);
            setPodcastState(p => { if (!p) return null; const newPodcast = { ...p, thumbnailBaseImage: image, youtubeThumbnails: newThumbnails, selectedThumbnail: newThumbnails[0] || undefined }; updateHistory(newPodcast); return newPodcast; });
        } catch (err) {
            const friendlyMessage = parseErrorMessage(err);
            setError(friendlyMessage);
            log({type: 'error', message: 'Не удалось перерисовать обложки с новым фоном', data: {friendlyMessage, originalError: err}});
        }
    }, [podcast, log, defaultFont, updateHistory, setError]);
    
    const setGlobalMusicVolume = useCallback((volume: number) => {
        setPodcastState(p => { if (!p) return null; const newPodcast = { ...p, backgroundMusicVolume: volume }; updateHistory(newPodcast); return newPodcast; });
    }, [updateHistory]);
    
    const setChapterMusicVolume = useCallback((chapterId: string, volume: number | null) => {
        setPodcastState(p => {
            if (!p) return null;
            const newChapters = p.chapters.map(c => {
                if (c.id === chapterId) {
                    const newChapter = { ...c };
                    if (volume === null) {
                        delete newChapter.backgroundMusicVolume;
                    } else {
                        newChapter.backgroundMusicVolume = volume;
                    }
                    return newChapter;
                }
                return c;
            });
            const newPodcast = { ...p, chapters: newChapters };
            updateHistory(newPodcast);
            return newPodcast;
        });
    }, [updateHistory]);

    const setChapterMusic = useCallback((chapterId: string, music: MusicTrack, applyToAll: boolean = false) => {
        setPodcastState(p => {
            if (!p) return null;
            let newPodcast: Podcast;
            if (applyToAll) {
                const newChapters = p.chapters.map(c => ({...c, backgroundMusic: music }));
                newPodcast = { ...p, chapters: newChapters };
            } else {
                const newChapters = p.chapters.map(c => c.id === chapterId ? { ...c, backgroundMusic: music } : c);
                newPodcast = { ...p, chapters: newChapters };
            }
            updateHistory(newPodcast);
            return newPodcast;
        });
    }, [updateHistory]);

    const findMusicForChapter = useCallback(async (chapterId: string): Promise<MusicTrack[]> => {
        if (!podcast) return [];
        const chapter = podcast.chapters.find(c => c.id === chapterId);
        if (!chapter) return [];
        try {
            const scriptText = chapter.script.map(l => l.text).join(' ');
            const query = scriptText.trim() ? scriptText : podcast.topic;
            const tracks = await findMusicWithAi(query, log, apiKeys);
            if (tracks.length === 0) {
                log({type: 'info', message: `Подходящая музыка для главы "${chapter.title}" не найдена.`});
            }
            return tracks;
        } catch (err) {
            const friendlyMessage = parseErrorMessage(err);
            setError(friendlyMessage);
            log({ type: 'error', message: "Ошибка при поиске музыки.", data: { friendlyMessage, originalError: err } });
            return [];
        }
    }, [podcast, log, apiKeys, setError]);
    
    const findMusicManuallyForChapter = useCallback(async (keywords: string): Promise<MusicTrack[]> => {
        if (!podcast) return [];
        try {
            const tracks = await findMusicManually(keywords, log);
            if (tracks.length > 0) {
                log({type: 'response', message: 'Музыкальные треки по ручному запросу успешно получены.'});
            } else {
                log({type: 'info', message: 'По ручному запросу музыка не найдена.'});
            }
            return tracks;
        } catch (err) {
            const friendlyMessage = parseErrorMessage(err);
            setError(friendlyMessage);
            log({ type: 'error', message: "Ошибка при ручном поиске музыки.", data: { friendlyMessage, originalError: err } });
            return [];
        }
    }, [podcast, log, setError]);
    
    const findSfxForLine = useCallback(async (chapterId: string, lineIndex: number): Promise<SoundEffect[]> => {
        if (!podcast) return [];
        const chapter = podcast.chapters.find(c => c.id === chapterId);
        const line = chapter?.script[lineIndex];
        if (!line || line.speaker.toUpperCase() !== 'SFX') return [];
        
        if (line.searchTags) {
            try {
                log({type: 'info', message: `Поиск SFX для "${line.text}" по встроенным тегам: "${line.searchTags}"`});
                return await findSfxManually(line.searchTags, log, apiKeys.freesound);
            } catch (e) {
                log({type: 'error', message: 'Ошибка поиска SFX по встроенным тегам', data: e});
            }
        }
        
        try {
            log({type: 'warning', message: `SFX "${line.text}" не имеет встроенных тегов, используем AI-генерацию как fallback...`});
            return await findSfxWithAi(line.text, log, apiKeys);
        } catch (e) {
            log({type: 'error', message: 'Ошибка поиска SFX с ИИ', data: e});
            return [];
        }
    }, [podcast, log, apiKeys]);
    
    const findSfxManuallyForLine = useCallback(async (keywords: string): Promise<SoundEffect[]> => {
        try {
            return await findSfxManually(keywords, log, apiKeys.freesound);
        } catch (e) {
            log({type: 'error', message: 'Ошибка ручного поиска SFX', data: e});
            return [];
        }
    }, [log, apiKeys]);
    
    const setSfxForLine = useCallback((chapterId: string, lineIndex: number, sfx: SoundEffect | null) => {
        setPodcastState(p => {
            if (!p) return null;
            const newPodcast = {
                ...p,
                chapters: p.chapters.map(c => {
                    if (c.id !== chapterId) return c;
                    const newScript = [...c.script];
                    const line = newScript[lineIndex];
                    if (line) {
                        newScript[lineIndex] = {...line, soundEffect: sfx || undefined};
                    }
                    return {...c, script: newScript};
                })
            };
            updateHistory(newPodcast);
            return newPodcast;
        });
    }, [updateHistory]);
    
    const setSfxVolume = useCallback((chapterId: string, lineIndex: number, volume: number) => {
        setPodcastState(p => {
            if (!p) return null;
            const newPodcast = {
                ...p,
                chapters: p.chapters.map(c => {
                    if (c.id !== chapterId) return c;
                    const newScript = [...c.script];
                    const line = newScript[lineIndex];
                    if (line) {
                        newScript[lineIndex] = {...line, soundEffectVolume: volume};
                    }
                    return {...c, script: newScript};
                })
            };
            updateHistory(newPodcast);
            return newPodcast;
        });
    }, [updateHistory]);
    
    const setVideoPacingMode = useCallback((mode: 'auto' | 'manual') => {
        setPodcastState(p => {
            if (!p) return null;
            let newPodcast: Podcast;
            if (mode === 'manual' && p.videoPacingMode !== 'manual') {
                const newChapters = p.chapters.map(c => {
                    const imageCount = c.generatedImages?.length || 0;
                    const durations = (c.imageDurations && c.imageDurations.length === imageCount)
                        ? c.imageDurations
                        : Array(imageCount).fill(60);
                    return { ...c, imageDurations: durations };
                });
                newPodcast = { ...p, videoPacingMode: mode, chapters: newChapters };
            } else {
                newPodcast = { ...p, videoPacingMode: mode };
            }
            updateHistory(newPodcast);
            return newPodcast;
        });
    }, [updateHistory]);

    const setImageDuration = useCallback((chapterId: string, imageIndex: number, duration: number) => {
        setPodcastState(p => {
            if (!p) return null;
            const newChapters = p.chapters.map(c => {
                if (c.id === chapterId) {
                    const newDurations = [...c.imageDurations || []];
                    newDurations[imageIndex] = duration > 0 ? duration : 1;
                    return { ...c, imageDurations: newDurations };
                }
                return c;
            });
            const newPodcast = { ...p, chapters: newChapters };
            updateHistory(newPodcast);
            return newPodcast;
        });
    }, [updateHistory]);

    const regenerateChapterAudio = useCallback(async (chapterId: string) => {
        const chapter = podcast?.chapters.find(c => c.id === chapterId);
        if (!podcast || !chapter || !chapter.script.length) return;

        updateChapter(chapterId, 'audio_generating');
        try {
            const audioBlob = await generateChapterAudio(chapter.script, podcast.narrationMode, podcast.characterVoices, podcast.monologueVoice, log, apiKeys);
            updateChapter(chapterId, 'completed', { audioBlob });
            log({type: 'response', message: `Аудио для главы "${chapter.title}" успешно пересоздано.`});
        } catch (err) {
            const friendlyMessage = parseErrorMessage(err);
            log({type: 'error', message: `Ошибка при пересоздании аудио для главы "${chapter.title}"`, data: { friendlyMessage, originalError: err }});
            updateChapter(chapterId, 'error', { error: friendlyMessage });
        }
    }, [podcast, log, apiKeys, updateChapter]);

    const regenerateThumbnails = useCallback(async () => {
        if (!podcast) return;
        setIsRegeneratingThumbnails(true);
        log({type: 'info', message: 'Принудительная регенерация обложек...'});
        try {
            let baseImage = podcast.thumbnailBaseImage;
            if (!baseImage || !baseImage.url) {
                log({type: 'info', message: 'Фоновое изображение для обложки не найдено, поиск по главам...'});
                baseImage = podcast.chapters.flatMap(c => c.generatedImages || []).find(img => img.url);
            }
            
            if (!baseImage || !baseImage.url) {
                log({type: 'warning', message: 'Не найдены фоновые изображения. Попытка сгенерировать их для первой главы...'});
                const firstChapter = podcast.chapters[0];
                if (!firstChapter) throw new Error("В проекте нет глав для генерации изображений.");
                
                updateChapter(firstChapter.id, 'images_generating');
                const newImages = await generateStyleImages(firstChapter.imagePrompts, podcast.initialImageCount, log, apiKeys, imageMode, stockPhotoPreference);
                if (newImages.length === 0) {
                    updateChapter(firstChapter.id, 'error', {error: 'Не удалось сгенерировать изображения.'});
                    throw new Error("Не удалось сгенерировать фоновые изображения для создания обложек.");
                }
                log({type: 'info', message: 'Изображения для первой главы созданы. Используем первое как фон для обложки.'});
                baseImage = newImages[0];
                setPodcastState(p => {
                    if (!p) return null;
                    const newChapters = p.chapters.map(c => c.id === firstChapter.id ? {...c, generatedImages: newImages, status: 'completed' as ChapterStatus} : c);
                    const newPodcast = {...p, chapters: newChapters, thumbnailBaseImage: baseImage};
                    updateHistory(newPodcast);
                    return newPodcast;
                });
            }

            let designConcepts = podcast.designConcepts;
            if (!designConcepts || designConcepts.length === 0) {
                log({type: 'info', message: 'Дизайн-концепции не найдены, генерируем заново...'});
                designConcepts = await generateThumbnailDesignConcepts(podcast.topic, podcast.language, log, apiKeys);
            }
            
            const thumbnails = await generateYoutubeThumbnails(baseImage.url, podcast.selectedTitle, designConcepts, log, defaultFont);
            setPodcastState(p => { if (!p) return null; const newPodcast = { ...p, thumbnailBaseImage: baseImage, designConcepts, youtubeThumbnails: thumbnails, selectedThumbnail: thumbnails[0] || undefined }; updateHistory(newPodcast); return newPodcast; });
            log({type: 'response', message: 'Обложки успешно пересозданы.'});
            
        } catch (err) {
            const friendlyMessage = parseErrorMessage(err);
            setError(friendlyMessage);
            log({type: 'error', message: 'Ошибка при регенерации обложек', data: {friendlyMessage, originalError: err}});
        } finally {
            setIsRegeneratingThumbnails(false);
        }
    }, [podcast, log, apiKeys, updateHistory, setError, defaultFont, imageMode, stockPhotoPreference, updateChapter]);

    const manualTtsScript = useMemo(() => {
        if (!podcast) return "Генерация сценария...";
        const completedChapters = podcast.chapters.filter(c => c.status === 'completed' && c.script?.length > 0);
        if (completedChapters.length === 0) return "Сценарий будет доступен после завершения глав.";

        return `Style Instructions: Read aloud in a warm, welcoming tone.

${completedChapters.map((c, i) => `ГЛАВА ${i + 1}: ${c.title.toUpperCase()}

${c.script.map(line => {
            if (line.speaker.toUpperCase() === 'SFX') {
                return `[SFX: ${line.text}]`;
            }
            return `${line.speaker}: ${line.text}`;
        }).join('\n')}`).join('\n\n---\n\n')}`;
    }, [podcast?.chapters]);

    const subtitleText = useMemo(() => {
        if (!podcast) return "";
        return podcast.chapters
            .filter(c => c.status === 'completed' && c.script)
            .flatMap(c => c.script)
            .filter(line => line.speaker.toUpperCase() !== 'SFX')
            .map(line => line.text)
            .join('\n');
    }, [podcast?.chapters]);

    return {
        podcast,
        setPodcast,
        isLoading,
        loadingStatus,
        generationProgress,
        error,
        setError,
        warning,
        logs,
        log,
        audioUrls,
        isGenerationPaused,
        setIsGenerationPaused,
        editingThumbnail,
        setEditingThumbnail,
        isRegeneratingText,
        isRegeneratingAudio,
        regeneratingImage,
        generatingMoreImages,
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
        generateSrt,
        generateVideo,
        generateVideoLocally,
        generatePartialVideo,
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
        regenerateThumbnails
    };
};