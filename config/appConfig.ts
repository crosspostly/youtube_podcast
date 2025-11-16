// config/appConfig.ts

import type { AppConfig, ApiRetryConfig, StockPhotoApiKeys } from '../types';

// ============================================================================
// GEMINI API KEY ИНИЦИАЛИЗАЦИЯ И ВАЛИДАЦИЯ
// ============================================================================

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || 'AIzaSyDqGdkQYGxv3fYmKVjVCH0gw1Aiq5RyqiE';

// Проверка при загрузке
if (GEMINI_API_KEY) {
  console.log('✅ GEMINI API KEY загружен из конфига');
  console.log('🔑 Первые 10 символов:', GEMINI_API_KEY.substring(0, 10) + '...');
  console.log('🔑 Длина ключа:', GEMINI_API_KEY.length, 'символов');
  
  // Базовая валидация формата
  if (!GEMINI_API_KEY.startsWith('AIzaSy')) {
    console.warn('⚠️ ВНИМАНИЕ: Ключ не похож на Gemini API key (должен начинаться с AIzaSy)');
  }
  if (GEMINI_API_KEY.length < 30) {
    console.warn('⚠️ ВНИМАНИЕ: Ключ слишком короткий (должно быть ~39 символов)');
  }
} else {
  console.error('❌ GEMINI API KEY не найден! Добавь в .env файл:');
  console.error('   VITE_GEMINI_API_KEY=your_key_here');
}

// ============================================================================
// API RETRY КОНФИГУРАЦИЯ
// ============================================================================

const DEFAULT_API_RETRY_CONFIG: ApiRetryConfig = {
    retries: 3,
    initialDelay: 5000, // 5 seconds
    maxDelay: 60000,    // 60 seconds
    exponentialBase: 2,
    jitterFactor: 0.4   // 40% jitter
};

// ============================================================================
// ГЛОБАЛЬНАЯ КОНФИГУРАЦИЯ ПРИЛОЖЕНИЯ
// ============================================================================

export const appConfig: AppConfig = {
    geminiApiKey: GEMINI_API_KEY,
    apiRetry: DEFAULT_API_RETRY_CONFIG
};

// ============================================================================
// ФУНКЦИИ ОБНОВЛЕНИЯ КОНФИГУРАЦИИ
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

// ============================================================================
// ДЕФОЛТНЫЕ API КЛЮЧИ (разработчика)
// ============================================================================

export const DEFAULT_FREESOUND_KEY = '4E54XDGL5Pc3V72TQfSo83WZMb600FE2k9gPf6Gk';

export const DEFAULT_STOCK_PHOTO_KEYS = {
  unsplash: 'C04GfIdNUSfivrygInhzaCQ6233tvsT5QhJ76Th6RD4',
  pexels: 'MSK8N1uYAzU1yTNpicrZeWvKnQ1t99vTpy4YDKPHjSlHwaKbKqlFrokZ'
};

export const getStockPhotoKeys = (userKeys?: StockPhotoApiKeys) => {
  return {
    unsplash: userKeys?.unsplash || DEFAULT_STOCK_PHOTO_KEYS.unsplash,
    pexels: userKeys?.pexels || DEFAULT_STOCK_PHOTO_KEYS.pexels
  };
};

// ============================================================================
// ЭКСПОРТ ТИПОВ
// ============================================================================

export type { ApiRetryConfig, AppConfig };
