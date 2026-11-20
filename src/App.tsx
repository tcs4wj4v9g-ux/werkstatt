import { Canvas, useThree } from '@react-three/fiber';
import { CoopRaceWatcher } from './ui/CoopRaceUI';
import { addPlay, isActive } from './game/playtime';
import { useEffect, useState } from 'react';
import { dayClock, dayLeft, useGame } from './game/store';
import { coopActive, isLeader, recoverAfterCrash } from './net/coop';
import { Recover } from './ui/Recover';
import { Perf } from './three/Env';
import { GFX, TEST_DPR, TEST_MODE, useGfx } from './three/gfx';
import { GarageScene } from './three/GarageScene';
import { MarketScene } from './three/MarketScene';
import { TrackScene } from './three/TrackScene';
import { HelpModal, Toast } from './ui/common';
import { CoopModal, CoopElsewhere } from './ui/CoopUI';
import { ChatFeed, ChatPanel } from './ui/Chat';
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
  (window as any).__gkRay = useThree((s) => s.raycaster);
  return null;
}

export function App() {
  const stored = useGame((s) => s.screen);
  const hasListings = useGame((s) => (s.marketSource === 'auctions' ? s.auctions.length : s.listings.length) > 0);
  const panel = useGame((s) => s.panel);
  const level = useGfx((s) => s.level);
  const scale = useGfx((s) => s.scale);
  const G = GFX[level];
  // Verliert das iPad den Grafikkontext (Speicherdruck), wird die 3D-Ansicht neu aufgebaut statt grau zu bleiben.
  const [glKey, setGlKey] = useState(0);
  const dpr = TEST_MODE ? TEST_DPR : Math.max(0.6, Math.min(window.devicePixelRatio || 1, G.dpr) * scale);
  // Auktionen laufen in Echtzeit – auch die Zeit, in der das Spiel geschlossen war, wird beim Start nachgeholt.
  useEffect(() => {
    // Im Koop rechnet nur ein Gerät die Auktionsuhr, sonst würden beide dieselbe Abwicklung doppelt übertragen.
    const tick = () => isLeader() && useGame.getState().tickAuctions(Date.now());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  // Arbeitszeit im Einzelspiel: jede aktive Sekunde zählen, alle 30 s (und beim Verlassen) in den Spielstand übernehmen
  useEffect(() => {
    let pending = 0;
    const flush = () => {
      if (pending <= 0) return;
      const s = useGame.getState();
      useGame.setState({ playTime: addPlay(s.playTime, pending) });
      pending = 0;
    };
    const t = setInterval(() => {
      const s = useGame.getState();
      if (s.started && s.screen !== 'menu' && !coopActive() && isActive()) pending++;
      if (pending >= 30 || (pending > 0 && s.screen === 'menu')) flush();
    }, 1000);
    const hide = () => document.hidden && flush();
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', flush);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', flush);
    };
  }, []);
  // Der Spieltag endet nach drei Minuten von selbst. Im Koop schaltet nur ein Gerät um (sonst zwei Tage auf einmal),
  // auf Probefahrt oder im Menü wird gewartet. Im Testmodus (Tageslänge 0) bleibt es beim Knopf.
  useEffect(() => {
    if (!dayClock.ms) return;
    const t = setInterval(() => {
      const s = useGame.getState();
      if (!s.started || (s.screen !== 'garage' && s.screen !== 'market') || !isLeader()) return;
      if (dayLeft(s) <= 0) s.nextDay();
    }, 1000);
    return () => clearInterval(t);
  }, []);
  // Ungültige Kombinationen (z. B. nach Update eines alten Spielstands) abfangen.
  const hasDriveCar = useGame((s) => !!s.cars[s.driveBay]);
  const screen = stored === 'track' && !hasDriveCar ? 'garage' : stored === 'market' && !hasListings ? 'garage' : stored;

  return (
    <div className="app">
      {/* Ein Wechsel der Grafikstufe baut die 3D-Ansicht neu auf (Kantenglättung und Schatten lassen sich nicht im Betrieb umschalten). */}
      {/* Absturz in der 3D-Ansicht: neu aufbauen statt grauem Bildschirm (im Koop mit frischem Stand vom Server) */}
      <Recover onError={(e) => { recoverAfterCrash(); useGame.getState().say(`Ansicht neu aufgebaut (${e?.message ?? 'Fehler'}).`, true); }} fallback={(msg, reload) => <div className="crash"><div>Die Ansicht stürzt wiederholt ab:<br /><small>{msg}</small></div><button className="btn primary" onClick={reload}>Neu laden</button></div>}>
      <Canvas key={`${level}-${glKey}`} onCreated={({ gl }) => gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); setTimeout(() => setGlKey((k) => k + 1), 400); }, { once: true })} shadows={G.shadows} dpr={dpr} gl={{ antialias: G.antialias, powerPreference: 'high-performance' }} camera={{ fov: 45, near: 0.08, far: 400, position: [5, 2.5, 5] }}>
        <TestHook />
        <Perf />
        {screen === 'menu' && <MarketScene showroom />}
        {screen === 'market' && <MarketScene />}
        {screen === 'garage' && <GarageScene />}
        {screen === 'track' && <TrackScene />}
      </Canvas>
      </Recover>
      <Recover onError={() => recoverAfterCrash()} fallback={(msg, reload) => <div className="crash"><div>Die Bedienung stürzt wiederholt ab:<br /><small>{msg}</small></div><button className="btn primary" onClick={reload}>Neu laden</button></div>}>
      <div className="ui">
        {screen === 'menu' && <MenuScreen />}
        {screen === 'market' && <MarketUI />}
        {screen === 'garage' && <GarageUI />}
        {screen === 'track' && <TrackUI />}
        {panel === 'help' && screen !== 'menu' && <HelpModal />}
        {panel === 'coop' && screen !== 'menu' && <CoopModal />}
        <Toast />
        <ChatFeed />
        <ChatPanel />
        <CoopElsewhere />
        <CoopRaceWatcher />
      </div>
      </Recover>
      <div className="rotate">
        <div>↻</div>
        Bitte das iPad ins Querformat drehen
      </div>
    </div>
  );
}
