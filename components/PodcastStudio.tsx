import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Podcast, YoutubeThumbnail, Chapter, MusicTrack, SoundEffect, ScriptLine } from '../types';
import { usePodcastContext } from '../context/PodcastContext';
import Spinner from './Spinner';
import { ChapterIcon, RedoIcon, CombineIcon, DownloadIcon, ImageIcon, CopyIcon, CheckIcon, ScriptIcon, EditIcon, UserCircleIcon, PauseIcon, PlayIcon, BookOpenIcon, WrenchIcon, SpeakerWaveIcon, LanguageIcon, SubtitleIcon, SearchIcon, CloseIcon, VideoCameraIcon } from './Icons';

interface PodcastStudioProps {
    onEditThumbnail: (thumbnail: YoutubeThumbnail) => void;
}

const CopyableField: React.FC<{ label: string; value: string; isTextarea?: boolean; icon?: React.ReactNode }> = ({ label, value, isTextarea = false, icon }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const InputComponent = isTextarea ? 'textarea' : 'input';

    return (
        <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-1">{icon}{label}</label>
            <div className="relative">
                <InputComponent
                    readOnly
                    value={value}
                    className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 pr-10 text-slate-200"
                    rows={isTextarea ? 10 : undefined}
                />
                <button
                    onClick={handleCopy}
                    className="absolute top-2 right-2 p-1 rounded-md text-slate-400 hover:bg-slate-700 hover:text-white"
                    aria-label={`Copy ${label}`}
                >
                    {copied ? <CheckIcon className="w-5 h-5 text-green-400" /> : <CopyIcon className="w-5 h-5" />}
                </button>
            </div>
        </div>
    );
};


const PodcastStudio: React.FC<PodcastStudioProps> = ({ onEditThumbnail }) => {
    const {
        podcast,
        audioUrls, isGenerationPaused, setIsGenerationPaused,
        isRegeneratingText, isRegeneratingAudio,
        regeneratingImage, generatingMoreImages,
        isConvertingToMp3, isGeneratingSrt, isGeneratingVideo, videoGenerationProgress,
        handleGenerateChapter, combineAndDownload, generateVideo, generatePartialVideo,
        regenerateProject, regenerateText,
        regenerateChapterImages, regenerateAllAudio, regenerateSingleImage,
        generateMoreImages, handleTitleSelection, setGlobalMusicVolume, setChapterMusicVolume,
        manualTtsScript, subtitleText, generateSrt, setChapterMusic,
        findMusicForChapter, findMusicManuallyForChapter,
        findSfxForLine, findSfxManuallyForLine, setSfxForLine, setSfxVolume,
        setThumbnailBaseImage, setPodcast, setVideoPacingMode, setImageDuration,
    } = usePodcastContext();
    
    const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
    const audioPlayerRef = useRef<HTMLAudioElement>(null);
    const [musicModalChapter, setMusicModalChapter] = useState<Chapter | null>(null);
    const [sfxModalLine, setSfxModalLine] = useState<{chapterId: string, line: ScriptLine, lineIndex: number} | null>(null);
    const [volumePopoverChapterId, setVolumePopoverChapterId] = useState<string | null>(null);
    const volumePopoverRef = useRef<HTMLDivElement>(null);
    const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
    const downloadMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
             if (downloadMenuRef.current && !downloadMenuRef.current.contains(event.target as Node)) {
                setIsDownloadMenuOpen(false);
            }
            if (volumePopoverRef.current && !volumePopoverRef.current.contains(event.target as Node)) {
                setVolumePopoverChapterId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const SfxFinderModal = () => {
        if (!sfxModalLine) return null;
        const { chapterId, line, lineIndex } = sfxModalLine;

        const [isFinding, setIsFinding] = useState(false);
        const [isFindingManually, setIsFindingManually] = useState(false);
        const [foundSfx, setFoundSfx] = useState<SoundEffect[]>([]);
        const [previewingUrl, setPreviewingUrl] = useState<string | null>(null);
        const [manualSearchQuery, setManualSearchQuery] = useState('');
        const [tempSelectedSfx, setTempSelectedSfx] = useState<SoundEffect | null>(line.soundEffect || null);
        const [previewVolume, setPreviewVolume] = useState(line.soundEffectVolume ?? 0.5);
    
        useEffect(() => {
            if (audioPlayerRef.current && previewingUrl) {
                audioPlayerRef.current.volume = previewVolume;
            }
        }, [previewVolume, previewingUrl]);

        const handleFindWithAI = async () => {
            setIsFinding(true);
            setFoundSfx([]);
            try {
                const sfx = await findSfxForLine(chapterId, lineIndex);
                setFoundSfx(sfx);
            } finally {
                setIsFinding(false);
            }
        };

        const handleManualSearch = async () => {
            if (!manualSearchQuery.trim()) return;
            setIsFindingManually(true);
            setFoundSfx([]);
            try {
                const sfx = await findSfxManuallyForLine(manualSearchQuery);
                setFoundSfx(sfx);
            } finally {
                setIsFindingManually(false);
            }
        };
    
        const togglePreview = (url: string) => {
            if (!audioPlayerRef.current) return;
            const audio = audioPlayerRef.current;
            const isCurrentlyPlaying = !audio.paused && audio.src === url;

            if (isCurrentlyPlaying) {
                audio.pause();
                setPreviewingUrl(null);
            } else {
                audio.pause();
                audio.src = url;
                audio.volume = previewVolume;
                const playPromise = audio.play();
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        setPreviewingUrl(url);
                    }).catch(error => {
                        console.error("SFX playback failed:", error);
                        setPreviewingUrl(null);
                    });
                }
            }
        };
    
        const handleSave = () => {
            setSfxForLine(chapterId, lineIndex, tempSelectedSfx);
            setSfxVolume(chapterId, lineIndex, previewVolume);
            setSfxModalLine(null);
        };
    
        const displaySfx = useMemo(() => {
            const allSfx = new Map<number, SoundEffect>();
            if (line.soundEffect) {
                allSfx.set(line.soundEffect.id, line.soundEffect);
            }
            foundSfx.forEach(sfx => {
                allSfx.set(sfx.id, sfx);
            });
            return Array.from(allSfx.values());
        }, [line.soundEffect, foundSfx]);
    
        return (
             <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSfxModalLine(null)}>
                <div className="bg-slate-800/80 backdrop-blur-lg rounded-lg shadow-2xl w-full max-w-2xl flex flex-col border border-slate-700 max-h-[90vh]" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-between items-center p-4 border-b border-slate-700 flex-shrink-0">
                        <h3 className="text-xl font-bold text-white truncate">SFX для: "{line.text}"</h3>
                        <button onClick={() => setSfxModalLine(null)} className="text-slate-400 hover:text-white"><CloseIcon /></button>
                    </div>
                     <div className="p-6 space-y-4 flex-grow overflow-y-auto">
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                placeholder="Ручной поиск (e.g., door creak)" 
                                value={manualSearchQuery} 
                                onChange={(e) => setManualSearchQuery(e.target.value)} 
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleManualSearch();
                                    }
                                }}
                                className="flex-grow bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-white"
                            />
                            <button 
                                type="button" 
                                onClick={() => handleManualSearch()} 
                                disabled={isFindingManually || !manualSearchQuery.trim()} 
                                className="w-32 flex items-center justify-center gap-2 px-4 py-2 bg-slate-600 text-white font-bold rounded-lg hover:bg-slate-700 disabled:bg-slate-500"
                            >
                                {isFindingManually ? <Spinner className="w-5 h-5" /> : <SearchIcon />} Найти
                            </button>
                        </div>
                        <p className="text-xs text-center text-slate-400 mt-2">Поиск по ключевым словам в библиотеке Freesound.</p>

                         <div className="flex items-center gap-4"><hr className="flex-grow border-slate-600"/><span className="text-slate-400 text-sm">ИЛИ</span><hr className="flex-grow border-slate-600"/></div>
                        <div>
                            <button onClick={() => handleFindWithAI()} disabled={isFinding} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold rounded-lg hover:from-indigo-600 hover:to-purple-700">
                                {isFinding ? <Spinner className="w-5 h-5" /> : <SearchIcon />} Подобрать с помощью ИИ
                            </button>
                             <p className="text-xs text-center text-slate-400 mt-2">ИИ проанализирует описание и подберет ключевые слова.</p>
                        </div>
                        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-slate-600">
                            <label className="text-sm font-medium text-slate-300 whitespace-nowrap">Громкость:</label>
                            <input 
                                type="range"
                                min="0" max="1" step="0.05"
                                value={previewVolume}
                                onChange={e => setPreviewVolume(Number(e.target.value))}
                                className="w-full"
                            />
                            <span className="text-sm font-bold text-cyan-300 w-12 text-center">{Math.round(previewVolume * 100)}%</span>
                        </div>
                        <div className="space-y-2 pt-2">
                             {(isFinding || isFindingManually) && <div className="flex justify-center"><Spinner/></div>}
                             {displaySfx.length > 0 ? (
                                displaySfx.map(sfx => (
                                    <label key={sfx.id} className="p-2 rounded-md flex items-center justify-between gap-2 bg-slate-900/70 hover:bg-slate-900 cursor-pointer border-2 border-transparent has-[:checked]:border-cyan-500">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <input type="radio" name="sfx-selection" checked={tempSelectedSfx?.id === sfx.id} onChange={() => setTempSelectedSfx(sfx)} className="h-5 w-5 mr-2 text-cyan-600 bg-slate-700 border-slate-600 focus:ring-cyan-500"/>
                                            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePreview(sfx.previews['preview-hq-mp3']); }} className="p-2 bg-cyan-600/80 rounded-full text-white hover:bg-cyan-700 flex-shrink-0">
                                                {previewingUrl === sfx.previews['preview-hq-mp3'] ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
                                            </button>
                                            <div className="truncate">
                                                <p className="font-semibold text-white truncate">{sfx.name}</p>
                                                <p className="text-xs text-slate-400 truncate">by {sfx.username} ({sfx.license})</p>
                                            </div>
                                        </div>
                                    </label>
                                ))
                            ) : (!isFinding && !isFindingManually) && (<p className="text-center text-slate-400 pt-4">Результаты поиска появятся здесь.</p>)}
                        </div>
                    </div>
                     <div className="flex justify-end gap-4 p-4 border-t border-slate-700 flex-shrink-0 bg-slate-800/50 rounded-b-lg">
                        <button onClick={() => setSfxModalLine(null)} className="px-6 py-2 bg-slate-600 text-white font-bold rounded-lg hover:bg-slate-700">Отмена</button>
                        <button onClick={() => handleSave()} className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-lg hover:from-cyan-400 hover:to-blue-500">Применить</button>
                    </div>
                </div>
            </div>
        );
    };


    const MusicFinderModal = () => {
        if (!musicModalChapter) return null;
    
        const [isFinding, setIsFinding] = useState(false);
        const [isFindingManually, setIsFindingManually] = useState(false);
        const [foundTracks, setFoundTracks] = useState<MusicTrack[]>([]);
        const [previewingUrl, setPreviewingUrl] = useState<string | null>(null);
        const [manualSearchQuery, setManualSearchQuery] = useState('');
        const [tempSelectedTrack, setTempSelectedTrack] = useState<MusicTrack | null>(musicModalChapter.backgroundMusic || null);
        const [previewVolume, setPreviewVolume] = useState(musicModalChapter.backgroundMusicVolume ?? podcast?.backgroundMusicVolume ?? 0.1);

        useEffect(() => {
            if (audioPlayerRef.current && previewingUrl) {
                audioPlayerRef.current.volume = previewVolume;
            }
        }, [previewVolume, previewingUrl]);

        const handleFindWithAI = async () => {
            setIsFinding(true);
            setFoundTracks([]);
            try {
                const tracks = await findMusicForChapter(musicModalChapter.id);
                setFoundTracks(tracks);
            } finally {
                setIsFinding(false);
            }
        };

        const handleManualSearch = async () => {
            if (!manualSearchQuery.trim()) return;
            setIsFindingManually(true);
            setFoundTracks([]);
            try {
                const tracks = await findMusicManuallyForChapter(manualSearchQuery);
                setFoundTracks(tracks);
            } finally {
                setIsFindingManually(false);
            }
        };
    
        const togglePreview = (url: string) => {
            if (!audioPlayerRef.current) return;
            const audio = audioPlayerRef.current;
            const isCurrentlyPlaying = !audio.paused && audio.src === url;

            if (isCurrentlyPlaying) {
                audio.pause();
                setPreviewingUrl(null);
            } else {
                audio.pause(); 
                
                audio.src = url;
                audio.volume = previewVolume;
                const playPromise = audio.play();

                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        setPreviewingUrl(url);
                    }).catch(error => {
                        console.error("Audio playback failed:", error);
                        setPreviewingUrl(null);
                    });
                }
            }
        };
    
        const handleSave = () => {
            if (tempSelectedTrack) {
                setChapterMusic(musicModalChapter.id, tempSelectedTrack, false);
            }
            // Save the volume setting for this chapter specifically
            setChapterMusicVolume(musicModalChapter.id, previewVolume);
            setMusicModalChapter(null);
        };

        const displayTracks = useMemo(() => {
            const allTracks = new Map<string, MusicTrack>();
            if (musicModalChapter.backgroundMusic) {
                allTracks.set(musicModalChapter.backgroundMusic.id, musicModalChapter.backgroundMusic);
            }
            foundTracks.forEach(track => {
                allTracks.set(track.id, track);
            });
            return Array.from(allTracks.values());
        }, [musicModalChapter.backgroundMusic, foundTracks]);
    
        return (
            <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setMusicModalChapter(null)}>
                <div className="bg-slate-800/80 backdrop-blur-lg rounded-lg shadow-2xl w-full max-w-2xl flex flex-col border border-slate-700 max-h-[90vh]" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-between items-center p-4 border-b border-slate-700 flex-shrink-0">
                        <h3 className="text-xl font-bold text-white">Управление музыкой для "{musicModalChapter.title}"</h3>
                        <button onClick={() => setMusicModalChapter(null)} className="text-slate-400 hover:text-white"><CloseIcon /></button>
                    </div>
                    <div className="p-6 space-y-4 flex-grow overflow-y-auto">
                        <div className="flex gap-2">
                            <input 
                                type="text"
                                placeholder="Ручной поиск (e.g., epic cinematic)"
                                value={manualSearchQuery}
                                onChange={(e) => setManualSearchQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleManualSearch();
                                    }
                                }}
                                className="flex-grow bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-white"
                            />
                            <button 
                                type="button" 
                                onClick={() => handleManualSearch()} 
                                disabled={isFindingManually || !manualSearchQuery.trim()} 
                                className="w-32 flex items-center justify-center gap-2 px-4 py-2 bg-slate-600 text-white font-bold rounded-lg hover:bg-slate-700 disabled:from-slate-600 disabled:to-slate-700 disabled:shadow-none"
                            >
                                {isFindingManually ? <Spinner className="w-5 h-5" /> : <SearchIcon />}
                                Найти
                            </button>
                        </div>
                        <p className="text-xs text-center text-slate-400 mt-2">Поиск по ключевым словам в библиотеке Jamendo.</p>

                        <div className="flex items-center gap-4">
                            <hr className="flex-grow border-slate-600"/>
                            <span className="text-slate-400 text-sm">ИЛИ</span>
                            <hr className="flex-grow border-slate-600"/>
                        </div>

                        <div>
                            <button onClick={() => handleFindWithAI()} disabled={isFinding} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all disabled:from-slate-600 disabled:to-slate-700 disabled:shadow-none">
                                {isFinding ? <Spinner className="w-5 h-5" /> : <SearchIcon />}
                                Подобрать треки с помощью ИИ
                            </button>
                            <p className="text-xs text-center text-slate-400 mt-2">ИИ проанализирует содержание главы и предложит ключевые слова для поиска.</p>
                        </div>
                        
                        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-slate-600">
                            <label className="text-sm font-medium text-slate-300 whitespace-nowrap">Громкость предпрослушивания:</label>
                            <input 
                                type="range"
                                min="0" max="0.5" step="0.01"
                                value={previewVolume}
                                onChange={e => setPreviewVolume(Number(e.target.value))}
                                className="w-full"
                            />
                            <span className="text-sm font-bold text-cyan-300 w-12 text-center">{Math.round(previewVolume * 100)}%</span>
                        </div>

                        <div className="space-y-2 pt-2">
                            {(isFinding || isFindingManually) && <div className="flex justify-center"><Spinner/></div>}
                            {displayTracks.length > 0 ? (
                                displayTracks.map(track => (
                                    <label key={track.id} className="p-2 rounded-md flex items-center justify-between gap-2 bg-slate-900/70 hover:bg-slate-900 cursor-pointer border-2 border-transparent has-[:checked]:border-cyan-500">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <input 
                                                type="radio" 
                                                name="music-track-selection" 
                                                checked={tempSelectedTrack?.id === track.id}
                                                onChange={() => setTempSelectedTrack(track)}
                                                className="h-5 w-5 mr-2 text-cyan-600 bg-slate-700 border-slate-600 focus:ring-cyan-500"
                                            />
                                            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePreview(track.audio); }} className="p-2 bg-cyan-600/80 rounded-full text-white hover:bg-cyan-700 flex-shrink-0">
                                                {previewingUrl === track.audio ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
                                            </button>
                                            <div className="truncate">
                                                <p className="font-semibold text-white truncate">{track.name}</p>
                                                <p className="text-xs text-slate-400 truncate">{track.artist_name}</p>
                                            </div>
                                        </div>
                                    </label>
                                ))
                            ) : (!isFinding && !isFindingManually) && (
                                <p className="text-center text-slate-400 pt-4">Результаты поиска появятся здесь.</p>
                            )}
                        </div>
                    </div>
                     <div className="flex justify-end gap-4 p-4 border-t border-slate-700 flex-shrink-0 bg-slate-800/50 rounded-b-lg">
                        <button onClick={() => setMusicModalChapter(null)} className="px-6 py-2 bg-slate-600 text-white font-bold rounded-lg hover:bg-slate-700">Отмена</button>
                        <button onClick={() => handleSave()} className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-lg hover:from-cyan-400 hover:to-blue-500">Применить</button>
                    </div>
                </div>
            </div>
        );
    };

    if (!podcast) return null;

    const allChaptersDone = podcast.chapters.every(c => c.status === 'completed');
    const someChaptersDone = podcast.chapters.some(c => c.status === 'completed');
    const isQueueActive = !allChaptersDone && podcast.chapters.some(c => c.status !== 'error');

    const handleSfxPreview = (url: string, volume: number) => {
        if (!audioPlayerRef.current) return;
        const audio = audioPlayerRef.current;
        audio.pause();
        audio.src = url;
        audio.volume = volume;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => console.error("SFX playback failed:", error));
        }
    };

    return (
        <div className="w-full max-w-5xl mx-auto">
            {isGeneratingVideo && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-slate-800/80 rounded-lg shadow-2xl w-full max-w-lg p-8 text-center">
                        <Spinner className="w-16 h-16 mx-auto mb-6" />
                        <h3 className="text-2xl font-bold text-white mb-2">Идет создание видео...</h3>
                        <p className="text-cyan-300 mb-6">{videoGenerationProgress.message}</p>
                        <div className="w-full bg-slate-700 rounded-full h-4">
                            <div 
                                className="bg-gradient-to-r from-teal-400 to-cyan-500 h-4 rounded-full" 
                                style={{ width: `${videoGenerationProgress.progress * 100}%`, transition: 'width 0.3s ease' }}
                            ></div>
                        </div>
                        <p className="text-white font-bold text-lg mt-2">{Math.round(videoGenerationProgress.progress * 100)}%</p>
                    </div>
                </div>
            )}
            <audio ref={audioPlayerRef} className="hidden" />
            <MusicFinderModal />
            <SfxFinderModal />
             {isSourceModalOpen && podcast?.knowledgeBaseText && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsSourceModalOpen(false)}>
                    <div className="bg-slate-800/80 backdrop-blur-lg rounded-lg shadow-2xl w-full max-w-3xl h-full max-h-[80vh] flex flex-col border border-slate-700" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center p-4 border-b border-slate-700">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2"><BookOpenIcon /> Использованный источник</h3>
                            <button onClick={() => setIsSourceModalOpen(false)} className="text-slate-400 hover:text-white"><CloseIcon/></button>
                        </div>
                        <div className="p-6 overflow-y-auto">
                            <pre className="text-slate-300 whitespace-pre-wrap font-sans">{podcast.knowledgeBaseText}</pre>
                        </div>
                    </div>
                </div>
            )}
            <header className="text-center mb-8 p-6 bg-slate-900/60 backdrop-blur-lg rounded-2xl border border-slate-700 shadow-2xl shadow-black/20">
                <h2 className="text-3xl md:text-4xl font-bold text-white">{podcast.selectedTitle}</h2>
                <p className="text-slate-300 mt-2">{podcast.description}</p>
            </header>

            <div className="mb-8 p-6 bg-slate-900/60 backdrop-blur-lg rounded-2xl border border-slate-700 shadow-2xl shadow-black/20">
                <h3 className="text-xl font-bold text-white flex items-center gap-3 mb-4"><SpeakerWaveIcon /> Общие настройки аудио</h3>
                <div>
                    <label className="block text-lg font-medium text-slate-200 mb-2">
                        Общая громкость фоновой музыки: <span className="font-bold text-cyan-300">{Math.round(podcast.backgroundMusicVolume * 100)}%</span>
                    </label>
                    <input
                        type="range"
                        min="0"
                        max="0.5" // Max volume at 50% to not overpower speech
                        step="0.01"
                        value={podcast.backgroundMusicVolume}
                        onChange={e => setGlobalMusicVolume(Number(e.target.value))}
                        className="w-full"
                    />
                </div>
            </div>

            <div className="mb-8 p-6 bg-slate-900/60 backdrop-blur-lg rounded-2xl border border-slate-700 shadow-2xl shadow-black/20">
                 <h3 className="text-xl font-bold text-white flex items-center gap-3 mb-4"><VideoCameraIcon /> Настройки видео</h3>
                <div>
                    <label className="block text-lg font-medium text-slate-200 mb-2">Режим монтажа</label>
                    <div className="flex items-center gap-4 p-1 rounded-lg bg-slate-800 max-w-xs">
                         <button onClick={() => setVideoPacingMode('auto')} className={`flex-1 py-2 text-sm font-semibold rounded-md transition-colors ${podcast.videoPacingMode !== 'manual' ? 'bg-cyan-600 text-white' : 'hover:bg-slate-700'}`}>
                            Автоматический
                        </button>
                         <button onClick={() => setVideoPacingMode('manual')} className={`flex-1 py-2 text-sm font-semibold rounded-md transition-colors ${podcast.videoPacingMode === 'manual' ? 'bg-cyan-600 text-white' : 'hover:bg-slate-700'}`}>
                            Ручной
                        </button>
                    </div>
                    <p className="text-xs text-slate-400 mt-2 max-w-md">
                        {podcast.videoPacingMode === 'manual' 
                            ? "Вы можете задать длительность показа для каждого изображения вручную." 
                            : "Длительность показа изображений будет рассчитана автоматически на основе длины аудиодорожки."}
                    </p>
                </div>
            </div>

            <div className="space-y-6 mb-8">
                 {isQueueActive && (
                    <div className="flex justify-end mb-4">
                        <button onClick={() => setIsGenerationPaused(prev => !prev)} className="flex items-center gap-2 px-4 py-2 bg-yellow-600/80 text-white font-bold rounded-lg hover:bg-yellow-700/80 transition-colors">
                            {isGenerationPaused ? <PlayIcon className="w-5 h-5" /> : <PauseIcon className="w-5 h-5" />}
                            {isGenerationPaused ? 'Возобновить генерацию' : 'Приостановить генерацию'}
                        </button>
                    </div>
                )}
                {podcast.chapters.map((chapter, chapterIndex) => (
                    <div key={chapter.id} className="bg-slate-900/60 backdrop-blur-lg border border-slate-700 rounded-2xl shadow-lg shadow-black/20 overflow-hidden">
                        <div className="p-4 flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row">
                            <div className="flex items-center gap-4 flex-grow w-full">
                                <ChapterIcon className="w-8 h-8 text-cyan-400 flex-shrink-0" />
                                <div className="flex-grow min-w-0">
                                    <h4 className="font-bold text-white text-lg truncate">{chapter.title}</h4>
                                    <div className="flex items-center gap-2 text-xs text-slate-400">
                                        <span>Статус: <span className={`font-semibold ${ chapter.status === 'completed' ? 'text-green-400' : chapter.status === 'pending' ? 'text-slate-400' : chapter.status === 'error' ? 'text-red-400' : 'text-yellow-400 animate-pulse'}`}>{chapter.status}</span></span>
                                        <span className="text-slate-600">|</span>
                                        <div className="relative flex items-center gap-1 cursor-pointer" onClick={() => setMusicModalChapter(chapter)}>
                                            <span>Музыка: <span className="font-semibold text-indigo-300 truncate">{chapter.backgroundMusic?.name || 'Авто'}</span></span>
                                            <button className="p-1 rounded-full text-indigo-300 hover:bg-indigo-900/50"><EditIcon className="w-3 h-3"/></button>
                                        </div>
                                        <span className="text-slate-600">|</span>
                                        <div className="relative flex items-center gap-1">
                                            <button onClick={() => setVolumePopoverChapterId(volumePopoverChapterId === chapter.id ? null : chapter.id)} className="p-1 rounded-full text-indigo-300 hover:bg-indigo-900/50"><SpeakerWaveIcon className="w-3 h-3"/></button>
                                            {volumePopoverChapterId === chapter.id && (
                                                <div ref={volumePopoverRef} className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-slate-900 border border-slate-600 rounded-lg p-3 shadow-lg z-20">
                                                    <label className="block text-xs text-slate-300 mb-1">Громкость музыки</label>
                                                    <input type="range" min="0" max="0.5" step="0.01" value={chapter.backgroundMusicVolume ?? podcast.backgroundMusicVolume} onChange={e => setChapterMusicVolume(chapter.id, Number(e.target.value))} className="w-full"/>
                                                    <button onClick={() => setChapterMusicVolume(chapter.id, null)} className="mt-2 w-full text-xs text-center text-slate-400 hover:text-white">Сброс</button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                             <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                                {(chapter.status === 'script_generating' || chapter.status === 'audio_generating' || chapter.status === 'images_generating') && <Spinner className="w-5 h-5"/>}
                                {chapter.status === 'completed' && audioUrls[chapter.id] && <audio src={audioUrls[chapter.id]} controls className="h-8 w-60 sm:w-72"/>}
                                {(chapter.status === 'error' || chapter.status === 'completed') && (
                                    <button onClick={() => handleGenerateChapter(chapter.id)} className={`p-1.5 rounded-full ${chapter.status === 'error' ? 'text-red-400 bg-red-900/50 hover:bg-red-800' : 'text-blue-400 bg-blue-900/50 hover:bg-blue-800'}`} title="Повторить генерацию"><RedoIcon className="w-4 h-4"/></button>
                                )}
                            </div>
                        </div>

                        {(chapter.generatedImages && chapter.generatedImages.length > 0) && (
                             <details className="bg-slate-950/30 border-t border-slate-700" open>
                                <summary className="p-4 cursor-pointer font-semibold text-slate-300 hover:bg-slate-800/50">Изображения для главы ({chapter.generatedImages.length})</summary>
                                <div className="p-4 border-t border-slate-700">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {chapter.generatedImages.map((imgSrc, index) => (
                                            <div key={index}>
                                                <div className="group relative cursor-pointer">
                                                    <img src={imgSrc} alt={`Generated background ${index + 1}`} className={`rounded-lg w-full aspect-video object-cover transition-all border-4 border-transparent`} />
                                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 rounded-lg">
                                                        <button onClick={(e) => { e.stopPropagation(); regenerateSingleImage(chapter.id, index); }} disabled={regeneratingImage !== null} className="p-2 bg-white/20 rounded-full text-white hover:bg-white/30 disabled:opacity-50" title="Пересоздать"><RedoIcon /></button>
                                                        <button onClick={(e) => { e.stopPropagation(); setThumbnailBaseImage(imgSrc); }} className="p-2 bg-white/20 rounded-full text-white hover:bg-white/30" title="Сделать фоном для обложки"><ImageIcon /></button>
                                                        <a href={imgSrc} download={`image_ch${chapterIndex+1}_${index + 1}.jpeg`} onClick={e => e.stopPropagation()} className="p-2 bg-cyan-600 rounded-full text-white hover:bg-cyan-700" title="Скачать"><DownloadIcon /></a>
                                                    </div>
                                                    {regeneratingImage?.chapterId === chapter.id && regeneratingImage?.index === index && (
                                                    <div className="absolute inset-0 bg-slate-900/80 rounded-lg flex items-center justify-center"><Spinner /></div>
                                                    )}
                                                </div>
                                                {podcast.videoPacingMode === 'manual' && (
                                                    <div className="mt-2">
                                                        <label htmlFor={`duration-${chapter.id}-${index}`} className="block text-xs font-medium text-slate-400 mb-1">Длительность (сек)</label>
                                                        <input
                                                            type="number"
                                                            id={`duration-${chapter.id}-${index}`}
                                                            value={chapter.imageDurations?.[index] ?? 60}
                                                            onChange={(e) => setImageDuration(chapter.id, index, parseInt(e.target.value, 10))}
                                                            className="w-full bg-slate-800 border border-slate-600 rounded-md p-1.5 text-white text-center"
                                                            min="1"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex justify-center items-center gap-4 mt-4">
                                        <button onClick={() => regenerateChapterImages(chapter.id)} disabled={chapter.status === 'images_generating'} className="flex items-center justify-center gap-2 mx-auto px-4 py-2 bg-slate-700 text-white font-bold rounded-lg hover:bg-slate-600 transition-colors disabled:bg-slate-500">
                                           {chapter.status === 'images_generating' ? <Spinner className="w-5 h-5"/> : <RedoIcon className="w-5 h-5"/>} <span>Обновить все</span>
                                        </button>
                                        <button onClick={() => generateMoreImages(chapter.id)} disabled={generatingMoreImages === chapter.id} className="flex items-center justify-center gap-2 mx-auto px-4 py-2 bg-cyan-600/80 text-white font-bold rounded-lg hover:bg-cyan-700/80 transition-colors disabled:bg-slate-500">
                                            {generatingMoreImages === chapter.id ? <Spinner className="w-5 h-5"/> : <ImageIcon className="w-5 h-5"/>} <span>+5 изображений</span>
                                        </button>
                                    </div>
                                </div>
                            </details>
                        )}
                        
                        {chapter.script.some(l => l.speaker.toUpperCase() === 'SFX') && (
                             <details className="bg-slate-950/50 border-t border-slate-700">
                                <summary className="p-4 cursor-pointer font-semibold text-slate-300 hover:bg-slate-800/50">Звуковые эффекты</summary>
                                <div className="p-4 border-t border-slate-700">
                                    <div className="space-y-2">
                                        {chapter.script.map((line, lineIndex) => line.speaker.toUpperCase() === 'SFX' && (
                                            <div key={lineIndex} className="grid grid-cols-[1fr_auto_150px] items-center gap-4 p-2 bg-slate-800/50 rounded-lg">
                                                <div className="truncate">
                                                    <p className="text-slate-300 text-sm truncate italic">"{line.text}"</p>
                                                    <p className="text-xs text-cyan-400 truncate">{line.soundEffect?.name || 'Не выбран'}</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {line.soundEffect && <button onClick={() => handleSfxPreview(line.soundEffect!.previews['preview-hq-mp3'], line.soundEffectVolume ?? 0.5)} className="p-2 bg-cyan-600/80 rounded-full text-white hover:bg-cyan-700"><PlayIcon className="w-4 h-4"/></button>}
                                                    <button onClick={() => setSfxModalLine({ chapterId: chapter.id, line, lineIndex })} className="p-2 bg-indigo-600/80 rounded-full text-white hover:bg-indigo-700"><EditIcon className="w-4 h-4"/></button>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <SpeakerWaveIcon className="w-4 h-4 text-slate-400"/>
                                                    <input type="range" min="0" max="1" step="0.05" value={line.soundEffectVolume ?? 0.5} onChange={(e) => setSfxVolume(chapter.id, lineIndex, Number(e.target.value))} className="w-full"/>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </details>
                        )}
                    </div>
                ))}
            </div>
                <div className="mb-8 p-6 bg-slate-900/60 backdrop-blur-lg rounded-2xl border border-slate-700 shadow-2xl shadow-black/20">
                <h3 className="text-xl font-bold text-white flex items-center gap-3 mb-4"><WrenchIcon /> Инструменты</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    <button onClick={() => regenerateText()} disabled={isRegeneratingText} className="flex flex-col items-center justify-center gap-2 p-4 bg-slate-800 rounded-lg hover:bg-slate-700 disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors">
                        {isRegeneratingText ? <Spinner className="w-6 h-6"/> : <ScriptIcon />}
                        <span className="font-semibold text-sm">Обновить текст</span>
                    </button>
                    <button onClick={() => regenerateAllAudio()} disabled={isRegeneratingAudio} className="flex flex-col items-center justify-center gap-2 p-4 bg-slate-800 rounded-lg hover:bg-slate-700 disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors">
                        {isRegeneratingAudio ? <Spinner className="w-6 h-6"/> : <SpeakerWaveIcon />}
                        <span className="font-semibold text-sm">Переозвучить всё</span>
                    </button>
                    <button 
                        onClick={() => generateVideo(podcast)} 
                        disabled={!allChaptersDone || isGeneratingVideo} 
                        className="flex flex-col items-center justify-center gap-2 p-4 bg-purple-800/60 rounded-lg hover:bg-purple-700/80 disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors text-purple-300">
                        {isGeneratingVideo ? <Spinner className="w-6 h-6"/> : <VideoCameraIcon />}
                        <span className="font-semibold text-sm">Создать Видео</span>
                    </button>
                     <button 
                        onClick={() => generatePartialVideo()}
                        disabled={!someChaptersDone || isGeneratingVideo}
                        className="flex flex-col items-center justify-center gap-2 p-4 bg-teal-800/60 rounded-lg hover:bg-teal-700/80 disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors text-teal-300"
                        title="Собрать видео из уже сгенерированных глав">
                        {isGeneratingVideo ? <Spinner className="w-6 h-6"/> : <VideoCameraIcon />}
                        <span className="font-semibold text-sm text-center">Видео из готового</span>
                    </button>
                    <button onClick={() => regenerateProject()} className="flex flex-col items-center justify-center gap-2 p-4 bg-red-900/50 rounded-lg hover:bg-red-900/80 disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors text-red-300">
                        <RedoIcon />
                        <span className="font-semibold text-sm">Пересоздать проект</span>
                    </button>
                </div>
            </div>
            
            {podcast.thumbnailBaseImage && (
                 <div className="mb-8 p-6 bg-slate-900/60 backdrop-blur-lg rounded-2xl border border-slate-700 shadow-2xl shadow-black/20">
                    {podcast.youtubeThumbnails && podcast.youtubeThumbnails.length > 0 && (
                        <div>
                            <div className="mb-8">
                                <h4 className="text-lg font-semibold text-slate-200 flex items-center gap-3 mb-4"><SubtitleIcon /> Выбор заголовка для обложки</h4>
                                <div className="space-y-3">
                                    {podcast.youtubeTitleOptions.map((title, index) => (
                                        <label key={index} className="flex items-center p-3 bg-slate-800 rounded-lg cursor-pointer hover:bg-slate-700/50 transition-colors border border-transparent has-[:checked]:border-cyan-500 has-[:checked]:bg-cyan-900/20">
                                            <input
                                                type="radio"
                                                name="title-option"
                                                value={title}
                                                checked={podcast.selectedTitle === title}
                                                onChange={() => handleTitleSelection(title)}
                                                className="h-5 w-5 mr-4 text-cyan-600 bg-slate-700 border-slate-600 focus:ring-cyan-500"
                                            />
                                            <span className="text-slate-200">{title}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <h4 className="font-semibold text-lg text-slate-200 mb-4">Варианты обложек от AI-дизайнера</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                    {podcast.youtubeThumbnails.map((thumb) => (
                                        <div key={thumb.styleName} className="group relative">
                                            <p className="text-center font-semibold text-slate-300 mb-2">{thumb.styleName}</p>
                                            <img src={thumb.dataUrl} alt={`YouTube Thumbnail - ${thumb.styleName}`} className="rounded-lg border-2 border-cyan-500/50" />
                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 rounded-lg">
                                                <button onClick={() => onEditThumbnail(thumb)} className="flex items-center gap-2 px-4 py-2 bg-white/20 text-white text-sm font-bold rounded-lg hover:bg-white/30 backdrop-blur-sm"><EditIcon className="w-4 h-4"/> Редактировать</button>
                                                <a href={thumb.dataUrl} download={`thumbnail_${thumb.styleName.replace(/\s/g, '_')}_${podcast.selectedTitle.replace(/[^a-z0-9а-яё]/gi, '_')}.png`} className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white text-sm font-bold rounded-lg hover:bg-cyan-700"><DownloadIcon className="w-4 h-4"/> Скачать</a>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
            
            <div className="mb-8 p-6 bg-slate-900/60 backdrop-blur-lg rounded-2xl border border-slate-700 shadow-2xl shadow-black/20">
                    <h3 className="text-xl font-bold text-white flex items-center gap-3 mb-4"><ScriptIcon /> Текстовые материалы</h3>
                    <div className="space-y-4">
                    <CopyableField label="Название для YouTube" value={podcast.selectedTitle} icon={<UserCircleIcon className="w-4 h-4" />} />
                    <CopyableField label="Описание для YouTube" value={podcast.description} isTextarea icon={<BookOpenIcon className="w-4 h-4" />} />
                    <CopyableField label="Теги для YouTube" value={podcast.seoKeywords.join(', ')} icon={<ImageIcon className="w-4 h-4" />} />
                    {subtitleText && (
                        <CopyableField label="Субтитры (Текст)" value={subtitleText} isTextarea icon={<SubtitleIcon className="w-4 h-4" />} />
                    )}
                    {podcast.knowledgeBaseText && (
                        <div className="pt-2">
                            <button
                                onClick={() => setIsSourceModalOpen(true)}
                                className="flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300"
                            >
                                <BookOpenIcon className="w-5 h-5" />
                                Посмотреть использованный источник
                            </button>
                        </div>
                    )}
                    <CopyableField label="Полный сценарий для ручной озвучки" value={manualTtsScript} isTextarea icon={<ScriptIcon className="w-4 h-4" />} />
                    </div>
            </div>

                <div className="flex flex-col sm:flex-row gap-4 mt-8">
                <div className="relative flex-grow" ref={downloadMenuRef}>
                    <button 
                        onClick={() => setIsDownloadMenuOpen(prev => !prev)}
                        disabled={!allChaptersDone || isConvertingToMp3} 
                        className="w-full flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold rounded-lg hover:from-green-400 hover:to-emerald-500 disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed transition-all shadow-lg shadow-green-500/20 hover:shadow-emerald-500/30"
                    >
                        <DownloadIcon />
                        {isConvertingToMp3 ? `Конвертация в MP3...` : allChaptersDone ? "Скачать финальный подкаст" : `Завершите ${podcast.chapters.filter(c => c.status !== 'completed').length} глав`}
                    </button>
                    {isDownloadMenuOpen && allChaptersDone && (
                        <div className="absolute bottom-full mb-2 w-full bg-slate-700 rounded-lg shadow-lg z-10 border border-slate-600">
                            <button onClick={() => { combineAndDownload('wav'); setIsDownloadMenuOpen(false); }} className="w-full text-left px-4 py-3 hover:bg-slate-600 rounded-t-lg">Скачать в формате .WAV</button>
                            <button onClick={() => { combineAndDownload('mp3'); setIsDownloadMenuOpen(false); }} className="w-full text-left px-4 py-3 hover:bg-slate-600 rounded-b-lg">Скачать в формате .MP3</button>
                        </div>
                    )}
                </div>

                <button 
                    onClick={() => generateSrt()} 
                    disabled={!allChaptersDone || isGeneratingSrt}
                    className="w-full flex-grow flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold rounded-lg hover:from-indigo-400 hover:to-purple-500 disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-500/20 hover:shadow-purple-500/30"
                >
                    <SubtitleIcon />
                    {isGeneratingSrt ? `Генерация SRT...` : "Скачать субтитры (.SRT)"}
                </button>
            </div>
            <div className="text-center mt-4">
                    <button onClick={() => {
                        if (window.confirm("Вы уверены, что хотите вернуться в главное меню? Текущий проект будет сохранен в истории.")) {
                            setPodcast(null);
                        }
                    }} className="px-8 py-4 bg-slate-700 text-white font-bold rounded-lg hover:bg-slate-600">Вернуться в главное меню</button>
            </div>
        </div>
    );
};

export default PodcastStudio;