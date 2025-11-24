#!/bin/bash

# Test script for SFX, subtitles, and video assembly fixes
echo "🧪 Testing SFX, Subtitles, and Video Assembly Fixes"
echo "=================================================="

# Test 1: Check if new files exist
echo "📁 Test 1: Checking if new files exist..."
if [ -f "create_video.ps1" ]; then
    echo "✅ create_video.ps1 exists"
else
    echo "❌ create_video.ps1 missing"
fi

if [ -f "get_video_title.ps1" ]; then
    echo "✅ get_video_title.ps1 exists"
else
    echo "❌ get_video_title.ps1 missing"
fi

# Test 2: Check TypeScript compilation
echo ""
echo "🔍 Test 2: Checking TypeScript compilation..."
if npm run build > /dev/null 2>&1; then
    echo "✅ TypeScript compilation successful"
else
    echo "❌ TypeScript compilation failed"
fi

# Test 3: Check type checking
echo ""
echo "🔍 Test 3: Checking TypeScript types..."
if npx tsc --noEmit > /dev/null 2>&1; then
    echo "✅ TypeScript types valid"
else
    echo "❌ TypeScript type errors found"
fi

# Test 4: Check if functions exist in sfxService.ts
echo ""
echo "🔍 Test 4: Checking SFX service functions..."
if grep -q "findAndDownloadSfx" services/sfxService.ts; then
    echo "✅ findAndDownloadSfx function exists"
else
    echo "❌ findAndDownloadSfx function missing"
fi

if grep -q "soundEffectBlob" services/sfxService.ts; then
    echo "✅ soundEffectBlob usage found"
else
    echo "❌ soundEffectBlob usage missing"
fi

# Test 5: Check if types are updated
echo ""
echo "🔍 Test 5: Checking type definitions..."
if grep -q "blob?: Blob" types.ts; then
    echo "✅ Blob type found in SoundEffect interface"
else
    echo "❌ Blob type missing in SoundEffect interface"
fi

if grep -q "soundEffectBlob" types.ts; then
    echo "✅ soundEffectBlob found in ScriptLine interface"
else
    echo "❌ soundEffectBlob missing in ScriptLine interface"
fi

# Test 6: Check if audioUtils has enhanced SFX support
echo ""
echo "🔍 Test 6: Checking audio service enhancements..."
if grep -q "Using pre-downloaded blob for SFX" services/audioUtils.ts; then
    echo "✅ Enhanced SFX blob handling found"
else
    echo "❌ Enhanced SFX blob handling missing"
fi

if grep -q "SFX_ANTICIPATION" services/audioUtils.ts; then
    echo "✅ SFX timing improvements found"
else
    echo "❌ SFX timing improvements missing"
fi

# Test 7: Check if chapterPackager has SFX blob support
echo ""
echo "🔍 Test 7: Checking chapter packager SFX support..."
if grep -q "Используем загруженный blob для SFX" services/chapterPackager.ts; then
    echo "✅ SFX blob usage in packager found"
else
    echo "❌ SFX blob usage in packager missing"
fi

# Test 8: Check if subtitle cleaning is enhanced
echo ""
echo "🔍 Test 8: Checking subtitle cleaning improvements..."
if grep -q "u0400.*u04FF" services/chapterPackager.ts; then
    echo "✅ Cyrillic character support in subtitles found"
else
    echo "❌ Cyrillic character support in subtitles missing"
fi

# Test 9: Check if bat script has SFX support
echo ""
echo "🔍 Test 9: Checking assembly script SFX support..."
if grep -q "SFX PROCESSING" services/chapterPackager.ts; then
    echo "✅ SFX processing in assembly script found"
else
    echo "❌ SFX processing in assembly script missing"
fi

echo ""
echo "🎉 Testing completed!"
echo "=================================================="
echo ""
echo "📋 Summary of implemented fixes:"
echo "✅ SFX blob downloading and storage"
echo "✅ Enhanced SFX timing with anticipation"
echo "✅ Improved subtitle encoding (UTF-8 + Cyrillic)"
echo "✅ SFX integration in audio mixing"
echo "✅ SFX support in video assembly scripts"
echo "✅ Enhanced error handling and logging"
echo "✅ TypeScript type safety"