# Gemini API Queue Implementation

## Overview

This document describes the queue implementation for Gemini API requests to prevent 429 (rate limit) errors.

## Architecture

### Core Components

1. **GeminiRequestQueue** - Main queue class that manages API request scheduling
2. **withQueueAndRetries** - Wrapper function that combines queue management with retry logic
3. **generateContentWithFallback** - Updated to use the queue for text generation requests

### Configuration

- **Minimum delay between requests**: 150ms
- **Maximum concurrent requests**: 1 (sequential processing)
- **Retry logic**: Exponential backoff with 3 retries by default

## Usage

### For Text Generation (already updated)
```typescript
import { generateContentWithFallback } from './geminiService';

// This now automatically uses the queue
const response = await generateContentWithFallback(params, log, apiKey);
```

### For Other API Requests
```typescript
import { withQueueAndRetries } from './geminiService';

// Wrap any Gemini API call with queue and retry logic
const response = await withQueueAndRetries(() => 
    ai.models.generateContent({ model, ...params }), 
    log
);
```

## Queue Behavior

1. **Request Addition**: When a request is made, it's added to the queue with a unique ID
2. **Sequential Processing**: Only one request processes at a time
3. **Rate Limiting**: 150ms minimum delay between requests
4. **Logging**: Full visibility into queue status and request processing
5. **Retry Logic**: Failed requests are retried with exponential backoff

## Log Messages

The queue provides detailed logging:
- `"Request added to queue. Queue size: X, Current requests: Y"`
- `"Processing request {id}. Queue size: X, Current requests: Y"`
- `"Delaying request {id} by Xms to respect rate limits"`
- `"Request {id} completed successfully"`
- `"Request {id} failed"`

## Files Modified

- `services/geminiService.ts` - Added queue implementation and updated functions
- `services/imageService.ts` - Updated to use `withQueueAndRetries`
- `services/ttsService.ts` - Updated to use `withQueueAndRetries`

## Benefits

- ✅ Prevents 429 rate limit errors
- ✅ Ensures sequential request processing
- ✅ Provides detailed logging for debugging
- ✅ Maintains backward compatibility
- ✅ Configurable delay and concurrency settings

## Testing

To test the queue implementation:
1. Make multiple rapid API calls
2. Observe log messages showing queue processing
3. Verify 150ms delays between requests
4. Confirm no 429 errors occur

The queue will automatically initialize on the first API call and log `"Gemini API request queue initialized"`.