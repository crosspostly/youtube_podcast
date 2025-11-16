// ============================================================================
// API KEYS ИЗ .env
// ============================================================================

// Use `process.env` consistently, as defined in vite.config.ts
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FREESOUND_API_KEY = process.env.FREESOUND_API_KEY;
const UNSPLASH_API_KEY = process.env.UNSPLASH_API_KEY;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const JAMENDO_API_KEY = process.env.JAMENDO_API_KEY;


// ============================================================================
// ГЛОБАЛЬНАЯ КОНФИГУРАЦИЯ ПРИЛОЖЕНИЯ
// ============================================================================

import { ApiRetryConfig, AppConfig, StockPhotoApiKeys } from '../types';

const DEFAULT_API_RETRY_CONFIG: ApiRetryConfig = {
    retries: 3,
    initialDelay: 5000, // 5 seconds
    maxDelay: 60000,    // 60 seconds
    exponentialBase: 2,
    jitterFactor: 0.4   // 40% jitter
};

export const appConfig: AppConfig = {
    geminiApiKey: GEMINI_API_KEY,
    apiRetry: DEFAULT_API_RETRY_CONFIG
};

// ============================================================================
// ФУНКЦИИ УПРАВЛЕНИЯ КОНФИГУРАЦИЕЙ (ОБЯЗАТЕЛЬНО ЭКСПОРТИРОВАТЬ!)
// ============================================================================

export const updateAppConfig = (updates: Partial<AppConfig>) => {
    Object.assign(appConfig, updates);
};

export const getApiRetryConfig = (): ApiRetryConfig => {
    return { ...appConfig.apiRetry };
};

export const updateApiRetryConfig = (updates: Partial<ApiRetryConfig>) => {
    Object.assign(appConfig.apiRetry, updates);
};

export const DEFAULT_FREESOUND_KEY = FREESOUND_API_KEY || '';

export const DEFAULT_STOCK_PHOTO_KEYS = {
  unsplash: UNSPLASH_API_KEY || '',
  pexels: PEXELS_API_KEY || ''
};

export const getStockPhotoKeys = (userKeys?: StockPhotoApiKeys) => {
  return {
    unsplash: userKeys?.unsplash || DEFAULT_STOCK_PHOTO_KEYS.unsplash,
    pexels: userKeys?.pexels || DEFAULT_STOCK_PHOTO_KEYS.pexels
  };
};

export const API_KEYS = {
  gemini: GEMINI_API_KEY,
  freesound: FREESOUND_API_KEY,
  unsplash: UNSPLASH_API_KEY,
  pexels: PEXELS_API_KEY,
  jamendo: JAMENDO_API_KEY
};

// ============================================================================
// ЭКСПОРТ ТИПОВ
// ============================================================================

export type { ApiRetryConfig, AppConfig, StockPhotoApiKeys } from '../types';