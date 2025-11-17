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
    
    targetUrl = url;
    
    console.log(`Image download proxy: Starting download for ${source} from ${targetUrl}`);

    let imageResponse: Response;

    // Unsplash's download_location URL requires a two-step fetch to handle the redirect properly.
    if (source === 'unsplash') {
        // Step 1: Get the redirect URL from the 'Location' header. This also triggers the download count on Unsplash's side.
        const redirectResponse = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Client-ID ${apiKey}`,
                'User-Agent': 'Mystic-Narratives-AI/1.0 (Image Download Proxy)',
            },
            redirect: 'manual' // This is key to manually handle the redirect.
        });

        const location = redirectResponse.headers.get('Location');
        if (!location || (redirectResponse.status !== 301 && redirectResponse.status !== 302)) {
            const errorText = await redirectResponse.text().catch(() => '');
            throw new Error(`Unsplash download_location did not return a valid redirect. Status: ${redirectResponse.status}. Details: ${errorText}`);
        }
        
        console.log(`Image download proxy: Unsplash redirected. Fetching final URL.`);
        
        // Step 2: Fetch the final image URL (without authorization headers).
        imageResponse = await fetch(location, {
            headers: { 'User-Agent': 'Mystic-Narratives-AI/1.0 (Image Download Proxy)' }
        });
    } else { // For Pexels
        imageResponse = await fetch(targetUrl, {
            headers: {
                'Authorization': apiKey,
                'User-Agent': 'Mystic-Narratives-AI/1.0 (Image Download Proxy)',
            }
        });
    }

    if (!imageResponse.ok) {
        const errorText = await imageResponse.text().catch(() => '');
        throw new Error(`Failed to fetch final image. Status: ${imageResponse.status}. Details: ${errorText}`);
    }
    
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await imageResponse.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const dataUrl = `data:${contentType};base64,${base64}`;

    console.log(`Image download proxy: Successfully downloaded ${arrayBuffer.byteLength} bytes.`);
    return res.status(200).json({ base64: dataUrl });

  } catch (error) {
    console.error('Image download proxy error:', {
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