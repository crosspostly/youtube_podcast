import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './style.css';

// FIX: Cannot find name 'document'. This is likely due to a misconfigured TypeScript environment (missing "dom" in `lib`).
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