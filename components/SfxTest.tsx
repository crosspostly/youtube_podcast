import React, { useState, useRef } from 'react';
import { findSfxWithAi } from '../services/ttsService';
import { LogEntry, SoundEffect } from '../types';
import Spinner from './Spinner';
import { CloseIcon, PlayIcon, PauseIcon, SearchIcon } from './Icons';
import { usePodcastContext } from '../context/PodcastContext';

interface SfxTestProps {
    onClose: () => void;
}

const SfxTest: React.FC<SfxTestProps> = ({ onClose }) => {
    const [description, setDescription] = useState('A heavy wooden door creaking open');
    const [isLoading, setIsLoading] = useState(false);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [results, setResults] = useState<SoundEffect[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [previewingUrl, setPreviewingUrl] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const { log: contextLog, apiKeys } = usePodcastContext();

    const log = (entry: Omit<LogEntry, 'timestamp'>) => {
        const newEntry = { ...entry, timestamp: new Date().toISOString() };
        setLogs(prev => [newEntry, ...prev]);
        contextLog(entry);
    };

    const runTest = async () => {
        if (!description.trim()) {
            setError('Please enter a description.');
            return;
        }
        setIsLoading(true);
        setLogs([]);
        setResults([]);
        setError(null);

        try {
            const sfx = await findSfxWithAi(description, log, { gemini: apiKeys.gemini, freesound: apiKeys.freesound });
            setResults(sfx);
            log({ type: 'info', message: `Test finished: Found ${sfx.length} sound effects.` });
        } catch (err: any) {
            setError(err.message || 'An unknown error occurred.');
            log({ type: 'error', message: 'Test failed with an error.', data: err });
        } finally {
            setIsLoading(false);
        }
    };

    const togglePreview = (url: string) => {
        if (!audioRef.current) return;
        // FIX: Cast audioRef.current to `any` to access audio properties.
        const audio = audioRef.current as any;
        const isCurrentlyPlaying = !audio.paused && audio.src === url;

        if (isCurrentlyPlaying) {
            audio.pause();
            setPreviewingUrl(null);
        } else {
            audio.pause();
            audio.src = url;
            audio.volume = 0.5;
            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    setPreviewingUrl(url);
                }).catch((error: any) => {
                    console.error("Audio playback failed:", error);
                    setPreviewingUrl(null);
                });
            }
        }
    };

    return (
        <div className="fixed bottom-4 left-4 bg-slate-800/80 backdrop-blur-lg border border-slate-700 p-4 rounded-lg shadow-lg z-50 w-full max-w-3xl max-h-[90vh] flex flex-col">
            <audio ref={audioRef} className="hidden" onEnded={() => setPreviewingUrl(null)} />
            <div className="flex justify-between items-center mb-4 flex-shrink-0">
                <h3 className="text-lg font-bold text-white">Тест: AI-подбор SFX</h3>
                <button onClick={onClose} className="text-slate-400 hover:text-white"><CloseIcon /></button>
            </div>

            <div className="flex gap-2 mb-4 flex-shrink-0">
                <input
                    type="text"
                    value={description}
                    // FIX: Cast event target to HTMLInputElement to access value property.
                    onChange={(e) => setDescription((e.target as HTMLInputElement).value)}
                    placeholder="Введите описание звука..."
                    className="flex-grow bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-white"
                    disabled={isLoading}
                />
                <button
                    onClick={runTest}
                    disabled={isLoading || !description}
                    className="w-40 flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold rounded-lg hover:from-indigo-400 hover:to-purple-500 transition-all disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-wait"
                >
                    {isLoading ? <Spinner className="w-5 h-5" /> : <SearchIcon />}
                    <span>Запустить</span>
                </button>
            </div>

            <div className="flex-grow grid grid-cols-2 gap-4 overflow-hidden">
                <div className="flex flex-col overflow-hidden">
                    <h4 className="font-semibold text-white mb-2 flex-shrink-0">Журнал выполнения</h4>
                    <div className="flex-grow bg-slate-900 rounded-md p-2 overflow-y-auto text-xs font-mono">
                        {error && <p className="text-red-400 font-bold mb-2">Ошибка: {error}</p>}
                        {logs.map((entry, index) => (
                             <div key={index} className="border-b border-slate-700/50 py-1">
                                <p className={`${entry.type === 'error' && 'text-red-400'} ${entry.type === 'info' && 'text-blue-300'} ${entry.type === 'request' && 'text-yellow-300'} ${entry.type === 'response' && 'text-green-300'}`}>
                                    <span className="font-bold">{entry.type.toUpperCase()}:</span> {new Date(entry.timestamp).toLocaleTimeString()} - {entry.message}
                                </p>
                                {entry.data && <pre className="text-slate-400 text-xs whitespace-pre-wrap bg-slate-950 p-1 rounded mt-1 overflow-x-auto"><code>{typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data, null, 2)}</code></pre>}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex flex-col overflow-hidden">
                     <h4 className="font-semibold text-white mb-2 flex-shrink-0">Найденные SFX</h4>
                     <div className="flex-grow bg-slate-900 rounded-md p-2 overflow-y-auto">
                        {isLoading && <div className="flex justify-center items-center h-full"><Spinner /></div>}
                        {!isLoading && results.length === 0 && (
                            <div className="flex justify-center items-center h-full text-slate-400">
                                <p>Результаты появятся здесь</p>
                            </div>
                        )}
                        {results.length > 0 && (
                             <div className="space-y-2">
                                {results.map(sfx => (
                                    <div key={sfx.id} className="p-2 rounded-md flex items-center justify-between gap-2 bg-slate-800">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <button onClick={() => togglePreview(sfx.previews['preview-hq-mp3'])} className="p-2 bg-cyan-600/80 rounded-full text-white hover:bg-cyan-700 flex-shrink-0">
                                                {previewingUrl === sfx.previews['preview-hq-mp3'] ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
                                            </button>
                                            <div className="truncate">
                                                <p className="font-semibold text-white truncate">{sfx.name}</p>
                                                <p className="text-xs text-slate-400 truncate">by {sfx.username}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SfxTest;