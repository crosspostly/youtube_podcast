import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Audio proxy for freesound SFX
app.get('/api/audio-proxy', async (req, res) => {
    const { url } = req.query;
    
    if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'Missing URL parameter' });
    }
    
    // Security: Only allow freesound URLs
    if (!url.includes('freesound.org')) {
        return res.status(403).json({ error: 'Only freesound.org URLs are allowed' });
    }
    
    try {
        console.log(`[Audio Proxy] Fetching: ${url}`);
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const contentType = response.headers.get('content-type') || 'audio/mpeg';
        
        res.set({
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'Cache-Control': 'public, max-age=3600'
        });
        
        response.body.pipe(res);
        
    } catch (error) {
        console.error('[Audio Proxy] Error:', error.message);
        res.status(500).json({ error: 'Failed to proxy audio' });
    }
});

// Image proxy for stock photos (CORS fix)
app.get('/api/image-proxy', async (req, res) => {
    const { url } = req.query;
    
    if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'Missing URL parameter' });
    }
    
    // Security: Only allow unsplash and pexels URLs
    const allowedDomains = ['images.unsplash.com', 'images.pexels.com'];
    const urlObj = new URL(url);
    
    if (!allowedDomains.includes(urlObj.hostname)) {
        return res.status(403).json({ error: 'Only Unsplash and Pexels URLs are allowed' });
    }
    
    try {
        console.log(`[Image Proxy] Fetching: ${url}`);
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        
        res.set({
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'Cache-Control': 'public, max-age=31536000'
        });
        
        response.body.pipe(res);
        
    } catch (error) {
        console.error('[Image Proxy] Error:', error.message);
        res.status(500).json({ error: 'Failed to proxy image' });
    }
});

// Download image as base64 (for Canvas usage)
app.post('/api/download-image', async (req, res) => {
    const { url } = req.body;
    
    if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'Missing URL parameter' });
    }
    
    // Security: Only allow unsplash and pexels URLs
    const allowedDomains = ['images.unsplash.com', 'images.pexels.com'];
    const urlObj = new URL(url);
    
    if (!allowedDomains.includes(urlObj.hostname)) {
        return res.status(403).json({ error: 'Only Unsplash and Pexels URLs are allowed' });
    }
    
    try {
        console.log(`[Download Image] Fetching: ${url}`);
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        
        res.json({
            base64: `data:${contentType};base64,${base64}`
        });
        
    } catch (error) {
        console.error('[Download Image] Error:', error.message);
        res.status(500).json({ error: 'Failed to download image' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Development server running on http://localhost:${PORT}`);
    console.log(`📡 Audio proxy: /api/audio-proxy?url=<encoded-url>`);
    console.log(`🖼️  Image proxy: /api/image-proxy?url=<encoded-url>`);
    console.log(`💾 Download image: POST /api/download-image`);
});

export default app;