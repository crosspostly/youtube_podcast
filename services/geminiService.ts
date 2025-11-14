import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { safeLower } from '../utils/safeLower-util';

// This service is self-contained and doesn't import from other local files
// to be easily reusable.
export type LogFunction = (entry: { type: 'info' | 'error' | 'request' | 'response'; message: string; data?: any; }) => void;

// Queue implementation for API requests
interface QueueItem {
    id: string;
    execute: () => Promise<any>;
    resolve: (result: any) => void;
    reject: (error: any) => void;
    timestamp: number;
}

export class ApiRequestQueue {
    private queue: QueueItem[] = [];
    private isProcessing = false;
    private lastRequestTime = 0;
    private readonly minDelayBetweenRequests: number;
    private readonly maxConcurrentRequests = 1; // Only 1 request at a time
    private currentRequests = 0;
    private log: LogFunction;

    constructor(log: LogFunction, minDelayBetweenRequests = 150) {
        this.log = log;
        this.minDelayBetweenRequests = minDelayBetweenRequests;
    }

    async add<T>(executeFn: () => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const item: QueueItem = {
                id: crypto.randomUUID(),
                execute: executeFn,
                resolve,
                reject,
                timestamp: Date.now()
            };

            this.queue.push(item);
            this.log({ 
                type: 'info', 
                message: `Request added to queue. Queue size: ${this.queue.length}, Current requests: ${this.currentRequests}` 
            });

            this.processQueue();
        });
    }

    private async processQueue(): Promise<void> {
        if (this.isProcessing || this.currentRequests >= this.maxConcurrentRequests || this.queue.length === 0) {
            return;
        }

        this.isProcessing = true;

        while (this.queue.length > 0 && this.currentRequests < this.maxConcurrentRequests) {
            const item = this.queue.shift();
            if (!item) break;

            this.currentRequests++;
            this.log({ 
                type: 'info', 
                message: `Processing request ${item.id}. Queue size: ${this.queue.length}, Current requests: ${this.currentRequests}` 
            });

            // Calculate delay needed since last request
            const now = Date.now();
            const timeSinceLastRequest = now - this.lastRequestTime;
            const delayNeeded = Math.max(0, this.minDelayBetweenRequests - timeSinceLastRequest);

            if (delayNeeded > 0) {
                this.log({ 
                    type: 'info', 
                    message: `Delaying request ${item.id} by ${delayNeeded}ms to respect rate limits` 
                });
                await this.delay(delayNeeded);
            }

            // Execute the request
            this.executeRequest(item);
        }

        this.isProcessing = false;
    }

    private async executeRequest(item: QueueItem): Promise<void> {
        try {
            this.log({ 
                type: 'request', 
                message: `Executing request ${item.id}` 
            });
            
            this.lastRequestTime = Date.now();
            const result = await item.execute();
            
            this.log({ 
                type: 'response', 
                message: `Request ${item.id} completed successfully` 
            });
            
            item.resolve(result);
        } catch (error) {
            this.log({ 
                type: 'error', 
                message: `Request ${item.id} failed`, 
                data: error 
            });
            
            item.reject(error);
        } finally {
            this.currentRequests--;
            this.log({ 
                type: 'info', 
                message: `Request ${item.id} finished. Queue size: ${this.queue.length}, Current requests: ${this.currentRequests}` 
            });
            
            // Process next items in queue
            this.processQueue();
        }
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Global queue instance for general text-based requests
let globalQueue: ApiRequestQueue | null = null;

const getQueue = (log: LogFunction): ApiRequestQueue => {
    if (!globalQueue) {
        globalQueue = new ApiRequestQueue(log); // Uses default 150ms delay
        log({ type: 'info', message: 'Gemini API request queue initialized' });
    }
    return globalQueue;
};

// Centralized client creation.
const getAiClient = (customApiKey: string | undefined, log: LogFunction) => {
  const apiKey = customApiKey || process.env.API_KEY;
  if (!apiKey) {
    const errorMsg = "Ключ API не настроен. Убедитесь, что переменная окружения API_KEY установлена, или введите ключ в настройках.";
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
            const errorMessage = safeLower(error?.message || '');
            const status = error?.status || error?.response?.status;

            const isRetryable =
                status === 429 || // Too Many Requests
                status === 503 || // Service Unavailable
                status === 504 || // Gateway Timeout
                errorMessage.includes('overloaded') ||
                errorMessage.includes('rate limit') ||
                errorMessage.includes('timed out') ||
                errorMessage.includes('unavailable');

            if (isRetryable && attempt < retries) {
                log({ type: 'info', message: `API call failed (Attempt ${attempt}/${retries}). Retrying in ${currentDelay}ms...`, data: { message: error.message, status } });
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

// Queue-aware retry wrapper for any async function.
// Combines queue management with retry logic for better rate limit handling.
export const withQueueAndRetries = async <T>(fn: () => Promise<T>, log: LogFunction, retries = 3, initialDelay = 1000): Promise<T> => {
    const queue = getQueue(log);
    return await queue.add(() => withRetries(fn, log, retries, initialDelay));
};

// Define primary and fallback models for text generation
// FIX: Use the more capable model as primary and the faster model as fallback.
const PRIMARY_TEXT_MODEL = 'gemini-2.5-flash';
const FALLBACK_TEXT_MODEL = 'gemini-flash-lite-latest';

// Wrapper for generateContent that includes both retries and model fallback.
export const generateContentWithFallback = async (
    params: { contents: any; config?: any; }, 
    log: LogFunction,
    customApiKey?: string
): Promise<GenerateContentResponse> => {
    
    const queue = getQueue(log);
    
    const attemptGeneration = (model: string) => {
        log({ type: 'request', message: `Attempting generation with model: ${model}`, data: { contents: params.contents } });
        const ai = getAiClient(customApiKey, log);
        return ai.models.generateContent({ model, ...params });
    };

    try {
        // First, try the primary model, wrapped in our retry logic and queue.
        return await queue.add(() => withRetries(() => attemptGeneration(PRIMARY_TEXT_MODEL), log));
    } catch (primaryError) {
        log({ type: 'error', message: `Primary model (${PRIMARY_TEXT_MODEL}) failed after all retries.`, data: primaryError });
        log({ type: 'info', message: `Switching to fallback model: ${FALLBACK_TEXT_MODEL}` });
        
        try {
            // If the primary fails, try the fallback model, also with retries and queue.
            return await queue.add(() => withRetries(() => attemptGeneration(FALLBACK_TEXT_MODEL), log));
        } catch (fallbackError) {
            log({ type: 'error', message: `Fallback model (${FALLBACK_TEXT_MODEL}) also failed after all retries.`, data: fallbackError });
            // If both fail, throw a comprehensive error.
            throw new Error(`Both primary (${PRIMARY_TEXT_MODEL}) and fallback (${FALLBACK_TEXT_MODEL}) models failed. See logs for details.`);
        }
    }
};