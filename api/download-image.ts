import type { VercelRequest, VercelResponse } from '@vercel/node';

// FIX: Declare Buffer for TypeScript since @types/node is not available.
// This is safe because this serverless function runs in a Node.js environment.
declare const Buffer: any;

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
  
  let targetUrl: string = '';

  try {
    const { url, source, apiKey } = req.body;

    if (!url || typeof url !== 'string' || !source || !apiKey) {
      res.status(400).json({ error: 'Missing or invalid parameters: url, source, and apiKey are required.' });
      return;
    }

    // Validate URL format and domain
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

    let lastError: any;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30000); // 30 seconds timeout

            const response = await fetch(targetUrl, {
              method: 'GET',
              headers: {
                'User-Agent': 'Mystic-Narratives-AI/1.0 (Image Download Proxy)',
                ...authHeader
              },
              signal: controller.signal
            });

            clearTimeout(timeout);

            if (!response.ok) {
                // Don't retry on client-side errors (4xx)
                if (response.status >= 400 && response.status < 500) {
                     const errorText = await response.text();
                     console.error(`Image download proxy error: ${response.statusText}`, errorText);
                     return res.status(response.status).json({
                       error: `Failed to fetch image: ${response.statusText}`,
                       details: errorText,
                     });
                }
                throw new Error(`Server error: ${response.status}`);
            }

            const contentType = response.headers.get('content-type') || 'image/jpeg';
            const arrayBuffer = await response.arrayBuffer();
            const base64 = Buffer.from(arrayBuffer).toString('base64');
            const dataUrl = `data:${contentType};base64,${base64}`;

            console.log(`Image download proxy: Successfully downloaded ${arrayBuffer.byteLength} bytes from ${targetUrl}`);
            return res.status(200).json({ base64: dataUrl });

        } catch (error) {
            lastError = error;
            console.warn(`Attempt ${attempt} failed for ${targetUrl}:`, error instanceof Error ? error.message : String(error));
            if (attempt < 3) {
                await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
            }
        }
    }
    
    // If all retries failed
    throw lastError;

  } catch (error) {
    console.error('Image download proxy error after all retries:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        name: error instanceof Error ? error.name : 'Unknown',
        url: targetUrl || (req.body ? req.body.url : 'URL not available')
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}