```markdown
# 🚀 Multi-Channel YouTube Podcast System - Implementation Plan

**[Скачать на GitHub](https://github.com/crosspostly/youtube_podcast/blob/main/docs/MULTI_CHANNEL_IMPLEMENTATION_PLAN.md)**

***

## 📋 EXECUTIVE SUMMARY

**Цель:** Расширить youtube_podcast на **Multi-Channel систему** для одновременного производства контента на несколько YouTube каналов (historical-tier1, christian, etc.)

**Бизнес-эффект:**
- 1 запуск → **5+ видео** (3 long-form + 2 shorts на канал)
- 1 час работы → **3 канала** с контентом
- **Автоматическая связь** shorts → long-form для роста

**Timeline:** 3 недели (15 рабочих дней)

***

## 🎯 TASK BREAKDOWN (15 заданий для AI агента)

### **WEEK 1: Архитектура + Historical Channel (5 дней)**

#### **📦 TASK 1: Channel Types & Base Config**
**Файлы:** `types/channel.ts`, `channels/shared/baseConfig.ts`
**Описание:** Создать TypeScript типы и базовую конфигурацию для всех каналов
**Приоритет:** 🔴 CRITICAL
**Время:** 2 часа
```
КОНТЕКСТ: Это фундамент Multi-Channel системы. Без типов не будет ничего.
ЗАДАЧА: Создать типы ChannelConfig, ContentPlan, PlannedVideo + базовый config
ПРИМЕР: channels/historical-tier1/channelConfig.ts должен работать сразу
```

#### **📦 TASK 2: Historical Tier1 Channel Config**
**Файлы:** `channels/historical-tier1/channelConfig.ts`
**Описание:** Полная конфигурация для исторического канала 50+ Tier1
**Приоритет:** 🔴 CRITICAL  
**Время:** 1.5 часа
```
КОНТЕКСТ: Первый реальный канал. Должен работать с текущими промптами.
ЗАДАЧА: Перенести 50+ настройки в channelConfig + добавить SEO формулы
ПРОВЕРКА: npm run dev → historical-tier1 должен отображаться в селекте
```

#### **📦 TASK 3: Content Planner Core**
**Файлы:** `services/contentPlanner.ts`
**Описание:** AI планировщик серий видео (5 long-form + 10 shorts)
**Приоритет:** 🟠 HIGH
**Время:** 3 часа
```
КОНТЕКСТ: Сердце системы. Генерирует план из "Ancient Rome mysteries" → 15 видео
ЗАДАЧА: generateTopics(), planBatch() + JSON парсинг из Gemini
ПРИМЕР: planBatch({mainTopic: "Rome", longFormCount: 3}) → ContentPlan
```

#### **📦 TASK 4: Shared Prompts Refactor** 
**Файлы:** `channels/shared/{retention.ts, audio50plus.ts, accessibility.ts}`
**Описание:** Вынести общие промпты из prompts.ts в channels/shared/
**Приоритет:** 🟡 MEDIUM
**Время:** 2 часа
```
КОНТЕКСТ: prompts.ts раздулся. Нужно модульность.
ЗАДАЧА: getRetentionAnchorsInstructions() → channels/shared/retention.ts
ПРОВЕРКА: npm test prompts → все тесты проходят
```

#### **📦 TASK 5: Week 1 Integration Test**
**Файлы:** `tests/multi-channel.test.ts`
**Описание:** Интеграционный тест: план → производство 1 видео
**Приоритет:** 🟢 LOW
**Время:** 1 час
```
КОНТЕКСТ: Проверить что Week 1 работает вместе
ЗАДАЧА: Создать тест: historical-tier1 → planBatch → produce 1 long-form
ПРОВЕРКА: npm test → 100% pass rate
```

***

### **WEEK 2: Batch Production + Christian Channel (5 дней)**

#### **📦 TASK 6: Batch Producer**
**Файлы:** `services/batchProducer.ts`
**Описание:** Массовое производство по плану (параллельно/последовательно)
**Приоритет:** 🔴 CRITICAL
**Время:** 3 часа
```
КОНТЕКСТ: Контент-фабрика 2.0. Берет ContentPlan → делает 15+ видео
ЗАДАЧА: produceBatch(), organizeIntoFolders(), parallel processing
ПРОВЕРКА: 3 long-form + 6 shorts → batch_xxx/historical-tier1/ структура
```

#### **📦 TASK 7: Christian Channel Config**  
**Файлы:** `channels/christian/channelConfig.ts`
**Описание:** Конфигурация христианского канала (40-60 лет, духовный контент)
**Приоритет:** 🟠 HIGH
**Время:** 2 часа
```
КОНТЕКСТ: Второй канал. Тон спокойный, авторитетный, библейский.
ЗАДАЧА: characters (Pastor John, Bible Scholar Mary), SEO (sermon, scripture)
ПРИМЕР: "The Hidden Meaning of Beatitudes" + 3 shorts
```

#### **📦 TASK 8: Channel-Specific Prompts**
**Файлы:** `channels/historical-tier1/prompts/script.ts`, `channels/christian/prompts/script.ts`
**Описание:** Специфичные промпты для каждого канала (+ shared)
**Приоритет:** 🟠 HIGH
**Время:** 2.5 часа
```
КОНТЕКСТ: Historical = investigative, Christian = inspirational
ЗАДАЧА: historical/script.ts (Lovecraftian mystery), christian/script.ts (sermon style)
ПРОВЕРКА: npm run generate --channel=historical → правильный тон
```

#### **📦 TASK 9: Multi-Channel UI (Channel Selector)**
**Файлы:** `components/ChannelSelector.tsx`, `App.tsx`
**Описание:** UI для выбора каналов + планировщик
**Приоритет:** 🟠 HIGH  
**Время:** 3 часа
```
КОНТЕКСТ: Пользователь выбирает 1-3 канала → планирует контент
ЗАДАЧА: ChannelCard, MultiChannelPlanner, PlanReview
ПРИМЕР: Выбрать historical + christian → "Rome + Psalms" план
```

#### **📦 TASK 10: Week 2 Integration**
**Файлы:** `tests/batch-production.test.ts`
**Описание:** Тест: 2 канала → 10 видео в папки
**Приоритет:** 🟢 LOW
**Время:** 1 час

***

### **WEEK 3: Shorts + Production Dashboard (5 дней)**

#### **📦 TASK 11: Shorts Production Pipeline**
**Файлы:** `services/shortsProducer.ts`
**Описание:** Генерация shorts (30-60 сек) как teasers к long-form
**Приоритет:** 🔴 CRITICAL
**Время:** 3 часа
```
КОНТЕКСТ: Shorts = 80% просмотров → ссылка на long-form
ЗАДАЧА: 30-60 сек, 1 image, hook → "Watch full video" CTA
ПРИМЕР: "Pompeii mystery teaser #1" → ссылка на long-form #001
```

#### **📦 TASK 12: Production Monitor Dashboard**
**Файлы:** `components/ProductionMonitor.tsx`
**Описание:** Мониторинг массового производства (progress, logs)
**Приоритет:** 🟠 HIGH
**Время:** 2 часа
```
КОНТЕКСТ: Headless production + real-time статус
ЗАДАЧА: Progress bar, current video, log stream, pause/resume
ПРИМЕР: "Producing batch_123: 7/15 videos (47%)"
```

#### **📦 TASK 13: Folder Organization System**
**Файлы:** `services/folderOrganizer.ts`
**Описание:** Автоматическая структура папок по каналам/батчам
**Приоритет:** 🟠 HIGH
**Время:** 1.5 часа
```
КОНТЕКСТ: batch_2025-12-01/historical/long-form/001_pompeii/
ЗАДАЧА: createBatchFolder(), organizeVideo(), youtube_upload_info.txt
ПРОВЕРКА: tree downloads/batch_xxx/ → правильная структура
```

#### **📦 TASK 14: YouTube Upload Prep**
**Файлы:** `services/youtubePrep.ts`
**Описание:** Генерация upload_info.txt (titles, desc, tags, schedule)
**Приоритет:** 🟡 MEDIUM
**Время:** 2 часа
```
КОНТЕКСТ: Готовые файлы для массовой загрузки
ЗАДАЧА: title/description/tags из плана + thumbnails + schedule (через 3 дня)
ПРИМЕР: youtube_upload_info.txt с готовыми командами yt-dlp
```

#### **📦 TASK 15: Final Integration + Docs**
**Файлы:** `docs/MULTI_CHANNEL_USAGE.md`, `README.md`
**Описание:** Полная документация + end-to-end тест
**Приоритет:** 🟢 LOW
**Время:** 2 часа
```
КОНТЕКСТ: Система готова → как пользоваться
ЗАДАЧА: Usage guide, troubleshooting, metrics tracking
ПРОВЕРКА: npm run multi-channel-demo → 2 канала, 6 видео, 100% success
```

***

## 🎮 HOW TO USE WITH AI AGENT

### **Промпт для агента (копируй-вставляй):**

```
📦 TASK [№]: [НАЗВАНИЕ]

КОНТЕКСТ: 
Multi-Channel расширение youtube_podcast для 3+ каналов.
Цель: 1 запуск → 15+ видео (long-form + shorts) для всех каналов.

ПРОЕКТ: https://github.com/crosspostly/youtube_podcast/
Текущий статус: 50+ оптимизация готова (PR #56)

ЗАДАЧА:
[описание из таблицы выше]

ФАЙЛЫ ДЛЯ ИЗМЕНЕНИЯ:
- [список файлов]

ПРИОРИТЕТ: [🔴🟠🟡]
ОЖИДАЕМЫЙ РЕЗУЛЬТАТ:
[конкретная проверка]

КОММИТ MESSAGE: 
"feat(multi-channel): [TASK NAME]"

СДЕЛАЙ:
1. Код + тесты
2. Документация в docs/
3. npm test ✅
4. Создай PR с четким описанием
```

### **Пример промпта для TASK 1:**
```
📦 TASK 1: Channel Types & Base Config

КОНТЕКСТ: Multi-Channel расширение youtube_podcast для 3+ каналов.

ПРОЕКТ: https://github.com/crosspostly/youtube_podcast/

ЗАДАЧА: Создать TypeScript типы ChannelConfig, ContentPlan, PlannedVideo

ФАЙЛЫ:
- types/channel.ts 
- channels/shared/baseConfig.ts

ОЖИДАЕМЫЙ РЕЗУЛЬТАТ: 
npm run type-check → 0 errors

КОММИТ: "feat(multi-channel): task 1 - channel types & base config"
```

***

## ✅ SUCCESS METRICS

| Metric | Before | Target | Check |
|--------|--------|--------|-------|
| Videos per run | 1 | **15+** | `batchProducer.test.ts` |
| Channels supported | 1 | **3+** | UI ChannelSelector |
| Production time | 60min/video | **4min/video** | ProductionMonitor |
| Folder organization | Manual | **Automatic** | `tree downloads/batch_*` |
| Shorts → Long-form | Manual | **Automatic** | `linkedLongForm` field |

***

## 🚀 QUICK START (после TASK 15)

```
# 1. Выбрать каналы
npm run dev
# ChannelSelector → historical-tier1 + christian ✓

# 2. Спланировать контент
Main Topic: "Ancient Rome + Psalms"
Long-form: 3 per channel
Shorts: 2 per long-form
→ Generate Plan (15 videos) ✓

# 3. Массовое производство
Start Production → batch_2025-12-01/
historical-tier1/ (9 videos)
christian/ (6 videos) ✓

# 4. Готово к загрузке!
tree downloads/batch_*/ → youtube_upload_info.txt везде
```

***

**[СОЗДАНО: 01.12.2025]**  
**Автор: Perplexity AI**  
**Статус: Готово к реализации по задачам!**

***

**Теперь бери TASK 1 и отправляй агенту!** 🎯
```
