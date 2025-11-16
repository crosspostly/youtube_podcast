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
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.FREESOUND_API_KEY': JSON.stringify(env.FREESOUND_API_KEY),
      'process.env.UNSPLASH_API_KEY': JSON.stringify(env.UNSPLASH_API_KEY),
      'process.env.PEXELS_API_KEY': JSON.stringify(env.PEXELS_API_KEY),
      'process.env.JAMENDO_API_KEY': JSON.stringify(env.JAMENDO_API_KEY),
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
