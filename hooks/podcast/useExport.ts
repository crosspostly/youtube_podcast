import { useState, useMemo } from 'react';
import { packageProjectByChapters } from '../../services/chapterPackager';
import type { Podcast, LogEntry } from '../../types';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;

export const useExport = (
    podcast: Podcast | null,
    log: LogFunction,
    setError: React.Dispatch<React.SetStateAction<string | null>>,
    devMode: boolean
) => {
    const [isCombiningAudio, setIsCombiningAudio] = useState(false);
    const [isGeneratingSrt, setIsGeneratingSrt] = useState(false);
    const [isZipping, setIsZipping] = useState(false);

    // combineAndDownload и generateSrt можно сохранить — они не мешают

    const downloadProjectAsZip = async () => {
        if (!podcast || !podcast.chapters.every(c => c.status === 'completed')) {
            log({ type: 'info', message: 'Экспорт ZIP отменен: не все главы имеют статус "completed".' });
            return;
        }
        setIsZipping(true);
        log({ type: 'info', message: `Начало chapter-based упаковки: ${podcast.selectedTitle}` });
        try {
            const zipBlob = await packageProjectByChapters(podcast, log);
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${podcast.selectedTitle.replace(/[^a-z0-9а-яё]/gi, '_').toLowerCase()}_chapterpack.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            setError('Ошибка chapter-based упаковки!');
            log({ type: 'error', message: 'Ошибка chapter-based пакетирования', data: err });
        } finally {
            setIsZipping(false);
        }
    };

    // manualTtsScript сохраним
    const manualTtsScript = useMemo(() => {
        if (!podcast) return 'Генерация сценария...';
        const completedChapters = podcast.chapters.filter(c => c.status === 'completed' && c.script?.length > 0);
        if (completedChapters.length === 0) return 'Сценарий будет доступен после завершения глав.';
        return "Style Instructions: Read aloud in a warm, welcoming tone.\n\n" + completedChapters.map((chapter, index) => `ГЛАВА ${index + 1}: ${chapter.title.toUpperCase()}\n\n` + chapter.script.map(line => line.speaker.toUpperCase() === 'SFX' ? `[SFX: ${line.text}]` : `${line.speaker}: ${line.text}`).join('\n')).join('\n\n---\n\n');
    }, [podcast?.chapters]);

    return {
        isCombiningAudio,
        isGeneratingSrt,
        isZipping,
        combineAndDownload: undefined, // старое не экспортируем
        generateSrt: undefined, // если не используешь — убери
        downloadProjectAsZip,
        manualTtsScript
    };
};
