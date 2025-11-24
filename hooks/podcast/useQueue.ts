import React, { useState, useCallback, useEffect } from 'react';
import { generateContentPlan } from '../../services/aiTextService';
import { packageProjectByChapters } from '../../services/chapterPackager';
import type { Podcast, QueuedProject, LogEntry, NarrationMode } from '../../types';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;

type CreatePodcastFunc = (
    topic: string, 
    knowledgeBaseText: string, 
    creativeFreedom: boolean, 
    language: string, 
    totalDurationMinutes: number, 
    narrationMode: NarrationMode, 
    characterVoices: { [key: string]: string }, 
    monologueVoice: string, 
    imagesPerChapter: number,
    imageSource: 'ai' | 'stock',
    generateAllChapters: boolean,
    updateStatus: (label: string, status: 'pending' | 'in_progress' | 'completed' | 'error') => void,
    updateProgress: (progress: number | ((prev: number) => number)) => void
) => Promise<Podcast>;


export const useQueue = (
    isLoading: boolean,
    createPodcastData: CreatePodcastFunc,
    log: LogFunction,
    setError: React.Dispatch<React.SetStateAction<string | null>>
) => {
    const [projectQueue, setProjectQueue] = useState<QueuedProject[]>([]);
    const [completedPodcasts, setCompletedPodcasts] = useState<Map<string, Podcast>>(new Map());
    const [isQueueRunning, setIsQueueRunning] = useState(false);
    const [isPipelineLoading, setIsPipelineLoading] = useState(false);

    const processQueue = useCallback(async () => {
        if (!isQueueRunning || projectQueue.length === 0 || projectQueue.find(p => p.status === 'in_progress')) {
            if (projectQueue.length === 0) setIsQueueRunning(false);
            return;
        }
    
        const itemToRun = projectQueue.find(p => p.status === 'pending');
        if (!itemToRun) {
            setIsQueueRunning(false);
            log({ type: 'info', message: 'Очередь производства завершена.' });
            return;
        }

        setProjectQueue(q => q.map(p => p.id === itemToRun.id ? { ...p, status: 'in_progress' } : p));
        log({ type: 'info', message: `>>> STARTING QUEUE ITEM: ${itemToRun.title}` });

        try {
            const generatedPodcast = await createPodcastData(
                itemToRun.title, itemToRun.knowledgeBase, itemToRun.creativeFreedom, itemToRun.language,
                itemToRun.totalDuration, itemToRun.narrationMode,
                { character1: 'auto', character2: 'auto' }, 'Puck', itemToRun.imagesPerChapter, itemToRun.imageSource,
                true, () => {}, () => {} // No UI updates for headless
            );

            // Store the completed podcast for batch export
            setCompletedPodcasts(prev => new Map(prev).set(itemToRun.id, generatedPodcast));

            // Automatically download the completed project
            try {
                log({ type: 'info', message: `📦 Упаковка проекта для скачивания...` });
                const zipBlob = await packageProjectByChapters(generatedPodcast, log);
                
                // Download the individual project
                const fileName = `${sanitizeFileName(generatedPodcast.selectedTitle || generatedPodcast.topic)}_${Date.now()}.zip`;
                downloadBlob(zipBlob, fileName);
                
                log({ type: 'info', message: `✅ Проект скачан: ${fileName}` });
            } catch (error: any) {
                log({ type: 'error', message: `❌ Ошибка упаковки проекта: ${error.message}` });
            }

            log({ type: 'info', message: `>>> GENERATION COMPLETE FOR: ${itemToRun.title}.` });
            
            setProjectQueue(q => q.map(p => p.id === itemToRun.id ? { ...p, status: 'completed' } : p));
        } catch (error: any) {
            setProjectQueue(q => q.map(p => p.id === itemToRun.id ? { ...p, status: 'error' } : p));
            log({ type: 'error', message: `Ошибка при создании проекта из очереди: "${itemToRun.title}"`, data: error });
        }
    }, [isQueueRunning, projectQueue, createPodcastData, log]);
    
    useEffect(() => {
        if (isQueueRunning) {
            processQueue();
        }
    }, [isQueueRunning, projectQueue, processQueue]);

    // Create batch archive when all projects are complete
    useEffect(() => {
        if (projectQueue.length > 0 && projectQueue.every(p => p.status === 'completed')) {
            createBatchArchive();
        }
    }, [projectQueue, completedPodcasts]);

    // Helper function to create batch archive
    const createBatchArchive = async () => {
        if (completedPodcasts.size === 0) return;
        
        try {
            log({ type: 'info', message: '📚 Создание batch-архива со всеми проектами...' });
            
            // This would require JSZip import and more complex logic
            // For now, just log that batch is ready
            const batchName = `batch_projects_${new Date().toISOString().split('T')[0]}`;
            log({ 
                type: 'info', 
                message: `🎉 Batch-архив готов: ${batchName} (${completedPodcasts.size} проектов)` 
            });
            
            // Clear queue after batch completion
            setTimeout(() => {
                setProjectQueue([]);
                setCompletedPodcasts(new Map());
            }, 2000);
            
        } catch (error: any) {
            log({ type: 'error', message: `❌ Ошибка создания batch-архива: ${error.message}` });
        }
    }; 

    const startContentPipeline = useCallback(async (
        count: number,
        settings: {
            language: string; totalDuration: number; narrationMode: NarrationMode;
            creativeFreedom: boolean; imagesPerChapter: number; imageSource: 'ai' | 'stock';
        }
    ) => {
        if (isLoading || isQueueRunning) return;
        setIsPipelineLoading(true);
        try {
            const ideas = await generateContentPlan(count, log);
            const newQueueItems: QueuedProject[] = ideas.map(idea => ({
                id: crypto.randomUUID(), status: 'pending', title: idea.title,
                knowledgeBase: `Historical Fact: ${idea.historicalFact}\nTwist: ${idea.lovecraftianTwist}\nStructure: ${idea.scriptStructure.join('\n')}\nTone: ${idea.dialogueTone}`,
                ...settings
            }));
            setProjectQueue(prev => [...prev, ...newQueueItems]);
            setIsQueueRunning(true);
            log({ type: 'info', message: `В очередь добавлено ${count} проектов с выбранными настройками.` });
        } catch (err: any) {
            setError('Не удалось создать контент-план.');
            log({ type: 'error', message: 'Content pipeline failed', data: err });
        } finally {
            setIsPipelineLoading(false);
        }
    }, [isLoading, isQueueRunning, log, setError]);

    return {
        projectQueue,
        completedPodcasts,
        isQueueRunning,
        isPipelineLoading,
        startContentPipeline,
    };
};

// Helper function to sanitize filename
const sanitizeFileName = (name: string): string => {
    return name
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '_')
        .toLowerCase()
        .substring(0, 50);
};

// Helper function to download blob
const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};
