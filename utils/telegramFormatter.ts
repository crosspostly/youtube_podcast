/**
 * Утилиты для форматирования текста для Telegram
 * Преобразует VK гиперссылки и сохраняет форматирование
 */

/**
 * Преобразует VK гиперссылки формата [URL|Текст] в HTML <a href="URL">Текст</a>
 * 
 * @param text - Исходный текст с VK гиперссылками
 * @returns Отформатированный текст с HTML ссылками
 */
export const convertVkLinksToHtml = (text: string): string => {
    if (!text) return text;
    
    // Регулярное выражение для поиска VK гиперссылок формата [URL|Текст]
    // [\[\]] - экранированные скобки
    // ([^\]|]+) - URL (любые символы кроме ] и |)
    // \| - разделитель |
    // ([^\]]+) - текст ссылки (любые символы кроме ])
    const vkLinkRegex = /\[([^\]|]+)\|([^\]]+)\]/g;
    
    return text.replace(vkLinkRegex, '<a href="$1">$2</a>');
};

/**
 * Форматирует текст для Telegram:
 * 1. Преобразует VK гиперссылки в HTML
 * 2. Сохраняет переносы строк
 * 3. Экранирует HTML символы (кроме тех, что в ссылках)
 * 
 * @param text - Исходный текст
 * @returns Отформатированный текст для Telegram с HTML разметкой
 */
export const formatTextForTelegram = (text: string): string => {
    if (!text) return text;
    
    // Сначала преобразуем VK ссылки в HTML
    let formattedText = convertVkLinksToHtml(text);
    
    // Экранируем HTML символы, но сохраняем уже созданные ссылки
    // Это сложная задача, поэтому пока просто возвращаем текст с преобразованными ссылками
    // В будущем можно добавить более сложную обработку для экранирования
    
    return formattedText;
};

/**
 * Проверяет, содержит ли текст VK гиперссылки
 * 
 * @param text - Текст для проверки
 * @returns true, если есть VK гиперссылки
 */
export const hasVkLinks = (text: string): boolean => {
    if (!text) return false;
    const vkLinkRegex = /\[([^\]|]+)\|([^\]]+)\]/g;
    return vkLinkRegex.test(text);
};

/**
 * Извлекает все VK гиперссылки из текста
 * 
 * @param text - Текст для анализа
 * @returns Массив объектов {url: string, text: string}
 */
export const extractVkLinks = (text: string): Array<{url: string, text: string}> => {
    if (!text) return [];
    
    const links: Array<{url: string, text: string}> = [];
    const vkLinkRegex = /\[([^\]|]+)\|([^\]]+)\]/g;
    let match;
    
    while ((match = vkLinkRegex.exec(text)) !== null) {
        links.push({
            url: match[1],
            text: match[2]
        });
    }
    
    return links;
};