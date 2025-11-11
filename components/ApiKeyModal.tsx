import React, { useState } from 'react';
import { CloseIcon, KeyIcon } from './Icons';
import FontAutocompleteInput from './FontAutocompleteInput';

interface ApiKeyModalProps {
    onClose: () => void;
    onSave: (data: { keys: { gemini: string; openRouter: string }, defaultFont: string }) => void;
    currentKeys: { gemini: string; openRouter: string };
    currentFont: string;
}

type Tab = 'gemini' | 'fallback' | 'style';

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ onClose, onSave, currentKeys, currentFont }) => {
    const [geminiApiKey, setGeminiApiKey] = useState(currentKeys.gemini);
    const [openRouterApiKey, setOpenRouterApiKey] = useState(currentKeys.openRouter);
    const [defaultFont, setDefaultFont] = useState(currentFont);
    const [activeTab, setActiveTab] = useState<Tab>('gemini');

    const handleSave = () => {
        onSave({ 
            keys: { gemini: geminiApiKey, openRouter: openRouterApiKey },
            defaultFont
        });
        onClose();
    };

    const TabButton: React.FC<{ tabId: Tab; label: string }> = ({ tabId, label }) => (
        <button
            onClick={() => setActiveTab(tabId)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === tabId
                    ? 'bg-gray-800 text-teal-400 border-b-2 border-teal-400'
                    : 'text-gray-400 hover:text-white'
            }`}
        >
            {label}
        </button>
    );

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-md border border-gray-700">
                <div className="flex justify-between items-center p-4 border-b border-gray-700">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2"><KeyIcon/>Настройки</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><CloseIcon/></button>
                </div>
                <div className="px-6 pt-2 border-b border-gray-700">
                    <div className="flex items-center">
                        <TabButton tabId="gemini" label="Google Gemini" />
                        <TabButton tabId="fallback" label="Fallback" />
                        <TabButton tabId="style" label="Стиль канала" />
                    </div>
                </div>
                <div className="p-6 space-y-4">
                    {activeTab === 'gemini' && (
                        <div>
                            <h4 className="text-lg font-semibold text-white mb-2">Google Gemini API</h4>
                            <p className="text-gray-300 text-sm mb-4">
                                Основной сервис для генерации текста и изображений. Если поле пустое, будет использоваться ключ по умолчанию.
                            </p>
                            <div>
                                <label htmlFor="geminiApiKeyInput" className="block text-sm font-medium text-gray-300 mb-1">Ваш Gemini API-ключ</label>
                                <input
                                    id="geminiApiKeyInput"
                                    type="password"
                                    value={geminiApiKey}
                                    onChange={(e) => setGeminiApiKey(e.target.value)}
                                    placeholder="Введите ваш ключ API..."
                                    className="w-full bg-gray-900 border border-gray-600 rounded-md p-2 text-white focus:ring-2 focus:ring-teal-500"
                                />
                            </div>
                        </div>
                    )}
                    {activeTab === 'fallback' && (
                        <div>
                            <h4 className="text-lg font-semibold text-white mb-2">OpenRouter API</h4>
                            <p className="text-gray-300 text-sm mb-4">
                                Запасной сервис для генерации изображений, если квота Google Imagen исчерпана.
                                <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:underline ml-1">Получить ключ здесь.</a>
                            </p>
                            <div>
                                <label htmlFor="openRouterApiKeyInput" className="block text-sm font-medium text-gray-300 mb-1">Ваш OpenRouter API-ключ</label>
                                <input
                                    id="openRouterApiKeyInput"
                                    type="password"
                                    value={openRouterApiKey}
                                    onChange={(e) => setOpenRouterApiKey(e.target.value)}
                                    placeholder="Введите ваш ключ OpenRouter..."
                                    className="w-full bg-gray-900 border border-gray-600 rounded-md p-2 text-white focus:ring-2 focus:ring-teal-500"
                                />
                            </div>
                        </div>
                    )}
                     {activeTab === 'style' && (
                        <div>
                            <h4 className="text-lg font-semibold text-white mb-2">Шрифт по умолчанию</h4>
                            <p className="text-gray-300 text-sm mb-4">
                                Укажите основной шрифт из Google Fonts для вашего канала. Он будет использоваться по умолчанию для всех новых проектов, обеспечивая единый стиль.
                            </p>
                            <div>
                                <label htmlFor="defaultFontInput" className="block text-sm font-medium text-gray-300 mb-1">Название шрифта</label>
                                <FontAutocompleteInput 
                                    id="defaultFontInput"
                                    value={defaultFont} 
                                    onChange={setDefaultFont} 
                                />
                            </div>
                        </div>
                    )}
                </div>
                <div className="flex justify-end gap-4 p-4 bg-gray-900/50 border-t border-gray-700 rounded-b-lg">
                    <button onClick={onClose} className="px-6 py-2 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-700">Отмена</button>
                    <button onClick={handleSave} className="px-6 py-2 bg-teal-600 text-white font-bold rounded-lg hover:bg-teal-700">Сохранить</button>
                </div>
            </div>
        </div>
    );
};

export default ApiKeyModal;
