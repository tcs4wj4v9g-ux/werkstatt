import { defOf, defsOf } from './game/data/components';
import { performance } from './game/performance';
import * as motor from './game/motor';
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
import { player, travel } from './three/player';
(window as any).__gkPlayer = player;
import { engineAudio } from './game/audio';
(window as any).__gkAudio = engineAudio;
import { createCar } from './game/market';
import { movePlayer } from './three/player';
(window as any).__gkLib = { createCar, movePlayer, travel, motor, defsOf, defOf, perf: performance };
