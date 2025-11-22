import React, { useCallback } from 'react';
import { findMusicWithAi, findMusicManually } from '../../services/musicService';
import { findSfxWithAi, findSfxManually } from '../../services/sfxService';
import type { Podcast, MusicTrack, SoundEffect, LogEntry } from '../../types';

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;
type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;

export const useAssetManagement = (
    podcast: Podcast | null,
    setPodcast: (updater: React.SetStateAction<Podcast | null>) => void,
    log: LogFunction,
    setError: SetState<string | null>
) => {
    const setChapterMusic = useCallback((chapterId: string, music: MusicTrack) => {
        setPodcast(p => {
            if (!p) return null;
            return { ...p, chapters: p.chapters.map(c => c.id === chapterId ? { ...c, backgroundMusic: music } : c) };
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

    const findMusicForChapter = useCallback(async (chapterId: string): Promise<MusicTrack[]> => {
        if (!podcast) return [];
        const chapter = podcast.chapters.find(c => c.id === chapterId);
        if (!chapter) return [];
        try {
            const scriptText = chapter.script.map(l => l.text).join(' ');
            const query = scriptText.trim() ? scriptText : podcast.topic;
            const tracks = await findMusicWithAi(query, log);
            if (tracks.length === 0) log({ type: 'info', message: `Подходящая музыка для главы "${chapter.title}" не найдена.` });
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
            if (tracks.length === 0) log({ type: 'info', message: `Подходящая музыка по запросу "${keywords}" не найдена.` });
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

    return {
        setChapterMusic,
        setGlobalMusicVolume,
        setChapterMusicVolume,
        findMusicForChapter,
        findMusicManuallyForChapter,
        findSfxForLine,
        findSfxManuallyForLine,
        setSfxForLine,
        setSfxVolume,
    };
};
