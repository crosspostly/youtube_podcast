import React, { useState, useRef, useEffect } from 'react';
import { generateThumbnailDesignConcepts } from '../services/ttsService';
import { drawCanvas } from '../services/canvasUtils';
import { LogEntry, ThumbnailDesignConcept, TextOptions } from '../types';
import Spinner from './Spinner';
import { CloseIcon } from './Icons';
import { usePodcastContext } from '../context/PodcastContext';

interface TestingPanelProps {
    onClose: () => void;
}

interface RenderedResult {
    topic: string;
    thumbnails: {
        name: string;
        dataUrl: string;
    }[];
}

const PLACEHOLDER_IMAGE_URL = "https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?q=80&w=1280&h=720&auto=format&fit=crop";
const TEST_TITLE = "ТЕСТОВЫЙ ЗАГОЛОВОК";

const TestingPanel: React.FC<TestingPanelProps> = ({ onClose }) => {
    const [renderedResults, setRenderedResults] = useState<RenderedResult[]>([]);
    const [isTesting, setIsTesting] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const imageRef = useRef<HTMLImageElement | null>(null);
    const { log: contextLog, apiKeys, defaultFont } = usePodcastContext(); // Get defaultFont from context


    // Preload the placeholder image
    useEffect(() => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = PLACEHOLDER_IMAGE_URL;
        img.onload = () => {
            imageRef.current = img;
        };
    }, []);

    const log = (entry: Omit<LogEntry, 'timestamp'>) => {
        const message = `[${entry.type.toUpperCase()}] ${entry.message}`;
        setLogs(prev => [...prev, message]);
        // Also send to the main application log
        contextLog(entry);
    };

    const runDesignerTest = async () => {
        if (!imageRef.current) {
            alert("Тестовое изображение еще не загружено. Пожалуйста, подождите.");
            return;
        }

        setIsTesting(true);
        setRenderedResults([]);
        setLogs([]);

        const testTopics = [
            { topic: "The Haunting of Winchester House", language: "English" },
            { topic: "Тайна перевала Дятлова", language: "Русский" },
        ];
        
        const allResults: RenderedResult[] = [];

        for (const test of testTopics) {
            try {
                const concepts = await generateThumbnailDesignConcepts(test.topic, test.language, log, apiKeys);
                
                const canvas = document.createElement('canvas');
                canvas.width = 1280;
                canvas.height = 720;
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error("Could not get canvas context");
                
                const thumbnails = [];
                for (const concept of concepts) {
                    const options: TextOptions = {
                        text: TEST_TITLE,
                        fontFamily: defaultFont || concept.fontFamily || 'Impact',
                        fontSize: concept.fontSize || 90,
                        fillStyle: concept.textColor || '#FFFFFF',
                        textAlign: 'center',
                        position: { x: canvas.width / 2, y: canvas.height / 2 },
                        shadow: {
                            color: concept.shadowColor || 'rgba(0,0,0,0.8)',
                            blur: 15, offsetX: 5, offsetY: 5
                        },
                        overlayColor: `rgba(0,0,0,${concept.overlayOpacity || 0.4})`,
                        textTransform: concept.textTransform || 'uppercase',
                        strokeColor: concept.strokeColor,
                        strokeWidth: concept.strokeWidth,
                        gradientColors: concept.gradientColors,
                    };
                    await drawCanvas(ctx, imageRef.current!, options);
                    thumbnails.push({
                        name: concept.name,
                        dataUrl: canvas.toDataURL('image/png')
                    });
                }
                
                allResults.push({ topic: test.topic, thumbnails });

            } catch (error: any) {
                log({type: 'error', message: `Test failed for "${test.topic}": ${error.message}`});
            }
        }
        
        setRenderedResults(allResults);
        setIsTesting(false);
    };

    return (
        <div className="fixed bottom-4 right-4 bg-slate-800/80 backdrop-blur-lg border border-slate-700 p-4 rounded-lg shadow-lg z-50 w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-2 flex-shrink-0">
                <h3 className="text-lg font-bold text-white">Визуальный Тест AI-дизайнера</h3>
                <button onClick={onClose} className="text-slate-400 hover:text-white"><CloseIcon /></button>
            </div>
            <button
                onClick={runDesignerTest}
                disabled={isTesting || !imageRef.current}
                className="w-full px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold rounded-lg hover:from-indigo-400 hover:to-purple-500 transition-all disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-wait flex-shrink-0"
            >
                {isTesting ? <Spinner className="w-5 h-5 mx-auto" /> : "Запустить Визуальный Тест"}
            </button>
            
            <div className="mt-4 flex-grow overflow-y-auto pr-2">
                {isTesting && <p className="text-center text-cyan-300 animate-pulse">Генерация и отрисовка...</p>}
                {renderedResults.length > 0 && (
                    <div className="space-y-6">
                        {renderedResults.map(result => (
                            <div key={result.topic}>
                                <h4 className="font-semibold text-white text-lg mb-2 border-b border-slate-700 pb-2">{result.topic}</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {result.thumbnails.map(thumb => (
                                        <div key={thumb.name}>
                                            <p className="text-sm text-slate-300 text-center mb-1">{thumb.name}</p>
                                            <img src={thumb.dataUrl} alt={thumb.name} className="rounded-md w-full" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                 {logs.length > 0 && (
                    <div className="mt-4">
                        <h4 className="font-semibold text-white mb-2">Логи</h4>
                        <div className="bg-slate-900 p-2 rounded-md text-xs font-mono max-h-40 overflow-y-auto">
                            {logs.map((log, index) => <p key={index} className="whitespace-pre-wrap">{log}</p>)}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TestingPanel;