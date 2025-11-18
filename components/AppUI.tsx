import React, { useState, useEffect } from 'react';
import type { YoutubeThumbnail } from '../types';
import ThumbnailEditor from './ThumbnailEditor';
import TestingPanel from './TestingPanel';
import SfxTest from './SfxTest';
import { JournalIcon, CloseIcon } from './Icons';
import { usePodcastContext } from '../context/PodcastContext';
import { initDB } from '../services/dbService';
import MusicGenerationTest from './MusicGenerationTest';
import ProjectSetup from './ProjectSetup';
import PodcastStudio from './PodcastStudio';
import LoadingScreen from './LoadingScreen';
import VideoTestPanel from './VideoTestPanel';

const AppUI: React.FC<{
    isLogVisible: boolean;
    onCloseLog: () => void;
}> = ({ isLogVisible, onCloseLog }) => {
    const {
        podcast, isLoading, loadingStatus, generationProgress, error, setError,
        warning, logs, editingThumbnail, setEditingThumbnail,
        startNewProject, saveThumbnail, startAutomatedProject
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
            {isEditorOpen && editingThumbnail && podcast?.thumbnailBaseImage?.url && (
                <ThumbnailEditor
                    thumbnail={editingThumbnail}
                    baseImageSrc={podcast.thumbnailBaseImage.url}
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
                            onStartAutomatedProject={startAutomatedProject}
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
};

export default AppUI;