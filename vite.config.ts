import path from 'path';
// Fix: Import `process` to provide types for `process.cwd()` in Vite's Node.js context.
import process from 'process';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // Load all env variables from the root directory.
    // The prefix '' ensures all variables are loaded, not just VITE_ ones.
    // Note: The 'process' object is available in Vite's Node.js context,
    // so `process.cwd()` is correct here, even if your editor's linter shows a type error.
    const env = loadEnv(mode, process.cwd(), '');

    // Create an object to define `process.env` variables for client-side access.
    // This is the supported method in this environment, replacing `import.meta.env`.
    const processEnvDefine = Object.keys(env).reduce((acc, key) => {
        acc[`process.env.${key}`] = JSON.stringify(env[key]);
        return acc;
    }, {} as { [key: string]: string });

    // Ensure the API_KEY alias for geminiService and others is maintained.
    if (env.GEMINI_API_KEY) {
        processEnvDefine['process.env.API_KEY'] = JSON.stringify(env.GEMINI_API_KEY);
    }
    
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: processEnvDefine, // Use the dynamically created define object.
      resolve: {
        alias: {
          // Fix: `__dirname` is not available in an ES module context.
          // Using `process.cwd()` correctly resolves to the project root directory.
          '@': path.resolve(process.cwd(), '.'),
        }
      }
    };
});