


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
    log({ type: 'info', message: 'Начало генерации точных SRT-субтитров.' });
    let srtContent = '';
    let currentTime = 0;
    let subtitleIndex = 1;

    // The AudioContext can be created once and reused.
    // FIX: Cast window to `any` to access AudioContext/webkitAudioContext without
    // relying on DOM typings being present in the TS configuration.
    const audioContext = new ((window as any).AudioContext || (window as any).webkitAudioContext)();

    const completedChapters = podcast.chapters.filter(c => c.status === 'completed' && c.audioBlob);

    if (completedChapters.length === 0) {
        log({ type: 'warning', message: 'Нет завершенных глав для создания субтитров.' });
        return new Blob(['Нет данных для генерации субтитров.'], { type: 'text/plain;charset=utf-8' });
    }

    for (const chapter of completedChapters) {
        const scriptLines = chapter.script.filter(s => s.speaker.toUpperCase() !== 'SFX' && s.text.trim());
        if (!chapter.audioBlob) {
            continue;
        }

        try {
            const arrayBuffer = await chapter.audioBlob.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            const chapterDuration = audioBuffer.duration;

            if (scriptLines.length === 0) {
                // Chapter has audio but no lines, just advance time
                currentTime += chapterDuration;
                continue;
            }

            const totalChars = scriptLines.reduce((sum, line) => sum + line.text.length, 0);

            if (totalChars === 0) {
                currentTime += chapterDuration; // just advance time
                continue;
            }

            let chapterTimeOffset = 0;
            for (const line of scriptLines) {
                // Distribute duration proportionally based on character length
                const lineDuration = (line.text.length / totalChars) * chapterDuration;
                if (lineDuration < 0.5) { // Ensure a minimum display time
                    chapterTimeOffset += lineDuration;
                    continue; // Skip very short lines if they'd be unreadable
                }


                const startTime = formatSrtTime(currentTime + chapterTimeOffset);
                const endTime = formatSrtTime(currentTime + chapterTimeOffset + lineDuration);
                
                srtContent += `${subtitleIndex}\n`;
                srtContent += `${startTime} --> ${endTime}\n`;
                srtContent += `${line.text}\n\n`;
                
                chapterTimeOffset += lineDuration;
                subtitleIndex++;
            }

            // Advance currentTime by the actual duration of the chapter audio
            currentTime += chapterDuration;

        } catch (error) {
            log({ type: 'error', message: `Ошибка декодирования аудио для главы "${chapter.title}", глава будет пропущена в субтитрах.`, data: error });
        }
    }

    if (!srtContent) {
        srtContent = 'Не удалось сгенерировать субтитры. Возможно, аудиофайлы глав повреждены или отсутствуют.';
    }

    log({ type: 'info', message: 'Генерация точных SRT-субтитров завершена.' });
    // Use UTF-8 BOM for better compatibility with video players
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    return new Blob([bom, srtContent], { type: 'text/plain;charset=utf-8' });
};
