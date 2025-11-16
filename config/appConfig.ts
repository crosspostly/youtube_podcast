// ============================================================================
// API KEYS ИЗ .env
// ============================================================================

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
const FREESOUND_API_KEY = import.meta.env.VITE_FREESOUND_API_KEY || process.env.FREESOUND_API_KEY;
const UNSPLASH_API_KEY = import.meta.env.VITE_UNSPLASH_API_KEY || process.env.UNSPLASH_API_KEY;
const PEXELS_API_KEY = import.meta.env.VITE_PEXELS_API_KEY || process.env.PEXELS_API_KEY;
const JAMENDO_API_KEY = import.meta.env.VITE_JAMENDO_API_KEY || process.env.JAMENDO_API_KEY;

// Проверка при загрузке
if (GEMINI_API_KEY) {
  console.log('✅ GEMINI API KEY загружен из .env');
  console.log('🔑 Первые 10 символов:', GEMINI_API_KEY.substring(0, 10) + '...');
} else {
  console.error('❌ GEMINI API KEY не найден в .env!');
}

if (JAMENDO_API_KEY) {
  console.log('✅ JAMENDO API KEY загружен из .env');
} else {
  console.warn('⚠️ JAMENDO API KEY не найден');
}

// ============================================================================
// API RETRY КОНФИГУРАЦИЯ
// ============================================================================

const DEFAULT_API_RETRY_CONFIG = {
    retries: 3,
    initialDelay: 5000, // 5 seconds
    maxDelay: 60000,    // 60 seconds
    exponentialBase: 2,
    jitterFactor: 0.4   // 40% jitter
};

// ============================================================================
// ГЛОБАЛЬНАЯ КОНФИГУРАЦИЯ ПРИЛОЖЕНИЯ
// ============================================================================

export const appConfig = {
    geminiApiKey: GEMINI_API_KEY,
    apiRetry: DEFAULT_API_RETRY_CONFIG
};

export const DEFAULT_FREESOUND_KEY = FREESOUND_API_KEY || '';

export const DEFAULT_STOCK_PHOTO_KEYS = {
  unsplash: UNSPLASH_API_KEY || '',
  pexels: PEXELS_API_KEY || ''
};

export const API_KEYS = {
  gemini: GEMINI_API_KEY,
  freesound: FREESOUND_API_KEY,
  unsplash: UNSPLASH_API_KEY,
  pexels: PEXELS_API_KEY,
  jamendo: JAMENDO_API_KEY
};
