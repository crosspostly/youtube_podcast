/**
 * Финальный тест для проверки VK → Telegram форматирования
 */

import { formatTextForTelegram, hasVkLinks, extractVkLinks } from '../utils/telegramFormatter';

// Тестовый текст с различными сценариями
const testCases = [
    {
        name: 'Простая VK ссылка',
        input: '[https://vk.com/wall-123_456|Пост ВКонтакте]',
        expected: '<a href="https://vk.com/wall-123_456">Пост ВКонтакте</a>',
        shouldHaveLinks: true
    },
    {
        name: 'Множественные ссылки',
        input: 'Текст [https://vk.com/wall-123_456|Пост] и [https://youtube.com/watch?v=123|Видео]',
        expected: '<a href="https://vk.com/wall-123_456">Пост</a> и <a href="https://youtube.com/watch?v=123">Видео</a>',
        shouldHaveLinks: true
    },
    {
        name: 'Текст с переносами строк',
        input: 'Первая строка\n[https://example.com|Ссылка]\nВторая строка',
        expected: 'Первая строка\n<a href="https://example.com">Ссылка</a>\nВторая строка',
        shouldHaveLinks: true
    },
    {
        name: 'Текст без ссылок',
        input: 'Простой текст\nС переносами строк',
        expected: 'Простой текст\nС переносами строк',
        shouldHaveLinks: false
    },
    {
        name: 'Сложные URL',
        input: '[https://vk.com/video12345_67890?hash=abc123|Интересное видео]',
        expected: '<a href="https://vk.com/video12345_67890?hash=abc123">Интересное видео</a>',
        shouldHaveLinks: true
    }
];

// Функция для запуска всех тестов
export const runFinalTests = () => {
    console.log('🧪 Финальные тесты VK → Telegram форматирования\n');
    
    let passedTests = 0;
    let totalTests = testCases.length;
    
    testCases.forEach((testCase, index) => {
        console.log(`📝 Тест ${index + 1}: ${testCase.name}`);
        console.log(`Входные данные: ${testCase.input}`);
        
        // Проверка форматирования
        const formatted = formatTextForTelegram(testCase.input);
        console.log(`Результат: ${formatted}`);
        console.log(`Ожидаемый: ${testCase.expected}`);
        
        const formatPassed = formatted === testCase.expected;
        console.log(`✅ Форматирование: ${formatPassed ? 'Прошло' : 'Не прошло'}`);
        
        // Проверка определения ссылок
        const hasLinks = hasVkLinks(testCase.input);
        const linksCheckPassed = hasLinks === testCase.shouldHaveLinks;
        console.log(`✅ Определение ссылок: ${linksCheckPassed ? 'Прошло' : 'Не прошло'}`);
        
        // Если есть ссылки, проверяем извлечение
        if (testCase.shouldHaveLinks) {
            const extractedLinks = extractVkLinks(testCase.input);
            console.log(`📎 Извлеченные ссылки: ${JSON.stringify(extractedLinks, null, 2)}`);
        }
        
        const testPassed = formatPassed && linksCheckPassed;
        if (testPassed) {
            passedTests++;
        }
        
        console.log(`${testPassed ? '✅' : '❌'} Тест ${index + 1}: ${testPassed ? 'Прошел' : 'Не прошел'}\n`);
    });
    
    console.log(`🎉 Результаты: ${passedTests}/${totalTests} тестов пройдено`);
    
    if (passedTests === totalTests) {
        console.log('🌟 Все тесты пройдены! Форматирование работает корректно.');
    } else {
        console.log('⚠️ Некоторые тесты не пройдены. Проверьте реализацию.');
    }
    
    return passedTests === totalTests;
};

// Демонстрация работы с реальными данными
export const demonstrateRealUsage = () => {
    console.log('\n🎬 Демонстрация реального использования:\n');
    
    const realExample = `Заголовок статьи

Это пример текста с VK гиперссылками.

Источники:
[https://vk.com/wall-123_456|Оригинальный пост в VK]
[https://youtube.com/watch?v=example|Видео с объяснением]
[https://example.com/article|Статья с подробностями]

Продолжение текста после ссылок.`;

    console.log('Оригинальный текст:');
    console.log(realExample);
    console.log('\n' + '='.repeat(50) + '\n');
    
    console.log('Отформатированный для Telegram:');
    const formatted = formatTextForTelegram(realExample);
    console.log(formatted);
    console.log('\n' + '='.repeat(50) + '\n');
    
    console.log('Найденные ссылки:');
    const links = extractVkLinks(realExample);
    links.forEach((link, index) => {
        console.log(`${index + 1}. URL: ${link.url}`);
        console.log(`   Текст: ${link.text}`);
    });
    
    console.log('\n💡 Для отправки в Telegram используйте parse_mode: "HTML"');
};

// Запуск тестов
if (typeof window === 'undefined') {
    // Node.js окружение
    runFinalTests();
    demonstrateRealUsage();
}