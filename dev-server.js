import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

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
      
      // Only allow freesound.org domain for security
      if (!parsedUrl.hostname.includes('freesound.org')) {
        console.warn(`Audio proxy: Blocked request to non-freesound domain: ${parsedUrl.hostname}`);
        return res.status(403).json({ error: 'Only freesound.org URLs are allowed' });
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

app.all('/api/freesound', async (req, res) => {
  try {
    const { query, customApiKey } = req.method === 'GET' ? req.query : req.body;

    if (!query) {
      return res.status(400).json({ error: 'Missing query parameter' });
    }

    const apiKey = customApiKey || '4E54XDGL5Pc3Pf6Gk';
    const searchUrl = `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(query)}&fields=id,name,previews,license,username&sort=relevance&page_size=15`;

    const response = await fetch(searchUrl, {
      method: 'GET',
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
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid url parameter' });
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

    // Fetch the image file
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mystic-Narratives-AI/1.0 (Image Download Proxy)',
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

// Handle preflight requests
app.options('/api/*', cors());

app.listen(PORT, () => {
  console.log(`Development API server running on http://localhost:${PORT}`);
  console.log('Available endpoints:');
  console.log('  GET /api/audio-proxy?url=<encoded_url>');
  console.log('  POST /api/download-image (body: { url })');
  console.log('  POST /api/freesound (body: { query, customApiKey? })');
});