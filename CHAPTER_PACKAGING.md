# Chapter-Based Packaging System

## Обзор
Новая система упаковки организует проект по главам, где каждая глава — это автономный блок с собственными ресурсами.

## Структура архива
```
project_archive.zip
├── chapters/
│   ├── chapter_01/
│   │   ├── audio.wav           # Речь главы
│   │   ├── subtitles.srt       # Субтитры главы (очищенные)
│   │   ├── music.wav           # Музыка (обрезана)
│   │   ├── images/             # Изображения главы
│   │   ├── sfx/                # Звуковые эффекты
│   │   └── metadata.json       # Метаданные главы
│   ├── chapter_02/
│   └── ...
├── assemble_video.bat          # Скрипт сборки FFmpeg
└── project_metadata.json       # Общие данные проекта
```

## Метаданные главы (metadata.json)
```json
{
  "chapterNumber": 1,
  "title": "Dark Streets",
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
      "filePath": "sfx/thunder.wav"
    }
  ]
}
```

## Ключевые улучшения
- Каждая глава хранит ВСЁ своё: audio, music, images, sfx, субтитры, тайминги.
- Музыка и SFX обрезаются под главу, fade-out автоматом.
- Поддержка legacy images[] (dataURL) и новой схемы backgroundImages с blob.
- exportZip теперь собирает модульную структуру, а не "всё в одну папку".
- FFmpeg-сборка через скрипт assemble_video.bat.

## Использование
- Используй packageProjectByChapters для экспорта проекта.
- Фоновая генерация изображений — через generateImagesWithBlobs.
- Цвет/громкость/параметры выставляются в объекте Podcast/Chapter.
- Для ручного экспорта главы используй готовые ресурсы из chapters/chapter_N.

## Траблшутинг
- Проверь, что backgroundImages генерируется функцией imageService и содержит blob.
- Для старых projects (без backgroundImages) — сохранён fallback: images[] (dataURL).
- Импортируй все новые типы из types.ts.
- Скрипт .bat учитывает .wav для SFX и музыки.

## Roadmap
- [ ] Финальная интеграция в UI.
- [ ] Прогресс-бар упаковки.
- [ ] Preview минифрагмента главы (рекомендовано).
- [ ] Support WebM помимо MP4.
