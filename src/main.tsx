import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline-Fähigkeit: Service Worker nur im fertigen Build registrieren.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js'));
}

// iOS: Doppeltipp-Zoom und Pinch-Zoom der Seite unterbinden (Zoom gehört der 3D-Kamera).
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

// Für automatisierte Tests und Fehlersuche.
import { useGame } from './game/store';
(window as any).__gk = useGame;
