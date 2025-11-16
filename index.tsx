import React from 'react';
import ReactDOM from 'react-dom/client';
import { Buffer } from 'buffer';
import process from 'process';
import App from './App';
import './style.css';

// Polyfills для FFmpeg и других библиотек
(window as any).Buffer = Buffer;
(window as any).process = process;
(window as any).global = globalThis;

// @FIX: Cannot find name 'document'. Access it via `window` as DOM types are not available.
const rootElement = (window as any).document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);