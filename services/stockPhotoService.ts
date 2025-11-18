import type { LogEntry, StockPhoto } from '../types';
import { getApiKey } from '../config/apiConfig';
import { cropToAspectRatio } from './canvasUtils';
// Fix: Import the new proxy utility to fix CORS issues.
import { getProxiedUrl } from './apiUtils';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;

const PLACEHOLDER_IMAGE_URL = "https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?q=80&w=1280&h=720&auto=format&fit=crop";
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const searchUnsplash = async (query: string, log: LogFunction): Promise<StockPhoto[]> => {
    const apiKey = getApiKey('unsplash');
    if (!apiKey) {
        log({ type: 'info', message: 'Unsplash API key not provided.' });
        return [];
    }

    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=10&orientation=landscape`;
    log({ type: 'request', message: 'Searching Unsplash for photos', data: { query } });

    try {
        // Fix: Use the proxied URL to avoid CORS errors.
        const proxiedUrl = getProxiedUrl(url);
        const response = await fetch(proxiedUrl, { headers: { Authorization: `Client-ID ${apiKey}` } });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.errors?.[0] || 'Unsplash API error');
        }
        const data = await response.json();
        return data.results.map((p: any): StockPhoto => ({
            id: p.id,
            url: p.urls.regular,
            downloadUrl: p.links.download_location,
            authorName: p.user.name,
            authorUrl: p.user.links.html,
            source: 'Unsplash'
        }));
    } catch (e: any) {
        log({ type: 'error', message: 'Failed to fetch from Unsplash', data: e.message });
        return [];
    }
};

const searchPexels = async (query: string, log: LogFunction): Promise<StockPhoto[]> => {
    const apiKey = getApiKey('pexels');
    if (!apiKey) {
        log({ type: 'info', message: 'Pexels API key not provided.' });
        return [];
    }

    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=10&orientation=landscape`;
    log({ type: 'request', message: 'Searching Pexels for photos', data: { query } });

    try {
        // Fix: Use the proxied URL to avoid CORS errors.
        const proxiedUrl = getProxiedUrl(url);
        const response = await fetch(proxiedUrl, { headers: { Authorization: apiKey } });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Pexels API error');
        }
        const data = await response.json();
        return data.photos.map((p: any): StockPhoto => ({
            id: p.id.toString(),
            url: p.src.landscape,
            downloadUrl: p.src.original,
            authorName: p.photographer,
            authorUrl: p.photographer_url,
            source: 'Pexels'
        }));
    } catch (e: any) {
        log({ type: 'error', message: 'Failed to fetch from Pexels', data: e.message });
        return [];
    }
};


export const searchStockPhotos = async (
    prompt: string,
    log: LogFunction
): Promise<string[]> => {
    log({ type: 'info', message: `Searching for stock photos with prompt: ${prompt}` });
    try {
        let photos = await searchUnsplash(prompt, log);

        if (photos.length === 0) {
            log({ type: 'info', message: 'Unsplash returned no results. Waiting 1.5s before trying Pexels.' });
            await delay(1500);
            photos = await searchPexels(prompt, log);
        }

        if (photos.length === 0) {
            log({ type: 'info', message: 'No stock photos found, using fallback placeholder.' });
            return [await cropToAspectRatio(PLACEHOLDER_IMAGE_URL)];
        }
        
        log({ type: 'info', message: `Found ${photos.length} stock photos. Cropping to aspect ratio...` });
        
        const croppedImagePromises = photos.map(p => cropToAspectRatio(p.url).catch(e => {
            log({type: 'error', message: `Failed to crop image ${p.id}`, data: e});
            return cropToAspectRatio(PLACEHOLDER_IMAGE_URL); // Fallback for single image failure
        }));
        
        return await Promise.all(croppedImagePromises);

    } catch (error: any) {
        log({ type: 'error', message: 'An unexpected error occurred during stock photo search.', data: error });
        return [await cropToAspectRatio(PLACEHOLDER_IMAGE_URL)];
    }
};

export const getOnePhotoFromEachStockService = async (prompt: string, log: LogFunction): Promise<string[]> => {
    log({ type: 'info', message: `Quick Test: Fetching one photo from each stock service.` });
    
    const results = await Promise.allSettled([
        searchUnsplash(prompt, log),
        searchPexels(prompt, log)
    ]);

    const successfulPhotos: StockPhoto[] = [];
    if (results[0].status === 'fulfilled' && results[0].value.length > 0) {
        successfulPhotos.push(results[0].value[0]);
        log({ type: 'info', message: `Got an image from Unsplash for the test.` });
    }
    if (results[1].status === 'fulfilled' && results[1].value.length > 0) {
        successfulPhotos.push(results[1].value[0]);
         log({ type: 'info', message: `Got an image from Pexels for the test.` });
    }

    if (successfulPhotos.length === 0) {
        log({ type: 'info', message: 'No stock photos found for the test.' });
        return [];
    }

    const cropPromises = successfulPhotos.map(photo => 
        cropToAspectRatio(photo.url).catch(e => {
            log({type: 'error', message: `Failed to crop test image ${photo.id}`, data: e});
            return null;
        })
    );
    
    const croppedImages = await Promise.all(cropPromises);
    return croppedImages.filter((img): img is string => img !== null);
};