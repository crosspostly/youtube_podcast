
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

// This service is self-contained and doesn't import from other local files
// to be easily reusable.
type LogFunction = (entry: { type: 'info' | 'error' | 'request' | 'response'; message: string; data?: any; }) => void;

// Centralized client creation, ensuring a custom API key is used if provided.
const getAiClient = (log: LogFunction, customApiKey?: string) => {
  const apiKey = customApiKey || process.env.API_KEY;
  if (!apiKey) {
    const errorMsg = "Ключ API не настроен. Убедитесь, что переменная окружения API_KEY установлена или введен пользовательский ключ.";
    log({ type: 'error', message: errorMsg });
    throw new Error(errorMsg);
  }
  return new GoogleGenAI({ apiKey });
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Generic retry wrapper for any async function.
// It specifically checks for temporary, retryable errors like overload or rate limits.
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
                log({ type: 'error', message: `API call failed permanently after ${attempt} attempts.`, data: error });
                throw error;
            }
        }
    }
    // This part is unreachable due to the throw in the loop but is required by TypeScript.
    throw new Error("Exhausted all retries. This should not be reached.");
};

// Define primary and fallback models for text generation
// FIX: Use correct model names as per Gemini API guidelines.
const PRIMARY_TEXT_MODEL = 'gemini-flash-lite-latest';
const FALLBACK_TEXT_MODEL = 'gemini-2.5-flash';

// Wrapper for generateContent that includes both retries and model fallback.
export const generateContentWithFallback = async (
    params: { contents: any; config?: any; }, 
    log: LogFunction, 
    customApiKey?: string
): Promise<GenerateContentResponse> => {
    
    const attemptGeneration = (model: string) => {
        log({ type: 'request', message: `Attempting generation with model: ${model}`, data: { contents: params.contents } });
        // Create a new client for each attempt to ensure the correct (potentially custom) API key is used.
        const ai = getAiClient(log, customApiKey);
        return ai.models.generateContent({ model, ...params });
    };

    try {
        // First, try the primary model, wrapped in our retry logic.
        return await withRetries(() => attemptGeneration(PRIMARY_TEXT_MODEL), log);
    } catch (primaryError) {
        log({ type: 'error', message: `Primary model (${PRIMARY_TEXT_MODEL}) failed after all retries.`, data: primaryError });
        log({ type: 'info', message: `Switching to fallback model: ${FALLBACK_TEXT_MODEL}` });
        
        try {
            // If the primary fails, try the fallback model, also with retries.
            return await withRetries(() => attemptGeneration(FALLBACK_TEXT_MODEL), log);
        } catch (fallbackError) {
            log({ type: 'error', message: `Fallback model (${FALLBACK_TEXT_MODEL}) also failed after all retries.`, data: fallbackError });
            // If both fail, throw a comprehensive error.
            throw new Error(`Both primary (${PRIMARY_TEXT_MODEL}) and fallback (${FALLBACK_TEXT_MODEL}) models failed. See logs for details.`);
        }
    }
};