import type { VercelRequest, VercelResponse } from '@vercel/node';

// Helper to convert ArrayBuffer to Base64 string
const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const { url, source, apiKey } = req.body;

    if (!url || typeof url !== 'string' || !source || !apiKey) {
      res.status(400).json({ error: 'Missing or invalid parameters: url, source, and apiKey are required.' });
      return;
    }

    // Validate URL format and domain
    let targetUrl: string;
    try {
      targetUrl = url;
      const parsedUrl = new URL(targetUrl);
      
      // Only allow unsplash.com and pexels.com domains for security
      if (!parsedUrl.hostname.includes('unsplash.com') && !parsedUrl.hostname.includes('pexels.com')) {
        console.warn(`Image download proxy: Blocked request to non-stock-photo domain: ${parsedUrl.hostname}`);
        res.status(403).json({ error: 'Only unsplash.com and pexels.com URLs are allowed' });
        return;
      }
    } catch (error) {
      console.error('Image download proxy: Invalid URL format:', url);
      res.status(400).json({ error: 'Invalid URL format' });
      return;
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
      res.status(response.status).json({
        error: `Failed to fetch image: ${response.statusText}`,
        details: errorText,
      });
      return;
    }

    // Get content type from response or default to image/jpeg
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    
    // Convert to ArrayBuffer and then to base64
    const arrayBuffer = await response.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);
    
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
}
