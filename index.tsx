import { Buffer } from 'buffer';
// FIX: Cast `window` to `any` to attach the `Buffer` property, resolving the TypeScript error about 'Buffer' not existing on type 'Window'. This is a standard polyfill pattern for browser environments.
(window as any).Buffer = Buffer;

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './style.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);