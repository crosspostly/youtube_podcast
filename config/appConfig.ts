import type { AppConfig, ApiRetryConfig } from '../types';

// Default configuration for API retry behavior
const DEFAULT_API_RETRY_CONFIG: ApiRetryConfig = {
    retries: 3,
    initialDelay: 2000, // 2 seconds
    maxDelay: 30000,    // 30 seconds
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