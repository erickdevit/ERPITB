import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import { Root } from './app';

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true);
  },
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      // Periodically check for updates every 10 minutes
      setInterval(() => {
        registration.update().catch(() => undefined);
      }, 10 * 60 * 1000);

      // Check for updates whenever the browser tab regains focus
      window.addEventListener('focus', () => {
        registration.update().catch(() => undefined);
      });
    }
  },
});

createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>);
