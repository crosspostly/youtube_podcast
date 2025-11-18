
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Podcast, YoutubeThumbnail, Chapter, MusicTrack, SoundEffect, ScriptLine } from '../types';
import { usePodcastContext } from '../context/PodcastContext';
import Spinner from './Spinner';
import { ChapterIcon, RedoIcon, DownloadIcon, ImageIcon, CopyIcon, CheckIcon, ScriptIcon, EditIcon, UserCircleIcon, PlayIcon, PauseIcon, BookOpenIcon, WrenchIcon, SpeakerWaveIcon, SubtitleIcon, SearchIcon, CloseIcon, TitleIcon, DescriptionIcon } from './Icons';

interface PodcastStudioProps {
    onEditThumbnail: (thumbnail: YoutubeThumbnail) => void;
}

const PodcastStudio: React.FC<PodcastStudioProps> = ({ onEditThumbnail }) => {
    const {
        podcast, setPodcast, isLoading,
        audioUrls, isGenerationPaused, setIsGenerationPaused,
        isRegeneratingText, isRegeneratingImages, isRegeneratingAudio,
        isConvertingToMp3, isGeneratingSrt, isZipping,
        handleGenerateChapter, combineAndDownload, downloadProjectAsZip,
        regenerateProject, regenerateText,
        regenerateImages, regenerateAllAudio,
        setGlobalMusicVolume, setChapterMusicVolume,
        setChapterMusic,
        findMusicForChapter, findMusicManuallyForChapter,
        findSfxForLine, findSfxManuallyForLine, setSfxForLine, setSfxVolume,
        generateSrt // Exposed for manual triggering
    } = usePodcastContext();
    
    const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
    const audioPlayerRef = useRef<HTMLAudioElement>(null);
    const [musicModalChapter, setMusicModalChapter] = useState<Chapter | null>(null);
    const [sfxModalLine, setSfxModalLine] = useState<{chapterId: string, line: ScriptLine, lineIndex: number} | null>(null);
    const [volumePopoverChapterId, setVolumePopoverChapterId] = useState<string | null>(null);
    const volumePopoverRef = useRef<HTMLDivElement>(null);
    const [copiedField, setCopiedField] = useState<string | null>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (volumePopoverRef.current && !volumePopoverRef.current.contains(event.target as Node)) {
                setVolumePopoverChapterId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleCopy = (text: string, fieldId: string) => {
        navigator.clipboard.writeText(text);
        setCopiedField(fieldId);
        setTimeout(() => setCopiedField(null), 2000);
    };

    const SfxFinderModal = () => {
        if (!sfxModalLine) return null;
        const { chapterId, line, lineIndex } = sfxModalLine;

        const [isFinding, setIsFinding] = useState(false);
        const [isFindingManually, setIsFindingManually] = useState(false);
        const [foundSfx, setFoundSfx] = useState<SoundEffect[]>([]);
        const [previewingUrl, setPreviewingUrl] = useState<string | null>(null);
        const [manualSearchQuery, setManualSearchQuery] = useState('');
        const [tempSelectedSfx, setTempSelectedSfx] = useState<SoundEffect | null>(line.soundEffect || null);
    
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

        const handleManualSearch = async (e: React.FormEvent) => {
            e.preventDefault();
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
                audio.volume = line.soundEffectVolume ?? 0.7;
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
                        <form onSubmit={handleManualSearch} className="flex gap-2">
                             <input type="text" placeholder="Ручной поиск (e.g., door creak)" value={manualSearchQuery} onChange={(e) => setManualSearchQuery(e.target.value)} className="flex-grow bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-white"/>
                            <button type="submit" disabled={isFindingManually || !manualSearchQuery.trim()} className="w-32 flex items-center justify-center gap-2 px-4 py-2 bg-slate-600 text-white font-bold rounded-lg hover:bg-slate-700 disabled:bg-slate-500">
                                {isFindingManually ? <Spinner className="w-5 h-5" /> : <SearchIcon />} Найти
                            </button>
                        </form>
                         <div className="flex items-center gap-4"><hr className="flex-grow border-slate-600"/><span className="text-slate-400 text-sm">ИЛИ</span><hr className="flex-grow border-slate-600"/></div>
                        <button onClick={handleFindWithAI} disabled={isFinding} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold rounded-lg hover:from-indigo-600 hover:to-purple-700">
                            {isFinding ? <Spinner className="w-5 h-5" /> : <SearchIcon />} Подобрать с помощью ИИ
                        </button>
                        <div className="space-y-2 pt-4">
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
                        <button onClick={handleSave} className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-lg hover:from-cyan-400 hover:to-blue-500">Сохранить</button>
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

        const handleManualSearch = async (e: React.FormEvent) => {
            e.preventDefault();
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
                audio.volume = musicModalChapter.backgroundMusicVolume ?? podcast?.backgroundMusicVolume ?? 0.02;
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
                        <form onSubmit={handleManualSearch} className="flex gap-2">
                            <input 
                                type="text"
                                placeholder="Ручной поиск (e.g., epic cinematic)"
                                value={manualSearchQuery}
                                onChange={(e) => setManualSearchQuery(e.target.value)}
                                className="flex-grow bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-white"
                            />
                            <button type="submit" disabled={isFindingManually || !manualSearchQuery.trim()} className="w-32 flex items-center justify-center gap-2 px-4 py-2 bg-slate-600 text-white font-bold rounded-lg hover:bg-slate-700 disabled:from-slate-600 disabled:to-slate-700 disabled:shadow-none">
                                {isFindingManually ? <Spinner className="w-5 h-5" /> : <SearchIcon />}
                                Найти
                            </button>
                        </form>

                        <div className="flex items-center gap-4">
                            <hr className="flex-grow border-slate-600"/>
                            <span className="text-slate-400 text-sm">ИЛИ</span>
                            <hr className="flex-grow border-slate-600"/>
                        </div>

                        <button onClick={handleFindWithAI} disabled={isFinding} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all disabled:from-slate-600 disabled:to-slate-700 disabled:shadow-none">
                            {isFinding ? <Spinner className="w-5 h-5" /> : <SearchIcon />}
                            Подобрать треки с помощью ИИ
                        </button>

                        <div className="space-y-2 pt-4">
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
                        <button onClick={handleSave} className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-lg hover:from-cyan-400 hover:to-blue-500">Сохранить</button>
                    </div>
                </div>
            </div>
        );
    };

    if (!podcast) return null;

    const allChaptersDone = podcast.chapters.every(c => c.status === 'completed');
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
        <div className="w-full max-w-5xl mx-auto pb-24">
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
            </header>
            
            {/* Metadata Section: Tags & Titles & Description */}
            {(podcast.seoKeywords.length > 0 || podcast.youtubeTitleOptions.length > 0 || podcast.description) && (
                <div className="mb-8 p-6 bg-slate-900/60 backdrop-blur-lg rounded-2xl border border-slate-700 shadow-2xl shadow-black/20">
                     <h3 className="text-xl font-bold text-white flex items-center gap-3 mb-4"><TitleIcon /> Метаданные для YouTube</h3>
                     
                     {podcast.youtubeTitleOptions.length > 0 && (
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-slate-400 mb-2">Варианты заголовков (AI)</label>
                            <div className="space-y-2">
                                {podcast.youtubeTitleOptions.map((title, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg border border-slate-800 hover:border-slate-600 transition-colors">
                                        <span className="text-slate-200 truncate pr-2">{title}</span>
                                        <button 
                                            onClick={() => handleCopy(title, `title-${idx}`)}
                                            className="p-1 text-slate-400 hover:text-cyan-400 flex-shrink-0"
                                            title="Копировать"
                                        >
                                            {copiedField === `title-${idx}` ? <CheckIcon className="w-4 h-4 text-green-400"/> : <CopyIcon className="w-4 h-4"/>}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                     )}

                    {/* Description Block - Moved here from Header */}
                    {podcast.description && (
                        <div className="mb-6">
                            <div className="flex justify-between items-center mb-2">
                                <label className="block text-sm font-medium text-slate-400 flex items-center gap-2">
                                    <DescriptionIcon className="w-4 h-4"/> Описание видео (YouTube Description)
                                </label>
                                <button 
                                    onClick={() => handleCopy(podcast.description, 'description')}
                                    className="text-xs flex items-center gap-1 text-cyan-400 hover:text-cyan-300"
                                >
                                    {copiedField === 'description' ? <CheckIcon className="w-3 h-3"/> : <CopyIcon className="w-3 h-3"/>}
                                    Копировать
                                </button>
                            </div>
                            <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-800 text-slate-300 text-sm whitespace-pre-wrap max-h-40 overflow-y-auto custom-scrollbar">
                                {podcast.description}
                            </div>
                        </div>
                    )}

                     {podcast.seoKeywords.length > 0 && (
                         <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="block text-sm font-medium text-slate-400">SEO Теги (Keywords)</label>
                                <button 
                                    onClick={() => handleCopy(podcast.seoKeywords.join(', '), 'tags')}
                                    className="text-xs flex items-center gap-1 text-cyan-400 hover:text-cyan-300"
                                >
                                    {copiedField === 'tags' ? <CheckIcon className="w-3 h-3"/> : <CopyIcon className="w-3 h-3"/>}
                                    Копировать все
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {podcast.seoKeywords.map((tag, idx) => (
                                    <span key={idx} className="px-2 py-1 bg-slate-800 rounded-md text-xs text-slate-300 border border-slate-700">
                                        #{tag}
                                    </span>
                                ))}
                            </div>
                         </div>
                     )}
                </div>
            )}

            {podcast.characters && podcast.characters.length > 0 && (
                <div className="mb-8 p-6 bg-slate-900/60 backdrop-blur-lg rounded-2xl border border-slate-700 shadow-2xl shadow-black/20">
                    <h3 className="text-xl font-bold text-white flex items-center gap-3 mb-4"><UserCircleIcon /> Персонажи и голоса</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {podcast.characters.map((char) => (
                            <div key={char.name} className="bg-slate-900/70 p-4 rounded-lg border border-slate-800">
                                <p className="font-bold text-cyan-400 text-lg">{char.name}</p>
                                <p className="text-slate-300 italic text-sm mb-2">{char.description}</p>
                                    <p className="text-xs text-slate-400">Голос: <span className="font-semibold text-cyan-300">{podcast.characterVoices[char.name] || 'Не назначен'}</span></p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            
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

            <div className="space-y-6 mb-8">
                 {isQueueActive && (
                    <div className="flex justify-end mb-4">
                        <button onClick={() => setIsGenerationPaused(prev => !prev)} className="flex items-center gap-2 px-4 py-2 bg-yellow-600/80 text-white font-bold rounded-lg hover:bg-yellow-700/80 transition-colors">
                            {isGenerationPaused ? <PlayIcon className="w-5 h-5" /> : <PauseIcon className="w-5 h-5" />}
                            {isGenerationPaused ? 'Возобновить генерацию' : 'Приостановить генерацию'}
                        </button>
                    </div>
                )}
                {podcast.chapters.map((chapter) => (
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
                                {(chapter.status === 'script_generating' || chapter.status === 'audio_generating') && <Spinner className="w-5 h-5"/>}
                                {chapter.status === 'completed' && audioUrls[chapter.id] && <audio src={audioUrls[chapter.id]} controls className="h-8 w-60 sm:w-72"/>}
                                {(chapter.status === 'error' || chapter.status === 'completed') && (
                                    <button onClick={() => handleGenerateChapter(chapter.id)} className={`p-1.5 rounded-full ${chapter.status === 'error' ? 'text-red-400 bg-red-900/50 hover:bg-red-800' : 'text-blue-400 bg-blue-900/50 hover:bg-blue-800'}`} title="Пересоздать главу"><RedoIcon className="w-4 h-4"/></button>
                                )}
                            </div>
                        </div>
                        
                        {/* Chapter Images Section */}
                        {chapter.images && chapter.images.length > 0 ? (
                            <div className="px-4 pb-4">
                                <h5 className="font-semibold text-slate-300 mb-2 text-sm">Визуализация главы ({chapter.images.length})</h5>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                    {chapter.images.map((imgSrc, i) => (
                                        <img key={i} src={imgSrc} alt={`Chapter visual ${i}`} className="rounded-md w-full h-28 object-cover border border-slate-700 hover:border-cyan-500 transition-all" />
                                    ))}
                                </div>
                            </div>
                        ) : (
                            chapter.status === 'completed' && (
                                <div className="px-4 pb-4 text-center text-sm text-slate-500 italic">
                                    Изображения для этой главы не сгенерированы.
                                </div>
                            )
                        )}

                        {/* Full Script Display (Dialogue + SFX) */}
                        {chapter.script && chapter.script.length > 0 && (
                            <div className="bg-slate-950/50 p-4 border-t border-slate-700 max-h-[400px] overflow-y-auto custom-scrollbar">
                                <h5 className="font-semibold text-slate-300 mb-3 text-sm sticky top-0 bg-slate-950/90 backdrop-blur-sm py-2 z-10 flex items-center gap-2">
                                    <ScriptIcon className="w-4 h-4"/> Сценарий главы
                                </h5>
                                <div className="space-y-3">
                                    {chapter.script.map((line, lineIndex) => {
                                        const isSfx = line.speaker.toUpperCase() === 'SFX';
                                        return (
                                            <div key={lineIndex} className={`p-3 rounded-lg ${isSfx ? 'bg-slate-800/80 border border-slate-700' : 'bg-transparent hover:bg-slate-800/30 border border-transparent'}`}>
                                                {isSfx ? (
                                                    // SFX Line Design
                                                    <div className="grid grid-cols-[1fr_auto_150px] items-center gap-4">
                                                        <div className="truncate">
                                                            <p className="text-slate-300 text-sm truncate italic flex items-center gap-2">
                                                                <span className="px-1.5 py-0.5 bg-slate-700 rounded text-[10px] font-bold text-slate-400">SFX</span>
                                                                "{line.text}"
                                                            </p>
                                                            <p className="text-xs text-cyan-400 truncate pl-10">{line.soundEffect?.name || 'Не выбран'}</p>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {line.soundEffect && <button onClick={() => handleSfxPreview(line.soundEffect!.previews['preview-hq-mp3'], line.soundEffectVolume ?? 0.7)} className="p-1.5 bg-cyan-600/80 rounded-full text-white hover:bg-cyan-700"><PlayIcon className="w-3 h-3"/></button>}
                                                            <button onClick={() => setSfxModalLine({ chapterId: chapter.id, line, lineIndex })} className="p-1.5 bg-indigo-600/80 rounded-full text-white hover:bg-indigo-700"><EditIcon className="w-3 h-3"/></button>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <SpeakerWaveIcon className="w-3 h-3 text-slate-400"/>
                                                            <input type="range" min="0" max="1" step="0.05" value={line.soundEffectVolume ?? 0.7} onChange={(e) => setSfxVolume(chapter.id, lineIndex, Number(e.target.value))} className="w-full h-1"/>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    // Dialogue Line Design
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-xs font-bold text-cyan-500 uppercase tracking-wider">{line.speaker}</span>
                                                        <p className="text-slate-200 text-sm leading-relaxed">{line.text}</p>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Export Section */}
            <div className="mb-8 p-6 bg-slate-900/80 backdrop-blur-lg rounded-2xl border border-cyan-900/50 shadow-2xl shadow-cyan-900/20">
                <h3 className="text-2xl font-bold text-white flex items-center gap-3 mb-6"><DownloadIcon className="w-8 h-8 text-cyan-400"/> Экспорт материалов</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                     <button 
                        onClick={() => combineAndDownload('wav')} 
                        disabled={isLoading || isConvertingToMp3}
                        className="flex items-center justify-center gap-3 px-6 py-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-all border border-slate-700 hover:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? <Spinner className="w-5 h-5"/> : <SpeakerWaveIcon className="w-6 h-6 text-cyan-300"/>}
                        <span>Скачать Аудио (WAV)</span>
                    </button>
                    <button 
                        onClick={() => generateSrt()} 
                        disabled={isGeneratingSrt}
                        className="flex items-center justify-center gap-3 px-6 py-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-all border border-slate-700 hover:border-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isGeneratingSrt ? <Spinner className="w-5 h-5"/> : <SubtitleIcon className="w-6 h-6 text-cyan-300"/>}
                        <span>Скачать Субтитры (SRT)</span>
                    </button>
                    <button 
                        onClick={() => downloadProjectAsZip()} 
                        disabled={isZipping}
                        className="flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-teal-600 to-cyan-700 hover:from-teal-500 hover:to-cyan-600 text-white font-bold rounded-xl transition-all shadow-lg shadow-cyan-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isZipping ? <Spinner className="w-5 h-5"/> : <DownloadIcon className="w-6 h-6"/>}
                        <span>Скачать Полный ZIP</span>
                    </button>
                </div>
            </div>

            <div className="mb-8 p-6 bg-slate-900/60 backdrop-blur-lg rounded-2xl border border-slate-700 shadow-2xl shadow-black/20">
                <h3 className="text-xl font-bold text-white flex items-center gap-3 mb-4"><WrenchIcon /> Инструменты</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <button onClick={regenerateText} disabled={isRegeneratingText} className="flex flex-col items-center justify-center gap-2 p-4 bg-slate-800 rounded-lg hover:bg-slate-700 disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors">
                        {isRegeneratingText ? <Spinner className="w-6 h-6"/> : <ScriptIcon />}
                        <span className="font-semibold text-sm">Обновить текст</span>
                    </button>
                    <button onClick={regenerateImages} disabled={isRegeneratingImages} className="flex flex-col items-center justify-center gap-2 p-4 bg-slate-800 rounded-lg hover:bg-slate-700 disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors opacity-50" title="Используйте 'Пересоздать главу' для обновления картинок">
                        {isRegeneratingImages ? <Spinner className="w-6 h-6"/> : <ImageIcon />}
                        <span className="font-semibold text-sm">Обновить картинки (Глава 1)</span>
                    </button>
                    <button onClick={regenerateAllAudio} disabled={isRegeneratingAudio} className="flex flex-col items-center justify-center gap-2 p-4 bg-slate-800 rounded-lg hover:bg-slate-700 disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors">
                        {isRegeneratingAudio ? <Spinner className="w-6 h-6"/> : <SpeakerWaveIcon />}
                        <span className="font-semibold text-sm">Переозвучить всё</span>
                    </button>
                    <button onClick={regenerateProject} disabled={isLoading} className="flex flex-col items-center justify-center gap-2 p-4 bg-red-900/50 rounded-lg hover:bg-red-900/80 disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors text-red-300">
                        <RedoIcon />
                        <span className="font-semibold text-sm">Пересоздать проект</span>
                    </button>
                </div>
            </div>

            {podcast.youtubeThumbnails && podcast.youtubeThumbnails.length > 0 && (
                <div className="mb-8 p-6 bg-slate-900/60 backdrop-blur-lg rounded-2xl border border-slate-700 shadow-2xl shadow-black/20">
                    <div className="border-t border-slate-700 pt-6 mt-8">
                        <h4 className="text-xl font-bold text-white flex items-center gap-3 mb-4"><ImageIcon /> Обложки для YouTube</h4>
                        <p className="text-sm text-slate-400 mb-4">Нажмите на обложку, чтобы открыть редактор.</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {podcast.youtubeThumbnails.map((thumbnail) => (
                                <div key={thumbnail.styleName} className="group relative cursor-pointer" onClick={() => onEditThumbnail(thumbnail)}>
                                    <img src={thumbnail.dataUrl} alt={thumbnail.styleName} className="rounded-lg w-full aspect-video object-cover transition-all" />
                                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                                        <EditIcon className="w-8 h-8 text-white" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PodcastStudio;
