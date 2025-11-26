import React, { useState, useMemo, useEffect, useRef } from 'react';
import { NarrationMode, Voice, DetailedContentIdea, QueuedProject } from '../types';
import { usePodcastContext } from '../context/PodcastContext';
import { googleSearchForKnowledge, generateContentPlan } from '../services/aiTextService';
import { previewVoice } from '../services/aiAudioService';
import { getVoiceFromCache, saveVoiceToCache } from '../services/dbService';
import { useAvailableVoices } from '../hooks/useAvailableVoices';
import Spinner from './Spinner';
import { HistoryIcon, TrashIcon, SearchIcon, PlayIcon, PauseIcon, BeakerIcon, ImageIcon, LightbulbIcon, CheckIcon, CloseIcon, DownloadIcon } from './Icons';

interface ProjectSetupProps {
    onStartProject: (
        topic: string, 
        knowledgeBaseText: string, 
        creativeFreedom: boolean, 
        language: string, 
        totalDurationMinutes: number, 
        narrationMode: NarrationMode, 
        characterVoices: { [key: string]: string }, 
        monologueVoice: string, 
        initialImageCount: number,
        imageSource: 'ai' | 'stock'
    ) => void;
    onOpenDesignerTest: () => void;
    onOpenMusicTest: () => void;
    onOpenSfxTest: () => void;
}

const sampleArticles = [
  { topic: "Секреты и теории заговора вокруг Зоны 51", title: "Зона 51: Что скрывает секретная база?" },
  { topic: "История с привидениями в Доме Винчестеров", title: "Проклятие дома Винчестеров" },
  { topic: "Таинственные исчезновения в Беннингтонском треугольнике, Вермонт", title: "Исчезновения в Беннингтонском треугольнике" },
  { topic: "Паранормальная активность на Ранчо Скинуокер", title: "Ранчо Скинуокер: Портал в другие миры?" }
];

const languages: { code: string; name: string }[] = [
    { code: "ru", name: "Русский" }, { code: "en", name: "English" }, { code: "es", name: "Español" }, 
    { code: "zh-CN", name: "中文 (简体)" }, { code: "hi", name: "हिन्दी" }, { code: "ar", name: "العربية" }, 
    { code: "pt", name: "Português" }, { code: "bn", name: "বাংলা" }, { code: "fr", name: "Français" }, 
    { code: "de", name: "Deutsch" }, { code: "ja", name: "日本語" }, { code: "pa", name: "ਪੰਜਾਬੀ" }, 
    { code: "jv", name: "Basa Jawa" }, { code: "te", name: "తెలుగు" }, { code: "ko", name: "한국어" }, 
    { code: "tr", name: "Türkçe" }, { code: "ta", name: "தமிழ்" }, { code: "vi", name: "Tiếng Việt" }, 
    { code: "mr", name: "मराठी" }, { code: "it", name: "Italiano" }, { code: "pl", name: "Polski" }, 
    { code: "uk", name: "Українська" }, { code: "nl", name: "Nederlands" }, { code: "el", name: "Ελληνικά" }, 
    { code: "he", name: "עברית" }, { code: "sv", name: "Svenska" }, { code: "fi", name: "Suomi" }, 
    { code: "id", name: "Bahasa Indonesia" }, { code: "ms", name: "Bahasa Melayu" }, { code: "th", name: "ไทย" }, 
    { code: "ro", name: "Română" }, { code: "hu", name: "Magyar" }, { code: "cs", name: "Čeština" },
    { code: "da", name: "Dansk" }, { code: "no", name: "Norsk" }
];


const ProjectSetup: React.FC<ProjectSetupProps> = ({ onStartProject, onOpenDesignerTest, onOpenMusicTest, onOpenSfxTest }) => {
    const {
        isLoading, log, setError,
        history, setPodcast: setPodcastInHistory, clearHistory,
        saveMediaInHistory, setSaveMediaInHistory, startQuickTest,
        startContentPipeline, projectQueue, completedPodcasts, isQueueRunning,
        downloadAllCompletedProjects, isBatchExporting,
    } = usePodcastContext();
    
    const [projectTitleInput, setProjectTitleInput] = useState<string>('');
    const [knowledgeBaseText, setKnowledgeBaseText] = useState('');
    const [googleSearchQuestion, setGoogleSearchQuestion] = useState('');
    const [isGoogling, setIsGoogling] = useState(false);
    const [creativeFreedom, setCreativeFreedom] = useState(true);
    const [totalDurationMinutes, setTotalDurationMinutes] = useState(40);
    const [language, setLanguage] = useState('English');
    const [initialImageCount, setInitialImageCount] = useState(3);
    const [imageSource, setImageSource] = useState<'ai' | 'stock'>('ai');
    const [contentPlanCount, setContentPlanCount] = useState(3);
    
    const [narrationMode, setNarrationMode] = useState<NarrationMode>('dialogue');
    // Default to 'auto' so the AI suggestions take precedence
    const [characterVoices, setCharacterVoices] = useState<{ [key: string]: string }>({ character1: 'auto', character2: 'auto' });
    const [monologueVoice, setMonologueVoice] = useState<string>('Puck');
    const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const [voiceFilter, setVoiceFilter] = useState<'all' | 'male' | 'female'>('all');
    const activeBlobUrls = useRef<Map<string, string>>(new Map());

    const [langSearchTerm, setLangSearchTerm] = useState('');
    const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
    const langDropdownRef = useRef<HTMLDivElement>(null);
    
    const isAnythingLoading = isLoading || isQueueRunning;

    // Dynamic voices hook
    const { voices, loading: voicesLoading, error: voicesError, refreshVoices } = useAvailableVoices(log);

    const filteredLanguages = useMemo(() => 
        languages.filter(l => l.name.toLowerCase().includes(langSearchTerm.toLowerCase())),
    [langSearchTerm]);

    const filteredVoices = useMemo(() => {
        if (voiceFilter === 'all') return voices;
        return voices.filter(v => v.gender === voiceFilter);
    }, [voices, voiceFilter]);
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (langDropdownRef.current && !langDropdownRef.current.contains(event.target as Node)) {
                setIsLangDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        
        const urls = activeBlobUrls.current;

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            urls.forEach(url => URL.revokeObjectURL(url));
        };
    }, []);

    const handleGoogleSearchAndAdd = async () => {
        if (!googleSearchQuestion.trim()) return;
        setIsGoogling(true);
        setError(null);
        try {
            const answer = await googleSearchForKnowledge(googleSearchQuestion, log);
            const addition = `\n\n---\nИсточник по вопросу: "${googleSearchQuestion}"\n${answer}\n---\n`;
            setKnowledgeBaseText(prev => prev.trim() + addition);
            setGoogleSearchQuestion('');
        } catch (err: any) {
            setError(err.message || 'Ошибка при поиске в Google.');
            log({type: 'error', message: 'Ошибка при поиске в Google', data: err});
        } finally {
            setIsGoogling(false);
        }
    };
    
    const handlePreviewVoice = async (voiceId: string) => {
        if (previewingVoice || !audioRef.current || voiceId === 'auto') return;

        const playAudio = (blob: Blob) => {
            if (!audioRef.current) return;
            const audio = audioRef.current;

            if (activeBlobUrls.current.has(voiceId)) {
                URL.revokeObjectURL(activeBlobUrls.current.get(voiceId)!);
            }
            const url = URL.createObjectURL(blob);
            activeBlobUrls.current.set(voiceId, url);
            
            audio.pause();
            audio.src = url;

            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    log({ type: 'error', message: `Ошибка воспроизведения аудио для голоса ${voiceId}`, data: error });
                    setPreviewingVoice(null);
                });
            }
        };

        setPreviewingVoice(voiceId);

        audioRef.current.onended = () => setPreviewingVoice(null);
        audioRef.current.onerror = () => {
             log({ type: 'error', message: `Ошибка воспроизведения аудио для голоса ${voiceId}`});
             setPreviewingVoice(null);
        };

        try {
            const cachedBlob = await getVoiceFromCache(voiceId);
            if (cachedBlob) {
                log({ type: 'info', message: `Голос ${voiceId} загружен из кэша.` });
                playAudio(cachedBlob);
                return;
            }

            log({ type: 'info', message: `Голос ${voiceId} не найден в кэше. Генерация...` });
            const selectedLanguageCode = languages.find(l => l.name === language)?.code || 'ru';
            const generatedBlob = await previewVoice(voiceId, selectedLanguageCode, log);
            
            await saveVoiceToCache(voiceId, generatedBlob);
            log({ type: 'info', message: `Голос ${voiceId} сохранен в кэш.` });
            
            playAudio(generatedBlob);
        } catch (err: any) {
            setError(`Не удалось воспроизвести голос: ${err.message}`);
            log({ type: 'error', message: `Ошибка предпрослушивания голоса ${voiceId}`, data: err });
            setPreviewingVoice(null);
        }
    };

    const handleStartProjectClick = () => {
        onStartProject(projectTitleInput, knowledgeBaseText, creativeFreedom, language, totalDurationMinutes, narrationMode, characterVoices, monologueVoice, initialImageCount, imageSource);
    };

    const handleStartPipeline = () => {
        startContentPipeline(contentPlanCount, {
            language,
            totalDuration: totalDurationMinutes,
            narrationMode,
            creativeFreedom,
            imagesPerChapter: initialImageCount,
            imageSource
        });
    };

    const getStatusIcon = (status: QueuedProject['status']) => {
        switch(status) {
            case 'pending': return <div className="w-5 h-5 rounded-full border-2 border-slate-500" title="В очереди"></div>;
            case 'in_progress': return <Spinner className="w-5 h-5" title="В работе" />;
            case 'completed': return <CheckIcon className="w-6 h-6 text-green-400" title="Завершено" />;
            case 'error': return <CloseIcon className="w-6 h-6 text-red-400" title="Ошибка" />;
        }
    }

    // Функция для автоматического отзыва URL-адресов после загрузки
    const revokeUrlAfterDownload = (url: string) => {
        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 100);
    };



    return (
        <div className="w-full max-w-4xl mx-auto flex flex-col items-center">
            <audio ref={audioRef} className="hidden" />
            <p className="text-center text-lg text-slate-400 mb-6">Введите название будущего подкаста/видео, соберите базу знаний и настройте параметры генерации.</p>
            <div className="w-full flex flex-col sm:flex-row gap-2 mb-8">
                <input 
                    type="text" 
                    value={projectTitleInput} 
                    onChange={(e) => setProjectTitleInput(e.target.value)} 
                    placeholder="Название проекта (видео), например: 'Тайна перевала Дятлова'" 
                    className="flex-grow bg-slate-900 border border-slate-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-500" 
                />
            </div>

            <div className="w-full bg-slate-900/60 border border-slate-700 rounded-2xl p-6 mb-8 shadow-2xl shadow-black/20 backdrop-blur-lg">
                <h3 className="text-2xl font-bold text-white mb-4">Источник Знаний для Проекта</h3>
                <p className="text-slate-400 mb-4 text-sm">
                    Эта база знаний используется <span className="font-bold text-yellow-300">только для текущего проекта</span>.
                    Вы можете вставить свой текст или пополнить базу с помощью Google.
                    Если оставить поле пустым, ИИ будет использовать Google Search во время генерации.
                </p>
                <textarea
                    value={knowledgeBaseText}
                    onChange={(e) => setKnowledgeBaseText(e.target.value)}
                    placeholder="Вставьте сюда свой текст или используйте поиск Google ниже..."
                    className="w-full h-40 bg-slate-950 border border-slate-700 rounded-md p-3 text-slate-200 mb-4"
                />
                <div className="border-t border-slate-700 pt-4">
                    <h4 className="font-semibold text-lg text-slate-200 mb-2">Пополнить с помощью Google</h4>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={googleSearchQuestion}
                            onChange={(e) => setGoogleSearchQuestion(e.target.value)}
                            placeholder="Задайте вопрос для поиска..."
                            className="flex-grow bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-white"
                            disabled={isGoogling}
                        />
                        <button onClick={handleGoogleSearchAndAdd} disabled={isGoogling || !googleSearchQuestion} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 disabled:bg-slate-500 w-44 text-center transition-colors">
                            {isGoogling ? <Spinner className="w-5 h-5 mx-auto"/> : "Найти и добавить"}
                        </button>
                    </div>
                </div>
            </div>

             <div className="w-full bg-slate-900/60 border border-slate-700 rounded-2xl p-6 mb-8 shadow-2xl shadow-black/20 backdrop-blur-lg">
                <div className="flex flex-col sm:flex-row items-center justify-between mb-4 gap-4">
                    <h3 className="text-2xl font-bold text-white flex items-center gap-3"><LightbulbIcon /> Контент-фабрика</h3>
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col items-end">
                             <label className="text-xs text-slate-400 mb-1">Кол-во видео: <span className="font-bold text-cyan-400">{contentPlanCount}</span></label>
                             <input
                                type="range"
                                min="1"
                                max="10"
                                step="1"
                                value={contentPlanCount}
                                onChange={(e) => setContentPlanCount(Number(e.target.value))}
                                className="w-32 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                        <button onClick={handleStartPipeline} disabled={isAnythingLoading} className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-bold rounded-lg hover:from-teal-400 hover:to-cyan-500 disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-wait">
                            {isQueueRunning ? <Spinner className="w-5 h-5" /> : <LightbulbIcon className="w-5 h-5" />}
                            <span>Запустить Контент-Конвейер</span>
                        </button>
                    </div>
                </div>
                 <p className="text-slate-400 mb-4 text-sm">
                    Нажмите кнопку, чтобы ИИ сгенерировал детальный план для {contentPlanCount} видео (используя текущие настройки языка и озвучки ниже) и автоматически поставил их в очередь на создание.
                </p>
                {projectQueue.length > 0 && (
                    <div className="mt-6 border-t border-slate-700 pt-4">
                        <h4 className="text-lg font-semibold text-white mb-3">Очередь Производства</h4>
                        <div className="space-y-2">
                            {projectQueue.map((item) => (
                                <div key={item.id} className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
                                    <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
                                        {getStatusIcon(item.status)}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-slate-300 truncate">{item.title}</p>
                                        <p className="text-xs text-slate-500">{item.language}, {item.narrationMode}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        
                        {/* Batch Export Button */}
                        {completedPodcasts.size > 0 && (
                            <div className="mt-6 border-t border-slate-700 pt-4">
                                <button
                                    onClick={() => downloadAllCompletedProjects(Array.from(completedPodcasts.values()), log)}
                                    disabled={isBatchExporting || completedPodcasts.size === 0}
                                    className="w-full px-6 py-4 bg-gradient-to-r from-teal-600 to-cyan-700 hover:from-teal-500 hover:to-cyan-600 text-white font-bold rounded-xl transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                                >
                                    {isBatchExporting ? (
                                        <>
                                            <Spinner className="w-5 h-5" />
                                            <span>Упаковка проектов...</span>
                                        </>
                                    ) : (
                                        <>
                                            <DownloadIcon className="w-6 h-6" />
                                            <span>📦 Скачать все проекты ({completedPodcasts.size})</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="w-full bg-slate-900/60 border border-slate-700 rounded-2xl p-6 mb-8 shadow-2xl shadow-black/20 backdrop-blur-lg">
                <h3 className="text-2xl font-bold text-white mb-4">Настройки генерации</h3>
                <div className="space-y-6">
                    <div ref={langDropdownRef}>
                        <label className="block text-lg font-medium text-slate-200 mb-2">Язык генерации</label>
                        <div className="relative">
                            <button 
                                onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)} 
                                className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 text-white text-left"
                            >
                                {language}
                            </button>
                            {isLangDropdownOpen && (
                                <div className="absolute z-10 top-full mt-1 w-full bg-slate-800 border border-slate-700 rounded-md shadow-lg max-h-60 overflow-y-auto">
                                    <div className="p-2 sticky top-0 bg-slate-800">
                                        <div className="relative">
                                                <input 
                                                type="text"
                                                placeholder="Поиск языка..."
                                                value={langSearchTerm}
                                                onChange={e => setLangSearchTerm(e.target.value)}
                                                className="w-full bg-slate-700 border border-slate-500 rounded-md py-1.5 pl-8 pr-2 text-white"
                                            />
                                            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
                                        </div>
                                    </div>
                                    <ul>
                                        {filteredLanguages.map(lang => (
                                            <li 
                                                key={lang.code}
                                                onClick={() => {
                                                    setLanguage(lang.name);
                                                    setIsLangDropdownOpen(false);
                                                    setLangSearchTerm('');
                                                }}
                                                className="px-4 py-2 text-white hover:bg-cyan-600 cursor-pointer"
                                            >
                                                {lang.name}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                    <div>
                        <label className="flex items-center text-lg text-slate-200 cursor-pointer">
                            <input type="checkbox" checked={creativeFreedom} onChange={(e) => setCreativeFreedom(e.target.checked)} className="mr-3 h-5 w-5 rounded bg-slate-700 border-slate-600 text-cyan-600 focus:ring-cyan-500" />
                            Творческая свобода (Стиль Кинга/Лавкрафта)
                        </label>
                        <p className="text-sm text-slate-400 ml-8">Если включено, ИИ будет использовать факты как основу для художественного рассказа. Если выключено — создаст строгий документальный подкаст.</p>
                    </div>
                     <div>
                        <label className="block text-lg font-medium text-slate-200 mb-2">Источник фоновых изображений</label>
                         <div className="flex gap-2 rounded-lg bg-slate-900 p-1">
                            <button onClick={() => setImageSource('ai')} className={`flex-1 px-3 py-1 text-sm rounded-md transition-colors flex items-center justify-center gap-2 ${imageSource === 'ai' ? 'bg-cyan-600 text-white font-semibold' : 'text-slate-300 hover:bg-slate-700'}`}>
                                <BeakerIcon className="w-5 h-5" /> AI Генерация
                            </button>
                            <button onClick={() => setImageSource('stock')} className={`flex-1 px-3 py-1 text-sm rounded-md transition-colors flex items-center justify-center gap-2 ${imageSource === 'stock' ? 'bg-cyan-600 text-white font-semibold' : 'text-slate-300 hover:bg-slate-700'}`}>
                                <ImageIcon className="w-5 h-5" /> Стоковые Фото
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-lg font-medium text-slate-200 mb-2">
                            Желаемая длительность: <span className="font-bold text-cyan-400">{totalDurationMinutes} минут</span>
                        </label>
                        <input
                            type="range"
                            min="1"
                            max="240"
                            step="1"
                            value={totalDurationMinutes}
                            onChange={(e) => setTotalDurationMinutes(Number(e.target.value))}
                            className="w-full"
                        />
                    </div>
                        <div>
                        <label className="block text-lg font-medium text-slate-200 mb-2">
                            Количество картинок на главу: <span className="font-bold text-cyan-400">{initialImageCount}</span>
                        </label>
                        <input
                            type="range"
                            min="1"
                            max="15"
                            step="1"
                            value={initialImageCount}
                            onChange={(e) => setInitialImageCount(Number(e.target.value))}
                            className="w-full"
                        />
                    </div>
                </div>
            </div>
            
            <div className="w-full bg-slate-900/60 border border-slate-700 rounded-2xl p-6 mb-8 shadow-2xl shadow-black/20 backdrop-blur-lg">
                <h3 className="text-2xl font-bold text-white mb-4">Настройки озвучки</h3>
                <div className="space-y-6">
                    <div>
                        <label className="block text-lg font-medium text-slate-200 mb-2">Режим озвучки</label>
                        <div className="flex gap-4">
                            <label className="flex items-center text-slate-200 cursor-pointer"><input type="radio" name="narrationMode" value="dialogue" checked={narrationMode === 'dialogue'} onChange={() => setNarrationMode('dialogue')} className="mr-2 h-4 w-4 bg-slate-700 border-slate-600 text-cyan-600 focus:ring-cyan-500"/>Диалог</label>
                            <label className="flex items-center text-slate-200 cursor-pointer"><input type="radio" name="narrationMode" value="monologue" checked={narrationMode === 'monologue'} onChange={() => setNarrationMode('monologue')} className="mr-2 h-4 w-4 bg-slate-700 border-slate-600 text-cyan-600 focus:ring-cyan-500"/>Монолог</label>
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-lg font-medium text-slate-200">Фильтр голосов</label>
                            <div className="flex items-center gap-2">
                                {voicesLoading && <Spinner className="w-4 h-4 text-cyan-400" />}
                                <button 
                                    onClick={refreshVoices} 
                                    disabled={voicesLoading}
                                    className="text-xs text-cyan-400 hover:text-cyan-300 disabled:text-slate-500"
                                    title="Обновить список голосов"
                                >
                                    🔄
                                </button>
                            </div>
                        </div>
                        {voicesError && (
                            <div className="mb-2 p-2 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">
                                Ошибка загрузки голосов: {voicesError}
                            </div>
                        )}
                        <div className="flex gap-2 rounded-lg bg-slate-900 p-1">
                            <button onClick={() => setVoiceFilter('all')} className={`flex-1 px-3 py-1 text-sm rounded-md transition-colors ${voiceFilter === 'all' ? 'bg-cyan-600 text-white font-semibold' : 'text-slate-300 hover:bg-slate-700'}`}>Все</button>
                            <button onClick={() => setVoiceFilter('male')} className={`flex-1 px-3 py-1 text-sm rounded-md transition-colors ${voiceFilter === 'male' ? 'bg-cyan-600 text-white font-semibold' : 'text-slate-300 hover:bg-slate-700'}`}>Мужские</button>
                            <button onClick={() => setVoiceFilter('female')} className={`flex-1 px-3 py-1 text-sm rounded-md transition-colors ${voiceFilter === 'female' ? 'bg-cyan-600 text-white font-semibold' : 'text-slate-300 hover:bg-slate-700'}`}>Женские</button>
                        </div>
                        {voices.length > 0 && (
                            <div className="mt-2 text-xs text-slate-400">
                                Доступно голосов: {filteredVoices.length} из {voices.length}
                            </div>
                        )}
                    </div>
                    
                    {narrationMode === 'monologue' && (
                        <div>
                            <label className="block text-lg font-medium text-slate-200 mb-2">Голос рассказчика</label>
                            <div className="flex items-center gap-4">
                                <select 
                                    value={monologueVoice} 
                                    onChange={e => setMonologueVoice(e.target.value)} 
                                    className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 text-white disabled:bg-slate-800"
                                    disabled={voicesLoading || voices.length === 0}
                                >
                                    {voicesLoading ? (
                                        <option>Загрузка голосов...</option>
                                    ) : voicesError ? (
                                        <option>Ошибка загрузки голосов</option>
                                    ) : voices.length === 0 ? (
                                        <option>Голоса не доступны</option>
                                    ) : (
                                        filteredVoices.map(v => <option key={v.id} value={v.id}>{v.name} ({v.description})</option>)
                                    )}
                                </select>
                                <button 
                                    onClick={() => handlePreviewVoice(monologueVoice)} 
                                    disabled={!!previewingVoice || voicesLoading || voices.length === 0} 
                                    className="p-2 bg-cyan-600 rounded-full text-white hover:bg-cyan-700 disabled:bg-slate-500"
                                >
                                    {previewingVoice === monologueVoice ? <Spinner className="w-5 h-5"/> : <PlayIcon className="w-5 h-5"/>}
                                </button>
                            </div>
                        </div>
                    )}
                    {narrationMode === 'dialogue' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-lg font-medium text-slate-200 mb-2">Голос персонажа 1</label>
                                <div className="flex items-center gap-4">
                                    <select 
                                        value={characterVoices.character1} 
                                        onChange={e => setCharacterVoices(p => ({...p, character1: e.target.value}))} 
                                        className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 text-white disabled:bg-slate-800"
                                        disabled={voicesLoading || voices.length === 0}
                                    >
                                        <option value="auto">✨ Автоматический (ИИ подберет сам)</option>
                                        {voicesLoading ? (
                                            <option>Загрузка голосов...</option>
                                        ) : voicesError ? (
                                            <option>Ошибка загрузки голосов</option>
                                        ) : voices.length === 0 ? (
                                            <option>Голоса не доступны</option>
                                        ) : (
                                            filteredVoices.map(v => <option key={v.id} value={v.id}>{v.name} ({v.description})</option>)
                                        )}
                                    </select>
                                    <button 
                                        onClick={() => handlePreviewVoice(characterVoices.character1)} 
                                        disabled={!!previewingVoice || characterVoices.character1 === 'auto' || voicesLoading || voices.length === 0} 
                                        className="p-2 bg-cyan-600 rounded-full text-white hover:bg-cyan-700 disabled:bg-slate-500"
                                    >
                                        {previewingVoice === characterVoices.character1 ? <Spinner className="w-5 h-5"/> : <PlayIcon className="w-5 h-5"/>}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-lg font-medium text-slate-200 mb-2">Голос персонажа 2</label>
                                <div className="flex items-center gap-4">
                                    <select 
                                        value={characterVoices.character2} 
                                        onChange={e => setCharacterVoices(p => ({...p, character2: e.target.value}))} 
                                        className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 text-white disabled:bg-slate-800"
                                        disabled={voicesLoading || voices.length === 0}
                                    >
                                        <option value="auto">✨ Автоматический (ИИ подберет сам)</option>
                                        {voicesLoading ? (
                                            <option>Загрузка голосов...</option>
                                        ) : voicesError ? (
                                            <option>Ошибка загрузки голосов</option>
                                        ) : voices.length === 0 ? (
                                            <option>Голоса не доступны</option>
                                        ) : (
                                            filteredVoices.map(v => <option key={v.id} value={v.id}>{v.name} ({v.description})</option>)
                                        )}
                                    </select>
                                    <button 
                                        onClick={() => handlePreviewVoice(characterVoices.character2)} 
                                        disabled={!!previewingVoice || characterVoices.character2 === 'auto' || voicesLoading || voices.length === 0} 
                                        className="p-2 bg-cyan-600 rounded-full text-white hover:bg-cyan-700 disabled:bg-slate-500"
                                    >
                                            {previewingVoice === characterVoices.character2 ? <Spinner className="w-5 h-5"/> : <PlayIcon className="w-5 h-5"/>}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="w-full flex flex-col sm:flex-row gap-4 mb-8">
                <button onClick={handleStartProjectClick} disabled={isAnythingLoading || !projectTitleInput} className="flex-grow w-full px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xl font-bold rounded-lg hover:from-cyan-400 hover:to-blue-500 transition-all shadow-lg shadow-cyan-500/20 hover:shadow-blue-500/30 disabled:from-slate-600 disabled:to-slate-700 disabled:shadow-none disabled:cursor-not-allowed">Начать проект</button>
                <button onClick={startQuickTest} disabled={isAnythingLoading} className="sm:w-auto w-full flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-xl font-bold rounded-lg hover:from-indigo-400 hover:to-purple-500 disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed">
                    <BeakerIcon className="w-6 h-6"/>
                    <span>Быстрый Тест</span>
                </button>
            </div>
            
            <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <button onClick={onOpenDesignerTest} className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-700 transition-colors">
                    <BeakerIcon className="w-6 h-6"/>
                    <span>Тест AI-дизайнера</span>
                </button>
                <button onClick={onOpenMusicTest} className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-700 transition-colors">
                    <BeakerIcon className="w-6 h-6"/>
                    <span>Тест Музыки</span>
                </button>
                 <button onClick={onOpenSfxTest} className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-700 transition-colors">
                    <BeakerIcon className="w-6 h-6"/>
                    <span>Тест SFX</span>
                </button>
            </div>
            
            <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                {sampleArticles.map(article => <div key={article.title} className="bg-slate-900/60 backdrop-blur-lg border border-slate-700 rounded-2xl p-6 hover:border-cyan-500/50 hover:bg-slate-800/80 transition-all cursor-pointer shadow-lg shadow-black/20" onClick={() => setProjectTitleInput(article.topic)}><h3 className="text-xl font-bold text-white">{article.title}</h3></div>)}
            </div>

            {history.length > 0 && (
                <div className="w-full mt-12 border-t border-slate-700 pt-8">
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-3">
                            <HistoryIcon className="w-8 h-8 text-cyan-400" />
                            <h2 className="text-2xl font-bold text-white">История проектов</h2>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="text-right">
                                <label className="flex items-center text-sm text-slate-300 cursor-pointer whitespace-nowrap">
                                    <input
                                        type="checkbox"
                                        checked={saveMediaInHistory}
                                        onChange={(e) => setSaveMediaInHistory(e.target.checked)}
                                        className="mr-2 h-4 w-4 rounded bg-slate-700 border-slate-600 text-cyan-600 focus:ring-cyan-500 focus:ring-offset-slate-800 focus:ring-2"
                                    />
                                    Сохранять медиа в историю
                                </label>
                                <p className="text-xs text-slate-500 mt-1">Внимание: может привести к переполнению хранилища.</p>
                            </div>
                            <button onClick={clearHistory} className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 flex-shrink-0">
                                <TrashIcon className="w-5 h-5" />
                                Очистить
                            </button>
                        </div>
                    </div>
                    <div className="space-y-4">{history.map(item => <div key={item.id} onClick={() => setPodcastInHistory(item)} className="bg-slate-800/70 p-4 rounded-lg flex justify-between items-center cursor-pointer hover:bg-slate-800"><p className="font-semibold text-white truncate pr-4">{item.topic}</p><button className="text-cyan-400 hover:text-cyan-200 text-sm font-bold flex-shrink-0">Просмотр</button></div>)}</div>
                </div>
            )}

             
        </div>
    );
};

export default ProjectSetup;