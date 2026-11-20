import { useEffect, useRef, useState, type ReactNode } from 'react';
import { leaveCoopRace } from '../net/coopRace';
import { courseOf, raceClock, raceForDay, raceTargets } from '../game/races';
import { FARMS, LAKE, PAD, WORKSHOP, type DriveWorld } from '../three/driveWorld';
import { worldFor } from '../three/circuits';
import { CAMERA_LABEL, DRIVE_MIN, driveInput, useDriveHud, type DriveCamera } from '../game/drive';
import { DEFECTS } from '../game/data/defects';
import { activeDefects } from '../game/repair';
import { engineAudio } from '../game/audio';
import { soundProfile } from '../game/diagnosis';
import { useGame } from '../game/store';

/** Startet den Motorklang neu, falls er beim Betreten der Strecke noch nicht freigeschaltet war. */
function restart() {
  const s = useGame.getState();
  const car = s.cars[s.driveBay];
  if (car && !engineAudio.running()) {
    engineAudio.start(soundProfile(car));
    engineAudio.setWarm(true);
  }
}

/** Knopf, der gedrückt gehalten wird (Finger darf beim Drücken verrutschen). */
function Hold({ on, off, className, children, testid }: { on(): void; off(): void; className: string; children: ReactNode; testid?: string }) {
  return (
    <button
      className={`pedal ${className}`}
      data-testid={testid}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        restart();
        on();
      }}
      onPointerUp={off}
      onPointerCancel={off}
      onLostPointerCapture={off}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

/**
 * Schieberegler, der beim Loslassen in die Ruhelage zurückfedert (Lenkung: Mitte, Gas: unten).
 * Der Finger darf beim Ziehen über den Regler hinaus wandern; mehrere Finger gleichzeitig (Lenken + Gas) gehen.
 */
function Spring({ axis, testid, className, onChange, label }: { axis: 'x' | 'y'; testid: string; className: string; onChange(v: number): void; label?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [v, setV] = useState(0);
  const [held, setHeld] = useState(false);
  const read = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    // Lenkung: −1 (links) … +1 (rechts) über die Breite; Gas: 0 (unten) … 1 (oben) über die Höhe
    const val = axis === 'x' ? ((e.clientX - r.left) / r.width) * 2 - 1 : 1 - (e.clientY - r.top) / r.height;
    const c = axis === 'x' ? Math.max(-1, Math.min(1, val * 1.12)) : Math.max(0, Math.min(1, val * 1.08 - 0.04));
    setV(c);
    onChange(c);
  };
  const release = () => {
    setHeld(false);
    setV(0);
    onChange(0);
  };
  const pos = axis === 'x' ? { left: `${50 + v * 40}%` } : { bottom: `${8 + v * 70}%` };
  return (
    <div
      ref={ref}
      className={`spring ${className}${held ? ' held' : ''}`}
      data-testid={testid}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        restart();
        setHeld(true);
        read(e);
      }}
      onPointerMove={(e) => held && read(e)}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="rail" />
      {axis === 'y' && <div className="fill" style={{ height: `${8 + v * 70}%` }} />}
      <div className="knob" style={pos}>{label}</div>
    </div>
  );
}

/** Gezeichnete Karte der ganzen Gegend (einmal, 0,75 px je Meter), Norden = −z oben. */
const MAP_K = 0.75;
const mapImages = new Map<string, HTMLCanvasElement>();
function worldMap(w: DriveWorld) {
  const cached = mapImages.get(w.id);
  if (cached) return cached;
  const E = w.extent;
  const size = Math.round(2 * E * MAP_K);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const X = (x: number) => (x + E) * MAP_K;
  g.fillStyle = '#6f9152';
  g.fillRect(0, 0, size, size);
  // Wald und Felder
  for (let x = -E; x < E; x += 8)
    for (let z = -E; z < E; z += 8) {
      const s = w.surface(x, z).kind;
      if (s === 'forest') g.fillStyle = '#3f6334';
      else if (s === 'field') g.fillStyle = '#b9a557';
      else continue;
      g.fillRect(X(x), X(z), 8 * MAP_K + 0.5, 8 * MAP_K + 0.5);
    }
  if (w.water) {
    g.fillStyle = '#4f86b0';
    g.fillRect(X(w.water.x - w.water.w / 2), X(w.water.z - w.water.d / 2), w.water.w * MAP_K, w.water.d * MAP_K);
  }
  // See und Testgelände (nur in der Landschaft)
  if (w.id === 'land') {
  g.fillStyle = '#4f86b0';
  g.beginPath();
  g.ellipse(X(LAKE.x), X(LAKE.z), LAKE.rx * MAP_K, LAKE.rz * MAP_K, 0, 0, Math.PI * 2);
  g.fill();
  // Testgelände
  g.fillStyle = '#5d6066';
  g.fillRect(X(PAD.minX), X(PAD.minZ), (PAD.maxX - PAD.minX) * MAP_K, (PAD.maxZ - PAD.minZ) * MAP_K);
  }
  // Feldwege
  g.strokeStyle = '#d8c79e';
  g.lineWidth = 4 * MAP_K * 1.6;
  g.lineCap = g.lineJoin = 'round';
  for (const t of w.tracks) {
    g.beginPath();
    t.forEach((p, i) => (i ? g.lineTo(X(p.x), X(p.z)) : g.moveTo(X(p.x), X(p.z))));
    g.stroke();
  }
  // Straßen: Rand und Belag
  for (const [col, extra] of [['#f4f1e6', 4], ['#55585e', 0.5]] as const) {
    g.strokeStyle = col;
    g.lineWidth = (w.roadWidth + extra) * MAP_K * 1.4;
    g.beginPath();
    w.samples.forEach((p, i) => (i ? g.lineTo(X(p.x), X(p.z)) : g.moveTo(X(p.x), X(p.z))));
    g.closePath();
    g.stroke();
  }
  // Häuser
  g.fillStyle = '#b4553f';
  for (const h of w.houses) {
    g.save();
    g.translate(X(h.x), X(h.z));
    g.rotate(-h.rot);
    g.fillRect((-h.w / 2) * MAP_K, (-h.d / 2) * MAP_K, h.w * MAP_K, h.d * MAP_K);
    g.restore();
  }
  if (w.id === 'land') {
    g.fillStyle = '#ff7a1a';
    g.fillRect(X(WORKSHOP.x - WORKSHOP.w / 2), X(WORKSHOP.z - WORKSHOP.d / 2), WORKSHOP.w * MAP_K, WORKSHOP.d * MAP_K);
  }
  mapImages.set(w.id, c);
  return c;
}
const LAND_LABELS: [string, number, number][] = [
  ['Grünbach', 0, 0],
  ['Werkstatt', WORKSHOP.x, WORKSHOP.z - 14],
  ['Testgelände', (PAD.minX + PAD.maxX) / 2, (PAD.minZ + PAD.maxZ) / 2],
  ['Waldsee', LAKE.x, LAKE.z],
  ...FARMS.map((f) => [f.name, f.x, f.z - 14] as [string, number, number]),
];

/** Minikarte oben links: Fahrtrichtung zeigt nach oben, Umkreis gut 250 m. */
function MiniMap({ world }: { world: DriveWorld }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const labels: [string, number, number][] = world.id === 'land' ? LAND_LABELS : [['Start · Ziel', world.start.x, world.start.z]];
  const { px, pz, ph } = useDriveHud();
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const S = 170;
    if (c.width !== S * dpr) c.width = c.height = S * dpr;
    const g = c.getContext('2d')!;
    const img = worldMap(world);
    const E = world.extent;
    const zoom = 0.36; // Bildschirmpunkte je Meter
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#6f9152';
    g.fillRect(0, 0, S, S);
    g.translate(S / 2, S / 2);
    g.rotate(ph - Math.PI / 2);
    g.scale(zoom / MAP_K, zoom / MAP_K);
    g.drawImage(img, -(px + E) * MAP_K, -(pz + E) * MAP_K);
    g.restore();
    // Beschriftungen (aufrecht)
    g.font = '600 10px system-ui, sans-serif';
    g.textAlign = 'center';
    const rot = ph - Math.PI / 2;
    for (const [t, x, z] of labels) {
      const dx = (x - px) * zoom;
      const dz = (z - pz) * zoom;
      const sx = S / 2 + dx * Math.cos(rot) - dz * Math.sin(rot);
      const sy = S / 2 + dx * Math.sin(rot) + dz * Math.cos(rot);
      if (Math.hypot(sx - S / 2, sy - S / 2) > S / 2 - 14) continue;
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillText(t, sx + 1, sy + 1);
      g.fillStyle = '#ffffff';
      g.fillText(t, sx, sy);
    }
    // eigenes Auto: Pfeil nach oben
    g.fillStyle = '#ff7a1a';
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(S / 2, S / 2 - 9);
    g.lineTo(S / 2 + 6, S / 2 + 7);
    g.lineTo(S / 2, S / 2 + 3);
    g.lineTo(S / 2 - 6, S / 2 + 7);
    g.closePath();
    g.fill();
    g.stroke();
  }, [px, pz, ph, world]);
  return <canvas ref={ref} className="minimap" data-testid="minimap" style={{ width: 170, height: 170 }} />;
}

/** Lenkung: feinfühlig um die Mitte (Kennlinie), voller Ausschlag an den Enden. +1 = links für die Physik. */
const steerCurve = (x: number) => -Math.sign(x) * Math.abs(x) ** 1.15;
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/** Drehzahlmesser mit rotem Bereich, darin Tempo und Gang. */
function Gauge() {
  const { speed, rpm, redline, gear, wheelspin } = useDriveHud();
  const max = Math.ceil((redline + 500) / 1000) * 1000;
  const a0 = -225;
  const a1 = 45;
  const ang = (r: number) => ((a0 + (a1 - a0) * Math.min(1, r / max)) * Math.PI) / 180;
  const pt = (r: number, rad: number) => [Math.cos(ang(r)) * rad, Math.sin(ang(r)) * rad];
  const arc = (r0: number, r1: number, rad: number) => {
    const [x0, y0] = pt(r0, rad);
    const [x1, y1] = pt(r1, rad);
    return `M${x0} ${y0} A${rad} ${rad} 0 ${ang(r1) - ang(r0) > Math.PI ? 1 : 0} 1 ${x1} ${y1}`;
  };
  const [nx, ny] = pt(rpm, 40);
  const ticks = Array.from({ length: max / 1000 + 1 }, (_, i) => i * 1000);
  return (
    <svg className="tacho" viewBox="-56 -56 112 112" width="150" height="150" data-testid="gauge">
      <circle r="54" fill="rgba(18,20,24,0.82)" />
      <path d={arc(0, max, 46)} stroke="rgba(255,255,255,0.25)" strokeWidth="4" fill="none" />
      <path d={arc(redline, max, 46)} stroke="#e0402f" strokeWidth="5" fill="none" />
      {ticks.map((t) => {
        const [x0, y0] = pt(t, 41);
        const [x1, y1] = pt(t, 48);
        const [tx, ty] = pt(t, 33);
        return (
          <g key={t}>
            <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="#fff" strokeWidth="1.6" />
            <text x={tx} y={ty + 3} fontSize="8" fill="#cfd3d8" textAnchor="middle">{t / 1000}</text>
          </g>
        );
      })}
      <line x1="0" y1="0" x2={nx} y2={ny} stroke={rpm > redline - 150 ? '#ff5a3c' : '#ffb347'} strokeWidth="3" strokeLinecap="round" />
      <circle r="4" fill="#ffb347" />
      <text y="22" fontSize="20" fontWeight="800" fill="#fff" textAnchor="middle" data-testid="speed">{Math.round(speed)}</text>
      <text y="32" fontSize="7" fill="#cfd3d8" textAnchor="middle">km/h</text>
      <text x="0" y="-8" fontSize="15" fontWeight="800" fill={wheelspin ? '#ff5a3c' : '#9fe3a7'} textAnchor="middle" data-testid="gear">{gear === -1 ? 'R' : gear === 0 ? 'N' : gear}</text>
      <text x="0" y="47" fontSize="6" fill="#cfd3d8" textAnchor="middle">×1000/min</text>
    </svg>
  );
}

/** Anzeige im Zeitrennen: Countdown, Uhr, Kontrollpunkte, Sollzeiten. */
function RaceHud() {
  const hud = useDriveHud();
  const day = useGame((s) => s.day);
  const coop = useGame((s) => s.race?.coop);
  if (coop) {
    // Koop-Rennen: Countdown, Platz unter den Mitspielern, Uhr, Kontrollpunkte
    return (
      <>
        {hud.raceT < 0.8 && <div className="countdown" data-testid="countdown">{hud.raceT < 0 ? Math.ceil(-hud.raceT) : 'LOS!'}</div>}
        <div className="race-hud" data-testid="race-hud">
          {hud.field > 1 && (
            <div className="race-place" data-testid="race-place">
              P{hud.place}<span>/{hud.field}</span>
            </div>
          )}
          <div className="race-time">{raceClock(Math.max(0, hud.raceT))}</div>
          <div className="meta">
            {hud.laps > 1 && <b>Runde {Math.min(hud.laps, Math.floor(hud.cp / (hud.cpTotal / hud.laps)) + 1)}/{hud.laps} · </b>}
            Kontrollpunkt {Math.min(hud.cp, hud.cpTotal)}/{hud.cpTotal}
          </div>
          <div className="race-targets">Koop-Rennen</div>
        </div>
      </>
    );
  }
  const race = raceForDay(day);
  if (!race) return null;
  const t = raceTargets(race);
  const run = Math.max(0, hud.raceT);
  const medal = run <= t.gold ? 'gold' : run <= t.silver ? 'silver' : run <= t.bronze ? 'bronze' : null;
  return (
    <>
      {hud.raceT < 0.8 && (
        <div className="countdown" data-testid="countdown">{hud.raceT < 0 ? Math.ceil(-hud.raceT) : 'LOS!'}</div>
      )}
      <div className="race-hud" data-testid="race-hud">
        {race.kind === 'grid' && hud.field > 0 && (
          <div className="race-place" data-testid="race-place">
            P{hud.place}<span>/{hud.field}</span>
          </div>
        )}
        <div className="race-time">{raceClock(run)}</div>
        <div className="meta">
          {hud.laps > 1 && <b data-testid="lap">Runde {Math.min(hud.laps, Math.floor(hud.cp / (hud.cpTotal / hud.laps)) + 1)}/{hud.laps} · </b>}
          Kontrollpunkt {Math.min(hud.cp, hud.cpTotal)}/{hud.cpTotal}
        </div>
        {race.kind === 'time' ? (
          <div className={`race-targets ${medal ?? 'none'}`}>
            🥇 {raceClock(t.gold)} · 🥈 {raceClock(t.silver)} · 🥉 {raceClock(t.bronze)}
          </div>
        ) : (
          <div className="race-targets">Sieg: {race.prize.gold.toLocaleString('de-DE')} €</div>
        )}
      </div>
    </>
  );
}

export function TrackUI() {
  const hud = useDriveHud();
  const finishDrive = useGame((s) => s.finishDrive);
  const finishRace = useGame((s) => s.finishRace);
  const racing = useGame((s) => !!s.race);
  const raceTitle = useGame((s) => (s.race?.coop ? `Koop-Rennen ${courseOf(s.race.coop.course).name}` : s.race ? raceForDay(s.day)?.title : null));
  const worldId = useGame((s) => (s.race?.coop ? courseOf(s.race.coop.course).world : s.race ? courseOf(raceForDay(s.day)?.course ?? 'ost').world : 'land'));
  const world = worldFor(worldId);
  const car = useGame((s) => s.cars[s.driveBay]);
  const lamps = car ? activeDefects(car).map((d) => DEFECTS[d].lamp).filter(Boolean) : [];
  const [esp, setEspState] = useState(driveInput.assist);
  // ESP aus: Stabilitäts- und Antriebsschlupfregelung abgeschaltet – das Heck darf kommen (ABS bleibt, Drift-Hilfe fängt Dreher ab)
  const setEsp = (on: boolean) => {
    driveInput.assist = on;
    setEspState(on);
  };
  const next = (c: DriveCamera): DriveCamera => (c === 'chase' ? 'hood' : c === 'hood' ? 'cockpit' : 'chase');
  const counts = hud.elapsed >= DRIVE_MIN;
  return (
    <>
      <div className="topbar">
        <button className="btn ghost" data-testid="drive-end" onClick={() => {
            if (!racing) return finishDrive(counts);
            const wasCoop = !!useGame.getState().race?.coop;
            finishRace(null);
            if (wasCoop) leaveCoopRace();
          }}>✕ Abbrechen</button>
        <div className="title">{racing ? raceTitle : counts ? 'Zum Beenden auf dem Werkstatt-Vorplatz anhalten' : 'Probefahrt – fahr, wohin du willst'}</div>
        <button className={`btn ${esp ? '' : 'active'}`} data-testid="esp" onClick={() => setEsp(!esp)}>{esp ? '🛡 ESP an' : '⚠ ESP aus'}</button>
        <button className="btn" data-testid="camera" onClick={() => hud.set({ camera: next(hud.camera) })}>🎥 {CAMERA_LABEL[hud.camera]}</button>
        <button className="btn" data-testid="respawn" onClick={() => hud.set({ respawn: hud.respawn + 1 })}>{racing ? '↺ Letzter Kontrollpunkt' : '↺ Auf die Straße'}</button>
        {!racing && <div className="money" data-testid="drive-time">⏱ {clock(hud.elapsed)}</div>}
      </div>
      <MiniMap world={world} />
      {racing && <RaceHud />}
      <div className="speedo">
        <Gauge />
        <div className="meta">{(hud.distance / 1000).toFixed(1)} km{racing ? '' : counts ? ` · 🏠 Werkstatt ${hud.home < 1000 ? `${Math.round(hud.home / 10) * 10} m` : `${(hud.home / 1000).toFixed(1)} km`}` : ` · gewertet ab ${clock(DRIVE_MIN)}`}</div>
        {hud.tooShort && <div className="bad" data-testid="too-short">Noch keine {DRIVE_MIN} s gefahren – dreh noch eine Runde</div>}
        {lamps.length > 0 && <div className="lamps">{lamps.map((l) => <span key={l}>{l}</span>)}</div>}
        {hud.drift > 0 && <div className="good" data-testid="drift">Drift {Math.round(hud.drift)}°</div>}
      </div>
      <div className="drive left">
        <Spring axis="x" testid="steer" className="steer" onChange={(v) => (driveInput.steer = steerCurve(v))} label={<span>◀ ▶</span>} />
      </div>
      <div className="drive right">
        <div className="pedals">
          <Hold className="hand" testid="handbrake" on={() => (driveInput.handbrake = true)} off={() => (driveInput.handbrake = false)}>HAND­BREMSE</Hold>
          <Hold className="brake" testid="brake" on={() => (driveInput.brake = 1)} off={() => (driveInput.brake = 0)}>BREMSE</Hold>
        </div>
        <Spring axis="y" testid="gas" className="gas" onChange={(v) => (driveInput.throttle = v)} label="GAS" />
      </div>
    </>
  );
}
