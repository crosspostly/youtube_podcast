
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
