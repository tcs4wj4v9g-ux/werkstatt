import { Canvas, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { useGame } from './game/store';
import { isLeader } from './net/coop';
import { Perf } from './three/Env';
import { GFX, TEST_DPR, TEST_MODE, useGfx } from './three/gfx';
import { GarageScene } from './three/GarageScene';
import { MarketScene } from './three/MarketScene';
import { TrackScene } from './three/TrackScene';
import { HelpModal, Toast } from './ui/common';
import { CoopModal } from './ui/CoopUI';
import { GarageUI } from './ui/GarageUI';
import { MarketUI } from './ui/MarketUI';
import { MenuScreen } from './ui/MenuScreen';
import { TrackUI } from './ui/TrackUI';

/** Macht Kamera/Szene für automatisierte Tests erreichbar. */
function TestHook() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  (window as any).__gkCamera = camera;
  (window as any).__gkGL = gl;
  (window as any).__gkScene = useThree((s) => s.scene);
  return null;
}

export function App() {
  const stored = useGame((s) => s.screen);
  const hasListings = useGame((s) => (s.marketSource === 'auctions' ? s.auctions.length : s.listings.length) > 0);
  const panel = useGame((s) => s.panel);
  const level = useGfx((s) => s.level);
  const scale = useGfx((s) => s.scale);
  const G = GFX[level];
  const dpr = TEST_MODE ? TEST_DPR : Math.max(0.6, Math.min(window.devicePixelRatio || 1, G.dpr) * scale);
  // Auktionen laufen in Echtzeit – auch die Zeit, in der das Spiel geschlossen war, wird beim Start nachgeholt.
  useEffect(() => {
    // Im Koop rechnet nur ein Gerät die Auktionsuhr, sonst würden beide dieselbe Abwicklung doppelt übertragen.
    const tick = () => isLeader() && useGame.getState().tickAuctions(Date.now());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  // Ungültige Kombinationen (z. B. nach Update eines alten Spielstands) abfangen.
  const hasDriveCar = useGame((s) => !!s.cars[s.driveBay]);
  const screen = stored === 'track' && !hasDriveCar ? 'garage' : stored === 'market' && !hasListings ? 'garage' : stored;

  return (
    <div className="app">
      {/* Ein Wechsel der Grafikstufe baut die 3D-Ansicht neu auf (Kantenglättung und Schatten lassen sich nicht im Betrieb umschalten). */}
      <Canvas key={level} shadows={G.shadows} dpr={dpr} gl={{ antialias: G.antialias, powerPreference: 'high-performance' }} camera={{ fov: 45, near: 0.08, far: 400, position: [5, 2.5, 5] }}>
        <TestHook />
        <Perf />
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
        {panel === 'coop' && screen !== 'menu' && <CoopModal />}
        <Toast />
      </div>
      <div className="rotate">
        <div>↻</div>
        Bitte das iPad ins Querformat drehen
      </div>
    </div>
  );
}
