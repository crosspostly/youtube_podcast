import type { VercelRequest, VercelResponse } from '@vercel/node';

const FREESOUND_API_KEY_PLACEHOLDER = '4E54XDGL5Pc3V72TQfSo83WZMb600FE2k9gPf6Gk';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const { query, customApiKey } = req.method === 'GET' ? req.query : req.body;

    if (!query) {
      res.status(400).json({ error: 'Missing query parameter' });
      return;
    }

    const apiKey = (customApiKey as string) || process.env.FREESOUND_API_KEY;

    if (!apiKey || apiKey === FREESOUND_API_KEY_PLACEHOLDER) {
      const errorMessage = "Freesound API key is not configured. Please add it in the settings.";
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
