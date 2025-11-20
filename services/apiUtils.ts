
// services/apiUtils.ts
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
 * Generic retry wrapper for any async function.
 * It specifically checks for temporary, retryable errors like overload or rate limits.
 * Moved here from the deprecated geminiService.
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
                // Fix: Enhance error logging by serializing the error object for more detail.
                const serializedError = JSON.stringify(error, Object.getOwnPropertyNames(error));
                log({ type: 'error', message: `API call failed permanently after ${attempt} attempts.`, data: serializedError });
                throw error;
            }
        }
    }
    // This part is unreachable due to the throw in the loop but is required by TypeScript.
    throw new Error("Exhausted all retries. This should not be reached.");
};

/**
 * Helper to handle URLs.
 * Reverted to return the original URL directly as the proxy prefix was causing 404 errors.
 * @param url The original absolute URL.
 * @returns The original URL.
 */
export const getProxiedUrl = (url: string): string => {
    return url;
};

/**
 * Robust fetch wrapper that attempts a direct fetch first,
 * and falls back to multiple CORS proxies if the direct fetch fails.
 */
export const fetchWithCorsFallback = async (url: string, options: RequestInit = {}): Promise<Response> => {
    const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
    
    // 1. Try Direct Fetch
    try {
        const response = await fetch(url, { ...options, mode: 'cors' });
        if (response.ok) return response;
        // If 403/401, it might be a server blocking the request, try proxy.
        if (response.status === 403 || response.status === 401) {
             console.warn(`Direct fetch failed with ${response.status}, attempting proxy...`);
        }
    } catch (directError) {
        console.warn("Direct fetch failed (CORS/Network), attempting proxy...", directError);
    }

    // 2. Try CORSProxy.io
    try {
        const proxyUrl1 = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        const proxyResponse1 = await fetch(proxyUrl1, options);
        if (proxyResponse1.ok) return proxyResponse1;
        console.warn(`CORSProxy.io failed with ${proxyResponse1.status}`);
    } catch (proxyError1) {
         console.warn("CORSProxy.io failed", proxyError1);
    }
    
    await wait(300);

    // 3. Try AllOrigins (Raw) - good for audio files, might strip auth headers
    try {
        const proxyUrl2 = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        // Filter out Authorization header for AllOrigins as it might not handle it well for external resources
        // unless specifically needed. But for public audio it is fine.
        const proxyResponse2 = await fetch(proxyUrl2, options);
        if (proxyResponse2.ok) return proxyResponse2;
        console.warn(`AllOrigins failed with ${proxyResponse2.status}`);
    } catch (proxyError2) {
        console.warn("AllOrigins failed", proxyError2);
    }

    await wait(300);

    // 4. Try ThingProxy
    try {
        const proxyUrl3 = `https://thingproxy.freeboard.io/fetch/${url}`;
        const proxyResponse3 = await fetch(proxyUrl3, options);
        if (proxyResponse3.ok) return proxyResponse3;
        console.warn(`ThingProxy failed with ${proxyResponse3.status}`);
    } catch(e) {
        console.warn("ThingProxy failed", e);
    }

    await wait(300);

    // 5. Try CodeTabs (Last resort)
    try {
        const proxyUrl4 = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`;
        const proxyResponse4 = await fetch(proxyUrl4, options);
        if (proxyResponse4.ok) return proxyResponse4;
        throw new Error(`CodeTabs returned ${proxyResponse4.status}`);
    } catch (proxyError4) {
        // If all fail, throw a generic error to be caught by the caller
        throw new Error(`All fetch attempts failed for URL: ${url}. Last error: ${proxyError4}`);
    }
};
