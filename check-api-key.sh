#!/bin/bash

# API Key Validation Script for Mystic Narratives AI
# This script helps verify your API key configuration

echo "🔍 Mystic Narratives AI - API Key Validation"
echo "============================================"

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found!"
    echo "💡 Please copy .env.example to .env and configure your API keys"
    exit 1
fi

echo "✅ .env file found"

# Check if API key is configured
API_KEY=$(grep "^API_KEY=" .env | cut -d'=' -f2)
VITE_API_KEY=$(grep "^VITE_GEMINI_API_KEY=" .env | cut -d'=' -f2)

if [ -z "$API_KEY" ] || [ "$API_KEY" = "REPLACE_WITH_YOUR_GEMINI_API_KEY" ]; then
    echo "❌ API_KEY is not configured or still set to placeholder"
    echo "💡 Please edit .env and replace REPLACE_WITH_YOUR_GEMINI_API_KEY with your actual key"
    MISSING_KEY=true
fi

if [ -z "$VITE_API_KEY" ] || [ "$VITE_API_KEY" = "REPLACE_WITH_YOUR_GEMINI_API_KEY" ]; then
    echo "❌ VITE_GEMINI_API_KEY is not configured or still set to placeholder"
    echo "💡 Please edit .env and replace REPLACE_WITH_YOUR_GEMINI_API_KEY with your actual key"
    MISSING_KEY=true
fi

# If we found missing keys, exit
if [ "$MISSING_KEY" = true ]; then
    echo ""
    echo "📖 Setup Guide:"
    echo "1. Get your API key from: https://aistudio.google.com/apikey"
    echo "2. Edit the .env file"
    echo "3. Replace both API_KEY and VITE_GEMINI_API_KEY with your actual key"
    echo "4. Restart your development server: npm run dev"
    exit 1
fi

# Validate API key format
if [ ${#API_KEY} -ne 39 ] || [[ ! "$API_KEY" =~ ^AIzaSy ]]; then
    echo "⚠️  Warning: API_KEY format looks incorrect"
    echo "   Expected: 39 characters starting with 'AIzaSy'"
    echo "   Actual: ${#API_KEY} characters, starts with: ${API_KEY:0:6}"
    FORMAT_ISSUE=true
fi

if [ ${#VITE_API_KEY} -ne 39 ] || [[ ! "$VITE_API_KEY" =~ ^AIzaSy ]]; then
    echo "⚠️  Warning: VITE_GEMINI_API_KEY format looks incorrect"
    echo "   Expected: 39 characters starting with 'AIzaSy'"
    echo "   Actual: ${#VITE_API_KEY} characters, starts with: ${VITE_API_KEY:0:6}"
    FORMAT_ISSUE=true
fi

if [ "$FORMAT_ISSUE" = true ]; then
    echo ""
    echo "💡 Make sure you're using an API Key (not a Service Account key)"
    echo "   Get your key from: https://aistudio.google.com/apikey"
    exit 1
fi

echo "✅ API keys appear to be configured correctly"
echo ""

# Check if development server is running
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ Development server is running on http://localhost:3000"
else
    echo "⚠️  Development server doesn't appear to be running"
    echo "💡 Start it with: npm run dev"
fi

echo ""
echo "🎉 Configuration looks good!"
echo ""
echo "Next steps:"
echo "1. Make sure your development server is running: npm run dev"
echo "2. Open http://localhost:3000 in your browser"
echo "3. Test the API by generating some content"
echo ""
echo "If you still encounter issues:"
echo "- Check the browser console (F12) for error messages"
echo "- Verify your API key is 'Active' at https://aistudio.google.com/apikey"
echo "- See API_SETUP.md for detailed troubleshooting"