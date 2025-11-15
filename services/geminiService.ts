import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { safeLower } from '../utils/safeLower-util';
import { getApiRetryConfig } from '../config/appConfig';

// This service is self-contained and doesn't import from other local files
// to be easily reusable.
export type LogFunction = (entry: { type: 'info' | 'error' | 'request' | 'response' | 'warning'; message: string; data?: any; showToUser?: boolean; }) => void;

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
    private pendingRequests = new Set<string>(); // Track pending requests to prevent duplicates

    constructor(log: LogFunction, minDelayBetweenRequests = 1500) {
        this.log = log;
        this.minDelayBetweenRequests = minDelayBetweenRequests;
    }

    async add<T>(executeFn: () => Promise<T>, requestKey?: string): Promise<T> {
        // Check for duplicate requests
        if (requestKey && this.pendingRequests.has(requestKey)) {
            this.log({ 
                type: 'info', 
                message: `Duplicate request detected for key: ${requestKey}. Skipping.` 
            });
            throw new Error(`Duplicate request: ${requestKey}`);
        }

        return new Promise<T>((resolve, reject) => {
            const item: QueueItem = {
                id: crypto.randomUUID(),
                execute: executeFn,
                resolve,
                reject,
                timestamp: Date.now()
            };

            // Track this request if it has a key
            if (requestKey) {
                this.pendingRequests.add(requestKey);
                
                // Clean up the request key when done
                const originalResolve = item.resolve;
                const originalReject = item.reject;
                
                item.resolve = (result) => {
                    this.pendingRequests.delete(requestKey);
                    originalResolve(result);
                };
                
                item.reject = (error) => {
                    this.pendingRequests.delete(requestKey);
                    originalReject(error);
                };
            }

            this.queue.push(item);
            // НЕ ЛОГИРОВАТЬ технические детали для пользователя
            // Логировать только в console.log для debugging
            if (process.env.NODE_ENV === 'development') {
                console.log(`[Queue Debug] Added. Size: ${this.queue.length}, Active: ${this.currentRequests}`);
            }

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
            // Логировать для пользователя только значимые события
            this.log({ 
                type: 'info', 
                message: 'Обработка запроса к AI...' 
            });

            // Calculate delay needed since last request
            const now = Date.now();
            const timeSinceLastRequest = now - this.lastRequestTime;
            const delayNeeded = Math.max(0, this.minDelayBetweenRequests - timeSinceLastRequest);

            if (delayNeeded > 0) {
                this.log({ 
                    type: 'info', 
                    message: `Ожидание ${Math.round(delayNeeded/1000)}с перед следующим запросом...` 
                });
                await this.delay(delayNeeded);
            }

            // Execute the request sequentially - wait for completion before processing next
            await this.executeRequest(item);
        }

        this.isProcessing = false;
        
        // Process any remaining items that might have been added while processing
        if (this.queue.length > 0) {
            this.processQueue();
        }
    }

    private async executeRequest(item: QueueItem): Promise<void> {
        try {
            this.log({ 
                type: 'request', 
                message: `Отправка запроса к Gemini...` 
            });
            
            this.lastRequestTime = Date.now();
            const result = await item.execute();
            
            // Не логировать успешные запросы для пользователя
            
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
            // Не логировать технические детали завершения для пользователя
            
            // Note: processQueue() is not called here anymore since we're executing sequentially
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
        globalQueue = new ApiRequestQueue(log, 10000); // Increased to 10000ms (10 seconds) for strict free tier limits
        log({ type: 'info', message: 'Очередь запросов к Gemini API инициализирована (10с задержка)' });
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

// Configuration interface for retry behavior
export interface RetryConfig {
    retries?: number;
    initialDelay?: number;
    maxDelay?: number;
    exponentialBase?: number;
    jitterFactor?: number;
}

// Default retry configuration (now uses global config as base)
const getRetryConfig = (userConfig: RetryConfig = {}): Required<RetryConfig> => {
    const globalConfig = getApiRetryConfig();
    return { 
        retries: 3,
        initialDelay: 2000,
        maxDelay: 30000,
        exponentialBase: 2,
        jitterFactor: 0.4,
        ...globalConfig,
        ...userConfig 
    };
};

// Generic retry wrapper for any async function.
// It specifically checks for temporary, retryable errors like overload or rate limits.
export const withRetries = async <T>(
    fn: () => Promise<T>, 
    log: LogFunction, 
    config: RetryConfig = {}
): Promise<T> => {
    const {
        retries,
        initialDelay,
        maxDelay,
        exponentialBase,
        jitterFactor
    } = getRetryConfig(config);
    
    let attempt = 1;
    let currentDelay = Math.max(initialDelay, 2000); // Use a more robust initial delay
    let consecutive429Count = 0;

    while (attempt <= retries) {
        try {
            // Reset consecutive 429 count on successful attempt
            if (attempt > 1) {
                log({ 
                    type: 'info', 
                    message: `Retry attempt ${attempt - 1} successful` 
                });
            }
            consecutive429Count = 0;
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

            // Track consecutive 429 errors for enhanced user messaging
            if (status === 429) {
                consecutive429Count++;
            } else {
                consecutive429Count = 0;
            }

            if (isRetryable && attempt < retries) {
                // Add jitter to the backoff to prevent thundering herd
                const jitter = currentDelay * jitterFactor * (Math.random() - 0.5);
                const delayWithJitter = Math.min(currentDelay + jitter, maxDelay);

                const retryMessage = `API call failed (Attempt ${attempt}/${retries}). Retrying in ${Math.round(delayWithJitter / 1000)}s...`;
                const logEntry: Parameters<LogFunction>[0] = { 
                    type: 'warning', 
                    message: retryMessage, 
                    data: { 
                        message: error.message, 
                        status,
                        attempt,
                        consecutive429Count,
                        nextRetryIn: Math.round(delayWithJitter / 1000)
                    } 
                };
                
                // Enhanced user-facing messages for rate limiting
                if (status === 429) {
                    let userMessage: string;
                    
                    if (consecutive429Count === 1) {
                        userMessage = `⚠️ Превышен лимит запросов. Повторная попытка через ${Math.round(delayWithJitter / 1000)} сек...`;
                    } else if (consecutive429Count === 2) {
                        userMessage = `🔄 Снова превышен лимит. Увеличиваем интервал до ${Math.round(delayWithJitter / 1000)} сек. Пожалуйста, подождите...`;
                    } else if (consecutive429Count >= 3) {
                        userMessage = `⏳ API перегружен. Следующая попытка через ${Math.round(delayWithJitter / 1000)} сек. Рекомендуем сделать паузу...`;
                    } else {
                        userMessage = `Превышен лимит запросов. Повторная попытка через ${Math.round(delayWithJitter / 1000)} сек...`;
                    }
                    
                    log({ 
                        ...logEntry, 
                        message: userMessage, 
                        showToUser: true 
                    });
                } else {
                    log(logEntry);
                }

                await delay(delayWithJitter);
                attempt++;
                currentDelay = Math.min(currentDelay * exponentialBase, maxDelay); // Exponential backoff with cap
            } else {
                // Create enhanced error message based on what went wrong
                let finalErrorMessage: string;
                
                if (status === 429 && consecutive429Count > 0) {
                    finalErrorMessage = `❌ Сервис перегружен: исчерпаны все попытки (${attempt}) после ${consecutive429Count} превышений лимита. Пожалуйста, попробуйте позже.`;
                } else if (status === 429) {
                    finalErrorMessage = `❌ Превышен лимит запросов: исчерпаны все попытки (${attempt}). Пожалуйста, подождите несколько минут и попробуйте снова.`;
                } else if (status >= 500) {
                    finalErrorMessage = `❌ Ошибка сервера (${status}): исчерпаны все попытки (${attempt}). Сервис временно недоступен.`;
                } else {
                    finalErrorMessage = `❌ Ошибка API: исчерпаны все попытки (${attempt}).`;
                }
                
                const finalError = new Error(finalErrorMessage);
                if (error instanceof Error) {
                    (finalError as any).stack = error.stack;
                    (finalError as any).cause = error;
                }
                (finalError as any).originalError = error;
                (finalError as any).status = status;
                (finalError as any).consecutive429Count = consecutive429Count;

                log({ 
                    type: 'error', 
                    message: finalErrorMessage, 
                    data: { 
                        originalError: error,
                        status,
                        attempts: attempt,
                        consecutive429Count
                    } 
                });
                throw finalError;
            }
        }
    }
    // This part is unreachable due to the throw in the loop but is required by TypeScript.
    throw new Error("Exhausted all retries. This should not be reached.");
};

// Queue-aware retry wrapper for any async function.
// Combines queue management with retry logic for better rate limit handling.
export const withQueueAndRetries = async <T>(
    fn: () => Promise<T>, 
    log: LogFunction, 
    config: RetryConfig = {},
    requestKey?: string
): Promise<T> => {
    const queue = getQueue(log);
    return await queue.add(() => withRetries(fn, log, config), requestKey);
};

// Define primary model for text generation
const PRIMARY_TEXT_MODEL = 'gemini-2.5-flash-lite';

// Wrapper for generateContent that includes retries but no OpenRouter fallback.
export const generateContentWithFallback = async (
    params: { contents: any; config?: any; }, 
    log: LogFunction,
    apiKeys: { gemini?: string; }
): Promise<GenerateContentResponse> => {
    
    const queue = getQueue(log);
    
    const attemptGeneration = (model: string) => {
        log({ type: 'request', message: `Attempting generation with model: ${model}`, data: { contents: params.contents } });
        const ai = getAiClient(apiKeys.gemini, log);
        return ai.models.generateContent({ model, ...params });
    };

    try {
        // Try the primary model, wrapped in our retry logic and queue.
        return await queue.add(() => withRetries(() => attemptGeneration(PRIMARY_TEXT_MODEL), log), `text-${PRIMARY_TEXT_MODEL}`);
    } catch (primaryError) {
        log({ type: 'error', message: `Primary model (${PRIMARY_TEXT_MODEL}) failed after all retries.`, data: primaryError });
        
        // No fallback - just throw the original error with a more specific message
        throw new Error(`Primary model (${PRIMARY_TEXT_MODEL}) failed. Please check your API key and try again.`);
    }
};
