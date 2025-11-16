import express from 'express';
import cors from 'cors';
import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '500mb' })); // Большой лимит для base64

// Default developer key for Freesound, mirroring appConfig.ts
const DEFAULT_FREESOUND_KEY = '4E54XDGL5Pc3V72TQfSo83WZMb600FE2k9gPf6Gk';

// API Routes
app.get('/api/audio-proxy', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid url parameter' });
    }

    // Validate URL format and domain
    let targetUrl;
    try {
      targetUrl = decodeURIComponent(url);
      const parsedUrl = new URL(targetUrl);
      
      // Allow freesound.org and jamendo.com domains for security
      if (!parsedUrl.hostname.includes('freesound.org') && !parsedUrl.hostname.includes('jamendo.com')) {
        console.warn(`Audio proxy: Blocked request to non-allowed domain: ${parsedUrl.hostname}`);
        return res.status(403).json({ error: 'Only freesound.org and jamendo.com URLs are allowed' });
      }
    } catch (error) {
      console.error('Audio proxy: Invalid URL format:', url);
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    console.log(`Audio proxy: Streaming audio from ${targetUrl}`);

    // Fetch the audio file
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mystic-Narratives-AI/1.0 (Audio Proxy)',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Audio proxy error: ${response.statusText}`, errorText);
      return res.status(response.status).json({
        error: `Failed to fetch audio: ${response.statusText}`,
        details: errorText,
      });
    }

    // Get content type from response or default to audio/mpeg
    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    
    // Get content length if available
    const contentLength = response.headers.get('content-length');

    // Set headers for audio streaming
    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

    // Stream the audio data
    const audioBuffer = await response.arrayBuffer();
    res.status(200).send(Buffer.from(audioBuffer));

    console.log(`Audio proxy: Successfully streamed ${audioBuffer.byteLength} bytes from ${targetUrl}`);

  } catch (error) {
    console.error('Audio proxy error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.post('/api/freesound', async (req, res) => {
  // Add a header to indicate this proxy was invoked
  res.setHeader('X-Dev-Proxy-Invoked', 'true');
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Missing query parameter' });
    }

    const apiKey = DEFAULT_FREESOUND_KEY;
    console.log("Dev Server: Using hardcoded default Freesound API key.");

    if (!apiKey) {
      const errorMessage = "Freesound API key is not configured. A default key must be hardcoded in dev-server.js.";
      console.error(errorMessage);
      return res.status(500).json({
        error: "Internal Server Error",
        details: errorMessage,
      });
    }

    const searchUrl = `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(query)}&fields=id,name,previews,license,username&sort=relevance&page_size=15`;

    const response = await fetch(searchUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(15000), // Add 15s timeout
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Freesound API Error: ${response.statusText}`, errorText);
      return res.status(response.status).json({
        error: `Freesound API Error: ${response.statusText}`,
        details: errorText,
      });
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('Freesound proxy error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.post('/api/download-image', async (req, res) => {
  try {
    const { url, source, apiKey } = req.body;

    if (!url || typeof url !== 'string' || !source || !apiKey) {
      return res.status(400).json({ error: 'Missing or invalid parameters: url, source, and apiKey are required.' });
    }

    // Validate URL format and domain
    let targetUrl;
    try {
      targetUrl = url;
      const parsedUrl = new URL(targetUrl);
      
      // Only allow unsplash.com and pexels.com domains for security
      if (!parsedUrl.hostname.includes('unsplash.com') && !parsedUrl.hostname.includes('pexels.com')) {
        console.warn(`Image download proxy: Blocked request to non-stock-photo domain: ${parsedUrl.hostname}`);
        return res.status(403).json({ error: 'Only unsplash.com and pexels.com URLs are allowed' });
      }
    } catch (error) {
      console.error('Image download proxy: Invalid URL format:', url);
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    console.log(`Image download proxy: Downloading image from ${targetUrl}`);

    let authHeader = {};
    if (source === 'unsplash') {
        authHeader = { 'Authorization': `Client-ID ${apiKey}` };
    } else if (source === 'pexels') {
        authHeader = { 'Authorization': apiKey };
    }

    // Fetch the image file
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mystic-Narratives-AI/1.0 (Image Download Proxy)',
        ...authHeader
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Image download proxy error: ${response.statusText}`, errorText);
      return res.status(response.status).json({
        error: `Failed to fetch image: ${response.statusText}`,
        details: errorText,
      });
    }

    // Get content type from response or default to image/jpeg
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    
    // Convert to ArrayBuffer and then to base64
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    
    // Return base64 with Data URL scheme
    const dataUrl = `data:${contentType};base64,${base64}`;

    console.log(`Image download proxy: Successfully downloaded ${arrayBuffer.byteLength} bytes from ${targetUrl}`);

    res.status(200).json({ 
      base64: dataUrl
    });

  } catch (error) {
    console.error('Image download proxy error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Project export endpoint for local FFmpeg video generation
app.post('/api/export-project', async (req, res) => {
  try {
    const { projectId, metadata, chapters, settings } = req.body;
    
    if (!projectId || !chapters || chapters.length === 0) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    
    console.log(`📦 Получен проект: ${projectId}`);
    
    // 1. Создать директорию
    const projectDir = path.resolve(`./projects/${projectId}`);
    await fs.mkdir(`${projectDir}/audio`, { recursive: true });
    await fs.mkdir(`${projectDir}/images`, { recursive: true });
    
    // 2. Сохранить метаданные
    const manifest = {
      projectId,
      metadata,
      settings,
      chapters: []
    };
    
    // 3. Сохранить файлы для каждой главы
    for (const [index, chapter] of chapters.entries()) {
      
      const chapterManifest = {
        id: chapter.id,
        title: chapter.title,
        duration: chapter.duration,
        files: {
          speech: `audio/chapter-${index}-speech.mp3`,
          image: `images/chapter-${index}.jpg`
        },
        musicVolume: chapter.musicVolume,
        sfx: []
      };
      
      // Сохранить аудио
      await saveBase64ToFile(
        chapter.speechAudio,
        path.join(projectDir, chapterManifest.files.speech)
      );
      
      // Сохранить изображение
      await saveBase64ToFile(
        chapter.image,
        path.join(projectDir, chapterManifest.files.image)
      );
      
      // Сохранить музыку (если есть)
      if (chapter.musicAudio) {
        chapterManifest.files.music = `audio/chapter-${index}-music.mp3`;
        await saveBase64ToFile(
          chapter.musicAudio,
          path.join(projectDir, chapterManifest.files.music)
        );
      }
      
      // Сохранить SFX
      if (chapter.sfx && chapter.sfx.length > 0) {
        for (const [sfxIndex, sfx] of chapter.sfx.entries()) {
          const sfxFile = `audio/chapter-${index}-sfx-${sfxIndex}.mp3`;
          await saveBase64ToFile(
            sfx.audio,
            path.join(projectDir, sfxFile)
          );
          chapterManifest.sfx.push({
            file: sfxFile,
            timestamp: sfx.timestamp,
            volume: sfx.volume
          });
        }
      }
      
      manifest.chapters.push(chapterManifest);
    }
    
    // 4. Сохранить manifest.json
    await fs.writeFile(
      path.join(projectDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );
    
    console.log(`✅ Проект сохранён: ${projectDir}`);
    
    // 5. Запустить CLI для сборки видео (в фоне)
    const cliCommand = `node cli/build.js "${projectDir}"`;
    console.log(`🎬 Запуск: ${cliCommand}`);
    
    // Запускаем CLI в фоне, не дожидаясь завершения
    execPromise(cliCommand)
      .then(() => console.log(`✅ Видео готово: ${projectId}`))
      .catch((err) => console.error(`❌ Ошибка сборки:`, err));
    
    // 6. Вернуть ответ сразу
    res.status(200).json({
      success: true,
      projectId,
      message: 'Проект сохранён, сборка началась'
    });
    
  } catch (error) {
    console.error('Ошибка:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

async function saveBase64ToFile(base64Data, filePath) {
  // Определяем MIME тип и расширение
  let mimeType = 'image/jpeg'; // default
  let extension = '.jpg';
  
  if (base64Data.startsWith('data:')) {
    const matches = base64Data.match(/^data:([^;]+);base64,/);
    if (matches && matches[1]) {
      mimeType = matches[1];
      if (mimeType.includes('png')) {
        extension = '.png';
      } else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
        extension = '.jpg';
      } else if (mimeType.includes('webp')) {
        extension = '.webp';
      } else if (mimeType.includes('mp3')) {
        extension = '.mp3';
      } else if (mimeType.includes('wav')) {
        extension = '.wav';
      }
    }
    // Убираем data URL префикс
    base64Data = base64Data.replace(/^data:([^;]+);base64,/, '');
  }
  
  // Корректируем путь файла с правильным расширением
  const finalFilePath = filePath.replace(/\.[^/.]+$/, '') + extension;
  
  const buffer = Buffer.from(base64Data, 'base64');
  await fs.writeFile(finalFilePath, buffer);
  return finalFilePath;
}

// Handle preflight requests
app.options('/api/*', cors());

app.listen(PORT, () => {
  console.log(`Development API server running on http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log('  GET /api/audio-proxy?url=<encoded_url>');
  console.log('  POST /api/download-image (body: { url, source, apiKey })');
  console.log('  POST /api/freesound (body: { query })');
  console.log('  POST /api/export-project (body: { projectId, metadata, chapters, settings })');


// TEST: Проверка Gemini API ключа
app.get('/api/test-gemini', async (req, res) => {
  try {
    // Получить ключ из query параметра (для тестирования)
    const apiKey = req.query.key;
    
    if (!apiKey) {
      return res.status(400).json({ 
        success: false,
        error: 'API ключ не передан',
        hint: 'Добавь ?key=YOUR_API_KEY в URL'
      });
    }

    console.log('🔑 Проверка Gemini API ключа...');
    console.log('🔑 Первые 10 символов:', apiKey.substring(0, 10) + '...');

    // Тестовый запрос к Gemini API
    const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(testUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: 'Скажи "Привет, ключ работает!"' }]
        }]
      })
    });

    const data = await response.json();

    if (response.ok && data.candidates) {
      const geminiResponse = data.candidates[0]?.content?.parts[0]?.text || 'OK';
      
      console.log('✅ Gemini API ключ работает!');
      console.log('📝 Ответ Gemini:', geminiResponse);
      
      res.status(200).json({
        success: true,
        message: '✅ КЛЮЧ РАБОТАЕТ!',
        apiKey: apiKey.substring(0, 10) + '...',
        model: 'gemini-2.5-flash',
        geminiResponse: geminiResponse
      });
    } else {
      console.error('❌ Gemini API ключ НЕ работает:', data.error);
      
      res.status(response.status || 400).json({
        success: false,
        message: '❌ КЛЮЧ НЕ РАБОТАЕТ',
        error: data.error || 'Unknown error',
        apiKey: apiKey.substring(0, 10) + '...'
      });
    }

  } catch (error) {
    console.error('❌ Ошибка проверки:', error);
    res.status(500).json({
      success: false,
      message: '❌ ОШИБКА ПРОВЕРКИ',
      error: error.message
    });
  }
});

// Handle preflight requests
app.options('/api/*', cors());

app.listen(PORT, () => {
  console.log(`Development API server running on http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log('  GET /api/audio-proxy?url=<encoded_url>');
  console.log('  POST /api/download-image (body: { url, source, apiKey })');
  console.log('  POST /api/freesound (body: { query })');
  console.log('  POST /api/export-project (body: { projectId, metadata, chapters, settings })');
  console.log('  GET /api/test-gemini?key=<your_api_key>'); // ← НОВЫЙ
});