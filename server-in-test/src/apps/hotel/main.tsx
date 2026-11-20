import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HotelApp } from './HotelApp';
import './hotel.css';
import { applyTheme, storedTheme } from './theme';

applyTheme(storedTheme()); // before the first paint, so a dark choice doesn't flash light

// Offline shell and read-only fallbacks for staff on weak Wi-Fi (production builds only).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/hotel/sw.js', { scope: '/hotel/' }).catch(() => {}));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HotelApp />
  </StrictMode>,
);
