/**
 * Тесты для telegramFormatter
 */

import { convertVkLinksToHtml, formatTextForTelegram, hasVkLinks, extractVkLinks } from '../utils/telegramFormatter';

// Тестовые данные
const testTexts = {
    simpleVkLink: '[https://example.com|Пример ссылки]',
    multipleVkLinks: 'Первый текст [https://vk.com/wall-123_456|Пост ВК] и второй [https://example.com|Пример]',
    mixedContent: 'Заголовок\n\nТекст с ссылкой [https://youtube.com/watch?v=123|Видео] и продолжением.\n\nНовая строка.',
    noLinks: 'Простой текст без ссылок\nС переносами строк',
    complexVkLink: '[https://vk.com/video12345_67890|Интересное видео]',
    withFormatting: '**Жирный текст** и [https://example.com|ссылка]'
};

// Функция для запуска тестов
const runTests = () => {
    console.log('🧪 Тестирование форматирования текста для Telegram\n');

    // Тест 1: Простая VK ссылка
    console.log('📝 Тест 1: Простая VK ссылка');
    const simpleResult = convertVkLinksToHtml(testTexts.simpleVkLink);
    const expectedSimple = '<a href="https://example.com">Пример ссылки</a>';
    console.log('Исходный:', testTexts.simpleVkLink);
    console.log('Результат:', simpleResult);
    console.log('Ожидаемый:', expectedSimple);
    console.log('✅ Прошел:', simpleResult === expectedSimple);
    console.log('');

    // Тест 2: Множественные VK ссылки
    console.log('📝 Тест 2: Множественные VK ссылки');
    const multipleResult = convertVkLinksToHtml(testTexts.multipleVkLinks);
    console.log('Исходный:', testTexts.multipleVkLinks);
    console.log('Результат:', multipleResult);
    console.log('');

    // Тест 3: Смешанный контент
    console.log('📝 Тест 3: Смешанный контент с переносами строк');
    const mixedResult = formatTextForTelegram(testTexts.mixedContent);
    console.log('Исходный:', testTexts.mixedContent);
    console.log('Результат:', mixedResult);
    console.log('');

    // Тест 4: Проверка наличия ссылок
    console.log('📝 Тест 4: Проверка наличия ссылок');
    console.log('Текст со ссылками:', hasVkLinks(testTexts.simpleVkLink));
    console.log('Текст без ссылок:', hasVkLinks(testTexts.noLinks));
    console.log('');

    // Тест 5: Извлечение ссылок
    console.log('📝 Тест 5: Извлечение ссылок');
    const extractedLinks = extractVkLinks(testTexts.multipleVkLinks);
    console.log('Исходный:', testTexts.multipleVkLinks);
    console.log('Извлеченные ссылки:', extractedLinks);
    console.log('');

    // Тест 6: Сложная VK ссылка
    console.log('📝 Тест 6: Сложная VK ссылка');
    const complexResult = convertVkLinksToHtml(testTexts.complexVkLink);
    const expectedComplex = '<a href="https://vk.com/video12345_67890">Интересное видео</a>';
    console.log('Исходный:', testTexts.complexVkLink);
    console.log('Результат:', complexResult);
    console.log('Ожидаемый:', expectedComplex);
    console.log('✅ Прошел:', complexResult === expectedComplex);
    console.log('');

    // Тест 7: Текст с форматированием
    console.log('📝 Тест 7: Текст с форматированием');
    const formattingResult = formatTextForTelegram(testTexts.withFormatting);
    console.log('Исходный:', testTexts.withFormatting);
    console.log('Результат:', formattingResult);
    console.log('');

    console.log('🎉 Все тесты завершены!');
};

// Экспортируем для запуска
export { runTests, testTexts };

// Автоматический запуск при выполнении файла
if (typeof window === 'undefined') {
    // Node.js окружение
    runTests();
}