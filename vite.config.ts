import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
 plugins: [
   tailwindcss(),
   react(),
   nodePolyfills(),
 ],
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