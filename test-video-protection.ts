// Тестирование защиты видео-пайплайна от битых изображений

import { generateVideo } from './services/videoService';
import type { Podcast, GeneratedImage } from './types';

// Создаем тестовый подкаст с битыми изображениями
const createTestPodcastWithBrokenImages = (): Podcast => {
    const brokenImage: GeneratedImage = {
        url: 'https://example.com/broken-image-404.jpg',
        source: 'generated'
    };
    
    const workingImage: GeneratedImage = {
        url: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAyNCIgaGVpZ2h0PSI1NzYiIHZpZXdCb3g9IjAgMCAxMDI0IDU3NiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjEwMjQiIGhlaWdodD0iNTc2IiBmaWxsPSIjMzMzMzMzIi8+Cjx0ZXh0IHg9IjUxMiIgeT0iMjg4IiBmb250LWZhbWlseT0iSW50ZXIsIEFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXNpemU9IjI0IiBmaWxsPSIjOTk5OTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iMC4zZW0iPlRlc3QgSW1hZ2U8L3RleHQ+Cjwvc3ZnPg==',
        source: 'generated'
    };
    
    return {
        id: 'test-video-pipeline',
        topic: 'Тест защиты видео-пайплайна',
        selectedTitle: 'Тест: Битые изображения',
        chapters: [{
            id: 'test-chapter',
            title: 'Тестовая глава',
            status: 'completed',
            script: [{
                text: 'Это тестовая строка',
                speaker: 'Narrator'
            }],
            audioBlob: new Blob(['dummy audio'], { type: 'audio/wav' }),
            imagePrompts: ['Test prompt'],
            generatedImages: [
                brokenImage,      // Битое изображение
                workingImage,     // Рабочее изображение  
                brokenImage       // Еще одно битое изображение
            ],
            selectedBgIndex: 0
        }],
        language: 'ru',
        videoPacingMode: 'auto',
        totalDurationMinutes: 1,
        creativeFreedom: true,
        narrationMode: 'monologue',
        monologueVoice: 'default',
        initialImageCount: 3,
        backgroundMusicVolume: 0.02,
        knowledgeBaseText: '',
        designConcepts: [],
        youtubeThumbnails: [],
        // Недостающие поля для типа Podcast
        youtubeTitleOptions: ['Тест: Битые изображения'],
        description: 'Тестовое описание для проверки защиты видео-пайплайна',
        seoKeywords: ['тест', 'видео', 'защита'],
        characters: [],
        sources: [],
        characterVoices: { 'Narrator': 'default' }
    };
};

// Функция для тестирования защиты видео-пайплайна
export const testVideoPipelineProtection = async () => {
    console.log('🧪 Тестирование защиты видео-пайплайна от битых изображений...');
    
    const testPodcast = createTestPodcastWithBrokenImages();
    const logs: any[] = [];
    
    const logFunction = (entry: any) => {
        logs.push(entry);
        console.log(`[${entry.type.toUpperCase()}] ${entry.message}`);
    };
    
    const progressCallback = (progress: number, message: string) => {
        console.log(`📊 Прогресс: ${Math.round(progress * 100)}% - ${message}`);
    };
    
    try {
        // Создаем фейковый audio blob
        const audioBlob = new Blob(['dummy audio content'], { type: 'audio/wav' });
        
        console.log('🎬 Запуск генерации видео с битыми изображениями...');
        const videoBlob = await generateVideo(
            testPodcast,
            audioBlob,
            progressCallback,
            logFunction,
            undefined // manual durations
        );
        
        console.log('✅ Видео успешно сгенерировано!');
        console.log(`📦 Размер видео: ${(videoBlob.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`📋 Всего логов: ${logs.length}`);
        
        // Проверяем, что есть предупреждения о битых изображениях
        const warnings = logs.filter(log => log.type === 'warning');
        const imageWarnings = warnings.filter(log => 
            log.message.includes('недоступно') || 
            log.message.includes('placeholder') ||
            log.message.includes('Не удалось загрузить')
        );
        
        console.log(`⚠️ Найдено предупреждений об изображениях: ${imageWarnings.length}`);
        
        if (imageWarnings.length > 0) {
            console.log('🛡️ Защита сработала корректно - битые изображения были заменены на placeholder');
        } else {
            console.log('⚠️ Предупреждения не найдены - возможно, изображения не были распознаны как битые');
        }
        
        return {
            success: true,
            videoSize: videoBlob.size,
            logsCount: logs.length,
            warningsCount: imageWarnings.length,
            warnings: imageWarnings
        };
        
    } catch (error) {
        console.error('❌ Ошибка при генерации видео:', error);
        
        const errorLogs = logs.filter(log => log.type === 'error');
        console.log(`📋 Ошибок в логах: ${errorLogs.length}`);
        
        return {
            success: false,
            error: error.message,
            logsCount: logs.length,
            errorsCount: errorLogs.length,
            errors: errorLogs
        };
    }
};

// Функция для запуска теста в консоли браузера
export const runVideoProtectionTest = () => {
    console.log('🚀 Запуск теста защиты видео-пайплайна...');
    testVideoPipelineProtection().then(result => {
        console.log('📊 Результат теста:', result);
    });
};