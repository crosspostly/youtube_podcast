import './style.css'
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// FIX: Prefix `document` with `window.` to resolve missing DOM type error.
const rootElement = window.document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);