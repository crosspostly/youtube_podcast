# API Key Setup Guide

## Quick Setup (5 minutes)

### 1. Get Your Gemini API Key

1. Go to: https://aistudio.google.com/apikey
2. Click "Create API Key"
3. Select or create a Google Cloud project
4. Copy the key (starts with `AIzaSy`, 39 characters long)

### 2. Configure the API Key

#### Option A: Using .env file (Recommended)

1. Open the `.env` file in your project root
2. Replace `REPLACE_WITH_YOUR_GEMINI_API_KEY` with your actual key:

```bash
# Before
API_KEY=REPLACE_WITH_YOUR_GEMINI_API_KEY
VITE_GEMINI_API_KEY=REPLACE_WITH_YOUR_GEMINI_API_KEY

# After
API_KEY=AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz1234567
VITE_GEMINI_API_KEY=AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz1234567
```

3. **Important:** Restart your development server (`npm run dev`)

#### Option B: Using the UI

1. Start the application: `npm run dev`
2. Open http://localhost:3000
3. Click the 🔑 icon in the top-right corner
4. Paste your Gemini API key
5. Click "Save"
6. Refresh the page (F5)

### 3. Verify Setup

Open your browser console (F12) and check:

```javascript
// Check if environment variables are loaded
console.log(import.meta.env)

// Check if localStorage has the key
console.log(localStorage.getItem('apiKey_gemini'))
```

## Troubleshooting

### Error: 400 Bad Request

**Cause:** Missing or invalid API key

**Solutions:**
1. Ensure your key is exactly 39 characters starting with `AIzaSy`
2. No spaces or quotes around the key in `.env`
3. Make sure the key is "Active" in Google AI Studio
4. Restart Vite after changing `.env`

### Common Mistakes

❌ `API_KEY= AIzaSy...` (space after `=`)  
✅ `API_KEY=AIzaSy...`

❌ `API_KEY="AIzaSy..."` (quotes)  
✅ `API_KEY=AIzaSy...`

❌ Using Service Account JSON key instead of API Key  
✅ Use API Key from AI Studio

### API Key Not Working?

1. Check key status at: https://aistudio.google.com/apikey
2. Ensure you're using an API Key, not a Service Account key
3. Verify the key hasn't expired
4. Try generating a new key if needed

## Other API Keys (Optional)

The application includes working defaults for other services:
- ✅ Freesound (sound effects)
- ✅ Unsplash (stock images) 
- ✅ Pexels (stock images)
- ✅ Jamendo (background music)

You only need to configure the Gemini API key to get started.

## Need Help?

- Gemini API Documentation: https://ai.google.dev/gemini-api/docs
- AI Studio: https://aistudio.google.com
- Report issues in the project repository