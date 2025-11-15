import type { VercelRequest, VercelResponse } from '@vercel/node';
import { DEFAULT_FREESOUND_KEY } from '../config/appConfig';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  // Add a header to indicate this proxy was invoked
  res.setHeader('X-Vercel-Proxy-Invoked', 'true');

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
    const { query, customApiKey } = req.body;

    if (!query) {
      res.status(400).json({ error: 'Missing query parameter' });
      return;
    }

    let apiKey: string | undefined;

    // 1. Prioritize user-provided key
    if (customApiKey && typeof customApiKey === 'string' && customApiKey.trim() !== '') {
        apiKey = customApiKey.trim();
        console.log("Vercel Proxy: Using custom Freesound API key from request body.");
    }
    // 2. Fallback to environment variable (for Vercel deployment)
    else if (process.env.FREESOUND_API_KEY) {
        apiKey = process.env.FREESOUND_API_KEY;
        console.log("Vercel Proxy: Using Freesound API key from environment variable.");
    }
    // 3. Fallback to hardcoded default key
    else {
        apiKey = DEFAULT_FREESOUND_KEY;
        console.log("Vercel Proxy: Using default Freesound API key.");
    }

    if (!apiKey) {
      const errorMessage = "Freesound API key is not configured. Please add it in the settings, configure a Vercel environment variable, or set a default key.";
      console.error(errorMessage);
      return res.status(401).json({
        error: "Unauthorized",
        details: errorMessage,
      });
    }
    
    const searchUrl = `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(query as string)}&fields=id,name,previews,license,username&sort=relevance&page_size=15`;

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
      res.status(response.status).json({
        error: `Freesound API Error: ${response.statusText}`,
        details: errorText,
      });
      return;
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
}