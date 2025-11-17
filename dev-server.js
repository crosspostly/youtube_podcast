// dev-server.js

import express from 'express';
import cors from 'cors';
import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import https from 'https';

const execPromise = promisify(exec);

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '500mb' }));

const DEFAULT_FREESOUND_KEY = '4E54XDGL5Pc3V72TQfSo83WZMb600FE2k9gPf6Gk';

let ffmpegAvailable = false;

async function checkFfmpeg() {
  try {
    await execPromise('ffmpeg -version');
    console.log('✅ FFmpeg is installed and available in PATH.');
    return true;
  } catch (error) {
    console.error('❌ FFmpeg not found. The "Local FFmpeg" video generation feature will not work.');
    console.error('   Please install FFmpeg and ensure it is in your system\'s PATH.');
    console.error('   For download instructions, see: https://ffmpeg.org/download.html');
    return false;
  }
}


// 
======================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Download image using Node.js https module as fallback
 */
const downloadImageWithHttps = (url, headers = {}) => {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mystic-Narratives-AI/1.0 (Image Download Proxy)',
        'Accept': 'image/*,*/*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Accept-Language': 'en-US,en;q=0.9',
        ...headers
      },
      timeout: 30000
    };

    console.log(`Image download: Trying HTTPS fallback for ${url}`);
    
    const req = https.request(options, (res) => {
      const chunks = [];
      
      res.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      res.on('end', () => {
        try {
          const buffer = Buffer.concat(chunks);
          const contentType = res.headers['content-type'] || 'image/jpeg';
          resolve({
            data: buffer,
            contentType: contentType,
            status: res.statusCode
          });
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.error('HTTPS request error:', error);
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('HTTPS request timeout'));
    });

    req.end();
  });
};

// ============================================================================
// API ROUTES
// ============================================================================

app.get('/api/audio-proxy', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid url parameter' });
    }

    let targetUrl;
    try {
      targetUrl = decodeURIComponent(url);
      const parsedUrl = new URL(targetUrl);
      
      if (!parsedUrl.hostname.includes('freesound.org') && !parsedUrl.hostname.includes('jamendo.com')) {
        console.warn(`Audio proxy: Blocked request to non-allowed domain: ${parsedUrl.hostname}`);
        return res.status(403).json({ error: 'Only freesound.org and jamendo.com URLs are allowed' });
      }
    } catch (error) {
      console.error('Audio proxy: Invalid URL format:', url);
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    console.log(`Audio proxy: Streaming audio from ${targetUrl}`);

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

    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    const contentLength = response.headers.get('content-length');

    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

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
  res.setHeader('X-Dev-Proxy-Invoked', 'true');
  try {
    const { query, customApiKey } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Missing query parameter' });
    }
    
    const apiKey = customApiKey?.trim() || DEFAULT_FREESOUND_KEY;
    console.log(`Dev Server: Using Freesound API key (custom: ${!!customApiKey?.trim()}).`);

    if (!apiKey) {
      const errorMessage = "Freesound API key is not configured.";
      console.error(errorMessage);
      return res.status(500).json({
        error: "Internal Server Error",
        details: errorMessage,
      });
    }

    const searchUrl = `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(query)}&fields=id,name,previews,license,username&sort=relevance&page_size=15`;

    const response = await fetch(searchUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(15000),
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
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const retries = 3;
  let attempt = 1;

  while (attempt <= retries) {
    try {
      targetUrl = url;
      const parsedUrl = new URL(targetUrl);
      
      if (!parsedUrl.hostname.includes('unsplash.com') && !parsedUrl.hostname.includes('pexels.com')) {
        console.warn(`Image download proxy: Blocked request to non-stock-photo domain: ${parsedUrl.hostname}`);
        return res.status(403).json({ error: 'Only unsplash.com and pexels.com URLs are allowed' });
      }
    } catch (error) {
      console.error('Image download proxy: Invalid URL format:', url);
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    console.log(`Image download proxy: Downloading image from ${targetUrl} (source: ${source})`);

    // For Unsplash, we need to get the actual download URL first
    if (source === 'unsplash') {
      try {
        console.log(`Image download proxy: Getting Unsplash download_location for ${targetUrl}`);
        const downloadResponse = await fetch(targetUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Client-ID ${apiKey}`,
            'Accept': 'application/json',
            'User-Agent': 'Mystic-Narratives-AI/1.0 (Image Download Proxy)'
          },
          signal: AbortSignal.timeout(10000) // 10 seconds for API call
        });

        if (!downloadResponse.ok) {
          const errorText = await downloadResponse.text();
          console.error(`Unsplash download_location error: ${downloadResponse.statusText}`, errorText);
          throw new Error(`Unsplash download_location failed: ${downloadResponse.status}`);
        }

        const downloadData = await downloadResponse.json();
        if (!downloadData.url) {
          throw new Error('Unsplash download_location response missing URL');
        }

        targetUrl = downloadData.url;
        console.log(`Image download proxy: Got actual download URL: ${targetUrl}`);
      } catch (error) {
        console.error('Failed to get Unsplash download_location:', error);
        // Continue with original URL as fallback
      }
    }

      if (!url || typeof url !== 'string' || !source || !apiKey) {
        return res.status(400).json({ error: 'Missing or invalid parameters: url, source, and apiKey are required.' });
      }
      
      console.log(`Image download proxy: Downloading image from ${url} (Attempt ${attempt}/${retries})`);

      let imageResponse;

        const headers = {
          'User-Agent': 'Mystic-Narratives-AI/1.0 (Image Download Proxy)',
          'Accept': 'image/*,*/*',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Sec-Fetch-Dest': 'image',
          'Sec-Fetch-Mode': 'no-cors',
          'Sec-Fetch-Site': 'cross-site',
          ...authHeader
        };

        console.log(`Image download attempt ${attempt}/3: Fetching ${targetUrl} with headers:`, Object.keys(headers));

        let response, arrayBuffer, contentType;

        try {
          response = await fetch(targetUrl, {
            method: 'GET',
            headers: headers,
            signal: controller.signal
          });

          clearTimeout(timeout);

          if (!response.ok) {
            // Don't retry on client-side errors (4xx)
            if (response.status >= 400 && response.status < 500) {
                const errorText = await response.text();
                console.error(`Image download proxy error: ${response.status} ${response.statusText}`, errorText);
                return res.status(response.status).json({
                  error: `Failed to fetch image: ${response.statusText}`,
                  details: errorText,
                });
            }
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
          }

          contentType = response.headers.get('content-type') || 'image/jpeg';
          const contentLength = response.headers.get('content-length');
          console.log(`Image download: Got response with content-type: ${contentType}, content-length: ${contentLength}`);

          arrayBuffer = await response.arrayBuffer();
          
        } catch (fetchError) {
          clearTimeout(timeout);
          console.error(`Fetch failed on attempt ${attempt}, trying HTTPS fallback:`, fetchError.message);
          
          // Try HTTPS fallback
          try {
            const httpsResult = await downloadImageWithHttps(targetUrl, authHeader);
            
            if (httpsResult.status && httpsResult.status >= 400) {
              if (httpsResult.status >= 400 && httpsResult.status < 500) {
                return res.status(httpsResult.status).json({
                  error: `Failed to fetch image: HTTPS fallback returned ${httpsResult.status}`,
                });
              }
              throw new Error(`HTTPS fallback server error: ${httpsResult.status}`);
            }
            
            arrayBuffer = httpsResult.data;
            contentType = httpsResult.contentType;
            console.log(`HTTPS fallback succeeded on attempt ${attempt}: ${arrayBuffer.byteLength} bytes`);
            
          } catch (httpsError) {
            console.error(`HTTPS fallback also failed on attempt ${attempt}:`, httpsError.message);
            throw fetchError; // Throw the original fetch error
          }
        }
        
        console.log(`Image download proxy: Unsplash redirected. Fetching final URL.`);
        
        imageResponse = await fetch(location, {
          headers: { 'User-Agent': 'Mystic-Narratives-AI/1.0 (Image Download Proxy)' }
        });
      } else { // For Pexels
        imageResponse = await fetch(url, {
          headers: {
            'Authorization': apiKey,
            'User-Agent': 'Mystic-Narratives-AI/1.0 (Image Download Proxy)',
          }
        });
      }

        const base64 = Buffer.from(arrayBuffer).toString('base64');
        const dataUrl = `data:${contentType};base64,${base64}`;

        console.log(`Image downloaded successfully: ${arrayBuffer.byteLength} bytes, content-type: ${contentType}`);
        return res.status(200).json({ base64: dataUrl });

      } catch (error) {
        lastError = error;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorCause = error instanceof Error ? error.cause : undefined;
        const errorCode = error instanceof Error && 'code' in error ? error.code : undefined;
        
        console.error(`Image download attempt ${attempt}/3 failed:`, {
          message: errorMessage,
          cause: errorCause,
          code: errorCode,
          url: targetUrl,
          stack: error instanceof Error ? error.stack : undefined
        });
        
        if (attempt < 3) {
          const delay = 2000 * attempt;
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;

  } catch (error) {
    console.error('Image download proxy uncaught error:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        name: error instanceof Error ? error.name : 'Unknown',
        cause: error instanceof Error ? error.cause : undefined,
        code: error instanceof Error && 'code' in error ? error.code : undefined,
        url: targetUrl || (req.body ? req.body.url : 'URL not available'),
        stack: error instanceof Error ? error.stack : undefined
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});


app.post('/api/export-project', async (req, res) => {
  if (!ffmpegAvailable) {
    console.error('❌ FFmpeg not available, cannot build video.');
    return res.status(500).json({
      error: 'FFmpeg not found',
      message: 'FFmpeg is not installed or not in your system\'s PATH. Local video generation is disabled.'
    });
  }
    
  try {
    const { projectId, metadata, chapters, settings, srtData } = req.body;
    
    if (!projectId || !chapters || chapters.length === 0) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    
    console.log(`📦 Получен проект: ${projectId}`);
    
    const projectDir = path.resolve(`./projects/${projectId}`);
    await fs.mkdir(`${projectDir}/audio`, { recursive: true });
    await fs.mkdir(`${projectDir}/images`, { recursive: true });
    
    const manifest = {
      projectId,
      metadata,
      settings,
      chapters: []
    };
    
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
      
      await saveBase64ToFile(
        chapter.speechAudio,
        path.join(projectDir, chapterManifest.files.speech)
      );
      
      await saveBase64ToFile(
        chapter.image,
        path.join(projectDir, chapterManifest.files.image)
      );
      
      if (chapter.musicAudio) {
        chapterManifest.files.music = `audio/chapter-${index}-music.mp3`;
        await saveBase64ToFile(
          chapter.musicAudio,
          path.join(projectDir, chapterManifest.files.music)
        );
      }
      
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

    if (srtData) {
      const srtContent = Buffer.from(srtData.split(',')[1], 'base64').toString('utf8');
      await fs.writeFile(path.join(projectDir, 'subtitles.srt'), srtContent, 'utf-8');
      manifest.srtFile = 'subtitles.srt';
      console.log(`📝 Субтитры сохранены: subtitles.srt`);
    }
    
    await fs.writeFile(
      path.join(projectDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );
    
    console.log(`✅ Проект сохранён: ${projectDir}`);
    
    const cliCommand = `node cli/build.js "${projectDir}"`;
    console.log(`🎬 Запуск: ${cliCommand}`);
    
    execPromise(cliCommand)
      .then(({ stdout, stderr }) => {
        if (stderr) {
            console.error(`[FFMPEG STDERR for ${projectId}]:\n${stderr}`);
        }
        console.log(`✅ Video generation complete for project: ${projectId}`);
        console.log(`   Output should be in the 'output' directory.`);
        console.log(`[FFMPEG STDOUT for ${projectId}]:\n${stdout}`);
      })
      .catch((err) => {
        console.error(`❌ FAILED to build video for project: ${projectId}`);
        console.error('Error details:', err);
      });
    
    res.status(200).json({
      success: true,
      projectId,
      message: 'Проект сохранён, сборка началась. Следите за прогрессом в консоли сервера.'
    });
    
  } catch (error) {
    console.error('Ошибка в эндпоинте /api/export-project:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('/api/test-image-download', async (req, res) => {
  try {
    const { url, source, apiKey } = req.query;
    
    if (!url || !source || !apiKey) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing parameters: url, source, and apiKey are required',
        hint: 'Add ?url=IMAGE_URL&source=unsplash|pexels&apiKey=YOUR_API_KEY'
      });
    }

    console.log(`🖼️ Testing image download from ${source}: ${url}`);

    // Simulate the same process as the main endpoint
    let targetUrl = url;
    
    // For Unsplash, get download location
    if (source === 'unsplash') {
      try {
        console.log(`Getting Unsplash download_location...`);
        const downloadResponse = await fetch(targetUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Client-ID ${apiKey}`,
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(10000)
        });

        if (!downloadResponse.ok) {
          throw new Error(`Unsplash download_location failed: ${downloadResponse.status}`);
        }

        const downloadData = await downloadResponse.json();
        if (!downloadData.url) {
          throw new Error('Unsplash download_location response missing URL');
        }

        targetUrl = downloadData.url;
        console.log(`Got actual download URL: ${targetUrl}`);
      } catch (error) {
        console.error('Failed to get Unsplash download_location:', error);
      }
    }

    // Test fetch
    let fetchSuccess = false;
    let httpsSuccess = false;
    let fetchError = null;
    let httpsError = null;
    let fetchResult = null;
    let httpsResult = null;

    // Test fetch
    try {
      const authHeader = source === 'unsplash' 
        ? { 'Authorization': `Client-ID ${apiKey}` }
        : { 'Authorization': apiKey };

      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mystic-Narratives-AI/1.0 (Image Download Proxy)',
          'Accept': 'image/*,*/*',
          ...authHeader
        },
        signal: AbortSignal.timeout(15000)
      });

      if (response.ok) {
        const contentType = response.headers.get('content-type');
        const contentLength = response.headers.get('content-length');
        const arrayBuffer = await response.arrayBuffer();
        
        fetchResult = {
          success: true,
          status: response.status,
          contentType,
          contentLength,
          size: arrayBuffer.byteLength,
          headers: Object.fromEntries(response.headers.entries())
        };
        fetchSuccess = true;
      } else {
        fetchError = `HTTP ${response.status}: ${response.statusText}`;
      }
    } catch (error) {
      fetchError = error instanceof Error ? error.message : 'Unknown error';
    }

    // Test HTTPS fallback
    try {
      const authHeader = source === 'unsplash' 
        ? { 'Authorization': `Client-ID ${apiKey}` }
        : { 'Authorization': apiKey };

      const result = await downloadImageWithHttps(targetUrl, authHeader);
      
      httpsResult = {
        success: true,
        status: result.status,
        contentType: result.contentType,
        size: result.data.byteLength
      };
      httpsSuccess = true;
    } catch (error) {
      httpsError = error instanceof Error ? error.message : 'Unknown error';
    }

    const testResults = {
      originalUrl: url,
      finalUrl: targetUrl,
      source,
      fetch: {
        success: fetchSuccess,
        error: fetchError,
        result: fetchResult
      },
      httpsFallback: {
        success: httpsSuccess,
        error: httpsError,
        result: httpsResult
      },
      recommendation: fetchSuccess ? 'Use fetch (primary method)' : 
                     httpsSuccess ? 'Use HTTPS fallback' : 
                     'Both methods failed'
    };

    console.log(`Test results for ${source}:`, testResults);

    res.status(200).json({
      success: true,
      testResults
    });

  } catch (error) {
    console.error('Test endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('/api/test-gemini', async (req, res) => {
  try {
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

// ============================================================================
// HELPER FUNCTION
// ============================================================================

async function saveBase64ToFile(base64Data, filePath) {
  let mimeType = 'image/jpeg';
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
    base64Data = base64Data.replace(/^data:([^;]+);base64,/, '');
  }
  
  const finalFilePath = filePath.replace(/\.[^/.]+$/, '') + extension;
  const buffer = Buffer.from(base64Data, 'base64');
  await fs.writeFile(finalFilePath, buffer);
  return finalFilePath;
}

// ============================================================================
// CORS & SERVER START
// ============================================================================

app.options('/api/*', cors());

checkFfmpeg().then(available => {
  ffmpegAvailable = available;
  app.listen(PORT, () => {
    console.log(`Development API server running on http://localhost:${PORT}`);
    console.log('Available endpoints:');
    console.log('  GET /api/audio-proxy?url=<encoded_url>');
    console.log('  POST /api/download-image (body: { url, source, apiKey })');
    console.log('  GET /api/test-image-download?url=<url>&source=<unsplash|pexels>&apiKey=<key>');
    console.log('  POST /api/freesound (body: { query, customApiKey? })');
    console.log('  POST /api/export-project (body: { projectId, metadata, chapters, settings })');
    console.log('  GET /api/test-gemini?key=<your_api_key>');
  });
});