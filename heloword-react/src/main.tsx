import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './i18n'

const CHUNK_ERROR_PATTERNS = [
  'Failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'Importing a module script failed',
  'Unable to preload CSS',
];

const isChunkLoadError = (message?: string) =>
  !!message && CHUNK_ERROR_PATTERNS.some((p) => message.includes(p));

// Handle dynamic import failures (chunk loading errors after deployment)
window.addEventListener('error', (event) => {
  if (isChunkLoadError(event.message)) {
    const retryCount = parseInt(sessionStorage.getItem('chunk-load-retry-count') || '0', 10);
    if (retryCount < 2) {
      sessionStorage.setItem('chunk-load-retry-count', String(retryCount + 1));
      window.location.reload();
    } else {
      sessionStorage.removeItem('chunk-load-retry-count');
      console.error('Chunk loading failed after retries', event);
    }
  }
});

window.addEventListener('unhandledrejection', (event) => {
  if (isChunkLoadError(event.reason?.message)) {
    const retryCount = parseInt(sessionStorage.getItem('chunk-load-retry-count') || '0', 10);
    if (retryCount < 2) {
      sessionStorage.setItem('chunk-load-retry-count', String(retryCount + 1));
      window.location.reload();
    } else {
      sessionStorage.removeItem('chunk-load-retry-count');
      console.error('Chunk loading failed after retries', event.reason);
    }
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
