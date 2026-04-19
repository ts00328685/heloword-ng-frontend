import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './i18n'

// Handle dynamic import failures (chunk loading errors after deployment)
window.addEventListener('error', (event) => {
  if (event.message?.includes('Failed to fetch dynamically imported module')) {
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
