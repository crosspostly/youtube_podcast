# Chapter-Based Packaging System

## Обзор

Новая система упаковки организует проект по главам, где каждая глава - это автономный блок с собственными ресурсами.

## Структура архива

```
project_archive.zip
├── chapters/
│   ├── chapter_01/
│   │   ├── audio.wav           # Речь главы
│   │   ├── subtitles.srt       # Субтитры главы (очищенные от артефактов)
│   │   ├── music.mp3           # Музыка (обрезана под длину главы)
│   │   ├── images/             # Изображения главы
│   │   │   ├── 001.png
│   │   │   ├── 002.png
│   │   │   └── 003.png
│   │   ├── sfx/                # Звуковые эффекты
│   │   │   ├── thunder.mp3     # Обрезаны до 3 сек макс
│   │   │   └── door_slam.mp3
│   │   └── metadata.json       # Метаданные главы
│   ├── chapter_02/
│   │   └── ...
│   └── chapter_03/
│       └── ...
├── assemble_video.bat          # Скрипт сборки FFmpeg
└── project_metadata.json       # Общие данные проекта
```

## Метаданные главы (metadata.json)

```json
{
  "chapterNumber": 1,
  "title": "Темные Улицы",
  "audioDuration": 45.3,
  "imageDuration": 15.1,
  "imageCount": 3,
  "musicVolume": 0.3,
  "sfxTimings": [
    {
      "name": "Thunder",
      "startTime": 12.5,
      "duration": 2.8,
      "volume": 0.7,
      "filePath": "sfx/thunder.mp3"
    }
  ]
}
```

## Ключевые улучшения

### 1. Картинки привязаны к главам ✅
- Каждая глава имеет свою папку `images/`
- Длительность каждого изображения = `audioDuration / imageCount`
- Все изображения главы используются в видео

### 2. Музыка скачивается и обрезается ✅
- Музыка скачивается при упаковке
- Автоматически обрезается до длины главы
- Плавное затухание (fade out) в конце
- Валидация URL перед скачиванием
- Fallback на HTTPS

### 3. SFX с точными таймингами ✅
- Каждый эффект скачивается отдельно
- Максимальная длительность 3 секунды
- Fade in/out для плавности
- Точные тайминги в `metadata.json`
- Попытка нескольких URL (HQ MP3 → HQ OGG → LQ MP3)

### 4. Субтитры очищены ✅
- Исправлены артефакты кодировки:
  - `â€"` → `—` (em-dash)
  - `â€œ` → `"` (кавычки)
  - `â€™` → `'` (апостроф)
- Удалены управляющие символы
- Нормализованы пробелы

## Использование

### В коде компонента

```typescript
import { useChapterPackaging } from '../hooks/useChapterPackaging';

const MyComponent = () => {
    const { 
        isPackaging, 
        packagingProgress, 
        packageError,
        downloadProjectByChapters 
    } = useChapterPackaging();

    const handleDownload = async () => {
        await downloadProjectByChapters(podcast);
    };

    return (
        <div>
            <button onClick={handleDownload} disabled={isPackaging}>
                {isPackaging ? packagingProgress : 'Скачать проект (по главам)'}
            </button>
            {packageError && <div className="error">{packageError}</div>}
        </div>
    );
};
```

### Генерация изображений с blob'ами

```typescript
import { generateImagesWithBlobs } from '../services/imageService';

// Вместо generateStyleImages используйте:
const bgImages = await generateImagesWithBlobs(
    chapter.visualSearchPrompts,
    3, // количество
    log,
    false // devMode
);

// bgImages теперь содержит url и blob для каждого изображения
chapter.backgroundImages = bgImages;
```

## Сборка видео

### Автоматическая сборка

1. Распакуйте архив
2. Убедитесь, что FFmpeg установлен и доступен в PATH
3. Запустите `assemble_video.bat`

Скрипт:
- Обработает каждую главу последовательно
- Создаст видео для каждой главы с:
  - Изображениями (каждое по `imageDuration` секунд)
  - Речью из `audio.wav`
  - Музыкой из `music.mp3` (если есть)
  - Субтитрами из `subtitles.srt`
- Склеит все главы в `final_video.mp4`

### Ручная сборка главы

```bash
cd chapters/chapter_01

# Создать список изображений
echo file 'images/001.png' > concat.txt
echo duration 15.1 >> concat.txt
echo file 'images/002.png' >> concat.txt
echo duration 15.1 >> concat.txt
echo file 'images/003.png' >> concat.txt
echo duration 15.1 >> concat.txt

# Собрать видео
ffmpeg -f concat -safe 0 -i concat.txt \
       -i audio.wav \
       -i music.mp3 \
       -filter_complex "[0:v]scale=1920:1080[v];[1:a][2:a]amix=inputs=2[a]" \
       -map "[v]" -map "[a]" \
       -vf "subtitles=subtitles.srt" \
       -c:v libx264 -preset medium -crf 20 \
       -c:a aac -b:a 192k \
       chapter_01.mp4
```

## Миграция из старой системы

### Было (старая система):
```typescript
// Все смешивалось в одну папку
zip.file('final_audio.wav', combinedAudio);
zip.file('subtitles.srt', allSubtitles);
for (let i = 0; i < images.length; i++) {
    zip.file(`images/${i}.png`, images[i]);
}
```

### Стало (новая система):
```typescript
// Каждая глава независима
for (let i = 0; i < chapters.length; i++) {
    const chapterFolder = zip.folder(`chapters/chapter_${i+1}`);
    chapterFolder.file('audio.wav', chapter.audioBlob);
    chapterFolder.file('subtitles.srt', chapterSrt);
    chapterFolder.file('music.mp3', trimmedMusicBlob);
    // ...
}
```

## Преимущества

1. **Модульность** - каждая глава независима
2. **Отладка** - легко найти и пересобрать проблемную главу
3. **Точность** - правильные тайминги для всех ресурсов
4. **Качество** - все ресурсы обрезаны под нужную длину
5. **Надежность** - музыка и SFX скачиваются и валидируются
6. **Чистота** - субтитры без артефактов кодировки

## Устранение проблем

### Музыка не загружается
- Проверьте, что `chapter.backgroundMusic.audio` содержит валидный URL
- Убедитесь, что URL начинается с `https://`
- Проверьте логи упаковки на ошибки HTTP

### SFX не работают
- Убедитесь, что `line.soundEffect.previews` содержит хотя бы один URL
- Проверьте `metadata.json` на корректные тайминги
- Проверьте, что файлы существуют в папке `sfx/`

### Субтитры с артефактами
- Убедитесь, что используется новая функция `cleanSubtitleText()`
- Проверьте кодировку исходного текста от AI

### Изображения не все используются
- Проверьте `metadata.json` - поле `imageCount`
- Убедитесь, что все файлы существуют в `images/`
- Проверьте расчет `imageDuration` в метаданных

## Технические детали

### Обрезка аудио
- Использует Web Audio API
- Fade out 1 секунда в конце
- Конвертация в WAV (совместимость с FFmpeg)

### Валидация музыки
```typescript
const validateMusicUrl = async (url: string): Promise<boolean> => {
    const response = await fetch(url, { method: 'HEAD' });
    const contentType = response.headers.get('content-type');
    return response.ok && contentType?.includes('audio');
};
```

### Очистка субтитров
```typescript
const cleanSubtitleText = (text: string): string => {
    return text
        .replace(/â€"/g, '—')  // em-dash
        .replace(/â€œ/g, '"')  // quotes
        .replace(/â€™/g, "'")  // apostrophe
        .replace(/[\u0000-\u001F]/g, '') // control chars
        .trim();
};
```

## Roadmap

- [ ] Параллельная обработка глав в FFmpeg
- [ ] Прогресс-бар для каждой главы
- [ ] Предпросмотр отдельной главы
- [ ] Экспорт только выбранных глав
- [ ] Альтернативные форматы (WebM, AVI)
