import { useState } from 'react';
import type { Podcast, LogEntry } from '../types';
import { combineAndMixAudio, convertWavToMp3 } from '../services/ttsService';
import { generateSrtFile } from '../services/srtService';
import { generateVideo as generateVideoService } from '../services/videoService';
import { createAssemblyPackage } from '../services/packageService';
import { safeLower } from '../utils/safeLower-util';

export const usePodcastActions = (
    podcast: Podcast | null,
    log: (entry: Omit<LogEntry, 'timestamp'>) => void,
    setError: (error: string | null) => void,
) => {
    const [isConvertingToMp3, setIsConvertingToMp3] = useState(false);
    const [isGeneratingSrt, setIsGeneratingSrt] = useState(false);
    const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
    const [isPackaging, setIsPackaging] = useState(false);
    const [videoGenerationProgress, setVideoGenerationProgress] = useState<{ progress: number, message: string }>({ progress: 0, message: '' });
    
    const combineAndDownload = async (format: 'wav' | 'mp3' = 'wav') => {
        if (!podcast || podcast.chapters.some(c => c.status !== 'completed' || !c.audioBlob)) return;
        
        const setLoading = format === 'mp3' ? setIsConvertingToMp3 : () => {};
        setLoading(true);

        try {
            let finalBlob = await combineAndMixAudio(podcast);
            let extension = 'wav';

            if (format === 'mp3') {
                finalBlob = await convertWavToMp3(finalBlob, log);
                extension = 'mp3';
            }

            const url = URL.createObjectURL(finalBlob);
            const a = (window as any).document.createElement('a');
            a.href = url;
            a.download = `${safeLower(podcast.selectedTitle.replace(/[^a-z0-9а-яё]/gi, '_'))}.${extension}`;
            (window as any).document.body.appendChild(a);
            a.click();
            (window as any).document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err: any) {
            setError('Ошибка при сборке аудиофайла.');
            log({type: 'error', message: `Ошибка при сборке и экспорте (${format})`, data: err});
        } finally {
            setLoading(false);
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
            setError('Ошибка при создании SRT файла.');
            log({type: 'error', message: 'Ошибка при генерации SRT', data: err});
        } finally {
            setIsGeneratingSrt(false);
        }
    };
    
    const generateVideo = async (podcastToRender: Podcast) => {
        setIsGeneratingVideo(true);
        setVideoGenerationProgress({ progress: 0, message: 'Подготовка...' });
        try {
            const finalAudioBlob = await combineAndMixAudio(podcastToRender);

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
            const a = (window as any).document.createElement('a');
            a.href = url;
            a.download = `${safeLower(podcastToRender.selectedTitle.replace(/[^a-z0-9а-яё]/gi, '_'))}.mp4`;
            (window as any).document.body.appendChild(a);
            a.click();
            (window as any).document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err: any) {
            setError('Ошибка при создании видеофайла.');
            log({type: 'error', message: 'Ошибка при генерации видео', data: err});
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

    const handlePackageForLocalAssembly = async () => {
        if (!podcast) return;
        setIsPackaging(true);
        setError(null);
        try {
            await createAssemblyPackage(podcast, log);
        } catch (err: any) {
             const errorMessage = `Ошибка при создании пакета для сборки: ${err.message || 'Неизвестная ошибка'}`;
             setError(errorMessage);
             log({ type: 'error', message: errorMessage, data: err });
        } finally {
            setIsPackaging(false);
        }
    };

    return {
        isConvertingToMp3,
        isGeneratingSrt,
        isGeneratingVideo,
        videoGenerationProgress,
        isPackaging,
        combineAndDownload,
        generateSrt,
        generateVideo: handleGenerateFullVideo,
        generatePartialVideo: handleGeneratePartialVideo,
        handlePackageForLocalAssembly,
    };
};
