import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      tailwindcss(),
      react(),
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || ''),
      'process.env.FREESOUND_API_KEY': JSON.stringify(env.VITE_FREESOUND_API_KEY || env.FREESOUND_API_KEY || ''),
      'process.env.UNSPLASH_API_KEY': JSON.stringify(env.VITE_UNSPLASH_API_KEY || env.UNSPLASH_API_KEY || ''),
      'process.env.PEXELS_API_KEY': JSON.stringify(env.VITE_PEXELS_API_KEY || env.PEXELS_API_KEY || ''),
      'process.env.JAMENDO_API_KEY': JSON.stringify(env.VITE_JAMENDO_API_KEY || env.JAMENDO_API_KEY || ''),
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
        }
      }
    }
  };
});
