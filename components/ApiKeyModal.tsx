import React, { useState, useEffect } from 'react';
import { CloseIcon, KeyIcon } from './Icons';
import FontAutocompleteInput from './FontAutocompleteInput';
import type { ImageMode, StockPhotoPreference, ApiRetryConfig } from '../types';
import { getKeyStatus, unblockKey } from '../utils/stockPhotoKeyManager';
import { getGeminiImageStatus, resetGeminiCircuitBreaker } from '../services/imageService';

interface ApiKeyModalProps {
    onClose: () => void;
    onSave: (data: { 
        keys: { 
            gemini: string; 
            freesound: string;
            unsplash: string;
            pexels: string;
        };
        defaultFont: string;
        imageMode: ImageMode;
        retryConfig: ApiRetryConfig;
        stockPhotoPreference: StockPhotoPreference;
    }) => void;
    currentKeys: { 
        gemini: string; 
        freesound: string;
        unsplash: string;
        pexels: string;
    };
    currentFont: string;
    currentImageMode: ImageMode;
    currentRetryConfig: ApiRetryConfig;
    currentStockPhotoPreference: StockPhotoPreference;
}

type Tab = 'gemini' | 'sfx' | 'stocks' | 'style' | 'retry';

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ 
    onClose, 
    onSave, 
    currentKeys, 
    currentFont, 
    currentImageMode, 
    currentRetryConfig, 
    currentStockPhotoPreference 
}) => {
    const [geminiApiKey, setGeminiApiKey] = useState(currentKeys.gemini);
    const [freesoundApiKey, setFreesoundApiKey] = useState(currentKeys.freesound);
    const [unsplashApiKey, setUnsplashApiKey] = useState(currentKeys.unsplash || '');
    const [pexelsApiKey, setPexelsApiKey] = useState(currentKeys.pexels || '');
    const [defaultFont, setDefaultFont] = useState(currentFont);
    const [imageMode, setImageMode] = useState<ImageMode>(currentImageMode);
    const [retryConfig, setRetryConfig] = useState<ApiRetryConfig>(currentRetryConfig);
    const [stockPhotoPreference, setStockPhotoPreference] = useState<StockPhotoPreference>(currentStockPhotoPreference);
    const [activeTab, setActiveTab] = useState<Tab>('gemini');
    
    const [geminiStatus, setGeminiStatus] = useState(getGeminiImageStatus());

    useEffect(() => {
        const interval = setInterval(() => {
            setGeminiStatus(getGeminiImageStatus());
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const handleSave = () => {
        onSave({ 
            keys: { 
                gemini: geminiApiKey, 
                freesound: freesoundApiKey,
                unsplash: unsplashApiKey,
                pexels: pexelsApiKey
            },
            defaultFont,
            imageMode,
            retryConfig,
            stockPhotoPreference
        });
        onClose();
    };
    
    const handleResetCircuitBreaker = () => {
        resetGeminiCircuitBreaker();
        setGeminiStatus(getGeminiImageStatus());
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

    const KeyStatusIndicator: React.FC<{ service: 'unsplash' | 'pexels' }> = ({ service }) => {
        const status = getKeyStatus(service);
        
        if (!status.isBlocked) {
            return (
                <div className="flex items-center gap-2 text-green-400 text-sm">
                    <span>✅</span>
                    <span className="capitalize">{service}: Активен</span>
                </div>
            );
        }
        
        const remainingMinutes = Math.ceil((status.blockedUntil! - Date.now()) / 60000);
        
        return (
            <div className="flex items-center justify-between gap-2 text-orange-400 text-sm">
                <div className="flex items-center gap-2">
                    <span>⏸️</span>
                    <span className="capitalize">{service}: Заблокирован ({remainingMinutes} мин)</span>
                </div>
                <button 
                    onClick={() => unblockKey(service)}
                    className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded"
                >
                    Разблокировать
                </button>
            </div>
        );
    };

    const GeminiStatusIndicator = () => {
        const { isTripped, consecutiveFailures, lastFailureTimestamp } = geminiStatus;
        const coolDownPeriod = 5 * 60 * 1000;
        const remainingCooldown = Math.ceil((lastFailureTimestamp + coolDownPeriod - Date.now()) / 1000);

        if (isTripped) {
            return (
                 <div className="flex items-center justify-between gap-2 text-red-400 text-sm">
                    <div className="flex items-center gap-2">
                        <span>🛑</span>
                        <span>Gemini Image: Отключен (осталось {Math.floor(remainingCooldown / 60)} мин {remainingCooldown % 60} сек)</span>
                    </div>
                    <button 
                        onClick={handleResetCircuitBreaker}
                        className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded"
                    >
                        Сбросить
                    </button>
                </div>
            );
        }
        if (consecutiveFailures > 0) {
             return (
                <div className="flex items-center gap-2 text-yellow-400 text-sm">
                    <span>⚠️</span>
                    <span>Gemini Image: {consecutiveFailures} / 3 ошибок подряд</span>
                </div>
            );
        }
        return (
            <div className="flex items-center gap-2 text-green-400 text-sm">
                <span>✅</span>
                <span>Gemini Image: Активен</span>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-slate-800/80 backdrop-blur-lg rounded-lg shadow-2xl w-full max-w-md border border-slate-700">
                <div className="flex justify-between items-center p-4 border-b border-slate-700">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2"><KeyIcon/>Настройки</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><CloseIcon/></button>
                </div>
                <div className="px-6 pt-2">
                    <div className="flex items-center border-b border-slate-700">
                        <TabButton tabId="gemini" label="Google Gemini" />
                        <TabButton tabId="sfx" label="SFX" />
                        <TabButton tabId="stocks" label="Стоковые фото" />
                        <TabButton tabId="style" label="Стиль канала" />
                    </div>
                </div>
                <div className="p-6 space-y-4">
                    {activeTab === 'gemini' && (
                        <div>
                            <h4 className="text-lg font-semibold text-white mb-2">Google Gemini API</h4>
                            <p className="text-slate-300 text-sm mb-4">
                                Основной сервис для генерации текста и изображений. Если поле пустое, будет использоваться ключ по умолчанию.
                                Для изображений используется автоматический fallback на Unsplash & Pexels при исчерпании квоты.
                            </p>
                            <div>
                                <label htmlFor="geminiApiKeyInput" className="block text-sm font-medium text-slate-300 mb-1">Ваш Gemini API-ключ</label>
                                <input
                                    id="geminiApiKeyInput"
                                    type="password"
                                    value={geminiApiKey}
                                    onChange={(e) => setGeminiApiKey((e.currentTarget as any).value)}
                                    placeholder="Введите ваш ключ API..."
                                    className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-white focus:ring-2 focus:ring-cyan-500"
                                />
                            </div>
                            <div className="mt-4 p-3 bg-slate-900/50 rounded-lg border border-slate-700">
                                <h5 className="text-sm font-semibold text-slate-300 mb-2">Статус генерации изображений:</h5>
                                <GeminiStatusIndicator />
                            </div>
                        </div>
                    )}
                     {activeTab === 'sfx' && (
                        <div>
                            <h4 className="text-lg font-semibold text-white mb-2">Freesound API</h4>
                            <p className="text-slate-300 text-sm mb-4">
                                Ключ для доступа к библиотеке звуковых эффектов Freesound.org. Если поле пустое, будет использоваться ключ по умолчанию с общими лимитами.
                                <a href="https://freesound.org/docs/api/" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline ml-1">Получить ключ здесь.</a>
                            </p>
                            <div>
                                <label htmlFor="freesoundApiKeyInput" className="block text-sm font-medium text-slate-300 mb-1">Ваш Freesound API-ключ</label>
                                <input
                                    id="freesoundApiKeyInput"
                                    type="password"
                                    value={freesoundApiKey}
                                    onChange={(e) => setFreesoundApiKey((e.currentTarget as any).value)}
                                    placeholder="Введите ваш ключ Freesound..."
                                    className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-white focus:ring-2 focus:ring-cyan-500"
                                />
                            </div>
                        </div>
                    )}
                    {activeTab === 'stocks' && (
                        <div className="space-y-4">
                            <h4 className="text-lg font-semibold text-white mb-2">API ключи для стоковых фото</h4>
                            <p className="text-slate-300 text-sm mb-4">
                                Используются для поиска обложек и фоновых изображений. 
                                Если поля пустые — используются дефолтные ключи разработчика с общими лимитами.
                            </p>
                            
                            <div>
                                <label htmlFor="unsplashApiKeyInput" className="block text-sm font-medium text-slate-300 mb-1">
                                    Unsplash API Key
                                </label>
                                <input
                                    id="unsplashApiKeyInput"
                                    type="password"
                                    value={unsplashApiKey}
                                    onChange={(e) => setUnsplashApiKey((e.currentTarget as any).value)}
                                    placeholder="Введите ваш Access Key..."
                                    className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-white focus:ring-2 focus:ring-cyan-500"
                                />
                                <a 
                                    href="https://unsplash.com/oauth/applications" 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="text-cyan-400 hover:underline text-xs mt-1 inline-block"
                                >
                                    Получить ключ →
                                </a>
                            </div>
                            
                            <div>
                                <label htmlFor="pexelsApiKeyInput" className="block text-sm font-medium text-slate-300 mb-1">
                                    Pexels API Key
                                </label>
                                <input
                                    id="pexelsApiKeyInput"
                                    type="password"
                                    value={pexelsApiKey}
                                    onChange={(e) => setPexelsApiKey((e.currentTarget as any).value)}
                                    placeholder="Введите ваш API Key..."
                                    className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-white focus:ring-2 focus:ring-cyan-500"
                                />
                                <a 
                                    href="https://www.pexels.com/api/" 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="text-cyan-400 hover:underline text-xs mt-1 inline-block"
                                >
                                    Получить ключ →
                                </a>
                            </div>
                            
                            <div>
                                <label htmlFor="stockPhotoPreferenceSelect" className="block text-sm font-medium text-slate-300 mb-1">
                                    Приоритетный источник фото
                                </label>
                                <select
                                    id="stockPhotoPreferenceSelect"
                                    value={stockPhotoPreference}
                                    onChange={(e) => setStockPhotoPreference((e.currentTarget as any).value as StockPhotoPreference)}
                                    className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-white focus:ring-2 focus:ring-cyan-500"
                                >
                                    <option value="auto">Авто (пробовать оба)</option>
                                    <option value="unsplash">Unsplash (приоритет)</option>
                                    <option value="pexels">Pexels (приоритет)</option>
                                </select>
                                <p className="text-slate-400 text-xs mt-1">
                                    При выборе "Авто" система автоматически пробует оба сервиса с fallback.
                                </p>
                            </div>
                            
                            <div className="mt-4 p-3 bg-slate-900/50 rounded-lg border border-slate-700">
                                <h5 className="text-sm font-semibold text-slate-300 mb-2">Статус ключей:</h5>
                                <KeyStatusIndicator service="unsplash" />
                                <KeyStatusIndicator service="pexels" />
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