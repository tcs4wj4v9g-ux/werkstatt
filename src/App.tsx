import { Canvas, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { useGame } from './game/store';
import { GarageScene } from './three/GarageScene';
import { MarketScene } from './three/MarketScene';
import { TrackScene } from './three/TrackScene';
import { HelpModal, Toast } from './ui/common';
import { GarageUI } from './ui/GarageUI';
import { MarketUI } from './ui/MarketUI';
import { MenuScreen } from './ui/MenuScreen';
import { TrackUI } from './ui/TrackUI';

/** Macht Kamera/Szene für automatisierte Tests erreichbar. */
function TestHook() {
  const camera = useThree((s) => s.camera);
  (window as any).__gkCamera = camera;
  return null;
}

/**
 * Testmodus (`?test` in der Adresse): halbe Auflösung, keine Schatten, keine Kantenglättung.
 * Nur für automatisierte Browser-Tests ohne Grafikkarte – Spiellogik und Tipp-Erkennung sind unverändert.
 */
const TEST_MODE = new URLSearchParams(window.location.search).has('test');

export function App() {
  const stored = useGame((s) => s.screen);
  const hasListings = useGame((s) => (s.marketSource === 'auctions' ? s.auctions.length : s.listings.length) > 0);
  const panel = useGame((s) => s.panel);
  // Auktionen laufen in Echtzeit – auch die Zeit, in der das Spiel geschlossen war, wird beim Start nachgeholt.
  useEffect(() => {
    const tick = () => useGame.getState().tickAuctions(Date.now());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  // Ungültige Kombinationen (z. B. nach Update eines alten Spielstands) abfangen.
  const hasDriveCar = useGame((s) => !!s.cars[s.driveBay]);
  const screen = stored === 'track' && !hasDriveCar ? 'garage' : stored === 'market' && !hasListings ? 'garage' : stored;

  return (
    <div className="app">
      <Canvas shadows={!TEST_MODE} dpr={TEST_MODE ? 0.5 : [1, 1.6]} gl={{ antialias: !TEST_MODE }} camera={{ fov: 45, near: 0.08, far: 400, position: [5, 2.5, 5] }}>
        <TestHook />
        {screen === 'menu' && <MarketScene showroom />}
        {screen === 'market' && <MarketScene />}
        {screen === 'garage' && <GarageScene />}
        {screen === 'track' && <TrackScene />}
      </Canvas>
      <div className="ui">
        {screen === 'menu' && <MenuScreen />}
        {screen === 'market' && <MarketUI />}
        {screen === 'garage' && <GarageUI />}
        {screen === 'track' && <TrackUI />}
        {panel === 'help' && screen !== 'menu' && <HelpModal />}
        <Toast />
      </div>
      <div className="rotate">
        <div>↻</div>
        Bitte das iPad ins Querformat drehen
      </div>
    </div>
  );
}
