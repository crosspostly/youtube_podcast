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