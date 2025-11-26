# Dynamic Google Gemini Voices Implementation

## Overview

This implementation replaces the static voice list with dynamic voice fetching from Google Gemini TTS API, providing users with access to all available voices instead of a hardcoded subset.

## Files Modified/Added

### New Files

1. **`services/voicesService.ts`** - Service for fetching and caching voices
   - `fetchAvailableVoices()` - Main function to get voices from API
   - `discoverAdditionalVoices()` - Tests potential voice names to discover additional voices
   - `cacheVoices()` / `getCachedVoices()` - LocalStorage caching with 24-hour expiry

2. **`hooks/useAvailableVoices.ts`** - React hook for voice management
   - Provides `voices`, `loading`, `error`, and `refreshVoices` states
   - Handles caching, API calls, and error handling
   - Auto-refreshes voices on component mount

### Modified Files

1. **`components/ProjectSetup.tsx`** - Updated to use dynamic voices
   - Replaced static `VOICES` import with `useAvailableVoices` hook
   - Added loading states and error handling to voice selection UI
   - Added refresh button and voice count display
   - Enhanced dropdowns with disabled states during loading

## Features Implemented

### ✅ Dynamic Voice Fetching
- Attempts to discover additional voices beyond the static list
- Tests potential voice names with minimal API calls
- Falls back gracefully to static list if API fails

### ✅ Caching System
- Voices cached in localStorage for 24 hours
- Reduces API calls and improves loading times
- Automatic cache invalidation after expiry

### ✅ Enhanced UI
- Loading indicators during voice fetching
- Error messages with retry functionality
- Voice count display ("Доступно голосов: X из Y")
- Refresh button to manually update voice list
- Disabled states for dropdowns during loading/errors

### ✅ Backward Compatibility
- All existing voice functionality preserved
- TTS generation works with any discovered voice
- PodcastStudio component displays selected voices correctly
- Fallback to static list ensures app always works

## How It Works

1. **Initial Load**: Hook checks for cached voices first
2. **API Discovery**: If no cache, tests potential voice names
3. **Caching**: Successfully discovered voices are cached locally
4. **UI Updates**: Dropdowns populated with available voices
5. **Error Handling**: Graceful fallback to static list on failures

## Voice Discovery Strategy

Since Google doesn't provide a direct voices listing endpoint, the implementation:

1. Uses a curated list of potential voice names based on Google's naming conventions
2. Tests a sample of voices with minimal TTS requests
3. Adds successful voices to the available list
4. Combines with existing static voices for maximum compatibility

## User Experience

- **Fast Loading**: Cached voices load instantly
- **Progressive Enhancement**: Starts with static list, adds discovered voices
- **Clear Feedback**: Loading states, error messages, and voice counts
- **Reliable Fallback**: Always has voices available, even if API fails

## Future Enhancements

- Monitor Google API updates for official voice listing endpoints
- Implement voice metadata (language, accent, age range) when available
- Add voice preview caching for improved performance
- Implement voice quality/score ratings
- Add voice search/filtering by characteristics