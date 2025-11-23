# Quick Start: Chapter-Based System

## Быстрый старт

### 1. Интеграция в компонент

```typescript
import { useChapterPackaging } from '../hooks/useChapterPackaging';

function PodcastStudio({ podcast }: { podcast: Podcast }) {
    const { 
        isPackaging, 
        packagingProgress, 
        packageError,
        packageLogs,
        downloadProjectByChapters 
    } = useChapterPackaging();

    const handleDownload = () => {
        downloadProjectByChapters(podcast);
    };

    return (
        <div>
            <button 
                onClick={handleDownload} 
                disabled={isPackaging}
                className="btn btn--primary"
            >
                {isPackaging ? packagingProgress : '📥 Скачать проект'}
            </button>

            {packageError && (
                <div className="alert alert--error">
                    {packageError}
                </div>
            )}

            {/* Логи упаковки */}
            <div className="logs">
                {packageLogs.map((log, i) => (
                    <div key={i} className={`log log--${log.type}`}>
                        {log.message}
                    </div>
                ))}
            </div>
        </div>
    );
}
```

### 2. Генерация глав с BackgroundImages

```typescript
import { generateImagesWithBlobs } from '../services/imageService';

async function generateChapter(
    chapterData: any, 
    log: LogFunction
): Promise<Chapter> {
    // 1. Создать сценарий
    const script = await generateScript(chapterData, log);
    
    // 2. Сгенерировать изображения С BLOB'АМИ
    const backgroundImages = await generateImagesWithBlobs(
        chapterData.visualSearchPrompts,
        3, // количество изображений
        log,
        false // devMode = false для последовательной генерации
    );
    
    // 3. Сгенерировать аудио
    const audioBlob = await generateChapterAudio(script, log);
    
    return {
        id: generateId(),
        title: chapterData.title,
        script: script,
        backgroundImages: backgroundImages, // ✅ Теперь с blob'ами!
        audioBlob: audioBlob,
        status: 'completed'
    };
}
```

### 3. Добавление музыки с валидацией

```typescript
import { fetchWithCorsFallback } from '../services/apiUtils';

async function validateAndAddMusic(
    chapter: Chapter, 
    music: MusicTrack,
    log: LogFunction
): Promise<void> {
    try {
        // Проверка доступности
        const musicUrl = music.audio.replace(/^http:\/\//, 'https://');
        const response = await fetchWithCorsFallback(musicUrl, { method: 'HEAD' });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('audio')) {
            throw new Error(`Invalid content type: ${contentType}`);
        }
        
        // Если всё ок - назначаем
        chapter.backgroundMusic = music;
        log({ type: 'info', message: `✅ Музыка валидна: ${music.name}` });
        
    } catch (error: any) {
        log({ 
            type: 'error', 
            message: `❌ Музыка недоступна: ${music.name} - ${error.message}` 
        });
        throw error;
    }
}
```

## Полный пример workflow

```typescript
import { useChapterPackaging } from '../hooks/useChapterPackaging';
import { generateImagesWithBlobs } from '../services/imageService';
import { findMusicWithAi } from '../services/musicService';
import { findSfxForScript } from '../services/sfxService';

async function createPodcastProject(
    topic: string,
    settings: PodcastSettings
): Promise<Podcast> {
    
    const podcast: Podcast = initializePodcast(topic, settings);
    
    // Генерируем главы
    for (let i = 0; i < settings.chapterCount; i++) {
        const chapter: Chapter = {
            id: `chapter-${i}`,
            title: `Глава ${i + 1}`,
            script: [],
            status: 'pending'
        };
        
        // 1. Сценарий
        chapter.script = await generateChapterScript(topic, i, log);
        chapter.status = 'script_generating';
        
        // 2. Изображения С BLOB'АМИ
        chapter.backgroundImages = await generateImagesWithBlobs(
            chapter.visualSearchPrompts || [],
            settings.imagesPerChapter,
            log,
            false
        );
        
        // 3. Музыка
        const musicTracks = await findMusicWithAi(
            `${topic} chapter ${i + 1}`,
            log
        );
        if (musicTracks.length > 0) {
            try {
                await validateAndAddMusic(chapter, musicTracks[0], log);
            } catch (e) {
                log({ type: 'info', message: 'Продолжаем без музыки' });
            }
        }
        
        // 4. SFX
        chapter.script = await findSfxForScript(chapter.script, log);
        
        // 5. Аудио
        chapter.audioBlob = await generateChapterAudio(chapter, log);
        chapter.status = 'completed';
        
        podcast.chapters.push(chapter);
    }
    
    return podcast;
}

// Использование
function MyApp() {
    const { downloadProjectByChapters } = useChapterPackaging();
    
    const handleCreate = async () => {
        const podcast = await createPodcastProject(
            'Темные тайны истории',
            {
                chapterCount: 5,
                imagesPerChapter: 3,
                language: 'ru'
            }
        );
        
        // Скачиваем проект
        await downloadProjectByChapters(podcast);
    };
    
    return <button onClick={handleCreate}>Создать проект</button>;
}
```

## Результат сборки

После запуска `assemble_video.bat`:

```
===================================================
Chapter-Based Video Assembly (High Quality)
===================================================

[INFO] Processing Chapter 01...
[INFO] Chapter duration: 45.3s, Image duration: 15.1s each
[SUCCESS] Chapter 01 complete

[INFO] Processing Chapter 02...
[INFO] Chapter duration: 38.7s, Image duration: 12.9s each
[SUCCESS] Chapter 02 complete

...

[INFO] Concatenating all chapters into final video...
[SUCCESS] Final video created: final_video.mp4
```

## Что получаете

✅ **Каждое изображение главы используется**  
✅ **Музыка точно под длину главы**  
✅ **SFX с точными таймингами (макс 3 сек)**  
✅ **Субтитры без артефактов**  
✅ **Модульная структура - легко отладить**

## Дальнейшие шаги

Читайте полную документацию: [CHAPTER_PACKAGING.md](./CHAPTER_PACKAGING.md)
