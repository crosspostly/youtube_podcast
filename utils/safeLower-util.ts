import { safeLower } from './utils/safeLower';
/**
 * Безопасное преобразование значения к нижнему регистру.
 * Обрабатывает null, undefined и не-строковые значения.
 * 
 * @param value - Любое значение для преобразования
 * @returns Строка в нижнем регистре или пустая строка
 * 
 * @example
 * safeLower('Hello') // 'hello'
 * safeLower(null) // ''
 * safeLower(undefined) // ''
 * safeLower(123) // '123'
 */
export function safeLower(value: any): string {
  return String(value ?? '').toLowerCase();
}

/**
 * Безопасное преобразование к верхнему регистру.
 * @param value - Любое значение для преобразования
 * @returns Строка в верхнем регистре или пустая строка
 */
export function safeUpper(value: any): string {
  return String(value ?? '').toUpperCase();
}

/**
 * Безопасная проверка строки (case-insensitive).
 * @param value1 - Первое значение
 * @param value2 - Второе значение
 * @returns true если строки равны (без учёта регистра)
 */
export function safeEquals(value1: any, value2: any): boolean {
  return safeLower(value1) === safeLower(value2);
}

/**
 * Безопасная проверка вхождения подстроки (case-insensitive).
 * @param str - Строка для поиска
 * @param searchStr - Искомая подстрока
 * @returns true если подстрока найдена
 */
export function safeIncludes(str: any, searchStr: any): boolean {
  return safeLower(str).includes(safeLower(searchStr));
}
