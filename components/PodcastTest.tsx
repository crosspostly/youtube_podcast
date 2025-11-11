import React, { useState, useRef, useEffect } from 'react';
import { generateThumbnailDesignConcepts } from '../services/ttsService';
import { drawCanvas } from '../services/canvasUtils';
import { LogEntry, ThumbnailDesignConcept, TextOptions } from '../types';
import Spinner from './Spinner';
import { CloseIcon } from './Icons';

interface PodcastTestProps {
    apiKeys: { gemini: string; openRouter: string };
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

const PodcastTest: React.FC<PodcastTestProps> = ({ apiKeys, onClose }) => {
    const [renderedResults, setRenderedResults] = useState<RenderedResult[]>([]);
    const [isTesting, setIsTesting] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const imageRef = useRef<HTMLImageElement | null>(null);

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
    };
    
    const mapFontFamily = (aiFamily: string): string => {
        const lowerFamily = aiFamily.toLowerCase();
        if (lowerFamily.includes('impact')) return "'Impact', 'Arial Black', sans-serif";
        if (lowerFamily.includes('serif')) return "'Georgia', 'Times New Roman', serif";
        if (lowerFamily.includes('sans-serif')) return "'Helvetica', 'Arial', sans-serif";
        if (lowerFamily.includes('cursive')) return "'Brush Script MT', cursive";
        return "'Impact', 'Arial Black', sans-serif";
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
                const concepts = await generateThumbnailDesignConcepts(test.topic, test.language, log, apiKeys.gemini);
                
                const canvas = document.createElement('canvas');
                canvas.width = 1280;
                canvas.height = 720;
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error("Could not get canvas context");
                
                const thumbnails = concepts.map(concept => {
                    const options: TextOptions = {
                        text: TEST_TITLE,
                        fontFamily: mapFontFamily(concept.fontFamily),
                        fontSize: concept.fontSize || 90,
                        fillStyle: concept.textColor || '#FFFFFF',
                        textAlign: 'center',
                        position: { x: canvas.width / 2, y: canvas.height / 2 },
                        shadow: {
                            color: concept.shadowColor || 'rgba(0,0,0,0.8)',
                            blur: 15, offsetX: 5, offsetY: 5
                        },
                        overlayColor: `rgba(0,0,0,${concept.overlayOpacity || 0.4})`,
                    };
                    drawCanvas(ctx, imageRef.current!, options);
                    return {
                        name: concept.name,
                        dataUrl: canvas.toDataURL('image/png')
                    };
                });
                
                allResults.push({ topic: test.topic, thumbnails });

            } catch (error: any) {
                log({type: 'error', message: `Test failed for "${test.topic}": ${error.message}`});
            }
        }
        
        setRenderedResults(allResults);
        setIsTesting(false);
    };

    return (
        <div className="fixed bottom-4 right-4 bg-gray-800 border border-gray-600 p-4 rounded-lg shadow-lg z-50 w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-2 flex-shrink-0">
                <h3 className="text-lg font-bold text-white">Визуальный Тест AI-дизайнера</h3>
                <button onClick={onClose} className="text-gray-400 hover:text-white"><CloseIcon /></button>
            </div>
            <button
                onClick={runDesignerTest}
                disabled={isTesting || !imageRef.current}
                className="w-full px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:bg-gray-500 disabled:cursor-wait flex-shrink-0"
            >
                {isTesting ? <Spinner className="w-5 h-5 mx-auto" /> : "Запустить Визуальный Тест"}
            </button>
            
            <div className="mt-4 flex-grow overflow-y-auto pr-2">
                {isTesting && <p className="text-center text-teal-300 animate-pulse">Генерация и отрисовка...</p>}
                {renderedResults.length > 0 && (
                    <div className="space-y-6">
                        {renderedResults.map(result => (
                            <div key={result.topic}>
                                <h4 className="font-semibold text-white text-lg mb-2 border-b border-gray-600 pb-1">Тема: "{result.topic}"</h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {result.thumbnails.map(thumb => (
                                        <div key={thumb.name} className="text-center">
                                            <img src={thumb.dataUrl} alt={thumb.name} className="rounded-md border border-gray-500 mb-1"/>
                                            <p className="text-xs text-gray-300">{thumb.name}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                 {logs.length > 0 && !isTesting && renderedResults.length === 0 && (
                     <div className="mt-4 p-2 bg-gray-900 rounded-md max-h-40 overflow-y-auto text-xs font-mono">
                         <p className="text-red-400 font-bold mb-2">Тест завершился с ошибками:</p>
                         {logs.map((l, i) => <p key={i} className="text-gray-400">{l}</p>)}
                     </div>
                 )}
            </div>
        </div>
    );
};

export default PodcastTest;