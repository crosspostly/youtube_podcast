import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Podcast, YoutubeThumbnail, LogEntry, ImageMode, StockPhotoPreference, ApiKeys } from './types';
import { JournalIcon, KeyIcon } from './components/Icons';
import { PodcastProvider } from './context/PodcastContext';
import ApiKeyModal from './components/ApiKeyModal';
import AppUI from './components/AppUI';
import { getApiRetryConfig, updateApiRetryConfig, type ApiRetryConfig, API_KEYS } from './config/appConfig';
import { appConfig } from './config/appConfig';
import { validateGeminiKey } from './services/geminiService';

const App: React.FC = () => {
    const [isLogVisible, setIsLogVisible] = useState(false);
    const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
    const [apiKeys, setApiKeys] = useState<ApiKeys>({ 
        gemini: '', 
        freesound: '', 
        unsplash: '',
        pexels: '',
        jamendo: API_KEYS.jamendo || ''
    });
    const [defaultFont, setDefaultFont] = useState('Impact');
    const [imageMode, setImageMode] = useState<ImageMode>('generate');
    const [stockPhotoPreference, setStockPhotoPreference] = useState<StockPhotoPreference>('unsplash');
    const [retryConfig, setRetryConfig] = useState<ApiRetryConfig>(getApiRetryConfig());

    useEffect(() => {
        try {
            const storedKeys = localStorage.getItem('apiKeys');
            if (storedKeys && storedKeys !== 'undefined') {
                try {
                    const parsedKeys = JSON.parse(storedKeys);
                    if (parsedKeys.openRouter !== undefined) {
                        delete parsedKeys.openRouter;
                        localStorage.setItem('apiKeys', JSON.stringify(parsedKeys));
                    }
                    setApiKeys(prevKeys => ({
                        ...prevKeys,
                        ...parsedKeys
                    }));
                } catch (e) {
                    console.error('Failed to parse API keys:', e);
                    localStorage.removeItem('apiKeys');
                }
            }
            const storedFont = localStorage.getItem('channelDefaultFont') || 'Impact';
            setDefaultFont(storedFont);
            
            const storedImageMode = localStorage.getItem('imageMode');
            if (storedImageMode && storedImageMode !== 'undefined') {
                setImageMode(storedImageMode as ImageMode);
            }
            
            const storedRetryConfig = localStorage.getItem('apiRetryConfig');
            if (storedRetryConfig && storedRetryConfig !== 'undefined') {
                try {
                    const parsedRetryConfig = JSON.parse(storedRetryConfig);
                    setRetryConfig(parsedRetryConfig);
                    updateApiRetryConfig(parsedRetryConfig);
                } catch (e) {
                    console.error('Failed to parse retry config:', e);
                    localStorage.removeItem('apiRetryConfig');
                }
            }
            
            const storedPreference = localStorage.getItem('stockPhotoPreference');
            if (storedPreference && storedPreference !== 'undefined') {
                setStockPhotoPreference(storedPreference as StockPhotoPreference);
            }
        } catch (e) { console.error("Failed to load settings from localStorage", e); }
    }, []);

    const handleSaveApiKeys = (data: { 
        keys: ApiKeys; 
        defaultFont: string; 
        imageMode: ImageMode; 
        retryConfig: ApiRetryConfig;
        stockPhotoPreference: StockPhotoPreference;
    }) => {
        setApiKeys(data.keys);
        setDefaultFont(data.defaultFont);
        setImageMode(data.imageMode);
        setRetryConfig(data.retryConfig);
        setStockPhotoPreference(data.stockPhotoPreference);
        updateApiRetryConfig(data.retryConfig);
        
        try {
            localStorage.setItem('apiKeys', JSON.stringify(data.keys));
            localStorage.setItem('channelDefaultFont', data.defaultFont);
            localStorage.setItem('imageMode', data.imageMode);
            localStorage.setItem('apiRetryConfig', JSON.stringify(data.retryConfig));
            localStorage.setItem('stockPhotoPreference', data.stockPhotoPreference);
        } catch (e) { console.error("Failed to save settings to localStorage", e); }
    };
    
    return (
        <div className="min-h-screen text-slate-100 p-4 sm:p-6 lg:p-8">
             <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
                <button onClick={() => setIsApiKeyModalOpen(true)} className="p-2 bg-slate-800/60 text-white rounded-lg hover:bg-slate-700/60 backdrop-blur-sm transition-colors"><KeyIcon /></button>
                <button onClick={() => setIsLogVisible(true)} className="p-2 bg-slate-800/60 text-white rounded-lg hover:bg-slate-700/60 backdrop-blur-sm transition-colors"><JournalIcon /></button>
            </div>
            {isApiKeyModalOpen && (
                <ApiKeyModal
                    onClose={() => setIsApiKeyModalOpen(false)}
                    onSave={handleSaveApiKeys}
                    currentKeys={apiKeys}
                    currentFont={defaultFont}
                    currentImageMode={imageMode}
                    currentRetryConfig={retryConfig}
                    currentStockPhotoPreference={stockPhotoPreference}
                />
            )}
            <PodcastProvider apiKeys={apiKeys} defaultFont={defaultFont} imageMode={imageMode}>
                <AppUI 
                    isLogVisible={isLogVisible} 
                    onCloseLog={() => setIsLogVisible(false)}
                />
            </PodcastProvider>
        </div>
    );
};

export default App;