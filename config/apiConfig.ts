// config/apiConfig.ts

/**
 * Fallback API keys - используются как дефолтные значения
 * Приоритет: .env/platform > localStorage > FALLBACK_KEYS
 */
const FALLBACK_KEYS = {
  gemini: '', // Use an empty string to force user/env key. Prevents errors on deploy.
  freesound: '4E54XDGL5Pc3V72TQfSo83WZMb600FE2k9gPf6Gk',
  unsplash: 'C04GfIdNUSfivrygInhzaCQ6233tvsT5QhJ76Th6RD4',
  pexels: 'MSK8N1uYAzU1yTNpicrZeWvKnQ1t99vTpy4YDKPHjSlHwaKbKqlFrokZ',
  jamendo: '76b53e2b'
} as const;

export type ApiService = keyof typeof FALLBACK_KEYS;

/**
 * Statically retrieves an environment variable using Vite's replacement on `process.env`.
 * This function's content will be replaced at build time.
 */
const getEnvKey = (service: ApiService): string | undefined => {
    switch (service) {
        // Fix: Prioritize the standard platform-injected API_KEY, then VITE_GEMINI_API_KEY.
        case 'gemini': return process.env.API_KEY || process.env.VITE_GEMINI_API_KEY;
        case 'freesound': return process.env.VITE_FREESOUND_API_KEY;
        case 'unsplash': return process.env.VITE_UNSPLASH_API_KEY;
        case 'pexels': return process.env.VITE_PEXELS_API_KEY;
        case 'jamendo': return process.env.VITE_JAMENDO_API_KEY;
        default: return undefined;
    }
};

/**
 * Получает API ключ с автоматическим fallback
 * Порядок приоритета:
 * 1. .env файл или ключ окружения (VITE_*_API_KEY / API_KEY)
 * 2. localStorage (настройки пользователя)
 * 3. Захардкоженные ключи (FALLBACK_KEYS)
 */
export const getApiKey = (service: ApiService): string => {
  // 1. Проверяем .env или ключ окружения (наивысший приоритет)
  const envKey = getEnvKey(service);
  if (envKey?.trim()) {
    return envKey.trim();
  }

  // 2. Проверяем localStorage (пользовательские настройки)
  try {
    const storageKey = `apiKey_${service}`;
    const userKey = localStorage.getItem(storageKey);
    if (userKey?.trim()) {
      return userKey.trim();
    }
  } catch (e) {
    console.warn(`Failed to read ${service} key from localStorage:`, e);
  }

  // 3. Используем fallback ключ
  const fallbackKey = FALLBACK_KEYS[service];

  // Special handling for Gemini to provide better error guidance
  if (service === 'gemini' && !fallbackKey) {
    console.warn(
      'Gemini API key is missing. Please:\n' +
      '1. Create a .env file in the project root with: API_KEY=your_key_here\n' +
      '2. Or enter your API key through the UI (click the key icon in the top right)\n' +
      '3. Get your key from: https://aistudio.google.com/apikey'
    );
  }

  return fallbackKey;
};

/**
 * Проверяет, использует ли пользовательский ключ (из localStorage)
 */
export const hasCustomKey = (service: ApiService): boolean => {
  try {
    const userKey = localStorage.getItem(`apiKey_${service}`);
    return !!(userKey?.trim());
  } catch {
    return false;
  }
};

/**
 * Сохраняет пользовательский ключ в localStorage
 */
export const saveApiKey = (service: ApiService, key: string): void => {
  try {
    const storageKey = `apiKey_${service}`;
    if (key.trim()) {
      localStorage.setItem(storageKey, key.trim());
    } else {
      localStorage.removeItem(storageKey);
    }
  } catch (e) {
    console.error(`Failed to save key for ${service} to localStorage`, e);
  }
};


/**
 * Получает все ключи сразу
 */
export const getAllApiKeys = (): { [key in ApiService]: string } => ({
  gemini: getApiKey('gemini'),
  freesound: getApiKey('freesound'),
  unsplash: getApiKey('unsplash'),
  pexels: getApiKey('pexels'),
  jamendo: getApiKey('jamendo')
});

/**
 * Информация об источнике ключа для UI
 */
export const getKeySource = (service: ApiService): 'custom' | 'env' | 'default' => {
  // Fix: The source logic needs to follow the new key priority.
  const envKey = getEnvKey(service);
  if (envKey?.trim()) return 'env';

  if (hasCustomKey(service)) return 'custom';
  
  return 'default';
};