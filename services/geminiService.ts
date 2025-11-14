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

    constructor(log: LogFunction, minDelayBetweenRequests = 1500) {
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
                errorMessage.includes('unavailable') ||
                errorMessage.includes('failed to fetch') ||
                errorMessage.includes('connection reset');

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

export const generateTextWithOpenRouter = async (prompt: string, log: LogFunction, openRouterApiKey: string): Promise<string> => {
    log({ type: 'request', message: `Fallback: Запрос текста от OpenRouter`, data: { prompt } });
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${openRouterApiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            "model": "deepseek/deepseek-r1:free",
            "messages": [
                { "role": "user", "content": prompt }
            ]
        })
    });
    
    if (!response.ok) {
        const errorBody = await response.text();
        log({ type: 'error', message: `Ошибка при генерации текста через OpenRouter`, data: { status: response.status, body: errorBody } });
        throw new Error(`OpenRouter API error: ${response.statusText}`);
    }

    const { choices } = await response.json();
    if (!choices || choices.length === 0 || !choices[0].message?.content) {
        throw new Error("Не удалось получить текст в ответе от OpenRouter.");
    }
    
    log({ type: 'response', message: 'Fallback: Текст успешно сгенерирован через OpenRouter.' });
    return choices[0].message.content;
};


// Define primary model for text generation
const PRIMARY_TEXT_MODEL = 'gemini-2.5-flash-lite';

// Wrapper for generateContent that includes both retries and model fallback.
export const generateContentWithFallback = async (
    params: { contents: any; config?: any; }, 
    log: LogFunction,
    apiKeys: { gemini?: string; openRouter?: string; }
): Promise<GenerateContentResponse> => {
    
    const queue = getQueue(log);
    
    const attemptGeneration = (model: string) => {
        log({ type: 'request', message: `Attempting generation with model: ${model}`, data: { contents: params.contents } });
        const ai = getAiClient(apiKeys.gemini, log);
        return ai.models.generateContent({ model, ...params });
    };

    try {
        // First, try the primary model, wrapped in our retry logic and queue.
        return await queue.add(() => withRetries(() => attemptGeneration(PRIMARY_TEXT_MODEL), log));
    } catch (primaryError) {
        log({ type: 'error', message: `Primary model (${PRIMARY_TEXT_MODEL}) failed after all retries.`, data: primaryError });
        
        if (apiKeys.openRouter) {
            log({ type: 'info', message: `Switching to fallback model on OpenRouter.` });
            try {
                const promptString = typeof params.contents === 'string' ? params.contents : JSON.stringify(params.contents);
                const openRouterText = await generateTextWithOpenRouter(promptString, log, apiKeys.openRouter);
                
                // Return a mock response object that behaves like GenerateContentResponse for the .text getter
                const response = {
                    get text() { return openRouterText; },
                    candidates: [{
                        content: { parts: [{ text: openRouterText }], role: 'model' },
                        finishReason: 'STOP',
                        index: 0,
                        safetyRatings: [],
                    }]
                };
                return response as GenerateContentResponse;

            } catch (fallbackError) {
                log({ type: 'error', message: `Fallback model on OpenRouter also failed.`, data: fallbackError });
                // If fallback fails, throw the original, more informative error.
                throw primaryError;
            }
        }
        
        // If no OpenRouter key, just throw the original error with a more specific message
        throw new Error(`Primary model (${PRIMARY_TEXT_MODEL}) failed and no OpenRouter fallback key was provided.`);
    }
};