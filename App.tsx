import React, { useState, useCallback, useEffect } from 'react';
import { generatePodcastBlueprint, generateNextChapterScript, generatePodcastDialogueAudio, combineWavBlobs, googleSearchForKnowledge, regenerateTextAssets } from './services/ttsService';
import { generateStyleImages, generateYoutubeThumbnails } from './services/imageService';
import type { Podcast, Chapter, LogEntry, YoutubeThumbnail, Character } from './types';
import Spinner from './components/Spinner';
import ThumbnailEditor from './components/ThumbnailEditor';
import ApiKeyModal from './components/ApiKeyModal';
import { HistoryIcon, TrashIcon, JournalIcon, CloseIcon, ChapterIcon, RedoIcon, CombineIcon, DownloadIcon, ImageIcon, CopyIcon, CheckIcon, ScriptIcon, EditIcon, KeyIcon, UserCircleIcon, PauseIcon, PlayIcon, BookOpenIcon, WrenchIcon, SpeakerWaveIcon } from './components/Icons';

const sampleArticles = [
  { topic: "Секреты и теории заговора вокруг Зоны 51", title: "Зона 51: Что скрывает секретная база?" },
  { topic: "История с привидениями в Доме Винчестеров", title: "Проклятие дома Винчестеров" },
  { topic: "Таинственные исчезновения в Беннингтонском треугольнике, Вермонт", title: "Исчезновения в Беннингтонском треугольнике" },
  { topic: "Паранормальная активность на Ранчо Скинуокер", title: "Ранчо Скинуокер: Портал в другие миры?" }
];

const CopyableField: React.FC<{ label: string; value: string; isTextarea?: boolean }> = ({ label, value, isTextarea = false }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const InputComponent = isTextarea ? 'textarea' : 'input';

    return (
        <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
            <div className="relative">
                <InputComponent
                    readOnly
                    value={value}
                    className="w-full bg-gray-900 border border-gray-600 rounded-md p-2 pr-10 text-gray-200"
                    rows={isTextarea ? 10 : undefined}
                />
                <button
                    onClick={handleCopy}
                    className="absolute top-2 right-2 p-1 rounded-md text-gray-400 hover:bg-gray-700 hover:text-white"
                    aria-label={`Copy ${label}`}
                >
                    {copied ? <CheckIcon className="w-5 h-5 text-green-400" /> : <CopyIcon className="w-5 h-5" />}
                </button>
            </div>
        </div>
    );
};


const App: React.FC = () => {
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [loadingStep, setLoadingStep] = useState<string>('');
    const [podcast, setPodcast] = useState<Podcast | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [projectTitleInput, setProjectTitleInput] = useState<string>('');
    const [history, setHistory] = useState<Podcast[]>([]);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isLogVisible, setIsLogVisible] = useState<boolean>(false);
    const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingThumbnail, setEditingThumbnail] = useState<YoutubeThumbnail | null>(null);
    const [saveMediaInHistory, setSaveMediaInHistory] = useState<boolean>(false);
    const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
    const [apiKeys, setApiKeys] = useState({ gemini: '', openRouter: '' });
    const [isGeneratingChapter, setIsGeneratingChapter] = useState(false);
    const [isGenerationPaused, setIsGenerationPaused] = useState(false);
    const [isRegeneratingText, setIsRegeneratingText] = useState(false);
    const [isRegeneratingImages, setIsRegeneratingImages] = useState(false);
    const [isRegeneratingAudio, setIsRegeneratingAudio] = useState(false);

    // New state for knowledge base and generation settings
    const [knowledgeBaseText, setKnowledgeBaseText] = useState('');
    const [googleSearchQuestion, setGoogleSearchQuestion] = useState('');
    const [isGoogling, setIsGoogling] = useState(false);
    const [creativeFreedom, setCreativeFreedom] = useState(true);
    const [totalDurationMinutes, setTotalDurationMinutes] = useState(40);
    const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);


    useEffect(() => {
        try {
            const storedHistory = localStorage.getItem('podcastHistory');
            if (storedHistory) setHistory(JSON.parse(storedHistory));
            const storedGeminiKey = localStorage.getItem('geminiApiKey') || '';
            const storedOpenRouterKey = localStorage.getItem('openRouterProviderKey') || '';
            setApiKeys({ gemini: storedGeminiKey, openRouter: storedOpenRouterKey });
        } catch (e) { console.error("Failed to load history or API keys", e); }
    }, []);
    
    useEffect(() => {
        const newUrls: Record<string, string> = {};
        podcast?.chapters.forEach(chapter => {
            if (chapter.audioBlob) {
                newUrls[chapter.id] = URL.createObjectURL(chapter.audioBlob);
            }
        });
        setAudioUrls(newUrls);

        return () => {
            Object.values(newUrls).forEach(url => URL.revokeObjectURL(url));
        };
    }, [podcast?.chapters]);

    const log = useCallback((entry: Omit<LogEntry, 'timestamp'>) => {
        setLogs(prev => [{ ...entry, timestamp: new Date().toISOString() }, ...prev]);
    }, []);

    const updateHistory = useCallback((newPodcast: Podcast) => {
        const newHistory = [newPodcast, ...history.filter(p => p.id !== newPodcast.id)];
        setHistory(newHistory);
    
        const serializableHistory = newHistory.map(p => {
            const { chapters, ...podcastRest } = p;
            
            const serializablePodcast: any = {
                ...podcastRest,
                chapters: chapters.map(({ audioBlob, ...chapterRest }) => chapterRest)
            };
    
            if (!saveMediaInHistory) {
                delete serializablePodcast.generatedImages;
                delete serializablePodcast.youtubeThumbnails;
            }
    
            return serializablePodcast;
        });
    
        try {
            localStorage.setItem('podcastHistory', JSON.stringify(serializableHistory));
        } catch (e) {
            setError("Не удалось сохранить в историю: хранилище переполнено.");
            log({ type: 'error', message: 'Ошибка localStorage: хранилище переполнено.', data: e });
        }
    }, [history, saveMediaInHistory, log]);

    const handleStartProject = useCallback(async (topic: string) => {
        if (!topic.trim()) { setError('Введите название проекта.'); return; }
        setIsLoading(true);
        setError(null);
        setPodcast(null);
        setLogs([]);
        setIsGenerationPaused(false);
        
        try {
            setLoadingStep("Создание концепции, персонажей и первой главы...");
            const blueprint = await generatePodcastBlueprint(topic, knowledgeBaseText, creativeFreedom, log, apiKeys.gemini);
            
            setLoadingStep("Озвучивание первой главы...");
            const firstChapterAudio = await generatePodcastDialogueAudio(blueprint.chapters[0].script, blueprint.characters, log, apiKeys.gemini);
            
            setLoadingStep("Генерация изображений...");
            const generatedImages = await generateStyleImages(blueprint.imagePrompts, log, apiKeys.gemini, apiKeys.openRouter);
            
            setLoadingStep("Создание обложек для YouTube...");
            const youtubeThumbnails = generatedImages.length > 0 ? await generateYoutubeThumbnails(generatedImages[0], blueprint.title, log) : [];
            
            const newPodcast: Podcast = {
                ...blueprint,
                chapters: [{ ...blueprint.chapters[0], status: 'completed', audioBlob: firstChapterAudio }],
                generatedImages: generatedImages || [],
                youtubeThumbnails: youtubeThumbnails || [],
                knowledgeBaseText: knowledgeBaseText,
                creativeFreedom: creativeFreedom,
                totalDurationMinutes: totalDurationMinutes,
            };

            const CHAPTER_DURATION_MIN = 5;
            const totalChapters = Math.max(1, Math.ceil(totalDurationMinutes / CHAPTER_DURATION_MIN));

            for (let i = 1; i < totalChapters; i++) {
                newPodcast.chapters.push({
                    id: crypto.randomUUID(),
                    title: `Глава ${i + 1}`,
                    script: [],
                    status: 'pending',
                });
            }

            setPodcast(newPodcast);
            
        } catch (err: any) {
            setError(err.message || 'Произошла неизвестная ошибка при создании проекта.');
            log({ type: 'error', message: 'Критическая ошибка при инициализации проекта', data: err });
        } finally {
            setIsLoading(false);
            setLoadingStep('');
        }
    }, [log, apiKeys, knowledgeBaseText, creativeFreedom, totalDurationMinutes]);

    const handleGenerateChapter = useCallback(async (chapterId: string) => {
        if (!podcast) return;
    
        const chapterIndex = podcast.chapters.findIndex(c => c.id === chapterId);
        if (chapterIndex === -1) return;

        const updateChapterState = (id: string, status: Chapter['status'], data: Partial<Chapter> = {}) => {
            setPodcast(p => {
                if (!p) return null;
                const updatedChapters = p.chapters.map(c => c.id === id ? { ...c, status, ...data, error: data.error || undefined } : c);
                return { ...p, chapters: updatedChapters };
            });
        };
    
        try {
            updateChapterState(chapterId, 'script_generating');
            const chapterScriptData = await generateNextChapterScript(podcast.topic, podcast.title, podcast.characters, podcast.chapters.slice(0, chapterIndex), chapterIndex, podcast.knowledgeBaseText || '', podcast.creativeFreedom, log, apiKeys.gemini);
            
            updateChapterState(chapterId, 'audio_generating', { script: chapterScriptData.script, title: chapterScriptData.title });
            const audioBlob = await generatePodcastDialogueAudio(chapterScriptData.script, podcast.characters, log, apiKeys.gemini);
    
            updateChapterState(chapterId, 'completed', { audioBlob });

        } catch (err: any) {
            const errorMessage = err.message || 'Неизвестная ошибка при генерации главы.';
            log({type: 'error', message: `Ошибка при генерации главы ${chapterIndex + 1}`, data: err});
            updateChapterState(chapterId, 'error', { error: errorMessage });
        }

    }, [podcast, log, apiKeys.gemini]);
    
    const handleGoogleSearchAndAdd = async () => {
        if (!googleSearchQuestion.trim()) return;
        setIsGoogling(true);
        setError(null);
        try {
            const answer = await googleSearchForKnowledge(googleSearchQuestion, log, apiKeys.gemini);
            const addition = `\n\n---\nИсточник по вопросу: "${googleSearchQuestion}"\n${answer}\n---\n`;
            setKnowledgeBaseText(prev => prev.trim() + addition);
            setGoogleSearchQuestion(''); // Clear input after successful addition
        } catch (err: any) {
            setError(err.message || 'Ошибка при поиске в Google.');
            log({type: 'error', message: 'Ошибка при поиске в Google', data: err});
        } finally {
            setIsGoogling(false);
        }
    };


    useEffect(() => {
        const pendingChapter = podcast?.chapters.find(c => c.status === 'pending');
        if (pendingChapter && !isLoading && !isGeneratingChapter && !isGenerationPaused) {
            setIsGeneratingChapter(true);
            handleGenerateChapter(pendingChapter.id)
                .finally(() => {
                    setIsGeneratingChapter(false);
                });
        }
    }, [podcast?.chapters, handleGenerateChapter, isLoading, isGeneratingChapter, isGenerationPaused]);

    useEffect(() => {
        if (podcast) {
            updateHistory(podcast);

            const completedChapters = podcast.chapters.filter(c => c.status === 'completed');
            if (completedChapters.length > 0) {
                const scriptText = "Style Instructions: Read aloud in a warm, welcoming tone.\n\n" +
                    completedChapters.map((chapter, index) => 
                    `ГЛАВА ${index + 1}: ${chapter.title.toUpperCase()}\n\n` +
                    chapter.script.map(line => {
                      if (line.speaker.toUpperCase() === 'SFX') {
                          return `[SFX: ${line.text}]`;
                      }
                      return `${line.speaker}: ${line.text}`;
                    }).join('\n')
                ).join('\n\n---\n\n');
                
                setPodcast(p => p ? {...p, manualTtsScript: scriptText} : null);
            }
        }
    }, [podcast?.chapters.map(c => c.status).join(','), updateHistory]);


    const handleCombineAndDownload = async () => {
        if (!podcast || podcast.chapters.some(c => c.status !== 'completed' || !c.audioBlob)) return;
        setLoadingStep("Сборка финального аудиофайла...");
        setIsLoading(true);
        try {
            const blobs = podcast.chapters.map(c => c.audioBlob).filter((b): b is Blob => !!b);
            const finalBlob = await combineWavBlobs(blobs);
            const url = URL.createObjectURL(finalBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${podcast.topic.replace(/[^a-z0-9а-яё]/gi, '_').toLowerCase()}.wav`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err: any) {
            setError('Ошибка при сборке аудиофайла.');
            log({type: 'error', message: 'Ошибка при сборке WAV', data: err});
        } finally {
            setIsLoading(false);
            setLoadingStep("");
        }
    };

    const handleEditThumbnail = (thumbnail: YoutubeThumbnail) => {
        setEditingThumbnail(thumbnail);
        setIsEditorOpen(true);
    };

    const handleSaveThumbnail = (updatedThumbnail: YoutubeThumbnail) => {
        setPodcast(p => {
            if (!p || !p.youtubeThumbnails) return p;
            const newThumbnails = p.youtubeThumbnails.map(t => 
                t.styleName === updatedThumbnail.styleName ? updatedThumbnail : t
            );
            return { ...p, youtubeThumbnails: newThumbnails };
        });
        setIsEditorOpen(false);
        setEditingThumbnail(null);
    };

    const handleSaveApiKeys = (keys: { gemini: string; openRouter: string }) => {
        setApiKeys(keys);
        localStorage.setItem('geminiApiKey', keys.gemini);
        localStorage.setItem('openRouterProviderKey', keys.openRouter);
        log({ type: 'info', message: 'API-ключи сохранены.' });
    };
    
    // --- REGENERATION HANDLERS ---
    const handleRegenerateProject = () => {
        if (!podcast) return;
        if (window.confirm("Вы уверены, что хотите полностью пересоздать этот проект? Все текущие сгенерированные данные (кроме настроек) будут утеряны.")) {
            handleStartProject(podcast.topic);
        }
    };

    const handleRegenerateText = async () => {
        if (!podcast) return;
        setIsRegeneratingText(true);
        try {
            const newTextAssets = await regenerateTextAssets(podcast.topic, podcast.knowledgeBaseText || '', podcast.creativeFreedom, log, apiKeys.gemini);
            setPodcast(p => p ? { ...p, ...newTextAssets } : null);
        } catch (err: any) {
            setError(err.message || 'Ошибка при обновлении текста.');
            log({ type: 'error', message: 'Ошибка при регенерации текста', data: err });
        } finally {
            setIsRegeneratingText(false);
        }
    };
    
    const handleRegenerateImages = async () => {
        if (!podcast) return;
        setIsRegeneratingImages(true);
        try {
            const newImages = await generateStyleImages(podcast.imagePrompts, log, apiKeys.gemini, apiKeys.openRouter);
            const newThumbnails = newImages.length > 0 ? await generateYoutubeThumbnails(newImages[0], podcast.title, log) : [];
            setPodcast(p => p ? { ...p, generatedImages: newImages, youtubeThumbnails: newThumbnails } : null);
        } catch (err: any) {
            setError(err.message || 'Ошибка при генерации изображений.');
            log({ type: 'error', message: 'Ошибка при регенерации изображений', data: err });
        } finally {
            setIsRegeneratingImages(false);
        }
    };

    const handleRegenerateAllAudio = async () => {
        if (!podcast) return;
        setIsRegeneratingAudio(true);
        log({ type: 'info', message: 'Начало переозвучки всех глав.' });
    
        for (let i = 0; i < podcast.chapters.length; i++) {
            const chapter = podcast.chapters[i];
            if (chapter.script && chapter.script.length > 0) {
                setPodcast(p => {
                    if (!p) return null;
                    const updatedChapters = p.chapters.map(c => c.id === chapter.id ? { ...c, status: 'audio_generating' } : c);
                    return { ...p, chapters: updatedChapters };
                });
    
                try {
                    const audioBlob = await generatePodcastDialogueAudio(chapter.script, podcast.characters, log, apiKeys.gemini);
                    setPodcast(p => {
                        if (!p) return null;
                        const updatedChapters = p.chapters.map(c => c.id === chapter.id ? { ...c, status: 'completed', audioBlob } : c);
                        return { ...p, chapters: updatedChapters };
                    });
                } catch (err: any) {
                    log({ type: 'error', message: `Ошибка при переозвучке главы ${i + 1}`, data: err });
                    setPodcast(p => {
                        if (!p) return null;
                        const updatedChapters = p.chapters.map(c => c.id === chapter.id ? { ...c, status: 'error', error: err.message || 'Ошибка озвучки' } : c);
                        return { ...p, chapters: updatedChapters };
                    });
                }
            }
        }
    
        log({ type: 'info', message: 'Переозвучка всех глав завершена.' });
        setIsRegeneratingAudio(false);
    };

    const renderPodcastStudio = () => {
        if (!podcast) return null;
        const allChaptersDone = podcast.chapters.every(c => c.status === 'completed');
        const isQueueActive = !allChaptersDone && podcast.chapters.some(c => c.status !== 'error');


        return (
            <div className="w-full max-w-5xl mx-auto">
                <header className="text-center mb-8 p-6 bg-gray-800/50 rounded-2xl border border-gray-700">
                    <h2 className="text-3xl md:text-4xl font-bold text-white">{podcast.title}</h2>
                    <p className="text-gray-300 mt-2">{podcast.description}</p>
                </header>
                
                {podcast.characters && podcast.characters.length > 0 && (
                    <div className="mb-8 p-6 bg-gray-800/50 rounded-2xl border border-gray-700">
                        <h3 className="text-xl font-bold text-white flex items-center gap-3 mb-4"><UserCircleIcon /> Персонажи</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {podcast.characters.map((char) => (
                                <div key={char.name} className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                                    <p className="font-bold text-teal-400 text-lg">{char.name}</p>
                                    <p className="text-gray-300 italic text-sm">{char.description}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                
                <div className="space-y-4 mb-8">
                    {isQueueActive && (
                        <div className="flex justify-end mb-4">
                            <button
                                onClick={() => setIsGenerationPaused(prev => !prev)}
                                className="flex items-center gap-2 px-4 py-2 bg-yellow-600/80 text-white font-bold rounded-lg hover:bg-yellow-700/80 transition-colors"
                            >
                                {isGenerationPaused ? <PlayIcon className="w-5 h-5" /> : <PauseIcon className="w-5 h-5" />}
                                {isGenerationPaused ? 'Возобновить генерацию' : 'Приостановить генерацию'}
                            </button>
                        </div>
                    )}
                    {podcast.chapters.map((chapter, index) => (
                        <div key={chapter.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-4 flex-grow min-w-0">
                                <ChapterIcon className="w-6 h-6 text-teal-400 flex-shrink-0" />
                                <div className="flex-grow">
                                    <h4 className="font-bold text-white truncate">{chapter.title || `Глава ${index + 1}`}</h4>
                                    <p className="text-xs text-gray-400">
                                        Статус: <span className={`font-semibold ${
                                            chapter.status === 'completed' ? 'text-green-400' :
                                            chapter.status === 'pending' ? 'text-gray-400' :
                                            chapter.status === 'error' ? 'text-red-400' : 'text-yellow-400 animate-pulse'
                                        }`}>{chapter.status}</span>
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                {(chapter.status === 'script_generating' || chapter.status === 'audio_generating' || (chapter.status === 'pending' && isGeneratingChapter && !isGenerationPaused)) && <Spinner className="w-5 h-5"/>}
                                {chapter.status === 'completed' && audioUrls[chapter.id] && <audio src={audioUrls[chapter.id]} controls className="h-8 w-72"/>}
                                {(chapter.status === 'error' || chapter.status === 'completed') && (
                                    <button 
                                        onClick={() => handleGenerateChapter(chapter.id)} 
                                        className={`p-1.5 rounded-full ${chapter.status === 'error' ? 'text-red-400 bg-red-900/50 hover:bg-red-900' : 'text-blue-400 bg-blue-900/50 hover:bg-blue-900'}`}
                                        title="Повторить генерацию"
                                    >
                                        <RedoIcon className="w-4 h-4"/>
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
                 <div className="mb-8 p-6 bg-gray-800/50 rounded-2xl border border-gray-700">
                    <h3 className="text-xl font-bold text-white flex items-center gap-3 mb-4"><WrenchIcon /> Инструменты</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <button onClick={handleRegenerateText} disabled={isRegeneratingText} className="flex flex-col items-center justify-center gap-2 p-4 bg-gray-700/80 rounded-lg hover:bg-gray-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors">
                            {isRegeneratingText ? <Spinner className="w-6 h-6"/> : <ScriptIcon />}
                            <span className="font-semibold text-sm">Обновить текст</span>
                        </button>
                        <button onClick={handleRegenerateImages} disabled={isRegeneratingImages} className="flex flex-col items-center justify-center gap-2 p-4 bg-gray-700/80 rounded-lg hover:bg-gray-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors">
                            {isRegeneratingImages ? <Spinner className="w-6 h-6"/> : <ImageIcon />}
                            <span className="font-semibold text-sm">Новые изображения</span>
                        </button>
                        <button onClick={handleRegenerateAllAudio} disabled={isRegeneratingAudio} className="flex flex-col items-center justify-center gap-2 p-4 bg-gray-700/80 rounded-lg hover:bg-gray-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors">
                            {isRegeneratingAudio ? <Spinner className="w-6 h-6"/> : <SpeakerWaveIcon />}
                            <span className="font-semibold text-sm">Переозвучить всё</span>
                        </button>
                        <button onClick={handleRegenerateProject} disabled={isLoading} className="flex flex-col items-center justify-center gap-2 p-4 bg-red-900/50 rounded-lg hover:bg-red-900/80 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors text-red-300">
                            <RedoIcon />
                            <span className="font-semibold text-sm">Пересоздать проект</span>
                        </button>
                    </div>
                </div>

                {(podcast.generatedImages && podcast.generatedImages.length > 0) && (
                    <div className="mb-8 p-6 bg-gray-800/50 rounded-2xl border border-gray-700">
                        <h3 className="text-xl font-bold text-white flex items-center gap-3 mb-4"><ImageIcon /> Визуальные материалы</h3>
                        
                        {podcast.youtubeThumbnails && podcast.youtubeThumbnails.length > 0 && (
                            <div className="mb-8">
                                <h4 className="font-semibold text-lg text-gray-200 mb-4">Варианты обложек для YouTube</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                    {podcast.youtubeThumbnails.map((thumb) => (
                                        <div key={thumb.styleName} className="group relative">
                                            <p className="text-center font-semibold text-gray-300 mb-2">{thumb.styleName}</p>
                                            <img src={thumb.dataUrl} alt={`YouTube Thumbnail - ${thumb.styleName}`} className="rounded-lg border-2 border-teal-500" />
                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 rounded-lg">
                                                <button onClick={() => handleEditThumbnail(thumb)} className="flex items-center gap-2 px-4 py-2 bg-white/20 text-white text-sm font-bold rounded-lg hover:bg-white/30 backdrop-blur-sm"><EditIcon className="w-4 h-4"/> Редактировать</button>
                                                <a href={thumb.dataUrl} download={`thumbnail_${thumb.styleName.replace(/\s/g, '_')}_${podcast.topic.replace(/[^a-z0-9а-яё]/gi, '_')}.png`} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-bold rounded-lg hover:bg-teal-700"><DownloadIcon className="w-4 h-4"/> Скачать</a>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        
                        <h4 className="font-semibold text-lg text-gray-200 mb-4 border-t border-gray-700 pt-6">Сгенерированные изображения</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {podcast.generatedImages.map((imgSrc, index) => (
                                 <div key={index}>
                                     <h4 className="font-semibold text-gray-300 mb-2">Изображение {index + 1}</h4>
                                     <img src={imgSrc} alt={`Generated image ${index + 1}`} className="rounded-lg w-full aspect-video object-cover" />
                                     <a href={imgSrc} download={`image_${index + 1}_${podcast.topic.replace(/[^a-z0-9а-яё]/gi, '_')}.jpeg`} className="mt-2 inline-block px-4 py-2 bg-gray-600 text-white text-sm font-bold rounded-lg hover:bg-gray-700">Скачать</a>
                                 </div>
                            ))}
                        </div>
                    </div>
                )}
                
                <div className="mb-8 p-6 bg-gray-800/50 rounded-2xl border border-gray-700">
                     <h3 className="text-xl font-bold text-white flex items-center gap-3 mb-4"><ScriptIcon /> Текстовые материалы</h3>
                     <div className="space-y-4">
                        <CopyableField label="Название для YouTube" value={podcast.title} />
                        <CopyableField label="Описание для YouTube" value={podcast.description} isTextarea />
                        <CopyableField label="Теги для YouTube" value={podcast.seoKeywords.join(', ')} />
                        {podcast.knowledgeBaseText && (
                            <div className="pt-2">
                                <button
                                    onClick={() => setIsSourceModalOpen(true)}
                                    className="flex items-center gap-2 text-sm text-teal-400 hover:text-teal-300"
                                >
                                    <BookOpenIcon className="w-5 h-5" />
                                    Посмотреть использованный источник
                                </button>
                            </div>
                        )}
                        <CopyableField label="Полный сценарий для ручной озвучки" value={podcast.manualTtsScript || 'Генерация сценария...'} isTextarea />
                     </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 mt-8">
                    <button onClick={handleCombineAndDownload} disabled={!allChaptersDone || isLoading} className="flex-1 flex items-center justify-center gap-3 px-8 py-4 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-all">
                        <DownloadIcon /> {allChaptersDone ? "Собрать и скачать финальный подкаст" : `Завершите ${podcast.chapters.filter(c => c.status !== 'completed').length} глав`}
                    </button>
                    <button onClick={() => setPodcast(null)} className="flex-1 px-8 py-4 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-700">Начать новый проект</button>
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 font-sans p-4 sm:p-6 lg:p-8">
            <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
                <button onClick={() => setIsApiKeyModalOpen(true)} className="p-2 bg-gray-700/50 text-white rounded-lg hover:bg-gray-600/50 flex items-center gap-2"><KeyIcon /></button>
                <button onClick={() => setIsLogVisible(true)} className="px-4 py-2 bg-gray-700/50 text-white rounded-lg hover:bg-gray-600/50 flex items-center gap-2"><JournalIcon />Журнал</button>
            </div>
            {isLogVisible && (
                <div className="fixed inset-0 bg-black/60 z-40 flex justify-end" onClick={() => setIsLogVisible(false)}>
                    <div className="w-full max-w-2xl h-full bg-gray-800 shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center p-4 border-b border-gray-700">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2"><JournalIcon/>Журнал запросов</h3>
                            <button onClick={() => setIsLogVisible(false)} className="text-gray-400 hover:text-white"><CloseIcon/></button>
                        </div>
                        <div className="flex-grow p-4 overflow-y-auto text-sm font-mono">
                            {logs.map((entry, index) => (
                                <div key={index} className="border-b border-gray-700/50 py-2">
                                    <p className={`${entry.type === 'error' && 'text-red-400'} ${entry.type === 'info' && 'text-blue-300'} ${entry.type === 'request' && 'text-yellow-300'} ${entry.type === 'response' && 'text-green-300'}`}>
                                        <span className="font-bold">{entry.type.toUpperCase()}:</span> {new Date(entry.timestamp).toLocaleTimeString()} - {entry.message}
                                    </p>
                                    {entry.data && <pre className="text-gray-400 text-xs whitespace-pre-wrap bg-gray-900 p-2 rounded mt-1 overflow-x-auto"><code>{typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data, null, 2)}</code></pre>}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            {isEditorOpen && editingThumbnail && podcast?.generatedImages && (
                <ThumbnailEditor
                    thumbnail={editingThumbnail}
                    baseImageSrc={podcast.generatedImages[0]}
                    onSave={handleSaveThumbnail}
                    onClose={() => setIsEditorOpen(false)}
                />
            )}
            {isApiKeyModalOpen && (
                <ApiKeyModal
                    currentKeys={apiKeys}
                    onSave={handleSaveApiKeys}
                    onClose={() => setIsApiKeyModalOpen(false)}
                />
            )}
             {isSourceModalOpen && podcast?.knowledgeBaseText && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsSourceModalOpen(false)}>
                    <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-3xl h-full max-h-[80vh] flex flex-col border border-gray-700" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center p-4 border-b border-gray-700">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2"><BookOpenIcon /> Использованный источник</h3>
                            <button onClick={() => setIsSourceModalOpen(false)} className="text-gray-400 hover:text-white"><CloseIcon/></button>
                        </div>
                        <div className="p-6 overflow-y-auto">
                            <pre className="text-gray-300 whitespace-pre-wrap font-sans">{podcast.knowledgeBaseText}</pre>
                        </div>
                    </div>
                </div>
            )}
            <div className="max-w-7xl mx-auto">
                <header className="text-center mb-10"><h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight"><span className="bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-blue-500">Студия Подкастов с ИИ</span></h1></header>
                <main className="flex justify-center items-start">
                    {isLoading ? <div className="text-center p-8"><Spinner className="w-16 h-16 mb-6 mx-auto" /><h2 className="text-2xl font-bold text-white mb-2">Генерация...</h2><p className="text-lg text-teal-300 animate-pulse">{loadingStep}</p></div> : 
                     error ? <div className="text-center p-8 bg-red-900/50 border border-red-700 rounded-lg"><h3 className="text-2xl font-bold text-red-300">Произошла ошибка</h3><p className="mt-2 text-red-200">{error}</p><button onClick={() => { setError(null); setIsLoading(false); }} className="mt-4 px-6 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700">Попробовать снова</button></div> : 
                     podcast ? renderPodcastStudio() : (
                        <div className="w-full max-w-4xl mx-auto flex flex-col items-center">
                            <p className="text-center text-lg text-gray-400 mb-6">Введите название будущего подкаста/видео, соберите базу знаний и настройте параметры генерации.</p>
                            <div className="w-full flex flex-col sm:flex-row gap-2 mb-8">
                                <input 
                                    type="text" 
                                    value={projectTitleInput} 
                                    onChange={(e) => setProjectTitleInput(e.target.value)} 
                                    placeholder="Название проекта (видео), например: 'Тайна перевала Дятлова'" 
                                    className="flex-grow bg-gray-800 border border-gray-600 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-teal-500" 
                                />
                            </div>

                            <div className="w-full bg-gray-800/50 border border-gray-700 rounded-2xl p-6 mb-8">
                                <h3 className="text-2xl font-bold text-white mb-4">Источник Знаний для Проекта</h3>
                                <p className="text-gray-400 mb-4 text-sm">
                                    Эта база знаний используется <span className="font-bold text-yellow-300">только для текущего проекта</span>.
                                    Вы можете вставить свой текст или пополнить базу с помощью Google.
                                    Если оставить поле пустым, ИИ будет использовать Google Search во время генерации.
                                </p>
                                <textarea
                                    value={knowledgeBaseText}
                                    onChange={(e) => setKnowledgeBaseText(e.target.value)}
                                    placeholder="Вставьте сюда свой текст или используйте поиск Google ниже..."
                                    className="w-full h-40 bg-gray-900 border border-gray-600 rounded-md p-3 text-gray-200 mb-4"
                                />
                                <div className="border-t border-gray-600 pt-4">
                                    <h4 className="font-semibold text-lg text-gray-200 mb-2">Пополнить с помощью Google</h4>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={googleSearchQuestion}
                                            onChange={(e) => setGoogleSearchQuestion(e.target.value)}
                                            placeholder="Задайте вопрос для поиска..."
                                            className="flex-grow bg-gray-900 border border-gray-600 rounded-lg px-4 py-2 text-white"
                                            disabled={isGoogling}
                                        />
                                        <button onClick={handleGoogleSearchAndAdd} disabled={isGoogling || !googleSearchQuestion} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:bg-gray-500 w-44 text-center transition-colors">
                                            {isGoogling ? <Spinner className="w-5 h-5 mx-auto"/> : "Найти и добавить"}
                                        </button>
                                    </div>
                                </div>
                            </div>


                            <div className="w-full bg-gray-800/50 border border-gray-700 rounded-2xl p-6 mb-8">
                                <h3 className="text-2xl font-bold text-white mb-4">Настройки генерации</h3>
                                <div className="space-y-6">
                                    <div>
                                        <label className="flex items-center text-lg text-gray-200 cursor-pointer">
                                            <input type="checkbox" checked={creativeFreedom} onChange={(e) => setCreativeFreedom(e.target.checked)} className="mr-3 h-5 w-5 rounded bg-gray-700 border-gray-600 text-teal-600 focus:ring-teal-500" />
                                            Творческая свобода (Стиль Кинга/Лавкрафта)
                                        </label>
                                        <p className="text-sm text-gray-400 ml-8">Если включено, ИИ будет использовать факты как основу для художественного рассказа. Если выключено — создаст строгий документальный подкаст.</p>
                                    </div>
                                    <div>
                                        <label className="block text-lg font-medium text-gray-200 mb-2">
                                            Желаемая длительность: <span className="font-bold text-teal-400">{totalDurationMinutes} минут</span>
                                        </label>
                                        <input
                                            type="range"
                                            min="10"
                                            max="240"
                                            step="5"
                                            value={totalDurationMinutes}
                                            onChange={(e) => setTotalDurationMinutes(Number(e.target.value))}
                                            className="w-full"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="w-full flex flex-col sm:flex-row gap-2 mb-8">
                                 <button onClick={() => handleStartProject(projectTitleInput)} disabled={isLoading || !projectTitleInput} className="w-full px-8 py-4 bg-teal-600 text-white text-xl font-bold rounded-lg hover:bg-teal-700 transition-all disabled:bg-gray-500 disabled:cursor-not-allowed">Начать проект</button>
                            </div>
                           
                            <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                                {sampleArticles.map(article => <div key={article.title} className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6 hover:border-teal-500 hover:bg-gray-800 transition-all cursor-pointer" onClick={() => setProjectTitleInput(article.topic)}><h3 className="text-xl font-bold text-white">{article.title}</h3></div>)}
                            </div>

                            {history.length > 0 && (
                                <div className="w-full mt-12 border-t border-gray-700 pt-8">
                                    <div className="flex justify-between items-center mb-6">
                                        <div className="flex items-center gap-3">
                                            <HistoryIcon className="w-8 h-8 text-teal-400" />
                                            <h2 className="text-2xl font-bold text-white">История проектов</h2>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-right">
                                                <label className="flex items-center text-sm text-gray-300 cursor-pointer whitespace-nowrap">
                                                    <input
                                                        type="checkbox"
                                                        checked={saveMediaInHistory}
                                                        onChange={(e) => setSaveMediaInHistory(e.target.checked)}
                                                        className="mr-2 h-4 w-4 rounded bg-gray-700 border-gray-600 text-teal-600 focus:ring-teal-500 focus:ring-offset-gray-800 focus:ring-2"
                                                    />
                                                    Сохранять медиа в историю
                                                </label>
                                                <p className="text-xs text-gray-500 mt-1">Внимание: может привести к переполнению хранилища.</p>
                                            </div>
                                            <button onClick={() => { setHistory([]); localStorage.removeItem('podcastHistory'); }} className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 flex-shrink-0">
                                                <TrashIcon className="w-5 h-5" />
                                                Очистить
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-4">{history.map(item => <div key={item.id} onClick={() => setPodcast(item)} className="bg-gray-800/70 p-4 rounded-lg flex justify-between items-center cursor-pointer hover:bg-gray-800"><p className="font-semibold text-white truncate pr-4">{item.topic}</p><button className="text-teal-400 hover:text-teal-200 text-sm font-bold flex-shrink-0">Просмотр</button></div>)}</div>
                                </div>
                            )}
                        </div>
                     )}
                </main>
            </div>
        </div>
    );
};

export default App;