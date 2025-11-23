import { useState, useMemo } from 'react';
import JSZip from 'jszip';
import { packageProjectByChapters, packageProjectToFolder } from '../../services/chapterPackager';
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
    const [isBatchExporting, setIsBatchExporting] = useState(false);

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

    const downloadAllCompletedProjects = async (
    completedProjects: Podcast[],
    log: LogFunction
): Promise<void> => {
    if (completedProjects.length === 0) {
        log({ type: 'info', message: '❌ Нет завершённых проектов для экспорта' });
        return;
    }

    setIsBatchExporting(true);
    log({ 
        type: 'info', 
        message: `🚀 Начало массовой упаковки ${completedProjects.length} проектов...` 
    });

    try {
        const masterZip = new JSZip();
        const totalProjects = completedProjects.length;
        let successCount = 0;
        let errorCount = 0;

        // Process each project
        for (let i = 0; i < completedProjects.length; i++) {
            const project = completedProjects[i];
            const projectNum = String(i + 1).padStart(2, '0');
            const sanitizedTitle = (project.selectedTitle || project.topic)
                .replace(/[^a-z0-9а-яё]/gi, '_')
                .toLowerCase()
                .substring(0, 50);
            const folderName = `project_${projectNum}_${sanitizedTitle}`;

            log({ 
                type: 'info', 
                message: `📦 [${i + 1}/${totalProjects}] Упаковка проекта: "${project.selectedTitle || project.topic}"` 
            });

            try {
                const projectFolder = masterZip.folder(folderName);
                if (!projectFolder) {
                    throw new Error('Не удалось создать папку проекта');
                }

                // Verify all chapters are completed before packaging
                const incompleteChapters = project.chapters.filter(c => c.status !== 'completed');
                if (incompleteChapters.length > 0) {
                    log({ 
                        type: 'warning', 
                        message: `⚠️ [${i + 1}/${totalProjects}] Пропуск проекта "${project.selectedTitle || project.topic}": ${incompleteChapters.length} глав не завершены` 
                    });
                    continue;
                }

                await packageProjectToFolder(project, projectFolder, log);
                
                log({ 
                    type: 'info', 
                    message: `✅ [${i + 1}/${totalProjects}] Проект "${project.selectedTitle || project.topic}" упакован успешно` 
                });
                successCount++;
            } catch (error: any) {
                errorCount++;
                log({ 
                    type: 'error', 
                    message: `❌ [${i + 1}/${totalProjects}] Ошибка упаковки проекта "${project.selectedTitle || project.topic}"`,
                    data: error.message 
                });
                // Continue with next project despite error
            }
        }

        if (successCount === 0) {
            log({ type: 'error', message: '❌ Ни один проект не удалось упаковать' });
            return;
        }

        log({ 
            type: 'info', 
            message: `🔄 Финальная сборка общего архива...` 
        });

        // Generate final blob
        const zipBlob = await masterZip.generateAsync({ type: 'blob' });

        // Create download
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        const fileName = `batch_projects_${today}.zip`;
        
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        log({ 
            type: 'info', 
            message: `🎉 Массовая упаковка завершена! Успешно: ${successCount}, Ошибок: ${errorCount}. Архив "${fileName}" скачан.` 
        });

    } catch (err: any) {
        setError('Ошибка при создании массового архива');
        log({ 
            type: 'error', 
            message: 'Критическая ошибка при массовом экспорте', 
            data: err.message 
        });
    } finally {
        setIsBatchExporting(false);
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
        isBatchExporting,
        combineAndDownload: undefined, // старое не экспортируем
        generateSrt: undefined, // если не используешь — убери
        downloadProjectAsZip,
        downloadAllCompletedProjects,
        manualTtsScript
    };
};
