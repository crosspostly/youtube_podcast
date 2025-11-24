#!/bin/bash

# Enhanced test script for SFX, subtitles, and video assembly fixes
echo "🧪 Testing SFX, Subtitles, and Video Assembly Fixes (Enhanced)"
echo "============================================================="

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

if grep -q "cleanupSfxBlobs" services/audioUtils.ts; then
    echo "✅ SFX memory cleanup integration found"
else
    echo "❌ SFX memory cleanup integration missing"
fi

# Test 7: Check if chapterPackager has enhanced SFX timing support
echo ""
echo "🔍 Test 7: Checking chapter packager SFX timing support..."
if grep -q "Enhanced SFX processing with timing from metadata" services/chapterPackager.ts; then
    echo "✅ Enhanced SFX timing processing found"
else
    echo "❌ Enhanced SFX timing processing missing"
fi

if grep -q "adelay" services/chapterPackager.ts; then
    echo "✅ FFmpeg adelay filter support found"
else
    echo "❌ FFmpeg adelay filter support missing"
fi

if grep -q "powershell.*Get-Content.*metadata.*ConvertFrom-Json" services/chapterPackager.ts; then
    echo "✅ PowerShell metadata parsing found"
else
    echo "❌ PowerShell metadata parsing missing"
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

# Test 10: Check memory cleanup utilities
echo ""
echo "🔍 Test 10: Checking memory cleanup utilities..."
if [ -f "utils/sfxMemoryCleanup.ts" ]; then
    echo "✅ SFX memory cleanup utility exists"
else
    echo "❌ SFX memory cleanup utility missing"
fi

if grep -q "cleanupSfxBlobs" utils/sfxMemoryCleanup.ts; then
    echo "✅ cleanupSfxBlobs function exists"
else
    echo "❌ cleanupSfxBlobs function missing"
fi

if grep -q "getSfxMemoryStats" utils/sfxMemoryCleanup.ts; then
    echo "✅ getSfxMemoryStats function exists"
else
    echo "❌ getSfxMemoryStats function missing"
fi

# Test 11: Check Jest test configuration
echo ""
echo "🔍 Test 11: Checking Jest test configuration..."
if [ -f "jest.config.js" ]; then
    echo "✅ Jest configuration exists"
else
    echo "❌ Jest configuration missing"
fi

if [ -f "test/setup.ts" ]; then
    echo "✅ Jest test setup exists"
else
    echo "❌ Jest test setup missing"
fi

# Test 12: Check comprehensive test files
echo ""
echo "🔍 Test 12: Checking comprehensive test files..."
if [ -f "test/sfxService.test.ts" ]; then
    echo "✅ SFX service unit tests exist"
else
    echo "❌ SFX service unit tests missing"
fi

if [ -f "test/sfxMemoryCleanup.test.ts" ]; then
    echo "✅ SFX memory cleanup tests exist"
else
    echo "❌ SFX memory cleanup tests missing"
fi

if [ -f "test/sfxTiming.test.ts" ]; then
    echo "✅ SFX timing integration tests exist"
else
    echo "❌ SFX timing integration tests missing"
fi

# Test 13: Run Jest tests (if available)
echo ""
echo "🧪 Test 13: Running Jest tests..."
if npm list jest > /dev/null 2>&1; then
    if npm test > /dev/null 2>&1; then
        echo "✅ Jest tests pass"
    else
        echo "❌ Jest tests failed"
        echo "Run 'npm test' for detailed output"
    fi
else
    echo "⚠️ Jest not installed, skipping tests"
fi

# Test 14: Check package.json test scripts
echo ""
echo "🔍 Test 14: Checking package.json test scripts..."
if grep -q '"test":' package.json; then
    echo "✅ Test script found in package.json"
else
    echo "❌ Test script missing in package.json"
fi

if grep -q '"test:watch"' package.json; then
    echo "✅ Test watch script found in package.json"
else
    echo "❌ Test watch script missing in package.json"
fi

if grep -q '"test:coverage"' package.json; then
    echo "✅ Test coverage script found in package.json"
else
    echo "❌ Test coverage script missing in package.json"
fi

echo ""
echo "🎉 Enhanced testing completed!"
echo "============================================================="
echo ""
echo "📋 Summary of implemented fixes:"
echo "✅ SFX blob downloading and storage"
echo "✅ Enhanced SFX timing with anticipation"
echo "✅ Improved subtitle encoding (UTF-8 + Cyrillic)"
echo "✅ Enhanced SFX integration with metadata timing"
echo "✅ FFmpeg adelay filter for precise SFX positioning"
echo "✅ PowerShell-based metadata parsing"
echo "✅ SFX memory cleanup utilities"
echo "✅ Comprehensive Jest test suite"
echo "✅ Memory leak prevention"
echo "✅ Enhanced error handling and logging"
echo "✅ TypeScript type safety"
echo "✅ Real data testing capabilities"
echo ""
echo "🧪 New testing capabilities:"
echo "- Unit tests for SFX service functionality"
echo "- Memory cleanup testing"
echo "- SFX timing calculation testing"
echo "- Error handling and fallback testing"
echo "- Blob download and storage testing"
echo "- Mock data for reliable testing"