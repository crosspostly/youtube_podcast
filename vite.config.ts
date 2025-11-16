import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
 plugins: [
   tailwindcss(),
   react(),
 ],
 resolve: {
   alias: {
     buffer: 'buffer',
     process: 'process/browser',
     stream: 'stream-browserify',
   }
 },
 optimizeDeps: {
   esbuildOptions: {
     define: {
       global: 'globalThis'
     }
   }
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
})