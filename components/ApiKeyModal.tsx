


import React, { useState } from 'react';
import { CloseIcon, KeyIcon } from './Icons';
import FontAutocompleteInput from './FontAutocompleteInput';

interface ApiKeyModalProps {
    onClose: () => void;
    onSave: (data: { keys: { gemini: string; openRouter: string; freesound: string }, defaultFont: string }) => void;
    currentKeys: { gemini: string; openRouter: string; freesound: string };
    currentFont: string;
}

type Tab = 'gemini' | 'fallback' | 'sfx' | 'style';

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ onClose, onSave, currentKeys, currentFont }) => {
    const [geminiApiKey, setGeminiApiKey] = useState(currentKeys.gemini);
    const [openRouterApiKey, setOpenRouterApiKey] = useState(currentKeys.openRouter);
    const [freesoundApiKey, setFreesoundApiKey] = useState(currentKeys.freesound);
    const [defaultFont, setDefaultFont] = useState(currentFont);
    const [activeTab, setActiveTab] = useState<Tab>('gemini');

    const handleSave = () => {
        onSave({ 
            keys: { gemini: geminiApiKey, openRouter: openRouterApiKey, freesound: freesoundApiKey },
            defaultFont
        });
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
                    <div className="flex items-center border-b border-slate-700">
                        <TabButton tabId="gemini" label="Google Gemini" />
                        <TabButton tabId="fallback" label="Fallback" />
                        <TabButton tabId="sfx" label="SFX" />
                        <TabButton tabId="style" label="Стиль канала" />
                    </div>
                </div>
                <div className="p-6 space-y-4">
                    {activeTab === 'gemini' && (
                        <div>
                            <h4 className="text-lg font-semibold text-white mb-2">Google Gemini API</h4>
                            <p className="text-slate-300 text-sm mb-4">
                                Основной сервис для генерации текста и изображений. Если поле пустое, будет использоваться ключ по умолчанию.
                            </p>
                            <div>
                                <label htmlFor="geminiApiKeyInput" className="block text-sm font-medium text-slate-300 mb-1">Ваш Gemini API-ключ</label>
                                <input
                                    id="geminiApiKeyInput"
                                    type="password"
                                    value={geminiApiKey}
                                    // FIX: Add explicit event type to correctly access e.target.value
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setGeminiApiKey(e.target.value)}
                                    placeholder="Введите ваш ключ API..."
                                    className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-white focus:ring-2 focus:ring-cyan-500"
                                />
                            </div>
                        </div>
                    )}
                    {activeTab === 'fallback' && (
                        <div>
                            <h4 className="text-lg font-semibold text-white mb-2">OpenRouter API</h4>
                            <p className="text-slate-300 text-sm mb-4">
                                Запасной сервис для генерации изображений, если квота Google Imagen исчерпана.
                                <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline ml-1">Получить ключ здесь.</a>
                            </p>
                            <div>
                                <label htmlFor="openRouterApiKeyInput" className="block text-sm font-medium text-slate-300 mb-1">Ваш OpenRouter API-ключ</label>
                                <input
                                    id="openRouterApiKeyInput"
                                    type="password"
                                    value={openRouterApiKey}
                                    // FIX: Add explicit event type to correctly access e.target.value
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOpenRouterApiKey(e.target.value)}
                                    placeholder="Введите ваш ключ OpenRouter..."
                                    className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-white focus:ring-2 focus:ring-cyan-500"
                                />
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
                                    // FIX: Add explicit event type to correctly access e.target.value
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFreesoundApiKey(e.target.value)}
                                    placeholder="Введите ваш ключ Freesound..."
                                    className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-white focus:ring-2 focus:ring-cyan-500"
                                />
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