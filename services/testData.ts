import { Podcast, Chapter, GeneratedImage } from '../types';

// This is a blueprint, so it doesn't have all Podcast fields like id, topic, etc.
// It has core creative content needed for test.
export const TEST_PODCAST_BLUEPRINT: Omit<Podcast, 'id' | 'topic' | 'selectedTitle' | 'youtubeThumbnails' | 'designConcepts' | 'knowledgeBaseText' | 'creativeFreedom' | 'totalDurationMinutes' | 'language' | 'narrationMode' | 'characterVoices' | 'monologueVoice' | 'initialImageCount' | 'backgroundMusicVolume' | 'thumbnailBaseImage'> = {
  youtubeTitleOptions: ["Тестовый Заголовок: Тайна Маяка", "Что случилось на старом маяке?", "Маяк Потерянных Душ"],
  description: "Это тестовый подкаст, созданный для проверки видео-движка. Он рассказывает вымышленную историю о старом, заброшенном маяке и его таинственном смотрителе.\n\nПодробности и источники: [https://vk.com/wall-123_456|Исследование в VK] и [https://example.com/source|Дополнительные материалы]",
  seoKeywords: ["тест", "видео", "ffmpeg", "маяк", "тайна", "мистика"],
  characters: [
    { name: "Рассказчик", description: "Мужчина, спокойный, глубокий голос." },
    { name: "Историк", description: "Женщина, ясный, информативный голос." }
  ],
  sources: [],
  chapters: [
    {
      id: 'test-chapter-1',
      title: "Глава I: Шепот у Скал",
      script: [
        { speaker: "SFX", text: "Звук волн, разбивающихся о скалы, крики чаек" },
        { speaker: "Рассказчик", text: "На краю мира, где земля встречается с безжалостным океаном, стоит Он. Одинокий страж. Маяк на мысе Отчаяния. [https://vk.com/photo123_456|Фотография маяка 1890 года]" },
        { speaker: "Историк", text: "Его построили в 1888 году. Записи говорят, что первый смотритель, Аластор Кейн, был человеком молчаливым и замкнутым. См. [https://example.com/archive|Архивные документы]." },
        { speaker: "Рассказчик", text: "Говорят, он разговаривал с туманом. И туман... отвечал ему." }
      ],
      imagePrompts: [
        "An ancient, weathered lighthouse on a rocky cliff during a storm, dramatic waves crashing, cinematic, hyperrealistic",
        "A black and white photo of a 19th-century lighthouse keeper with a stern look, holding a lantern, mysterious atmosphere",
        "A dense fog rolling in from ocean, obscuring the base of a tall lighthouse, eerie, lovecraftian horror"
      ],
      generatedImages: [
        { url: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4MCIgaGVpZ2h0PSI3MjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEyODAiIGhlaWdodD0iNzIwIiBmaWxsPSIjMWUyOTNiIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSI2MCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5UZXN0IEltYWdlIDE6IExpZ2h0aG91c2U8L3RleHQ+PC9zdmc+", source: 'generated' },
        { url: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4MCIgaGVpZ2h0PSI3MjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEyODAiIGhlaWdodD0iNzIwIiBmaWxsPSIjMWUyOTNiIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSI2MCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5UZXN0IEltYWdlIDI6IEtlZXBlcjwvdGV4dD48L3N2Zz4=", source: 'generated' },
        { url: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4MCIgaGVpZ2h0PSI3MjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEyODAiIGhlaWdodD0iNzIwIiBmaWxsPSIjMWUyOTNiIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSI2MCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5UZXN0IEltYWdlIDM6IEZvZzwvdGV4dD48L3N2Zz4=", source: 'generated' }
      ],
      status: 'pending',
      selectedBgIndex: 0
    },
    {
      id: 'test-chapter-2',
      title: "Глава II: Потерянный Журнал",
      script: [
        { speaker: "SFX", text: "звук перелистываемых старых, хрупких страниц" },
        { speaker: "Историк", text: "Мы нашли его журнал. Последняя запись датирована 31 октября 1899 года. Она была странной." },
        { speaker: "Рассказчик", text: "Он писал: 'Свет больше не мой. Он принадлежит Ему. Тому, кто ждет в глубине'." },
        { speaker: "SFX", text: "Глубокий, потусторонний гул, который медленно затихает" },
        { speaker: "Историк", text: "На следующий день маяк был пуст. Аластор Кейн исчез. Бесследно." }
      ],
      imagePrompts: [
        "An old, leather-bound journal open to a page with frantic, barely legible handwriting, a sputtering candle nearby",
        "The interior of a lighthouse lantern room, giant lens reflecting an empty, swirling void instead of light",
        "A vast, dark ocean under a starless sky, with a subtle, ominous glow coming from deep below, cosmic horror"
      ],
      generatedImages: [
         { url: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4MCIgaGVpZ2h0PSI3MjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEyODAiIGhlaWdodD0iNzIwIiBmaWxsPSIjMzM0MTU1Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSI2MCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5UZXN0IEltYWdlIDQ6IEpvdXJuYWw8L3RleHQ+PC9zdmc+", source: 'generated' },
         { url: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4MCIgaGVpZ2h0PSI3MjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEyODAiIGhlaWdodD0iNzIwIiBmaWxsPSIjMzM0MTU1Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSI2MCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5UZXN0IEltYWdlIDU6IExlbnM8L3RleHQ+PC9zdmc+", source: 'generated' },
         { url: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTI4MCIgaGVpZ2h0PSI3MjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEyODAiIGhlaWdodD0iNzIwIiBmaWxsPSIjMzM0MTU1Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSI2MCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5UZXN0IEltYWdlIDY6IE9jZWFuPC90ZXh0Pjwvc3ZnPg==", source: 'generated' }
       ],
      status: 'pending',
      selectedBgIndex: 0
    }
  ]
};