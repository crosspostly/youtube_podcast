import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Podcast, YoutubeThumbnail, LogEntry } from './types';
import ThumbnailEditor from './components/ThumbnailEditor';
import TestingPanel from './components/TestingPanel';
import SfxTest from './components/SfxTest';
import { JournalIcon, CloseIcon, KeyIcon } from './components/Icons';
import { PodcastProvider, usePodcastContext } from './context/PodcastContext';
import { initDB } from './services/dbService';
import ApiKeyModal from './components/ApiKeyModal';
import MusicGenerationTest from './components/MusicGenerationTest';
import ProjectSetup from './components/ProjectSetup';
import PodcastStudio from './components/PodcastStudio';
import LoadingScreen from './components/LoadingScreen';
import VideoTestPanel from './components/VideoTestPanel';
import { getApiRetryConfig, updateApiRetryConfig, type ApiRetryConfig } from './config/appConfig';


const AppUI: React.FC<{
    isLogVisible: boolean;
    onCloseLog: () => void;
}> = ({ isLogVisible, onCloseLog }) => {
    const {
        podcast, isLoading, loadingStatus, generationProgress, error, setError,
        warning, logs, editingThumbnail, setEditingThumbnail,
        startNewProject, saveThumbnail,
    } = usePodcastContext();
    
    const [isDesignerTestPanelVisible, setIsDesignerTestPanelVisible] = useState<boolean>(false);
    const [isMusicTestPanelVisible, setIsMusicTestPanelVisible] = useState<boolean>(false);
    const [isSfxTestPanelVisible, setIsSfxTestPanelVisible] = useState<boolean>(false);
    const [isVideoTestPanelVisible, setIsVideoTestPanelVisible] = useState<boolean>(false);
    const [isEditorOpen, setIsEditorOpen] = useState(false);

    useEffect(() => {
        initDB();
    }, []);

    const handleEditThumbnail = (thumbnail: YoutubeThumbnail) => {
        setEditingThumbnail(thumbnail);
        setIsEditorOpen(true);
    };

    const handleSaveThumbnail = (updatedThumbnail: YoutubeThumbnail) => {
        saveThumbnail(updatedThumbnail);
        setIsEditorOpen(false);
        setEditingThumbnail(null);
    };

    return (
        <>
            {isDesignerTestPanelVisible && <TestingPanel onClose={() => setIsDesignerTestPanelVisible(false)} />}
            {isMusicTestPanelVisible && <MusicGenerationTest onClose={() => setIsMusicTestPanelVisible(false)} />}
            {isSfxTestPanelVisible && <SfxTest onClose={() => setIsSfxTestPanelVisible(false)} />}
            {isVideoTestPanelVisible && <VideoTestPanel onClose={() => setIsVideoTestPanelVisible(false)} />}
            {isLogVisible && (
                <div className="fixed inset-0 bg-black/60 z-40 flex justify-end" onClick={onCloseLog}>
                    <div className="w-full max-w-2xl h-full bg-slate-800 shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center p-4 border-b border-slate-700">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2"><JournalIcon/>Журнал запросов</h3>
                            <button onClick={onCloseLog} className="text-slate-400 hover:text-white"><CloseIcon/></button>
                        </div>
                        <div className="flex-grow p-4 overflow-y-auto text-sm font-mono">
                            {logs.map((entry, index) => (
                                <div key={index} className="border-b border-slate-700/50 py-2">
                                    <p className={`${entry.type === 'error' && 'text-red-400'} ${entry.type === 'warning' && 'text-orange-300'} ${entry.type === 'info' && 'text-blue-300'} ${entry.type === 'request' && 'text-yellow-300'} ${entry.type === 'response' && 'text-green-300'}`}>
                                        <span className="font-bold">{entry.type.toUpperCase()}:</span> {new Date(entry.timestamp).toLocaleTimeString()} - {entry.message}
                                    </p>
                                    {entry.data && <pre className="text-slate-400 text-xs whitespace-pre-wrap bg-slate-900 p-2 rounded mt-1 overflow-x-auto"><code>{typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data, null, 2)}</code></pre>}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            {isEditorOpen && editingThumbnail && podcast?.thumbnailBaseImage && (
                <ThumbnailEditor
                    thumbnail={editingThumbnail}
                    baseImageSrc={podcast.thumbnailBaseImage}
                    onSave={handleSaveThumbnail}
                    onClose={() => setIsEditorOpen(false)}
                />
            )}
            <div className="max-w-7xl mx-auto">
                <header className="text-center mb-10">
                    <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white drop-shadow-[0_0_15px_rgba(45,212,191,0.4)]">
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-teal-300 to-cyan-400">Mystic Narratives AI</span>
                    </h1>
                </header>
                <main className="flex justify-center items-start">
                    {isLoading ? (
                        <LoadingScreen loadingStatus={loadingStatus} generationProgress={generationProgress} warning={warning} />
                    ) : error ? (
                        <div className="text-center p-8 bg-red-900/50 border border-red-700 rounded-lg">
                            <h3 className="text-2xl font-bold text-red-300">Произошла ошибка</h3>
                            <p className="mt-2 text-red-200">{error}</p>
                            <button onClick={() => { setError(null); }} className="mt-4 px-6 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700">Попробовать снова</button>
                        </div>
                    ) : podcast ? (
                        <PodcastStudio 
                            onEditThumbnail={handleEditThumbnail}
                        />
                    ) : (
                        <ProjectSetup 
                            onStartProject={startNewProject}
                            onOpenDesignerTest={() => setIsDesignerTestPanelVisible(true)}
                            onOpenMusicTest={() => setIsMusicTestPanelVisible(true)}
                            onOpenSfxTest={() => setIsSfxTestPanelVisible(true)}
                            onOpenVideoTest={() => setIsVideoTestPanelVisible(true)}
                        />
                    )}
                </main>
            </div>
        </>
    );
}

const App: React.FC = () => {
    const [isLogVisible, setIsLogVisible] = useState(false);
    const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
    const [apiKeys, setApiKeys] = useState({ gemini: '', openRouter: '', freesound: '' });
    const [defaultFont, setDefaultFont] = useState('Impact');
    const [retryConfig, setRetryConfig] = useState<ApiRetryConfig>(getApiRetryConfig());

    useEffect(() => {
        try {
            // FIX: Cast `window` to `any` to access `localStorage` because DOM types are missing in the environment.
            const storedKeys = (window as any).localStorage.getItem('apiKeys');
            if (storedKeys) {
                setApiKeys(JSON.parse(storedKeys));
            }
            // FIX: Cast `window` to `any` to access `localStorage` because DOM types are missing in the environment.
            const storedFont = (window as any).localStorage.getItem('channelDefaultFont') || 'Impact';
            setDefaultFont(storedFont);
            
            // Load retry config from localStorage
            const storedRetryConfig = (window as any).localStorage.getItem('apiRetryConfig');
            if (storedRetryConfig) {
                const parsedRetryConfig = JSON.parse(storedRetryConfig);
                setRetryConfig(parsedRetryConfig);
                updateApiRetryConfig(parsedRetryConfig);
            }
        } catch (e) { console.error("Failed to load settings from localStorage", e); }
    }, []);

    const handleSaveApiKeys = (data: { keys: { gemini: string; openRouter: string; freesound: string }, defaultFont: string, retryConfig: ApiRetryConfig }) => {
        setApiKeys(data.keys);
        setDefaultFont(data.defaultFont);
        setRetryConfig(data.retryConfig);
        updateApiRetryConfig(data.retryConfig);
        
        try {
            // FIX: Cast `window` to `any` to access `localStorage` because DOM types are missing in the environment.
            (window as any).localStorage.setItem('apiKeys', JSON.stringify(data.keys));
            // FIX: Cast `window` to `any` to access `localStorage` because DOM types are missing in the environment.
            (window as any).localStorage.setItem('channelDefaultFont', data.defaultFont);
            // Save retry config to localStorage
            (window as any).localStorage.setItem('apiRetryConfig', JSON.stringify(data.retryConfig));
        } catch (e) { console.error("Failed to save settings to localStorage", e); }
    };
    
    return (
        <div className="min-h-screen text-slate-100 p-4 sm:p-6 lg:p-8">
             <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
                <button onClick={() => setIsApiKeyModalOpen(true)} className="p-2 bg-slate-800/60 text-white rounded-lg hover:bg-slate-700/60 backdrop-blur-sm transition-colors"><KeyIcon /></button>
                <button onClick={() => setIsLogVisible(true)} className="p-2 bg-slate-800/60 text-white rounded-lg hover:bg-slate-700/60 backdrop-blur-sm transition-colors"><JournalIcon /></button>
            </div>
            {isApiKeyModalOpen && (
                <ApiKeyModal
                    onClose={() => setIsApiKeyModalOpen(false)}
                    onSave={handleSaveApiKeys}
                    currentKeys={apiKeys}
                    currentFont={defaultFont}
                    currentRetryConfig={retryConfig}
                />
            )}
            <PodcastProvider apiKeys={apiKeys} defaultFont={defaultFont}>
                <AppUI 
                    isLogVisible={isLogVisible} 
                    onCloseLog={() => setIsLogVisible(false)}
                />
            </PodcastProvider>
        </div>
    );
};

export default App;