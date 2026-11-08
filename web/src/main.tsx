import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { LanguageProvider } from './i18n';
import './index.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Relative URL so registration works under a subpath; a failure
    // (e.g. inside a framed Space) must never break loading.
    navigator.serviceWorker.register('sw.js').catch(() => undefined);
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </React.StrictMode>,
);
