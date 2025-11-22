import React, { useState } from 'react';
import { CloseIcon, KeyIcon, WrenchIcon } from './Icons';
import FontAutocompleteInput from './FontAutocompleteInput';
import { ApiKeys } from '../types';
import { usePodcastContext } from '../context/PodcastContext';

interface ApiKeyModalProps {
    onClose: () => void;
    onSave: (data: { keys: Partial<ApiKeys>, defaultFont: string }) => void;
    currentKeys: ApiKeys;
    currentFont: string;
}

type Tab = 'ai' | 'sounds' | 'stock' | 'style' | 'dev';

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ onClose, onSave, currentKeys, currentFont }) => {
    const [geminiApiKey, setGeminiApiKey] = useState(currentKeys.gemini);
    const [freesoundApiKey, setFreesoundApiKey] = useState(currentKeys.freesound);
    const [unsplashApiKey, setUnsplashApiKey] = useState(currentKeys.unsplash);
    const [pexelsApiKey, setPexelsApiKey] = useState(currentKeys.pexels);
    const [jamendoApiKey, setJamendoApiKey] = useState(currentKeys.jamendo);
    const [defaultFont, setDefaultFont] = useState(currentFont);
    const [activeTab, setActiveTab] = useState<Tab>('ai');
    
    // Use global context for devMode
    const { devMode, setDevMode } = usePodcastContext();
    const [localDevMode, setLocalDevMode] = useState(devMode);

    const handleSave = () => {
        onSave({ 
            keys: { 
                gemini: geminiApiKey, 
                freesound: freesoundApiKey,
                unsplash: unsplashApiKey,
                pexels: pexelsApiKey,
                jamendo: jamendoApiKey
            },
            defaultFont
        });
        setDevMode(localDevMode);
        onClose();
    };

    const TabButton: React.FC<{ tabId: Tab; label: string }> = ({ tabId, label }) => (
        <button
            onClick={() => setActiveTab(tabId)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 ${
                activeTab === tabId
                    ? 'text-cyan-400 border-cyan-400'
                    : 'text-slate-400 hover:text-white border-transparent'
            }`}
        >
            {label}
        </button>
    );

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-slate-800/80 backdrop-blur-lg rounded-lg shadow-2xl w-full max-w-md border border-slate-700">
                <div className="flex justify-between items-center p-4 border-b border-slate-700">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2"><KeyIcon/>Настройки</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><CloseIcon/></button>
                </div>
                <div className="px-6 pt-2">
                    <div className="flex items-center border-b border-slate-700 flex-wrap">
                        <TabButton tabId="ai" label="AI" />
                        <TabButton tabId="sounds" label="Звуки" />
                        <TabButton tabId="stock" label="Фото" />
                        <TabButton tabId="style" label="Стиль" />
                        <TabButton tabId="dev" label="Dev" />
                    </div>
                </div>
                <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                    {activeTab === 'ai' && (
                        <div className="space-y-6">
                            <div>
                                <h4 className="text-lg font-semibold text-white mb-2">Google Gemini API</h4>
                                <p className="text-slate-300 text-sm mb-4">
                                    Основной сервис для генерации текста и изображений. Если поле пустое, будет использоваться ключ из `.env` файла.
                                </p>
                                <div>
                                    <label htmlFor="geminiApiKeyInput" className="block text-sm font-medium text-slate-300 mb-1">Ваш Gemini API-ключ</label>
                                    <input
                                        id="geminiApiKeyInput"
                                        type="password"
                                        value={geminiApiKey}
                                        onChange={(e) => setGeminiApiKey(e.target.value)}
                                        placeholder="Введите ваш ключ API..."
                                        className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-white focus:ring-2 focus:ring-cyan-500"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                     {activeTab === 'sounds' && (
                        <div className="space-y-6">
                             <div>
                                <h4 className="text-lg font-semibold text-white mb-2">Freesound API</h4>
                                <p className="text-slate-300 text-sm mb-4">
                                    Ключ для доступа к библиотеке звуковых эффектов Freesound.org.
                                    <a href="https://freesound.org/docs/api/" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline ml-1">Получить ключ здесь.</a>
                                </p>
                                <div>
                                    <label htmlFor="freesoundApiKeyInput" className="block text-sm font-medium text-slate-300 mb-1">Ваш Freesound API-ключ</label>
                                    <input
                                        id="freesoundApiKeyInput"
                                        type="password"
                                        value={freesoundApiKey}
                                        onChange={(e) => setFreesoundApiKey(e.target.value)}
                                        placeholder="Введите ваш ключ Freesound..."
                                        className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-white focus:ring-2 focus:ring-cyan-500"
                                    />
                                </div>
                            </div>
                             <div>
                                <h4 className="text-lg font-semibold text-white mb-2">Jamendo API</h4>
                                <p className="text-slate-300 text-sm mb-4">
                                    Ключ для доступа к музыкальной библиотеке Jamendo.
                                    <a href="https://developer.jamendo.com/v3.0/docs" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline ml-1">Получить ключ здесь.</a>
                                </p>
                                <div>
                                    <label htmlFor="jamendoApiKeyInput" className="block text-sm font-medium text-slate-300 mb-1">Ваш Jamendo Client ID</label>
                                    <input
                                        id="jamendoApiKeyInput"
                                        type="password"
                                        value={jamendoApiKey}
                                        onChange={(e) => setJamendoApiKey(e.target.value)}
                                        placeholder="Введите ваш Client ID..."
                                        className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-white focus:ring-2 focus:ring-cyan-500"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                     {activeTab === 'stock' && (
                        <div className="space-y-6">
                             <div>
                                <h4 className="text-lg font-semibold text-white mb-2">Unsplash API</h4>
                                <p className="text-slate-300 text-sm mb-4">
                                    Ключ для доступа к библиотеке стоковых фото Unsplash.
                                    <a href="https://unsplash.com/developers" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline ml-1">Получить ключ здесь.</a>
                                </p>
                                <div>
                                    <label htmlFor="unsplashApiKeyInput" className="block text-sm font-medium text-slate-300 mb-1">Ваш Unsplash Access Key</label>
                                    <input
                                        id="unsplashApiKeyInput"
                                        type="password"
                                        value={unsplashApiKey}
                                        onChange={(e) => setUnsplashApiKey(e.target.value)}
                                        placeholder="Введите ваш ключ Unsplash..."
                                        className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-white focus:ring-2 focus:ring-cyan-500"
                                    />
                                </div>
                            </div>
                             <div>
                                <h4 className="text-lg font-semibold text-white mb-2">Pexels API</h4>
                                <p className="text-slate-300 text-sm mb-4">
                                    Ключ для доступа к библиотеке стоковых фото и видео Pexels.
                                    <a href="https://www.pexels.com/api/" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline ml-1">Получить ключ здесь.</a>
                                </p>
                                <div>
                                    <label htmlFor="pexelsApiKeyInput" className="block text-sm font-medium text-slate-300 mb-1">Ваш Pexels API-ключ</label>
                                    <input
                                        id="pexelsApiKeyInput"
                                        type="password"
                                        value={pexelsApiKey}
                                        onChange={(e) => setPexelsApiKey(e.target.value)}
                                        placeholder="Введите ваш ключ Pexels..."
                                        className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-white focus:ring-2 focus:ring-cyan-500"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                     {activeTab === 'style' && (
                        <div>
                            <h4 className="text-lg font-semibold text-white mb-2">Шрифт по умолчанию</h4>
                            <p className="text-slate-300 text-sm mb-4">
                                Укажите основной шрифт из Google Fonts для вашего канала. Он будет использоваться по умолчанию для всех новых проектов, обеспечивая единый стиль.
                            </p>
                            <div>
                                <label htmlFor="defaultFontInput" className="block text-sm font-medium text-slate-300 mb-1">Название шрифта</label>
                                <FontAutocompleteInput 
                                    id="defaultFontInput"
                                    value={defaultFont} 
                                    onChange={setDefaultFont} 
                                />
                            </div>
                        </div>
                    )}
                    {activeTab === 'dev' && (
                        <div className="space-y-6">
                            <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-4">
                                <h4 className="text-lg font-semibold text-yellow-400 mb-2 flex items-center gap-2"><WrenchIcon /> Режим разработчика (Dev Mode)</h4>
                                <p className="text-slate-300 text-sm mb-4">
                                    Включает ускоренную генерацию контента для тестирования и отладки.
                                </p>
                                <div className="flex items-center justify-between bg-slate-900 p-3 rounded-lg">
                                    <span className="text-white font-medium">Включить Dev Mode</span>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={localDevMode} 
                                            onChange={(e) => setLocalDevMode(e.target.checked)} 
                                            className="sr-only peer" 
                                        />
                                        <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-cyan-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-600"></div>
                                    </label>
                                </div>
                                <ul className="list-disc list-inside text-xs text-slate-400 mt-4 space-y-1">
                                    <li>Музыка не скачивается браузером (в ZIP кладется ссылка).</li>
                                    <li>Параллельная генерация картинок (пауза 2-5 сек вместо очереди).</li>
                                    <li>Максимально быстрый запуск всех процессов.</li>
                                </ul>
                            </div>
                        </div>
                    )}
                </div>
                <div className="flex justify-end gap-4 p-4 bg-slate-900/50 border-t border-slate-700 rounded-b-lg">
                    <button onClick={onClose} className="px-6 py-2 bg-slate-600 text-white font-bold rounded-lg hover:bg-slate-700">Отмена</button>
                    <button onClick={handleSave} className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-lg hover:from-cyan-400 hover:to-blue-500">Сохранить</button>
                </div>
            </div>
        </div>
    );
};

export default ApiKeyModal;
