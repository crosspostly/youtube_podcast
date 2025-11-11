import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { Podcast, YoutubeThumbnail, LogEntry, NarrationMode, Voice } from './types';
import Spinner from './components/Spinner';
import ThumbnailEditor from './components/ThumbnailEditor';
import ApiKeyModal from './components/ApiKeyModal';
import PodcastTest from './components/PodcastTest';
import { HistoryIcon, TrashIcon, JournalIcon, CloseIcon, ChapterIcon, RedoIcon, CombineIcon, DownloadIcon, ImageIcon, CopyIcon, CheckIcon, ScriptIcon, EditIcon, KeyIcon, UserCircleIcon, PauseIcon, PlayIcon, BookOpenIcon, WrenchIcon, SpeakerWaveIcon, LanguageIcon, SubtitleIcon, SearchIcon, BeakerIcon } from './components/Icons';
import { PodcastProvider, usePodcastContext } from './context/PodcastContext';
import { googleSearchForKnowledge, previewVoice } from './services/ttsService';
import { initDB, getVoiceFromCache, saveVoiceToCache } from './services/dbService';

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

const VOICES: Voice[] = [
    { id: 'Zephyr', name: 'Zephyr', description: 'Bright (яркий)', gender: 'female' },
    { id: 'Puck', name: 'Puck', description: 'Upbeat (энергичный)', gender: 'male' },
    { id: 'Charon', name: 'Charon', description: 'Informative (информативный)', gender: 'male' },
    { id: 'Kore', name: 'Kore', description: 'Firm (уверенный)', gender: 'female' },
    { id: 'Fenrir', name: 'Fenrir', description: 'Excitable (возбужденный)', gender: 'male' },
    { id: 'Leda', name: 'Leda', description: 'Youthful (молодой)', gender: 'female' },
    { id: 'Orus', name: 'Orus', description: 'Firm (уверенный)', gender: 'male' },
    { id: 'Aoede', name: 'Aoede', description: 'Breezy (легкий)', gender: 'female' },
    { id: 'Callirrhoe', name: 'Callirrhoe', description: 'Easy-going (спокойный)', gender: 'female' },
    { id: 'Autonoe', name: 'Autonoe', description: 'Bright (яркий)', gender: 'female' },
    { id: 'Enceladus', name: 'Enceladus', description: 'Breathy (дыхательный)', gender: 'male' },
    { id: 'Iapetus', name: 'Iapetus', description: 'Clear (ясный)', gender: 'male' },
    { id: 'Umbriel', name: 'Umbriel', description: 'Easy-going (спокойный)', gender: 'male' },
    { id: 'Algieba', name: 'Algieba', description: 'Smooth (гладкий)', gender: 'male' },
    { id: 'Despina', name: 'Despina', description: 'Smooth (гладкий)', gender: 'female' },
    { id: 'Erinome', name: 'Erinome', description: 'Clear (ясный)', gender: 'female' },
    { id: 'Algenib', name: 'Algenib', description: 'Gravelly (гортанный)', gender: 'male' },
    { id: 'Rasalgethi', name: 'Rasalgethi', description: 'Informative (информативный)', gender: 'male' },
    { id: 'Laomedeia', name: 'Laomedeia', description: 'Upbeat (энергичный)', gender: 'female' },
    { id: 'Achernar', name: 'Achernar', description: 'Soft (мягкий)', gender: 'female' },
    { id: 'Alnilam', name: 'Alnilam', description: 'Firm (уверенный)', gender: 'male' },
    { id: 'Schedar', name: 'Schedar', description: 'Even (равномерный)', gender: 'male' },
    { id: 'Gacrux', name: 'Gacrux', description: 'Mature (зрелый)', gender: 'female' },
    { id: 'Pulcherrima', name: 'Pulcherrima', description: 'Forward (прямой)', gender: 'female' },
    { id: 'Achird', name: 'Achird', description: 'Friendly (дружественный)', gender: 'male' },
    { id: 'Zubenelgenubi', name: 'Zubenelgenubi', description: 'Casual (неформальный)', gender: 'male' },
    { id: 'Vindemiatrix', name: 'Vindemiatrix', description: 'Gentle (мягкий)', gender: 'female' },
    { id: 'Sadachbia', name: 'Sadachbia', description: 'Lively (оживленный)', gender: 'male' },
    { id: 'Sadaltager', name: 'Sadaltager', description: 'Knowledgeable (знающий)', gender: 'male' },
    { id: 'Sulafat', name: 'Sulafat', description: 'Warm (теплый)', gender: 'female' }
];


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
            <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-1">{icon}{label}</label>
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

interface PodcastStudioAppProps {
    apiKeys: { gemini: string; openRouter: string };
    isLogVisible: boolean;
    onCloseLog: () => void;
    defaultFont: string;
}

const PodcastStudioApp: React.FC<PodcastStudioAppProps> = ({ apiKeys, isLogVisible, onCloseLog, defaultFont }) => {
    const {
        podcast, setPodcast, isLoading, loadingStep, error, setError,
        logs, log, history, setHistory, clearHistory, saveMediaInHistory, setSaveMediaInHistory,
        audioUrls, isGenerationPaused, setIsGenerationPaused,
        isRegeneratingText, isRegeneratingImages, isRegeneratingAudio,
        regeneratingImageIndex, isGeneratingMoreImages,
        editingThumbnail, setEditingThumbnail,
        startNewProject, handleGenerateChapter, combineAndDownload,
        saveThumbnail, regenerateProject, regenerateText,
        regenerateImages, regenerateAllAudio, regenerateSingleImage,
        generateMoreImages, handleTitleSelection, handleBgSelection,
        manualTtsScript, subtitleText
    } = usePodcastContext();

    const [projectTitleInput, setProjectTitleInput] = useState<string>('');
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [isTestPanelVisible, setIsTestPanelVisible] = useState<boolean>(false);
    const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
    
    const [knowledgeBaseText, setKnowledgeBaseText] = useState('');
    const [googleSearchQuestion, setGoogleSearchQuestion] = useState('');
    const [isGoogling, setIsGoogling] = useState(false);
    const [creativeFreedom, setCreativeFreedom] = useState(true);
    const [totalDurationMinutes, setTotalDurationMinutes] = useState(40);
    const [language, setLanguage] = useState('Русский');
    
    const [narrationMode, setNarrationMode] = useState<NarrationMode>('dialogue');
    const [characterVoices, setCharacterVoices] = useState<{ [key: string]: string }>({ character1: 'Puck', character2: 'Zephyr' });
    const [monologueVoice, setMonologueVoice] = useState<string>('Puck');
    const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const [voiceFilter, setVoiceFilter] = useState<'all' | 'male' | 'female'>('all');
    const activeBlobUrls = useRef<Map<string, string>>(new Map());

    const [langSearchTerm, setLangSearchTerm] = useState('');
    const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
    const langDropdownRef = useRef<HTMLDivElement>(null);
    
    const filteredLanguages = useMemo(() => 
        languages.filter(l => l.name.toLowerCase().includes(langSearchTerm.toLowerCase())),
    [langSearchTerm]);

    const filteredVoices = useMemo(() => {
        if (voiceFilter === 'all') return VOICES;
        return VOICES.filter(v => v.gender === voiceFilter);
    }, [voiceFilter]);

    useEffect(() => {
        initDB();
        
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
            const answer = await googleSearchForKnowledge(googleSearchQuestion, log, apiKeys.gemini);
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
        if (previewingVoice || !audioRef.current) return;

        const playAudio = (blob: Blob) => {
            if (!audioRef.current) return;

            if (activeBlobUrls.current.has(voiceId)) {
                URL.revokeObjectURL(activeBlobUrls.current.get(voiceId)!);
            }

            const url = URL.createObjectURL(blob);
            activeBlobUrls.current.set(voiceId, url);

            audioRef.current.src = url;
            audioRef.current.play();
            audioRef.current.onended = () => setPreviewingVoice(null);
            audioRef.current.onerror = () => {
                log({ type: 'error', message: `Ошибка воспроизведения аудио для голоса ${voiceId}`});
                setPreviewingVoice(null);
            };
        };

        setPreviewingVoice(voiceId);

        try {
            const cachedBlob = await getVoiceFromCache(voiceId);
            if (cachedBlob) {
                log({ type: 'info', message: `Голос ${voiceId} загружен из кэша.` });
                playAudio(cachedBlob);
                return;
            }

            log({ type: 'info', message: `Голос ${voiceId} не найден в кэше. Генерация...` });
            const selectedLanguageCode = languages.find(l => l.name === language)?.code || 'ru';
            const generatedBlob = await previewVoice(voiceId, selectedLanguageCode, log, apiKeys.gemini);
            
            await saveVoiceToCache(voiceId, generatedBlob);
            log({ type: 'info', message: `Голос ${voiceId} сохранен в кэш.` });
            
            playAudio(generatedBlob);
        } catch (err: any) {
            setError(`Не удалось воспроизвести голос: ${err.message}`);
            log({ type: 'error', message: `Ошибка предпрослушивания голоса ${voiceId}`, data: err });
            setPreviewingVoice(null);
        }
    };

    const handleEditThumbnail = (thumbnail: YoutubeThumbnail) => {
        setEditingThumbnail(thumbnail);
        setIsEditorOpen(true);
    };

    const handleSaveThumbnail = (updatedThumbnail: YoutubeThumbnail) => {
        saveThumbnail(updatedThumbnail);
        setIsEditorOpen(false);
        setEditingThumbnail(null);
    };

    const handleStartProjectClick = () => {
        startNewProject(projectTitleInput, knowledgeBaseText, creativeFreedom, language, totalDurationMinutes, narrationMode, characterVoices, monologueVoice);
    };

    const renderPodcastStudio = () => {
        if (!podcast) return null;
        const allChaptersDone = podcast.chapters.every(c => c.status === 'completed');
        const isQueueActive = !allChaptersDone && podcast.chapters.some(c => c.status !== 'error');


        return (
            <div className="w-full max-w-5xl mx-auto">
                <header className="text-center mb-8 p-6 bg-gray-800/50 rounded-2xl border border-gray-700">
                    <h2 className="text-3xl md:text-4xl font-bold text-white">{podcast.selectedTitle}</h2>
                    <p className="text-gray-300 mt-2">{podcast.description}</p>
                </header>

                {podcast.characters && podcast.characters.length > 0 && (
                    <div className="mb-8 p-6 bg-gray-800/50 rounded-2xl border border-gray-700">
                        <h3 className="text-xl font-bold text-white flex items-center gap-3 mb-4"><UserCircleIcon /> Персонажи и голоса</h3>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {podcast.characters.map((char) => (
                                <div key={char.name} className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                                    <p className="font-bold text-teal-400 text-lg">{char.name}</p>
                                    <p className="text-gray-300 italic text-sm mb-2">{char.description}</p>
                                     <p className="text-xs text-gray-400">Голос: <span className="font-semibold text-teal-300">{podcast.characterVoices[char.name] || 'Не назначен'}</span></p>
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
                                {(chapter.status === 'script_generating' || chapter.status === 'audio_generating') && <Spinner className="w-5 h-5"/>}
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
                        <button onClick={regenerateText} disabled={isRegeneratingText} className="flex flex-col items-center justify-center gap-2 p-4 bg-gray-700/80 rounded-lg hover:bg-gray-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors">
                            {isRegeneratingText ? <Spinner className="w-6 h-6"/> : <ScriptIcon />}
                            <span className="font-semibold text-sm">Обновить текст</span>
                        </button>
                        <button onClick={regenerateImages} disabled={isRegeneratingImages} className="flex flex-col items-center justify-center gap-2 p-4 bg-gray-700/80 rounded-lg hover:bg-gray-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors">
                            {isRegeneratingImages ? <Spinner className="w-6 h-6"/> : <ImageIcon />}
                            <span className="font-semibold text-sm">Новые изображения</span>
                        </button>
                        <button onClick={regenerateAllAudio} disabled={isRegeneratingAudio} className="flex flex-col items-center justify-center gap-2 p-4 bg-gray-700/80 rounded-lg hover:bg-gray-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors">
                            {isRegeneratingAudio ? <Spinner className="w-6 h-6"/> : <SpeakerWaveIcon />}
                            <span className="font-semibold text-sm">Переозвучить всё</span>
                        </button>
                        <button onClick={regenerateProject} disabled={isLoading} className="flex flex-col items-center justify-center gap-2 p-4 bg-red-900/50 rounded-lg hover:bg-red-900/80 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors text-red-300">
                            <RedoIcon />
                            <span className="font-semibold text-sm">Пересоздать проект</span>
                        </button>
                    </div>
                </div>

                {(podcast.generatedImages && podcast.generatedImages.length > 0) && (
                    <div className="mb-8 p-6 bg-gray-800/50 rounded-2xl border border-gray-700">
                         <div className="mb-8">
                            <h4 className="text-xl font-bold text-white flex items-center gap-3 mb-4"><ImageIcon /> Галерея Фонов</h4>
                            <p className="text-sm text-gray-400 mb-4">Нажмите на изображение, чтобы выбрать его в качестве активного фона для всех вариантов обложек.</p>
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                 {podcast.generatedImages.map((imgSrc, index) => (
                                     <div key={index} className="group relative cursor-pointer" onClick={() => handleBgSelection(index)}>
                                        <img src={imgSrc} alt={`Generated background ${index + 1}`} className={`rounded-lg w-full aspect-video object-cover transition-all border-4 ${podcast.selectedBgIndex === index ? 'border-teal-500' : 'border-transparent'}`} />
                                         {podcast.selectedBgIndex === index && (
                                            <div className="absolute top-2 right-2 bg-teal-600 text-white text-xs font-bold px-2 py-1 rounded">Активный фон</div>
                                         )}
                                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 rounded-lg">
                                             <button onClick={(e) => { e.stopPropagation(); regenerateSingleImage(index); }} disabled={regeneratingImageIndex !== null} className="p-2 bg-white/20 rounded-full text-white hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed" title="Пересоздать это изображение"><RedoIcon /></button>
                                             <a href={imgSrc} download={`image_${index + 1}_${podcast.topic.replace(/[^a-z0-9а-яё]/gi, '_')}.jpeg`} onClick={e => e.stopPropagation()} className="p-2 bg-teal-600 rounded-full text-white hover:bg-teal-700" title="Скачать"><DownloadIcon /></a>
                                         </div>
                                         {regeneratingImageIndex === index && (
                                            <div className="absolute inset-0 bg-gray-900/80 rounded-lg flex items-center justify-center"><Spinner /></div>
                                         )}
                                     </div>
                                ))}
                            </div>
                            <div className="text-center mt-4">
                                <button
                                    onClick={generateMoreImages}
                                    disabled={isGeneratingMoreImages}
                                    className="flex items-center justify-center gap-2 mx-auto px-4 py-2 bg-teal-600/80 text-white font-bold rounded-lg hover:bg-teal-700/80 transition-colors disabled:bg-gray-500"
                                >
                                    {isGeneratingMoreImages ? <Spinner className="w-5 h-5"/> : <ImageIcon className="w-5 h-5"/>}
                                    <span>Сгенерировать ещё 5</span>
                                </button>
                            </div>
                        </div>
                        
                        {podcast.youtubeThumbnails && podcast.youtubeThumbnails.length > 0 && (
                            <div className="border-t border-gray-700 pt-6">
                                <div className="mb-8">
                                    <h4 className="text-lg font-semibold text-gray-200 flex items-center gap-3 mb-4"><SubtitleIcon /> Выбор заголовка для обложки</h4>
                                    <div className="space-y-3">
                                        {podcast.youtubeTitleOptions.map((title, index) => (
                                            <label key={index} className="flex items-center p-3 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-700/50 transition-colors border border-transparent has-[:checked]:border-teal-500 has-[:checked]:bg-teal-900/20">
                                                <input
                                                    type="radio"
                                                    name="title-option"
                                                    value={title}
                                                    checked={podcast.selectedTitle === title}
                                                    onChange={() => handleTitleSelection(title)}
                                                    className="h-5 w-5 mr-4 text-teal-600 bg-gray-700 border-gray-600 focus:ring-teal-500"
                                                />
                                                <span className="text-gray-200">{title}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <h4 className="font-semibold text-lg text-gray-200 mb-4">Варианты обложек от AI-дизайнера</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                        {podcast.youtubeThumbnails.map((thumb) => (
                                            <div key={thumb.styleName} className="group relative">
                                                <p className="text-center font-semibold text-gray-300 mb-2">{thumb.styleName}</p>
                                                <img src={thumb.dataUrl} alt={`YouTube Thumbnail - ${thumb.styleName}`} className="rounded-lg border-2 border-teal-500/50" />
                                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 rounded-lg">
                                                    <button onClick={() => handleEditThumbnail(thumb)} className="flex items-center gap-2 px-4 py-2 bg-white/20 text-white text-sm font-bold rounded-lg hover:bg-white/30 backdrop-blur-sm"><EditIcon className="w-4 h-4"/> Редактировать</button>
                                                    <a href={thumb.dataUrl} download={`thumbnail_${thumb.styleName.replace(/\s/g, '_')}_${podcast.selectedTitle.replace(/[^a-z0-9а-яё]/gi, '_')}.png`} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-bold rounded-lg hover:bg-teal-700"><DownloadIcon className="w-4 h-4"/> Скачать</a>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
                
                <div className="mb-8 p-6 bg-gray-800/50 rounded-2xl border border-gray-700">
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
                                    className="flex items-center gap-2 text-sm text-teal-400 hover:text-teal-300"
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
                    <button onClick={combineAndDownload} disabled={!allChaptersDone || isLoading} className="flex-1 flex items-center justify-center gap-3 px-8 py-4 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-all">
                        <DownloadIcon /> {allChaptersDone ? "Собрать и скачать финальный подкаст" : `Завершите ${podcast.chapters.filter(c => c.status !== 'completed').length} глав`}
                    </button>
                    <button onClick={() => setPodcast(null)} className="flex-1 px-8 py-4 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-700">Начать новый проект</button>
                </div>
            </div>
        );
    };

    return (
        <>
            <audio ref={audioRef} className="hidden" />
            {isTestPanelVisible && <PodcastTest apiKeys={apiKeys} onClose={() => setIsTestPanelVisible(false)} />}
            {isLogVisible && (
                <div className="fixed inset-0 bg-black/60 z-40 flex justify-end" onClick={onCloseLog}>
                    <div className="w-full max-w-2xl h-full bg-gray-800 shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center p-4 border-b border-gray-700">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2"><JournalIcon/>Журнал запросов</h3>
                            <button onClick={onCloseLog} className="text-gray-400 hover:text-white"><CloseIcon/></button>
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
                    baseImageSrc={podcast.generatedImages[podcast.selectedBgIndex || 0]}
                    onSave={handleSaveThumbnail}
                    onClose={() => setIsEditorOpen(false)}
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
                     error ? <div className="text-center p-8 bg-red-900/50 border border-red-700 rounded-lg"><h3 className="text-2xl font-bold text-red-300">Произошла ошибка</h3><p className="mt-2 text-red-200">{error}</p><button onClick={() => { setError(null); }} className="mt-4 px-6 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700">Попробовать снова</button></div> : 
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
                                    <div ref={langDropdownRef}>
                                        <label className="block text-lg font-medium text-gray-200 mb-2">Язык генерации</label>
                                        <div className="relative">
                                            <button 
                                                onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)} 
                                                className="w-full bg-gray-900 border border-gray-600 rounded-md p-2 text-white text-left"
                                            >
                                                {language}
                                            </button>
                                            {isLangDropdownOpen && (
                                                <div className="absolute z-10 top-full mt-1 w-full bg-gray-800 border border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto">
                                                    <div className="p-2 sticky top-0 bg-gray-800">
                                                        <div className="relative">
                                                             <input 
                                                                type="text"
                                                                placeholder="Поиск языка..."
                                                                value={langSearchTerm}
                                                                onChange={e => setLangSearchTerm(e.target.value)}
                                                                className="w-full bg-gray-700 border border-gray-500 rounded-md py-1.5 pl-8 pr-2 text-white"
                                                            />
                                                            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
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
                                                                className="px-4 py-2 text-white hover:bg-teal-600 cursor-pointer"
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
                            
                            <div className="w-full bg-gray-800/50 border border-gray-700 rounded-2xl p-6 mb-8">
                                <h3 className="text-2xl font-bold text-white mb-4">Настройки озвучки</h3>
                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-lg font-medium text-gray-200 mb-2">Режим озвучки</label>
                                        <div className="flex gap-4">
                                            <label className="flex items-center text-gray-200 cursor-pointer"><input type="radio" name="narrationMode" value="dialogue" checked={narrationMode === 'dialogue'} onChange={() => setNarrationMode('dialogue')} className="mr-2 h-4 w-4 bg-gray-700 border-gray-600 text-teal-600 focus:ring-teal-500"/>Диалог</label>
                                            <label className="flex items-center text-gray-200 cursor-pointer"><input type="radio" name="narrationMode" value="monologue" checked={narrationMode === 'monologue'} onChange={() => setNarrationMode('monologue')} className="mr-2 h-4 w-4 bg-gray-700 border-gray-600 text-teal-600 focus:ring-teal-500"/>Монолог</label>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-lg font-medium text-gray-200 mb-2">Фильтр голосов</label>
                                        <div className="flex gap-2 rounded-lg bg-gray-900 p-1">
                                            <button onClick={() => setVoiceFilter('all')} className={`flex-1 px-3 py-1 text-sm rounded-md transition-colors ${voiceFilter === 'all' ? 'bg-teal-600 text-white font-semibold' : 'text-gray-300 hover:bg-gray-700'}`}>Все</button>
                                            <button onClick={() => setVoiceFilter('male')} className={`flex-1 px-3 py-1 text-sm rounded-md transition-colors ${voiceFilter === 'male' ? 'bg-teal-600 text-white font-semibold' : 'text-gray-300 hover:bg-gray-700'}`}>Мужские</button>
                                            <button onClick={() => setVoiceFilter('female')} className={`flex-1 px-3 py-1 text-sm rounded-md transition-colors ${voiceFilter === 'female' ? 'bg-teal-600 text-white font-semibold' : 'text-gray-300 hover:bg-gray-700'}`}>Женские</button>
                                        </div>
                                    </div>
                                    
                                    {narrationMode === 'monologue' && (
                                        <div>
                                            <label className="block text-lg font-medium text-gray-200 mb-2">Голос рассказчика</label>
                                            <div className="flex items-center gap-4">
                                                <select value={monologueVoice} onChange={e => setMonologueVoice(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-md p-2 text-white">
                                                    {filteredVoices.map(v => <option key={v.id} value={v.id}>{v.name} ({v.description})</option>)}
                                                </select>
                                                <button onClick={() => handlePreviewVoice(monologueVoice)} disabled={!!previewingVoice} className="p-2 bg-teal-600 rounded-full text-white hover:bg-teal-700 disabled:bg-gray-500">
                                                    {previewingVoice === monologueVoice ? <Spinner className="w-5 h-5"/> : <PlayIcon className="w-5 h-5"/>}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    {narrationMode === 'dialogue' && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div>
                                                <label className="block text-lg font-medium text-gray-200 mb-2">Голос персонажа 1</label>
                                                <div className="flex items-center gap-4">
                                                    <select value={characterVoices.character1} onChange={e => setCharacterVoices(p => ({...p, character1: e.target.value}))} className="w-full bg-gray-900 border border-gray-600 rounded-md p-2 text-white">
                                                        {filteredVoices.map(v => <option key={v.id} value={v.id}>{v.name} ({v.description})</option>)}
                                                    </select>
                                                    <button onClick={() => handlePreviewVoice(characterVoices.character1)} disabled={!!previewingVoice} className="p-2 bg-teal-600 rounded-full text-white hover:bg-teal-700 disabled:bg-gray-500">
                                                        {previewingVoice === characterVoices.character1 ? <Spinner className="w-5 h-5"/> : <PlayIcon className="w-5 h-5"/>}
                                                    </button>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-lg font-medium text-gray-200 mb-2">Голос персонажа 2</label>
                                                <div className="flex items-center gap-4">
                                                    <select value={characterVoices.character2} onChange={e => setCharacterVoices(p => ({...p, character2: e.target.value}))} className="w-full bg-gray-900 border border-gray-600 rounded-md p-2 text-white">
                                                        {filteredVoices.map(v => <option key={v.id} value={v.id}>{v.name} ({v.description})</option>)}
                                                    </select>
                                                    <button onClick={() => handlePreviewVoice(characterVoices.character2)} disabled={!!previewingVoice} className="p-2 bg-teal-600 rounded-full text-white hover:bg-teal-700 disabled:bg-gray-500">
                                                         {previewingVoice === characterVoices.character2 ? <Spinner className="w-5 h-5"/> : <PlayIcon className="w-5 h-5"/>}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="w-full flex flex-col sm:flex-row items-center gap-4 mb-8">
                                 <button onClick={handleStartProjectClick} disabled={isLoading || !projectTitleInput} className="w-full px-8 py-4 bg-teal-600 text-white text-xl font-bold rounded-lg hover:bg-teal-700 transition-all disabled:bg-gray-500 disabled:cursor-not-allowed">Начать проект</button>
                                 <button onClick={() => setIsTestPanelVisible(true)} className="flex items-center justify-center gap-2 px-6 py-4 bg-gray-700/80 text-white font-bold rounded-lg hover:bg-gray-700 transition-colors flex-shrink-0">
                                    <BeakerIcon className="w-6 h-6"/>
                                    <span>Тест AI-дизайнера</span>
                                 </button>
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
                                            <button onClick={clearHistory} className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 flex-shrink-0">
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
        </>
    );
}

const App: React.FC = () => {
    const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
    const [isLogVisible, setIsLogVisible] = useState(false);
    const [apiKeys, setApiKeys] = useState({ gemini: '', openRouter: '' });
    const [defaultFont, setDefaultFont] = useState('Impact');

    useEffect(() => {
        try {
            const storedGeminiKey = localStorage.getItem('geminiApiKey') || '';
            const storedOpenRouterKey = localStorage.getItem('openRouterProviderKey') || '';
            const storedFont = localStorage.getItem('channelDefaultFont') || 'Impact';
            setApiKeys({ gemini: storedGeminiKey, openRouter: storedOpenRouterKey });
            setDefaultFont(storedFont);
        } catch (e) { console.error("Failed to load settings from localStorage", e); }
    }, []);

    const handleSaveSettings = (data: { keys: { gemini: string; openRouter: string }, defaultFont: string }) => {
        setApiKeys(data.keys);
        setDefaultFont(data.defaultFont);
        localStorage.setItem('geminiApiKey', data.keys.gemini);
        localStorage.setItem('openRouterProviderKey', data.keys.openRouter);
        localStorage.setItem('channelDefaultFont', data.defaultFont);
    };

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 font-sans p-4 sm:p-6 lg:p-8">
             <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
                <button onClick={() => setIsLogVisible(true)} className="p-2 bg-gray-700/50 text-white rounded-lg hover:bg-gray-600/50 flex items-center gap-2"><JournalIcon /></button>
                <button onClick={() => setIsApiKeyModalOpen(true)} className="p-2 bg-gray-700/50 text-white rounded-lg hover:bg-gray-600/50 flex items-center gap-2"><KeyIcon /></button>
            </div>
             {isApiKeyModalOpen && (
                <ApiKeyModal
                    currentKeys={apiKeys}
                    currentFont={defaultFont}
                    onSave={handleSaveSettings}
                    onClose={() => setIsApiKeyModalOpen(false)}
                />
            )}
            <PodcastProvider apiKeys={apiKeys} defaultFont={defaultFont}>
                <PodcastStudioApp 
                    apiKeys={apiKeys} 
                    isLogVisible={isLogVisible} 
                    onCloseLog={() => setIsLogVisible(false)}
                    defaultFont={defaultFont}
                />
            </PodcastProvider>
        </div>
    );
};

export default App;
