import { useRef, useState, type ReactNode } from 'react';
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

/** Lenkung: feinfühlig um die Mitte (Kennlinie), voller Ausschlag an den Enden. +1 = links für die Physik. */
const steerCurve = (x: number) => -Math.sign(x) * Math.abs(x) ** 1.35;
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
    <svg className="tacho" viewBox="-56 -56 112 112" width="170" height="170" data-testid="gauge">
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

export function TrackUI() {
  const hud = useDriveHud();
  const finishDrive = useGame((s) => s.finishDrive);
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
        <button className="btn ghost" data-testid="drive-end" onClick={() => finishDrive(counts)}>{counts ? '🏁 Zurück zur Werkstatt' : '✕ Abbrechen'}</button>
        <div className="title">Probefahrt – fahr, wohin du willst</div>
        <button className={`btn ${esp ? '' : 'active'}`} data-testid="esp" onClick={() => setEsp(!esp)}>{esp ? '🛡 ESP an' : '⚠ ESP aus'}</button>
        <button className="btn" data-testid="camera" onClick={() => hud.set({ camera: next(hud.camera) })}>🎥 {CAMERA_LABEL[hud.camera]}</button>
        <button className="btn" data-testid="respawn" onClick={() => hud.set({ respawn: hud.respawn + 1 })}>↺ Auf die Straße</button>
        <div className="money" data-testid="drive-time">⏱ {clock(hud.left)}</div>
      </div>
      <div className="speedo">
        <Gauge />
        <div className="meta">{(hud.distance / 1000).toFixed(1)} km{counts ? '' : ` · gewertet ab ${clock(DRIVE_MIN)}`}</div>
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
