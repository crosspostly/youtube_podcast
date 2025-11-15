import React, { useState, useEffect } from 'react';
import { CloseIcon, KeyIcon } from './Icons';
import FontAutocompleteInput from './FontAutocompleteInput';
import type { ImageMode, StockPhotoPreference, ApiRetryConfig } from '../types';
import { getKeyStatus, unblockKey } from '../utils/stockPhotoKeyManager';
import { getGeminiImageStatus, resetGeminiCircuitBreaker, COOL_DOWN_PERIOD_MS } from '../services/imageService';

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
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === tabId ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
        >
            {label}
        </button>
    );

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-slate-800/80 backdrop-blur-lg rounded-lg shadow-2xl w-full max-w-2xl flex flex-col border border-slate-700 max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-4 border-b border-slate-700">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2"><KeyIcon /> Настройки API и Стили</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><CloseIcon /></button>
                </div>
                
                <div className="flex border-b border-slate-700 px-4">
                    <TabButton tabId="gemini" label="Google Gemini" />
                    <TabButton tabId="sfx" label="Freesound" />
                    <TabButton tabId="stocks" label="Стоковые фото" />
                    <TabButton tabId="style" label="Стиль" />
                    <TabButton tabId="retry" label="API Retries" />
                </div>

                <div className="p-6 space-y-4 overflow-y-auto flex-grow">
                    {activeTab === 'gemini' && (
                        <div>
                            <h3 className="text-lg font-semibold text-white mb-2">Google Gemini API</h3>
                            <p className="text-sm text-slate-400 mb-4">Ключ для генерации текста, аудио и изображений.</p>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Gemini API Key</label>
                            {/* FIX: Cannot find name 'HTMLInputElement'. Changed event type to 'any'. */}
                            <input type="password" value={geminiApiKey} onChange={(e: any) => setGeminiApiKey(e.currentTarget.value)} className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-white" />

                            <div className="mt-6 border-t border-slate-700 pt-4">
                                <h4 className="text-md font-semibold text-white mb-2">Статус генерации изображений (Circuit Breaker)</h4>
                                {geminiStatus.isTripped ? (
                                    <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300">
                                        <p className="font-bold">Сервис отключен</p>
                                        <p className="text-sm">Генерация изображений временно отключена из-за {geminiStatus.consecutiveFailures} последовательных ошибок. Будет автоматически включена через {Math.max(0, Math.ceil((geminiStatus.lastFailureTimestamp + COOL_DOWN_PERIOD_MS - Date.now()) / 60000))} мин.</p>
                                        <button onClick={handleResetCircuitBreaker} className="mt-2 text-sm font-bold text-white bg-red-600 px-3 py-1 rounded hover:bg-red-700">Сбросить сейчас</button>
                                    </div>
                                ) : (
                                    <div className="p-3 bg-green-900/50 border border-green-700 rounded-lg text-green-300">
                                        <p className="font-bold">Сервис активен</p>
                                        <p className="text-sm">Генерация изображений работает в штатном режиме. Последовательных ошибок: {geminiStatus.consecutiveFailures}.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    
                    {activeTab === 'sfx' && (
                        <div>
                             <h3 className="text-lg font-semibold text-white mb-2">Freesound API</h3>
                             <p className="text-sm text-slate-400 mb-4">Ключ для поиска звуковых эффектов (SFX).</p>
                             <label className="block text-sm font-medium text-slate-300 mb-1">Freesound API Key</label>
                             {/* FIX: Cannot find name 'HTMLInputElement'. Changed event type to 'any'. */}
                             <input type="password" value={freesoundApiKey} onChange={(e: any) => setFreesoundApiKey(e.currentTarget.value)} className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-white" />
                        </div>
                    )}

                    {activeTab === 'stocks' && (
                        <div className="space-y-4">
                            <div>
                                 <h3 className="text-lg font-semibold text-white mb-2">API ключи для стоковых фото</h3>
                                 <p className="text-sm text-slate-400 mb-4">Используются как fallback, если генерация Gemini недоступна.</p>
                                 <label className="block text-sm font-medium text-slate-300 mb-1">Unsplash Access Key</label>
                                 {/* FIX: Cannot find name 'HTMLInputElement'. Changed event type to 'any'. */}
                                 <input type="password" value={unsplashApiKey} onChange={(e: any) => setUnsplashApiKey(e.currentTarget.value)} className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-white" />
                            </div>
                            <div>
                                 <label className="block text-sm font-medium text-slate-300 mb-1">Pexels API Key</label>
                                 {/* FIX: Cannot find name 'HTMLInputElement'. Changed event type to 'any'. */}
                                 <input type="password" value={pexelsApiKey} onChange={(e: any) => setPexelsApiKey(e.currentTarget.value)} className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-white" />
                            </div>
                            <div className="border-t border-slate-700 pt-4">
                                <label className="block text-sm font-medium text-slate-300 mb-1">Предпочтительный сервис</label>
                                {/* FIX: Cannot find name 'HTMLSelectElement'. Changed event type to 'any'. */}
                                <select value={stockPhotoPreference} onChange={(e: any) => setStockPhotoPreference(e.currentTarget.value as StockPhotoPreference)} className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-white">
                                    <option value="unsplash">Unsplash</option>
                                    <option value="pexels">Pexels</option>
                                    <option value="auto">Авто (сначала Unsplash)</option>
                                </select>
                            </div>
                        </div>
                    )}

                    {activeTab === 'style' && (
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-lg font-semibold text-white mb-2">Стиль и брендинг</h3>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Шрифт по умолчанию для обложек</label>
                                <FontAutocompleteInput value={defaultFont} onChange={setDefaultFont} />
                            </div>
                            <div className="border-t border-slate-700 pt-4">
                                <label className="block text-sm font-medium text-slate-300 mb-1">Режим получения изображений</label>
                                {/* FIX: Cannot find name 'HTMLSelectElement'. Changed event type to 'any'. */}
                                <select value={imageMode} onChange={(e: any) => setImageMode(e.currentTarget.value as ImageMode)} className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-white">
                                    <option value="generate">Генерация (с fallback на стоки)</option>
                                    <option value="unsplash">Только Unsplash</option>
                                    <option value="pexels">Только Pexels</option>
                                    <option value="auto">Авто-выбор стока</option>
                                </select>
                            </div>
                        </div>
                    )}

                    {activeTab === 'retry' && (
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-white mb-2">Настройки повторных запросов к API</h3>
                            <p className="text-sm text-slate-400 mb-4">Настройте, как приложение будет повторять неудачные запросы (например, при превышении лимитов).</p>
                            <div>
                                <label className="block text-sm font-medium text-slate-300">Количество попыток</label>
                                {/* FIX: Cannot find name 'HTMLInputElement'. Changed event type to 'any'. */}
                                <input type="number" value={retryConfig.retries || 3} onChange={(e: any) => setRetryConfig(p => ({...p, retries: parseInt(e.currentTarget.value, 10) || 3}))} className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-white" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300">Начальная задержка (ms)</label>
                                {/* FIX: Cannot find name 'HTMLInputElement'. Changed event type to 'any'. */}
                                <input type="number" value={retryConfig.initialDelay || 5000} onChange={(e: any) => setRetryConfig(p => ({...p, initialDelay: parseInt(e.currentTarget.value, 10) || 5000}))} className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-white" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300">Максимальная задержка (ms)</label>
                                {/* FIX: Cannot find name 'HTMLInputElement'. Changed event type to 'any'. */}
                                <input type="number" value={retryConfig.maxDelay || 60000} onChange={(e: any) => setRetryConfig(p => ({...p, maxDelay: parseInt(e.currentTarget.value, 10) || 60000}))} className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-white" />
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-4 p-4 border-t border-slate-700 bg-slate-800/50 rounded-b-lg">
                    <button onClick={onClose} className="px-6 py-2 bg-slate-600 text-white font-bold rounded-lg hover:bg-slate-700">Отмена</button>
                    <button onClick={handleSave} className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-lg hover:from-cyan-400 hover:to-blue-500">Сохранить</button>
                </div>
            </div>
        </div>
    );
};

export default ApiKeyModal;
