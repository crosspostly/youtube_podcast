import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Test configuration to verify environment variables are loaded
export default defineConfig(({ mode }) => {
    // This will help debug environment variable loading
    console.log('🔍 Environment Variables Debug:');
    console.log('Mode:', mode);
    
    // Load environment variables
    const env = import.meta.env;
    
    // Check if API keys are loaded
    const hasApiKey = env.VITE_GEMINI_API_KEY || env.API_KEY;
    const isPlaceholder = env.VITE_GEMINI_API_KEY?.includes('REPLACE_WITH_YOUR') || 
                          env.API_KEY?.includes('REPLACE_WITH_YOUR');
    
    console.log('API Key found:', !!hasApiKey);
    console.log('Is placeholder:', isPlaceholder);
    
    if (!hasApiKey || isPlaceholder) {
        console.warn('⚠️  Gemini API key is not configured properly!');
        console.warn('Please check your .env file and replace the placeholder with your actual API key.');
        console.warn('Get your key from: https://aistudio.google.com/apikey');
    } else {
        console.log('✅ API key appears to be configured');
    }
    
    // Return the actual production config
    return {
        server: {
            port: 3000,
            host: '0.0.0.0',
            proxy: {
                '/api': {
                    target: 'http://localhost:3001',
                    changeOrigin: true,
                    secure: false,
                }
            }
        },
        plugins: [react()],
        define: {
            // Keep existing process.env definitions for compatibility
            'process.env': '{}'
        },
        resolve: {
            alias: {
                '@': '/home/engine/project',
            }
        }
    };
});