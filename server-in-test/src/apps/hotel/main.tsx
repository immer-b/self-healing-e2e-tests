import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HotelApp } from './HotelApp';
import './hotel.css';
import { applyTheme, storedTheme } from './theme';

applyTheme(storedTheme()); // before the first paint, so a dark choice doesn't flash light

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HotelApp />
  </StrictMode>,
);
