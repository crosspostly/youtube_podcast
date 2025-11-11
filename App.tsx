import React, { useState, useCallback, useEffect } from 'react';
import { generatePodcastBlueprint, generateNextChapterScript, generatePodcastDialogueAudio, combineWavBlobs } from './services/ttsService';
import { generateStyleImages, generateYoutubeThumbnail } from './services/imageService';
import type { Podcast, Chapter, LogEntry } from './types';
import Spinner from './components/Spinner';
import { HistoryIcon, TrashIcon, JournalIcon, CloseIcon, ChapterIcon, RedoIcon, CombineIcon, DownloadIcon, ImageIcon } from './components/Icons';

const sampleArticles = [
  { topic: "Секреты и теории заговора вокруг Зоны 51", title: "Зона 51: Что скрывает секретная база?" },
  { topic: "История с привидениями в Доме Винчестеров", title: "Проклятие дома Винчестеров" },
  { topic: "Таинственные исчезновения в Беннингтонском треугольнике, Вермонт", title: "Исчезновения в Беннингтонском треугольнике" },
  { topic: "Паранормальная активность на Ранчо Скинуокер", title: "Ранчо Скинуокер: Портал в другие миры?" }
];

const App: React.FC = () => {
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [loadingStep, setLoadingStep] = useState<string>('');
    const [podcast, setPodcast] = useState<Podcast | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [topicInput, setTopicInput] = useState<string>('');
    const [history, setHistory] = useState<Podcast[]>([]);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isLogVisible, setIsLogVisible] = useState<boolean>(false);
    const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});

    useEffect(() => {
        try {
            const storedHistory = localStorage.getItem('podcastHistory');
            if (storedHistory) setHistory(JSON.parse(storedHistory));
        } catch (e) { console.error("Failed to load history", e); }
    }, []);
    
    // Create/revoke blob URLs when podcast chapters change
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

    const updateHistory = (newPodcast: Podcast) => {
        const historyPodcast = JSON.parse(JSON.stringify(newPodcast));
        historyPodcast.chapters.forEach((c: Chapter) => c.audioBlob = undefined);
        const newHistory = [historyPodcast, ...history.filter(p => p.id !== newPodcast.id)];
        setHistory(newHistory);
        try {
            localStorage.setItem('podcastHistory', JSON.stringify(newHistory));
        } catch (e) { setError("Не удалось сохранить в историю: хранилище переполнено."); }
    };

    const handleStartProject = useCallback(async (topic: string) => {
        if (!topic.trim()) { setError('Введите тему.'); return; }
        setIsLoading(true);
        setError(null);
        setPodcast(null);
        setLogs([]);
        
        try {
            setLoadingStep("Создание концепции и первой главы...");
            const blueprint = await generatePodcastBlueprint(topic, log);
            
            setLoadingStep("Озвучивание первой главы...");
            const firstChapterAudio = await generatePodcastDialogueAudio(blueprint.chapters[0].script, log);
            
            setLoadingStep("Генерация изображений...");
            const generatedImages = await generateStyleImages(blueprint.imagePrompts, log);
            
            setLoadingStep("Создание обложки для YouTube...");
            const youtubeThumbnail = generatedImages.length > 0 ? await generateYoutubeThumbnail(generatedImages[0], blueprint.title, log) : null;
            
            const newPodcast: Podcast = {
                ...blueprint,
                chapters: [{ ...blueprint.chapters[0], status: 'completed', audioBlob: firstChapterAudio }],
                generatedImages: generatedImages || [],
                youtubeThumbnail: youtubeThumbnail || undefined,
            };

            // Add pending chapters to reach a total of 6
            const TOTAL_CHAPTERS = 6;
            for (let i = 1; i < TOTAL_CHAPTERS; i++) {
                newPodcast.chapters.push({
                    id: crypto.randomUUID(),
                    title: `Глава ${i + 1}`,
                    script: [],
                    status: 'pending',
                });
            }

            setPodcast(newPodcast);
            updateHistory(newPodcast);

        } catch (err: any) {
            setError(err.message || 'Произошла неизвестная ошибка при создании проекта.');
            log({ type: 'error', message: 'Критическая ошибка при инициализации проекта', data: err });
        } finally {
            setIsLoading(false);
            setLoadingStep('');
        }
    }, [log, history]);

    const handleGenerateChapter = useCallback(async (chapterId: string) => {
        if (!podcast) return;
    
        const chapterIndex = podcast.chapters.findIndex(c => c.id === chapterId);
        if (chapterIndex === -1) return;

        const updateChapterStatus = (id: string, status: Chapter['status'], data: Partial<Chapter> = {}) => {
            setPodcast(p => p ? ({
                ...p,
                chapters: p.chapters.map(c => c.id === id ? { ...c, status, ...data, error: data.error || undefined } : c)
            }) : null);
        };
    
        try {
            updateChapterStatus(chapterId, 'script_generating');
            const chapterScriptData = await generateNextChapterScript(podcast.topic, podcast.title, podcast.chapters.slice(0, chapterIndex), chapterIndex, log);
            
            updateChapterStatus(chapterId, 'audio_generating', { script: chapterScriptData.script, title: chapterScriptData.title });
            const audioBlob = await generatePodcastDialogueAudio(chapterScriptData.script, log);
    
            updateChapterStatus(chapterId, 'completed', { audioBlob });

        } catch (err: any) {
            const errorMessage = err.message || 'Неизвестная ошибка при генерации главы.';
            log({type: 'error', message: `Ошибка при генерации главы ${chapterIndex + 1}`, data: err});
            updateChapterStatus(chapterId, 'error', { error: errorMessage });
        }

    }, [podcast, log]);

    useEffect(() => {
      if (podcast) {
        updateHistory(podcast);
      }
    }, [podcast]);


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
            a.download = `${podcast.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.wav`;
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
    
    const renderPodcastStudio = () => {
        if (!podcast) return null;
        const allChaptersDone = podcast.chapters.every(c => c.status === 'completed');

        return (
            <div className="w-full max-w-5xl mx-auto">
                <header className="text-center mb-8 p-6 bg-gray-800/50 rounded-2xl border border-gray-700">
                    <h2 className="text-3xl md:text-4xl font-bold text-white">{podcast.title}</h2>
                    <p className="text-gray-300 mt-2">{podcast.description}</p>
                </header>
                
                <div className="space-y-4 mb-8">
                    {podcast.chapters.map((chapter, index) => (
                        <div key={chapter.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <ChapterIcon className="w-6 h-6 text-teal-400 flex-shrink-0" />
                                <div>
                                    <h4 className="font-bold text-white">{chapter.title || `Глава ${index + 1}`}</h4>
                                    <p className="text-xs text-gray-400">
                                        Статус: <span className={`font-semibold ${
                                            chapter.status === 'completed' ? 'text-green-400' :
                                            chapter.status === 'pending' ? 'text-gray-400' :
                                            chapter.status === 'error' ? 'text-red-400' : 'text-yellow-400 animate-pulse'
                                        }`}>{chapter.status}</span>
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {chapter.status === 'pending' && <button onClick={() => handleGenerateChapter(chapter.id)} className="px-3 py-1 text-sm bg-blue-600 rounded hover:bg-blue-700">Создать</button>}
                                {(chapter.status === 'script_generating' || chapter.status === 'audio_generating') && <Spinner className="w-5 h-5"/>}
                                {chapter.status === 'completed' && audioUrls[chapter.id] && <audio src={audioUrls[chapter.id]} controls className="h-8 w-48"/>}
                                {chapter.status === 'error' && <button onClick={() => handleGenerateChapter(chapter.id)} className="p-1.5 text-red-400 bg-red-900/50 rounded-full hover:bg-red-900"><RedoIcon className="w-4 h-4"/></button>}
                            </div>
                        </div>
                    ))}
                </div>

                {podcast.generatedImages && podcast.generatedImages.length > 0 && (
                    <div className="mt-8 p-6 bg-gray-800/50 rounded-2xl border border-gray-700">
                        <h3 className="text-xl font-bold text-white flex items-center gap-3 mb-4"><ImageIcon /> Визуальные материалы</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {podcast.youtubeThumbnail && (
                                <div className="md:col-span-2">
                                    <h4 className="font-semibold text-lg text-gray-200 mb-2">Обложка для YouTube</h4>
                                    <img src={podcast.youtubeThumbnail} alt="YouTube Thumbnail" className="rounded-lg border-2 border-teal-500" />
                                    <a href={podcast.youtubeThumbnail} download={`thumbnail_${podcast.title.replace(/[^a-z0-9]/gi, '_')}.png`} className="mt-2 inline-block px-4 py-2 bg-teal-600 text-white text-sm font-bold rounded-lg hover:bg-teal-700">Скачать обложку</a>
                                </div>
                            )}
                            {podcast.generatedImages.map((imgSrc, index) => (
                                 <div key={index}>
                                     <h4 className="font-semibold text-gray-300 mb-2">Изображение {index + 1}</h4>
                                     <img src={imgSrc} alt={`Generated image ${index + 1}`} className="rounded-lg w-full aspect-video object-cover" />
                                     <a href={imgSrc} download={`image_${index + 1}_${podcast.title.replace(/[^a-z0-9]/gi, '_')}.jpeg`} className="mt-2 inline-block px-4 py-2 bg-gray-600 text-white text-sm font-bold rounded-lg hover:bg-gray-700">Скачать изображение</a>
                                 </div>
                            ))}
                        </div>
                    </div>
                )}


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
            <div className="absolute top-4 right-4 z-50">
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
            <div className="max-w-7xl mx-auto">
                <header className="text-center mb-10"><h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight"><span className="bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-blue-500">Студия Подкастов с ИИ</span></h1></header>
                <main className="flex justify-center items-start">
                    {isLoading ? <div className="text-center p-8"><Spinner className="w-16 h-16 mb-6 mx-auto" /><h2 className="text-2xl font-bold text-white mb-2">Генерация...</h2><p className="text-lg text-teal-300 animate-pulse">{loadingStep}</p></div> : 
                     error ? <div className="text-center p-8 bg-red-900/50 border border-red-700 rounded-lg"><h3 className="text-2xl font-bold text-red-300">Произошла ошибка</h3><p className="mt-2 text-red-200">{error}</p><button onClick={() => setError(null)} className="mt-4 px-6 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700">Попробовать снова</button></div> : 
                     podcast ? renderPodcastStudio() : (
                        <div className="w-full max-w-4xl mx-auto flex flex-col items-center">
                            <p className="text-center text-lg text-gray-400 mb-6">Введите тему, чтобы начать создание длинного подкаста по частям.</p>
                            <div className="w-full flex flex-col sm:flex-row gap-2 mb-8">
                                <input type="text" value={topicInput} onChange={(e) => setTopicInput(e.target.value)} placeholder="Например, 'История Римской Империи'" className="flex-grow bg-gray-800 border border-gray-600 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                                <button onClick={() => handleStartProject(topicInput)} disabled={isLoading} className="px-8 py-3 bg-teal-600 text-white font-bold rounded-lg hover:bg-teal-700 transition-all disabled:bg-gray-500">Начать проект</button>
                            </div>
                            <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                                {sampleArticles.map(article => <div key={article.title} className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6 hover:border-teal-500 hover:bg-gray-800 transition-all cursor-pointer" onClick={() => setTopicInput(article.topic)}><h3 className="text-xl font-bold text-white">{article.title}</h3></div>)}
                            </div>
                            {history.length > 0 && (
                                <div className="w-full mt-12 border-t border-gray-700 pt-8">
                                    <div className="flex justify-between items-center mb-6">
                                    <div className="flex items-center gap-3"><HistoryIcon className="w-8 h-8 text-teal-400" /><h2 className="text-2xl font-bold text-white">История проектов</h2></div>
                                    <button onClick={() => {setHistory([]); localStorage.removeItem('podcastHistory');}} className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300"><TrashIcon className="w-5 h-5" />Очистить</button>
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
