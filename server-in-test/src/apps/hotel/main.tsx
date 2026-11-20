import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HotelApp } from './HotelApp';
import './hotel.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HotelApp />
  </StrictMode>,
);
