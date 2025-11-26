
import React, { useCallback } from 'react';
import { generatePodcastBlueprint, generateQuickTestBlueprint, generateThumbnailDesignConcepts } from '../../services/aiTextService';
import { generateChapterAudio } from '../../services/aiAudioService';
import { findMusicManually } from '../../services/musicService';
import { findSfxForScript } from '../../services/sfxService';
import { generateStyleImages, generateYoutubeThumbnails } from '../../services/imageService';
import { searchStockPhotos, getOnePhotoFromEachStockService } from '../../services/stockPhotoService';
import type { Podcast, Chapter, LogEntry, NarrationMode, BackgroundImage, SfxTiming } from '../../types';

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;
type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;
const CHARS_PER_SECOND_SFX = 15;

export const useProjectGeneration = (
    log: LogFunction,
    setPodcast: (podcast: Podcast) => void,
    setLoadingStatus: SetState<{ label: string; status: 'pending' | 'in_progress' | 'completed' | 'error'; }[]>,
    setGenerationProgress: SetState<number>,
    defaultFont: string,
    devMode: boolean
) => {
    const createPodcastData = useCallback(async (
        topic: string,
        knowledgeBaseText: string,
        creativeFreedom: boolean,
        language: string,
        totalDurationMinutes: number,
        narrationMode: NarrationMode,
        characterVoicePrefs: { [key: string]: string },
        monologueVoice: string,
        imagesPerChapter: number,
        imageSource: 'ai' | 'stock',
        generateAllChapters: boolean,
        updateStatus: (label: string, status: 'pending' | 'in_progress' | 'completed' | 'error') => void,
        updateProgress: (progress: number | ((prev: number) => number)) => void
    ): Promise<Podcast> => {
        updateStatus('Анализ темы и создание концепции', 'in_progress');
        const blueprint = await generatePodcastBlueprint(topic, knowledgeBaseText, creativeFreedom, language, log);
        updateStatus('Анализ темы и создание концепции', 'completed');
        updateProgress(10);
        
        updateStatus('Подбор музыки и SFX для первой главы', 'in_progress');
        const firstChapter = blueprint.chapters[0];
        const populatedScript = await findSfxForScript(firstChapter.script, log);
        firstChapter.script = populatedScript;

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
        firstChapter.sfxTimings = sfxTimings;
        log({ type: 'info', message: `✅ Собрано ${sfxTimings.length} SFX-таймингов для metadata` });
        
        if (firstChapter.musicSearchKeywords) {
            const musicTracks = await findMusicManually(firstChapter.musicSearchKeywords, log);
            if (musicTracks.length > 0) {
                firstChapter.backgroundMusic = musicTracks[0];
            }
        }
        updateStatus('Подбор музыки и SFX для первой главы', 'completed');
        updateProgress(20);

        const finalCharacterVoices: { [key: string]: string } = {};
        if (blueprint.characters.length > 0) {
            const char1 = blueprint.characters[0];
            finalCharacterVoices[char1.name] = (characterVoicePrefs.character1 && characterVoicePrefs.character1 !== 'auto') ? characterVoicePrefs.character1 : char1.suggestedVoiceId || 'Puck';
        }
        if (blueprint.characters.length > 1) {
            const char2 = blueprint.characters[1];
            finalCharacterVoices[char2.name] = (characterVoicePrefs.character2 && characterVoicePrefs.character2 !== 'auto') ? characterVoicePrefs.character2 : char2.suggestedVoiceId || 'Zephyr';
        }

        updateStatus('Озвучивание и Генерация Изображений (Глава 1)', 'in_progress');
        
        const chapter1Visuals = firstChapter.visualSearchPrompts || blueprint.visualSearchPrompts || [topic];
        log({ type: 'info', message: `Генерация контента для Главы 1 (Parallel execution). DevMode: ${devMode}` });
        
        const imagePromise = imageSource === 'ai'
            ? generateStyleImages(chapter1Visuals, imagesPerChapter, log, devMode)
            : searchStockPhotos(chapter1Visuals[0] || topic, log);
        const audioPromise = generateChapterAudio(firstChapter.script, narrationMode, finalCharacterVoices, monologueVoice, log);

        const [firstChapterAudio, generatedImages] = await Promise.all([audioPromise, imagePromise]);

        updateStatus('Озвучивание и Генерация Изображений (Глава 1)', 'completed');
        updateProgress(p => p + 30);

        updateStatus('Разработка дизайн-концепций обложек', 'in_progress');
        const designConcepts = await generateThumbnailDesignConcepts(topic, language, log);
        updateStatus('Разработка дизайн-концепций обложек', 'completed');
        updateProgress(p => p + 10);
        
        const selectedTitle = blueprint.youtubeTitleOptions[0] || topic;
        
        updateStatus('Создание вариантов обложек для YouTube', 'in_progress');
        const thumbnailBaseImage = imageSource === 'ai' ? (generatedImages as BackgroundImage[])[0] : (generatedImages as string[])[0];
        const youtubeThumbnails = generatedImages.length > 0 ? await generateYoutubeThumbnails(thumbnailBaseImage, selectedTitle, designConcepts, log, defaultFont) : [];
        updateStatus('Создание вариантов обложек для YouTube', 'completed');
        updateProgress(60); 

        // Correctly construct the new podcast object, ensuring backgroundImages with blobs are saved
        const newPodcast: Podcast = {
            id: crypto.randomUUID(), ...blueprint, topic, selectedTitle, thumbnailText: selectedTitle, language,
            chapters: [{ 
                ...firstChapter, 
                status: 'completed', 
                audioBlob: firstChapterAudio,
                // IMPORTANT: Explicitly assign backgroundImages to the chapter
                ...(imageSource === 'ai' 
                    ? { backgroundImages: generatedImages as BackgroundImage[] }
                    : { images: generatedImages as string[] })
            }],
            // Ensure generatedImages at root are URLs for display/history
            generatedImages: imageSource === 'ai' ? (generatedImages as BackgroundImage[]).map(i => i.url) : (generatedImages as string[]),
            youtubeThumbnails: youtubeThumbnails || [], designConcepts: designConcepts || [],
            knowledgeBaseText, creativeFreedom, totalDurationMinutes, narrationMode, characterVoices: finalCharacterVoices,
            monologueVoice, selectedBgIndex: 0, backgroundMusicVolume: 0.12, initialImageCount: imagesPerChapter, imageSource,
        };

        if (imageSource === 'ai') {
            log({ type: 'info', message: `📸 After generation: backgroundImages[0].blob size = ${(generatedImages as BackgroundImage[])?.[0]?.blob?.size || 0} bytes` });
        }

        const CHAPTER_DURATION_MIN = 5;
        const totalChapters = Math.max(1, Math.ceil(totalDurationMinutes / CHAPTER_DURATION_MIN));
        for (let i = 1; i < totalChapters; i++) {
            newPodcast.chapters.push({ id: crypto.randomUUID(), title: `Глава ${i + 1}`, script: [], status: 'pending' });
        }

        updateProgress(100);
        updateStatus('Готово', 'completed');
        
        return newPodcast;
    }, [log, defaultFont, devMode]);

    const startNewProject = useCallback(async (topic: string, knowledgeBaseText: string, creativeFreedom: boolean, language: string, totalDurationMinutes: number, narrationMode: NarrationMode, characterVoicePrefs: { [key: string]: string }, monologueVoice: string, initialImageCount: number, imageSource: 'ai' | 'stock') => {
        const imageStepLabel = imageSource === 'ai' ? `Генерация изображений` : `Поиск стоковых фото`;
        setLoadingStatus([
            { label: 'Анализ темы и создание концепции', status: 'pending' },
            { label: 'Подбор музыки и SFX для первой главы', status: 'pending' },
            { label: 'Озвучивание и Генерация Изображений (Глава 1)', status: 'pending' },
            { label: 'Разработка дизайн-концепций обложек', status: 'pending' },
            { label: 'Создание вариантов обложек для YouTube', status: 'pending' }
        ]);
        
        const updateStatus = (label: string, status: 'pending' | 'in_progress' | 'completed' | 'error') => {
            setLoadingStatus(prev => prev.map(step => step.label === label ? { ...step, status } : step));
        };
        
        try {
            const newPodcast = await createPodcastData(
                topic, knowledgeBaseText, creativeFreedom, language, totalDurationMinutes, narrationMode, characterVoicePrefs, monologueVoice, initialImageCount, imageSource,
                false, updateStatus, setGenerationProgress
            );
            setPodcast(newPodcast);
        } catch (err: any) {
             setLoadingStatus(prev => prev.map(s => s.status === 'in_progress' ? { ...s, status: 'error' } : s));
             throw err; // Re-throw to be caught by the UI
        }
    }, [createPodcastData, setLoadingStatus, setGenerationProgress, setPodcast]);

    const startQuickTest = useCallback(async () => {
        setLoadingStatus([{ label: 'Создание плана для быстрого теста...', status: 'in_progress' }]);
        try {
            const blueprint = await generateQuickTestBlueprint('Mysterious Signal from Deep Space', 'English', log);
            setLoadingStatus(prev => [...prev.map(s => ({...s, status: 'completed' as const})), { label: 'Получение тестовых изображений...', status: 'in_progress' as const }]);
            const testImages = await getOnePhotoFromEachStockService(blueprint.visualSearchPrompts[0] || 'Space mystery', log);
            const firstChapter = blueprint.chapters[0];
            setLoadingStatus(prev => [...prev.map(s => ({...s, status: 'completed' as const})), { label: 'Генерация аудио (быстрый тест)...', status: 'in_progress' as const }]);

            const [char1, char2] = [blueprint.characters[0]?.name || 'Host', blueprint.characters[1]?.name || 'Expert'];
            const audioBlob = await generateChapterAudio(firstChapter.script, 'dialogue', { [char1]: 'Puck', [char2]: 'Zephyr' }, 'Puck', log);
            
            const newPodcast: Podcast = {
                id: crypto.randomUUID(), ...blueprint, topic: 'Quick Test: Deep Space', selectedTitle: blueprint.youtubeTitleOptions[0], thumbnailText: blueprint.youtubeTitleOptions[0],
                description: blueprint.description, seoKeywords: blueprint.seoKeywords, visualSearchPrompts: blueprint.visualSearchPrompts, characters: blueprint.characters,
                sources: [], language: 'English', chapters: [{ ...firstChapter, status: 'completed', audioBlob, images: testImages }], generatedImages: testImages,
                youtubeThumbnails: [], designConcepts: [], knowledgeBaseText: '', creativeFreedom: true, totalDurationMinutes: 1, narrationMode: 'dialogue',
                characterVoices: { [char1]: 'Puck', [char2]: 'Zephyr' }, monologueVoice: 'Puck', selectedBgIndex: 0, backgroundMusicVolume: 0.12,
                initialImageCount: testImages.length, imageSource: 'stock'
            };
            setPodcast(newPodcast);
            setLoadingStatus([]);
        } catch (err) {
            setLoadingStatus(prev => prev.map(s => s.status === 'in_progress' ? { ...s, status: 'error' as const } : s));
            throw err;
        }
    }, [log, setPodcast, setLoadingStatus]);

    return { createPodcastData, startNewProject, startQuickTest };
};
