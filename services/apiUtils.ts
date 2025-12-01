
import { GoogleGenAI } from "@google/genai";
import { getApiKey } from '../config/apiConfig';
import type { LogEntry } from '../types';

type LogFunction = (entry: Omit<LogEntry, 'timestamp'>) => void;

/**
 * Centralized function to get an authenticated GoogleGenAI client.
 * It uses the main apiConfig to retrieve the key, ensuring a single source of truth.
 * Throws a clear error if the key is not configured.
 */
export const getAiClient = (log: LogFunction): GoogleGenAI => {
  const apiKey = getApiKey('gemini');
  if (!apiKey) {
    const errorMsg = "Ключ API Gemini не настроен. Убедитесь, что переменная окружения API_KEY установлена, или введите ключ в настройках.";
    log({ type: 'error', message: errorMsg });
    throw new Error(errorMsg);
  }
  return new GoogleGenAI({ apiKey });
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Helper to safely serialize error objects for logging
 */
const serializeError = (error: any): any => {
    if (error instanceof Error) {
        return {
            message: error.message,
            name: error.name,
            stack: error.stack,
            // Capture additional properties often found in API errors
            status: (error as any).status,
            statusText: (error as any).statusText,
            code: (error as any).code,
            details: (error as any).details || (error as any).response?.data
        };
    }
    return error;
};

/**
 * Generic retry wrapper for any async function.
 * It specifically checks for temporary, retryable errors like overload or rate limits.
 */
export const withRetries = async <T>(fn: () => Promise<T>, log: LogFunction, retries = 3, initialDelay = 1000): Promise<T> => {
    let attempt = 1;
    let currentDelay = initialDelay;
    while (attempt <= retries) {
        try {
            return await fn();
        } catch (error: any) {
            // Check for common retryable error patterns in message, status, or code.
            const errorMessage = (error?.message || '').toLowerCase();
            const errorStatus = (error?.status || '').toLowerCase();
            const isRetryable = 
                error?.code === 503 || 
                error?.code === 429 || 
                errorMessage.includes('overloaded') || 
                errorMessage.includes('rate limit') ||
                errorStatus === 'unavailable';

            if (isRetryable && attempt < retries) {
                log({ type: 'info', message: `API call failed (Attempt ${attempt}/${retries}). Retrying in ${currentDelay}ms...`, data: { message: error.message } });
                await delay(currentDelay);
                attempt++;
                currentDelay *= 2; // Exponential backoff
            } else {
                // If the error is not retryable or retries are exhausted, throw it.
                const serialized = serializeError(error);
                log({ type: 'error', message: `API call failed permanently after ${attempt} attempts.`, data: serialized });
                throw error;
            }
        }
    }
    // This part is unreachable due to the throw in the loop but is required by TypeScript.
    throw new Error("Exhausted all retries. This should not be reached.");
};

/**
 * Robust fetch wrapper that attempts a direct fetch first,
 * and falls back to multiple CORS proxies if the direct fetch fails.
 */
export const fetchWithCorsFallback = async (url: string, options: RequestInit = {}): Promise<Response> => {
    const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
    let lastError: any;

    // Helper to validate response
    // Proxies often return 200 OK with HTML text on failure.
    const isValidResponse = (res: Response) => {
        if (!res.ok) return false;
        const type = res.headers.get('content-type');
        const len = res.headers.get('content-length');
        
        // Explicitly reject HTML responses for media requests
        if (type && type.includes('text/html')) {
             return false;
        }
        
        // If length is very small (< 500 bytes), it's likely an error message or empty file.
        if (len && parseInt(len) < 500) {
             // Check if it's NOT audio/image/video but JSON/Text error
             if (type && (type.includes('text/plain') || type.includes('application/json'))) {
                 return false;
             }
        }
        return true;
    };

    // 1. Direct Fetch (Best for CORS-enabled hosts like Freesound CDN/Unsplash)
    try {
        const response = await fetch(url, { ...options, mode: 'cors' });
        if (isValidResponse(response)) return response;
    } catch (e) {
        lastError = e;
    }

    // 2. Local API Proxy (for development)
    try {
        const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl, options);
        if (isValidResponse(response)) return response;
    } catch (e) {
        lastError = e;
    }

    // 3. External Proxy Strategies
    const encodedUrl = encodeURIComponent(url);
    
    // Updated Proxy List - Ordered by reliability for binary data
    // corsproxy.io is prioritized as it handles large files well
    const proxies = [
        `https://corsproxy.io/?${encodedUrl}`,
        `https://api.allorigins.win/raw?url=${encodedUrl}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodedUrl}`,
        // `https://cors-anywhere.herokuapp.com/${url}` // Use only if you have access/own instance
    ];

    for (const proxyUrl of proxies) {
        try {
            // Random delay 500ms-1500ms to avoid rate limiting on proxies
            await wait(500 + Math.random() * 1000); 
            const response = await fetch(proxyUrl, options);
            if (isValidResponse(response)) return response;
        } catch (e) {
            lastError = e;
            console.warn(`Proxy failed: ${proxyUrl}`, e);
        }
    }

    throw new Error(`All fetch attempts failed for URL: ${url}. Last error: ${lastError}`);
};
