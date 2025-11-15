import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const { url } = req.query;

    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'Missing or invalid url parameter' });
      return;
    }

    // Validate URL format and domain
    let targetUrl: string;
    try {
      targetUrl = decodeURIComponent(url);
      const parsedUrl = new URL(targetUrl);
      
      // Allow freesound.org and jamendo.com domains for security
      if (!parsedUrl.hostname.includes('freesound.org') && !parsedUrl.hostname.includes('jamendo.com')) {
        console.warn(`Audio proxy: Blocked request to non-allowed domain: ${parsedUrl.hostname}`);
        res.status(403).json({ error: 'Only freesound.org and jamendo.com URLs are allowed' });
        return;
      }
    } catch (error) {
      console.error('Audio proxy: Invalid URL format:', url);
      res.status(400).json({ error: 'Invalid URL format' });
      return;
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
      res.status(response.status).json({
        error: `Failed to fetch audio: ${response.statusText}`,
        details: errorText,
      });
      return;
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
    // FIX: Use `(globalThis as any).Buffer` to access the `Buffer` object, as it's globally available in the Vercel/Node.js environment but may be missing from types.
    res.status(200).send((globalThis as any).Buffer.from(audioBuffer));

    console.log(`Audio proxy: Successfully streamed ${audioBuffer.byteLength} bytes from ${targetUrl}`);

  } catch (error) {
    console.error('Audio proxy error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}