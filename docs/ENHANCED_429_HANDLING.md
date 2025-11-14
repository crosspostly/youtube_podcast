# Enhanced 429 Error Handling Implementation

This document describes the enhanced error handling system for 429 (Too Many Requests) errors and other retryable API failures.

## Overview

The enhanced retry system provides:
- **Sophisticated exponential backoff** with configurable parameters
- **Intelligent jitter** to prevent thundering herd problems
- **Progressive user notifications** with context-aware messaging
- **Global configuration** with UI controls
- **Persistent settings** saved to localStorage

## Configuration

### Parameters

- **retries** (1-10): Maximum number of retry attempts
- **initialDelay** (500ms-10s): Initial delay before first retry
- **maxDelay** (5s-2min): Maximum delay cap to prevent excessive waiting
- **exponentialBase** (1.5x-4x): Multiplier for exponential backoff
- **jitterFactor** (0-100%): Random variation to prevent synchronized retries

### Default Configuration

```javascript
{
    retries: 3,           // Try up to 3 times
    initialDelay: 2000,   // Start with 2 second delay
    maxDelay: 30000,      // Cap at 30 seconds
    exponentialBase: 2,    // Double delay each time
    jitterFactor: 0.4      // 40% random variation
}
```

## Backoff Strategy

The delay calculation follows this pattern:

1. **Base Delay**: `currentDelay = initialDelay`
2. **Exponential Growth**: `currentDelay = currentDelay * exponentialBase`
3. **Jitter Addition**: `delayWithJitter = currentDelay + (currentDelay * jitterFactor * (Math.random() - 0.5))`
4. **Cap Application**: `finalDelay = Math.min(delayWithJitter, maxDelay)`

### Example Delay Sequence

With default settings (2s initial, 2x exponential, 40% jitter):

- Attempt 1 fails → Retry in ~2.4s (2s + 40% jitter)
- Attempt 2 fails → Retry in ~4.8s (4s + 40% jitter)
- Attempt 3 fails → Final error

## User Notifications

The system provides progressive messaging for consecutive 429 errors:

### First 429 Error
```
⚠️ Превышен лимит запросов. Повторная попытка через 2 сек...
```

### Second Consecutive 429 Error
```
🔄 Снова превышен лимит. Увеличиваем интервал до 4 сек. Пожалуйста, подождите...
```

### Third+ Consecutive 429 Error
```
⏳ API перегружен. Следующая попытка через 8 сек. Рекомендуем сделать паузу...
```

### Final Error Messages

Context-aware error messages based on failure type:

```javascript
// Rate limiting with consecutive failures
"❌ Сервис перегружен: исчерпаны все попытки (3) после 2 превышений лимита. Пожалуйста, попробуйте позже."

// Single rate limit failure
"❌ Превышен лимит запросов: исчерпаны все попытки (3). Пожалуйста, подождите несколько минут и попробуйте снова."

// Server errors
"❌ Ошибка сервера (503): исчерпаны все попытки (3). Сервис временно недоступен."
```

## Integration Points

### Core Functions

```javascript
import { withRetries, withQueueAndRetries, type RetryConfig } from './services/geminiService';

// Basic retry with default config
await withRetries(apiCall, log);

// Custom configuration
await withRetries(apiCall, log, { 
    retries: 5, 
    initialDelay: 1000,
    maxDelay: 60000 
});

// Queue-aware retry (for Gemini APIs)
await withQueueAndRetries(generateContent, log);

// Image-specific retry (31s delay for rate limits)
await withImageQueueAndRetries(generateImage, log);
```

### Configuration Management

```javascript
import { getApiRetryConfig, updateApiRetryConfig } from './config/appConfig';

// Get current configuration
const currentConfig = getApiRetryConfig();

// Update configuration
updateApiRetryConfig({ retries: 5, maxDelay: 120000 });
```

## Error Classification

### Retryable Errors
- **429**: Too Many Requests
- **503**: Service Unavailable  
- **504**: Gateway Timeout
- **Network Errors**: Connection reset, failed to fetch, timeouts
- **Overload Messages**: Error messages containing "overloaded" or "rate limit"

### Non-Retryable Errors
- **Authentication**: 401, 403 errors
- **Client Errors**: 400, 404, 422 errors
- **Configuration**: Missing API keys, invalid parameters

## Performance Impact

### Benefits
- **Reduced API Overload**: Exponential backoff prevents hammering services
- **Better User Experience**: Clear feedback about what's happening
- **Configurable Behavior**: Users can adjust based on their API quotas
- **Thundering Herd Prevention**: Jitter prevents synchronized retry storms

### Trade-offs
- **Increased Latency**: Failed requests take longer due to backoff
- **Complexity**: More sophisticated than simple retry loops
- **Configuration Overhead**: Users may need to tune parameters

## Best Practices

### For High-Volume Applications
- Increase `initialDelay` to 3000-5000ms
- Set `exponentialBase` to 1.5 for gentler growth
- Use higher `jitterFactor` (0.6-0.8) for better distribution

### For Low-Volume Applications  
- Use default settings
- Consider lower `retries` (2-3) for faster feedback
- Moderate `jitterFactor` (0.3-0.5) is sufficient

### For Rate-Limited APIs
- Higher `initialDelay` (5000-10000ms)
- Lower `exponentialBase` (1.5-2.0)
- Higher `maxDelay` (60000-120000ms)
- Maximum `jitterFactor` (0.8-1.0)

## Implementation Details

### File Structure
```
/services/geminiService.ts     # Core retry logic
/config/appConfig.ts          # Global configuration
/components/ApiKeyModal.tsx    # UI configuration controls
/types.ts                    # TypeScript interfaces
```

### Key Functions
- `withRetries()`: Main retry wrapper
- `getRetryConfig()`: Merges global and user config
- `updateApiRetryConfig()`: Updates global settings
- `consecutive429Count`: Tracks rate limit streaks

### Storage
Configuration is persisted to `localStorage` under key `apiRetryConfig` and automatically loaded on application start.

## Testing

Run the enhanced retry test:

```javascript
import { testEnhancedRetry } from './test/enhancedRetry.test';
testEnhancedRetry();
```

This test demonstrates:
- Consecutive 429 error handling
- Custom exponential backoff
- High jitter factor behavior
- Progressive user messaging