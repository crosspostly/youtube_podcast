import React, { useState } from 'react';
import { formatTextForTelegram, hasVkLinks, extractVkLinks } from '../utils/telegramFormatter';

const TelegramFormatterTest: React.FC = () => {
    const [testInput, setTestInput] = useState(`Пример текста с VK ссылками:

[https://vk.com/wall-123_456|Пост ВКонтакте] и [https://youtube.com/watch?v=123|Интересное видео]

Это текст с **жирным форматированием** и *курсивом*.

Еще одна ссылка: [https://example.com/page|Пример сайта]`);

    const formattedOutput = formatTextForTelegram(testInput);
    const hasLinks = hasVkLinks(testInput);
    const extractedLinks = extractVkLinks(testInput);

    return (
        <div className="max-w-4xl mx-auto p-6 bg-slate-900 rounded-lg">
            <h2 className="text-2xl font-bold text-white mb-4">🧪 Тест форматирования для Telegram</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Исходный текст */}
                <div>
                    <h3 className="text-lg font-semibold text-cyan-400 mb-2">Исходный текст:</h3>
                    <textarea
                        value={testInput}
                        onChange={(e) => setTestInput(e.target.value)}
                        className="w-full h-64 bg-slate-800 border border-slate-600 rounded p-3 text-slate-200 font-mono text-sm"
                    />
                </div>

                {/* Отформатированный текст */}
                <div>
                    <h3 className="text-lg font-semibold text-green-400 mb-2">Отформатированный для Telegram:</h3>
                    <textarea
                        value={formattedOutput}
                        readOnly
                        className="w-full h-64 bg-slate-800 border border-slate-600 rounded p-3 text-slate-200 font-mono text-sm"
                    />
                    {hasLinks && (
                        <div className="mt-2 p-2 bg-green-900/30 border border-green-600 rounded text-green-300 text-sm">
                            ✅ Найдены VK ссылки и преобразованы в HTML
                        </div>
                    )}
                </div>
            </div>

            {/* Извлеченные ссылки */}
            {extractedLinks.length > 0 && (
                <div className="mt-6">
                    <h3 className="text-lg font-semibold text-yellow-400 mb-2">📎 Извлеченные ссылки:</h3>
                    <div className="bg-slate-800 border border-slate-600 rounded p-4">
                        {extractedLinks.map((link, index) => (
                            <div key={index} className="mb-2 p-2 bg-slate-700 rounded">
                                <div className="text-sm text-slate-300">URL: <span className="text-cyan-400">{link.url}</span></div>
                                <div className="text-sm text-slate-300">Текст: <span className="text-green-400">{link.text}</span></div>
                                <div className="text-xs text-slate-400 mt-1">HTML: <code className="bg-slate-900 px-1 rounded">&lt;a href="{link.url}"&gt;{link.text}&lt;/a&gt;</code></div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Инструкции */}
            <div className="mt-6 p-4 bg-blue-900/30 border border-blue-600 rounded">
                <h3 className="text-lg font-semibold text-blue-400 mb-2">📱 Как использовать:</h3>
                <ol className="text-sm text-blue-200 space-y-1">
                    <li>1. Введите текст с VK ссылками в формате [URL|Текст]</li>
                    <li>2. Скопируйте отформатированный текст</li>
                    <li>3. Вставьте в Telegram с <code>parse_mode: 'HTML'</code></li>
                    <li>4. Ссылки станут кликабельными!</li>
                </ol>
            </div>
        </div>
    );
};

export default TelegramFormatterTest;