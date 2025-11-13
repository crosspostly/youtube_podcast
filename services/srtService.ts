import type { Podcast, LogEntry } from '../types';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;

const formatSrtTime = (seconds: number): string => {
    const date = new Date(0);
    date.setSeconds(seconds);
    // Gets a string like "00:05:23.123"
    const time = date.toISOString().substring(11, 23);
    return time.replace('.', ',');
};

export const generateSrtFile = async (podcast: Podcast, log: LogFunction): Promise<Blob> => {
    log({ type: 'info', message: 'Начало быстрой генерации SRT-субтитров.' });
    let srtContent = '';
    let currentTime = 0;
    let subtitleIndex = 1;

    // Average characters per second for speech. This is an estimate.
    const CHARS_PER_SECOND = 15;
    
    const allLines = podcast.chapters.flatMap(c => c.script.filter(s => s.speaker.toUpperCase() !== 'SFX'));

    for (const line of allLines) {
        if (!line.text.trim()) continue;

        // Estimate duration based on text length. Minimum 1 second.
        const duration = Math.max(1.5, line.text.length / CHARS_PER_SECOND);

        const startTime = formatSrtTime(currentTime);
        const endTime = formatSrtTime(currentTime + duration);
        
        srtContent += `${subtitleIndex}\n`;
        srtContent += `${startTime} --> ${endTime}\n`;
        srtContent += `${line.text}\n\n`;

        currentTime += duration;
        subtitleIndex++;
    }
    
    log({ type: 'info', message: 'Генерация SRT-субтитров завершена.' });
    // Use UTF-8 BOM for better compatibility with video players
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    return new Blob([bom, srtContent], { type: 'text/plain;charset=utf-8' });
};
