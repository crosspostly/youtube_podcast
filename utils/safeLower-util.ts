/**
 * Safe string manipulation utilities that handle null/undefined gracefully
 */

/**
 * Safely converts any value to lowercase string
 * @param value - Any value to convert
 * @returns Lowercase string or empty string for null/undefined
 */
export const safeLower = (value: any): string => {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).toLowerCase();
};

/**
 * Safely converts any value to uppercase string
 * @param value - Any value to convert
 * @returns Uppercase string or empty string for null/undefined
 */
export const safeUpper = (value: any): string => {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).toUpperCase();
};

/**
 * Safely compares two values without case sensitivity
 * @param value1 - First value to compare
 * @param value2 - Second value to compare
 * @returns True if values are equal (case-insensitive) or both null/undefined
 */
export const safeEquals = (value1: any, value2: any): boolean => {
  return safeLower(value1) === safeLower(value2);
};

/**
 * Safely checks if a string includes another substring (case-insensitive)
 * @param str - String to search in
 * @param searchStr - Substring to search for
 * @returns True if searchStr is found in str (case-insensitive)
 */
export const safeIncludes = (str: any, searchStr: any): boolean => {
  return safeLower(str).includes(safeLower(searchStr));
};

/**
 * Parses an error object and returns a user-friendly, localized string.
 * @param error - The error object to parse.
 * @returns A user-friendly error message.
 */
export const parseErrorMessage = (error: any): string => {
    if (!error) {
        return 'Произошла неизвестная ошибка.';
    }

    if (typeof error === 'string') {
        return error;
    }

    const message = safeLower(error.message || '');
    const status = error.status || error.response?.status;

    if (message.includes('api call failed permanently')) {
        const originalError = error.originalError || error;
        const originalStatus = originalError.status || originalError.response?.status;
        if (originalStatus === 429 || safeLower(originalError.message).includes('rate limit')) {
             return 'Превышен лимит запросов к API. Пожалуйста, подождите несколько минут и попробуйте снова. Сервер не смог подключиться даже после нескольких попыток.';
        }
        return 'Не удалось выполнить запрос к API после нескольких попыток. Проверьте ваше интернет-соединение или попробуйте позже.';
    }
    if (message.includes('api key not valid')) {
        return 'Ключ API недействителен. Проверьте правильность ключа в настройках.';
    }
    if (message.includes('api key not configured') || message.includes('api_key')) {
        return 'Ключ API не настроен. Пожалуйста, введите ваш ключ в настройках.';
    }
    if (message.includes('failed to fetch') || message.includes('network error') || message.includes('net::err_connection_reset')) {
        return 'Ошибка сети. Проверьте ваше интернет-соединение и попробуйте снова.';
    }
    if (status === 429 || message.includes('rate limit')) {
        return 'Превышен лимит запросов к API. Пожалуйста, подождите несколько минут и попробуйте снова.';
    }
    if (status >= 500) {
        return `Внутренняя ошибка сервера (код: ${status}). Сервис может быть временно недоступен. Пожалуйста, попробуйте позже.`;
    }
    if (message.includes('freesound proxy')) {
        return `Ошибка при обращении к Freesound. Сервис может быть временно недоступен.`;
    }
    if (message.includes('ffmpeg')) {
        return `Произошла ошибка в видео-движке: ${error.message}`;
    }
    if (message.includes('both primary and fallback models failed')) {
        return 'Не удалось сгенерировать контент. Оба основных и резервных сервиса недоступны. Проверьте журнал для подробностей.';
    }

    // Generic fallback
    return error.message || 'Произошла неизвестная ошибка. Подробности в журнале.';
};