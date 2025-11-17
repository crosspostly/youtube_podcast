# Image Download Proxy Fixes

## Problem Solved

The image download proxy `/api/download-image` was failing with "fetch failed" errors when trying to download images from Unsplash and Pexels stock photo services.

## Root Causes Identified

1. **Missing Unsplash download_location handling**: Unsplash requires calling the `download_location` endpoint first to get the actual download URL
2. **Insufficient headers**: The fetch request was missing important headers that stock photo services expect
3. **Poor error logging**: Limited visibility into why fetch was failing
4. **No fallback mechanism**: Single point of failure with only fetch

## Fixes Implemented

### 1. Enhanced Error Logging

**Before:**
```javascript
console.error(`Image download attempt ${attempt}/3 failed:`, error.message);
```

**After:**
```javascript
console.error(`Image download attempt ${attempt}/3 failed:`, {
  message: errorMessage,
  cause: errorCause,
  code: errorCode,
  url: targetUrl,
  stack: error instanceof Error ? error.stack : undefined
});
```

### 2. Unsplash download_location Support

**New functionality:**
```javascript
// For Unsplash, we need to get the actual download URL first
if (source === 'unsplash') {
  try {
    console.log(`Getting Unsplash download_location for ${targetUrl}`);
    const downloadResponse = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Client-ID ${apiKey}`,
        'Accept': 'application/json',
        'User-Agent': 'Mystic-Narratives-AI/1.0 (Image Download Proxy)'
      },
      signal: AbortSignal.timeout(10000)
    });

    const downloadData = await downloadResponse.json();
    if (!downloadData.url) {
      throw new Error('Unsplash download_location response missing URL');
    }

    targetUrl = downloadData.url;
    console.log(`Got actual download URL: ${targetUrl}`);
  } catch (error) {
    console.error('Failed to get Unsplash download_location:', error);
    // Continue with original URL as fallback
  }
}
```

### 3. Enhanced Headers

**New comprehensive headers:**
```javascript
const headers = {
  'User-Agent': 'Mystic-Narratives-AI/1.0 (Image Download Proxy)',
  'Accept': 'image/*,*/*',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Fetch-Dest': 'image',
  'Sec-Fetch-Mode': 'no-cors',
  'Sec-Fetch-Site': 'cross-site',
  ...authHeader
};
```

### 4. HTTPS Module Fallback

**New fallback mechanism:**
```javascript
// Try HTTPS fallback if fetch fails
try {
  const httpsResult = await downloadImageWithHttps(targetUrl, authHeader);
  
  if (httpsResult.status && httpsResult.status >= 400) {
    // Handle HTTP errors
    throw new Error(`HTTPS fallback server error: ${httpsResult.status}`);
  }
  
  arrayBuffer = httpsResult.data;
  contentType = httpsResult.contentType;
  console.log(`HTTPS fallback succeeded on attempt ${attempt}: ${arrayBuffer.byteLength} bytes`);
  
} catch (httpsError) {
  console.error(`HTTPS fallback also failed on attempt ${attempt}:`, httpsError.message);
  throw fetchError; // Throw the original fetch error
}
```

### 5. Test Endpoint

**New debugging endpoint:**
```
GET /api/test-image-download?url=<url>&source=<unsplash|pexels>&apiKey=<key>
```

This endpoint tests both fetch and HTTPS fallback methods and provides detailed comparison results.

## Usage

### Basic Download (Enhanced)
```javascript
const response = await fetch('/api/download-image', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    url: photo.downloadUrl, 
    source: photo.source, 
    apiKey: apiKey 
  })
});
```

### Testing
```bash
# Start the dev server
npm run dev:api

# Test with a real Unsplash image
curl "http://localhost:3000/api/test-image-download?url=https://api.unsplash.com/photos/LBI7cgq3pbM/download_location&source=unsplash&apiKey=YOUR_API_KEY"
```

### Automated Test Script
```bash
# Run the comprehensive test script
node test-image-download.js
```

## Expected Results

**Before fixes:**
```
ERROR: ❌ Не удалось скачать фото, используем placeholder
ERROR: { "error": "Internal Server Error", "message": "fetch failed" }
```

**After fixes:**
```
INFO: Image download proxy: Getting Unsplash download_location for https://api.unsplash.com/photos/LBI7cgq3pbM/download_location
INFO: Image download proxy: Got actual download URL: https://images.unsplash.com/photo-...
INFO: Image download attempt 1/3: Fetching https://images.unsplash.com/photo-... with headers: [...]
INFO: Image download: Got response with content-type: image/jpeg, content-length: 3527456
INFO: Image downloaded successfully: 3527456 bytes, content-type: image/jpeg
RESPONSE: ✅ Фото скачано и обработано через proxy
```

## Benefits

1. **Reliability**: Multiple fallback mechanisms prevent single points of failure
2. **Compliance**: Proper Unsplash API usage with download_location handling
3. **Debugging**: Detailed logging helps identify issues quickly
4. **Testing**: Built-in test endpoint for easy troubleshooting
5. **Performance**: HTTPS fallback can be more reliable in some network conditions

## Files Modified

- `dev-server.js`: Enhanced `/api/download-image` endpoint with all fixes
- `services/stockPhotoService.ts`: Improved error logging and context
- `test-image-download.js`: New test script for verification

## Testing Checklist

- [ ] Server starts without errors (`npm run dev:api`)
- [ ] Test endpoint accessible (`GET /api/test-image-download`)
- [ ] Unsplash download_location handling works
- [ ] HTTPS fallback activates when fetch fails
- [ ] Error logging provides sufficient detail
- [ ] Images successfully download and convert to base64
- [ ] Placeholder fallback works when all methods fail