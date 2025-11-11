import React, { useState, useCallback } from 'react';
import { generateScriptPackage, generatePodcastAudio } from './services/geminiService';
import type { PodcastPackage } from './types';
import Spinner from './components/Spinner';
import { TitleIcon, DescriptionIcon, ScriptIcon, PromptsIcon, SourcesIcon } from './components/Icons';

const sampleArticles = [
  {
    title: "Зона 51: Что скрывает секретная база?",
    description: "Исследуйте теории заговора и известные факты о самой загадочной военной базе в США.",
    topic: "Секреты и теории заговора вокруг Зоны 51"
  },
  {
    title: "Проклятие дома Винчестеров",
    description: "Погрузитесь в историю Сары Винчестер и ее бесконечного дома, построенного для призраков.",
    topic: "История с привидениями в Доме Винчестеров"
  },
  {
    title: "Исчезновения в Беннингтонском треугольнике",
    description: "Пять загадочных исчезновений в горах Вермонта, которые до сих пор не раскрыты.",
    topic: "Таинственные исчезновения в Беннингтонском треугольнике, Вермонт"
  },
  {
    title: "Ранчо Скинуокер: Портал в другие миры?",
    description: "Узнайте о паранормальной активности, НЛО и странных существах на самом известном ранчо в Юте.",
    topic: "Паранормальная активность на Ранчо Скинуокер"
  }
];

const App: React.FC = () => {
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [loadingStep, setLoadingStep] = useState<string>('');
    const [podcastPackage, setPodcastPackage] = useState<PodcastPackage | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [topicInput, setTopicInput] = useState<string>('');

    const handleGenerate = useCallback(async (topic: string) => {
        if (!topic.trim()) {
            setError('Введите тему или вставьте ссылку на статью для анализа.');
            return;
        }

        setIsLoading(true);
        setError(null);
        setPodcastPackage(null);

        try {
            const scriptData = await generateScriptPackage(topic, setLoadingStep);
            
            setLoadingStep("Синтез голоса...");
            const audioData = await generatePodcastAudio(scriptData.script);
            
            setPodcastPackage({ ...scriptData, audio: audioData });

        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Произошла неизвестная ошибка. Проверьте консоль для деталей.');
            console.error(err);
        } finally {
            setIsLoading(false);
            setLoadingStep('');
        }
    }, []);

    const renderLoadingState = () => (
        <div className="flex flex-col items-center justify-center text-center p-8 bg-gray-800 rounded-lg shadow-2xl">
            <Spinner className="w-16 h-16 mb-6" />
            <h2 className="text-2xl font-bold text-white mb-2">Создание подкаста...</h2>
            <p className="text-lg text-teal-300 animate-pulse">{loadingStep}</p>
            <p className="text-sm text-gray-400 mt-4 max-w-md">
                Это может занять до минуты. ИИ исследует тему, пишет сценарий и озвучивает его.
            </p>
        </div>
    );
    
    const renderResults = () => podcastPackage && (
        <div className="w-full space-y-8">
            <div className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-gray-700">
                <div className="flex items-center gap-4 text-teal-300 mb-4">
                    <TitleIcon />
                    <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">{podcastPackage.title}</h2>
                </div>
                {podcastPackage.audio && (
                    <div className="mt-4">
                        <audio controls className="w-full">
                            <source src={`data:audio/mpeg;base64,${podcastPackage.audio}`} type="audio/mpeg" />
                            Ваш браузер не поддерживает аудиоэлемент.
                        </audio>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <div className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-gray-700">
                        <div className="flex items-center gap-4 text-teal-300 mb-4">
                            <DescriptionIcon />
                            <h3 className="text-2xl font-semibold text-white">Описание выпуска</h3>
                        </div>
                        <p className="text-gray-300 leading-relaxed">{podcastPackage.description}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {podcastPackage.seoKeywords.map((keyword, index) => (
                                <span key={index} className="bg-gray-700 text-teal-300 text-xs font-medium px-2.5 py-1 rounded-full">{keyword}</span>
                            ))}
                        </div>
                    </div>

                    <div className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-gray-700">
                        <div className="flex items-center gap-4 text-teal-300 mb-4">
                            <ScriptIcon />
                            <h3 className="text-2xl font-semibold text-white">Сценарий рассказчика</h3>
                        </div>
                        <div className="prose prose-invert max-w-none text-gray-300 space-y-4 max-h-96 overflow-y-auto pr-4">
                            {podcastPackage.script.map((line, index) => (
                                <p key={index}>{line.text}</p>
                            ))}
                        </div>
                    </div>
                </div>
                
                <div className="lg:col-span-1 space-y-8">
                    <div className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-gray-700">
                        <div className="flex items-center gap-4 text-teal-300 mb-4">
                            <PromptsIcon />
                            <h3 className="text-2xl font-semibold text-white">Промпты для Изображений</h3>
                        </div>
                        <ol className="list-decimal list-inside text-gray-400 space-y-2 text-sm max-h-60 overflow-y-auto pr-2">
                            {podcastPackage.imagePrompts.map((prompt, index) => (
                                <li key={index}>"{prompt}"</li>
                            ))}
                        </ol>
                    </div>

                    <div className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-gray-700">
                        <div className="flex items-center gap-4 text-teal-300 mb-4">
                            <SourcesIcon />
                            <h3 className="text-2xl font-semibold text-white">Источники</h3>
                        </div>
                        <ul className="space-y-2 text-sm max-h-60 overflow-y-auto pr-2">
                            {podcastPackage.sources.map((source, index) => (
                                <li key={index}>
                                    <a href={source.uri} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline break-all" title={source.title}>
                                        {source.title || source.uri}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
             <button
                onClick={() => { setPodcastPackage(null); setTopicInput(''); }}
                className="w-full mt-4 px-8 py-3 bg-teal-600 text-white font-bold rounded-lg hover:bg-teal-700 transition-all duration-300 transform hover:scale-105 shadow-lg"
            >
                Создать новый подкаст
            </button>
        </div>
    );
    
    const renderInitialState = () => (
        <div className="w-full max-w-4xl mx-auto flex flex-col items-center">
             <p className="text-center text-lg text-gray-400 mb-6">
               Введите свою тему или вставьте ссылку на статью для анализа. ИИ проведет исследование и подготовит полный пакет материалов.
            </p>
            <div className="w-full flex flex-col sm:flex-row gap-2 mb-8">
                 <input
                    type="text"
                    value={topicInput}
                    onChange={(e) => setTopicInput(e.target.value)}
                    placeholder="Например, 'Загадка исчезновения рейса MH370'"
                    className="flex-grow bg-gray-800 border border-gray-600 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <button
                    onClick={() => handleGenerate(topicInput)}
                    disabled={isLoading}
                    className="px-8 py-3 bg-teal-600 text-white font-bold rounded-lg hover:bg-teal-700 transition-all duration-300 transform hover:scale-105 shadow-lg disabled:bg-gray-500 disabled:scale-100"
                >
                    Создать
                </button>
            </div>

            <p className="text-center text-md text-gray-500 mb-4">... или выберите одну из загадочных историй для вдохновения:</p>
            
            <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {sampleArticles.map(article => (
                    <div 
                        key={article.title} 
                        className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6 flex flex-col justify-between hover:border-teal-500 hover:bg-gray-800 transition-all duration-300 shadow-lg cursor-pointer"
                        onClick={() => setTopicInput(article.topic)}
                    >
                        <div>
                            <h3 className="text-xl font-bold text-white mb-2">{article.title}</h3>
                            <p className="text-gray-400 text-sm">{article.description}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 font-sans p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
                <header className="text-center mb-10">
                    <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight">
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-blue-500">
                            Загадочные Истории с ИИ
                        </span>
                    </h1>
                </header>

                <main className="flex justify-center items-start">
                    {isLoading ? renderLoadingState() : error ? (
                        <div className="text-center p-8 bg-red-900/50 border border-red-700 rounded-lg">
                            <h3 className="text-2xl font-bold text-red-300">Произошла ошибка</h3>
                            <p className="mt-2 text-red-200">{error}</p>
                             <button
                                onClick={() => { setError(null); setIsLoading(false); setTopicInput(topicInput); }}
                                className="mt-4 px-6 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors"
                            >
                                Попробовать снова
                            </button>
                        </div>
                    ) : podcastPackage ? renderResults() : renderInitialState()}
                </main>

                <footer className="text-center mt-12 text-gray-500 text-sm">
                    <p>Создано с помощью Google Gemini. Ссылки на источники предоставляются для ознакомления.</p>
                </footer>
            </div>
        </div>
    );
};

export default App;
