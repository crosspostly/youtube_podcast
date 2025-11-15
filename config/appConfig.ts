import type { AppConfig, ApiRetryConfig, StockPhotoApiKeys } from '../types';

// Export the type for use in other components
export type { ApiRetryConfig, AppConfig };

// Default configuration for API retry behavior
const DEFAULT_API_RETRY_CONFIG: ApiRetryConfig = {
    retries: 3,
    initialDelay: 5000, // 5 seconds (increased from 2s)
    maxDelay: 60000,    // 60 seconds (increased from 30s)
    exponentialBase: 2,
    jitterFactor: 0.4    // 40% jitter
};

// Global application configuration
export const appConfig: AppConfig = {
    apiRetry: DEFAULT_API_RETRY_CONFIG
};

// Function to update configuration (can be called from UI or other parts of the app)
export const updateAppConfig = (updates: Partial<AppConfig>) => {
    Object.assign(appConfig, updates);
};

// Function to get current API retry configuration
export const getApiRetryConfig = (): ApiRetryConfig => {
    return { ...appConfig.apiRetry };
};

// Function to update only API retry configuration
export const updateApiRetryConfig = (updates: Partial<ApiRetryConfig>) => {
    Object.assign(appConfig.apiRetry, updates);
};

// ============================================================================
// ДЕФОЛТНЫЕ API КЛЮЧИ (разработчика)
// ============================================================================

export const DEFAULT_FREESOUND_KEY = '4E54XDGL5Pc3V72TQfSo83WZMb600FE2k9gPf6Gk';

export const DEFAULT_STOCK_PHOTO_KEYS = {
  unsplash: 'C04GfIdNUSfivrygInhzaCQ6233tvsT5QhJ76Th6RD4',  // ← ВСТАВИТЬ СЮДА ВАШ КЛЮЧ
  pexels: 'MSK8N1uYAzU1yTNpicrZeWvKnQ1t99vTpy4YDKPHjSlHwaKbKqlFrokZ'          // ← ВСТАВИТЬ СЮДА ВАШ КЛЮЧ
};

// Функция получения ключей с приоритетом пользовательских
export const getStockPhotoKeys = (userKeys?: StockPhotoApiKeys) => {
  return {
    unsplash: userKeys?.unsplash || DEFAULT_STOCK_PHOTO_KEYS.unsplash,
    pexels: userKeys?.pexels || DEFAULT_STOCK_PHOTO_KEYS.pexels
  };
};