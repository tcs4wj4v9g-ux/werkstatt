import { useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { CAMERA_LABEL, driveInput, useDriveHud, type DriveCamera } from '../game/drive';
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

/**
 * Pedal mit Dosierung: oben angetippt voll, weiter unten weniger (35 %). Mit dem Finger verschieben ändert den Druck.
 * So lässt sich auf dem iPad feinfühlig Gas geben und bremsen.
 */
function Pedal({ set, className, children }: { set(v: number): void; className: string; children: ReactNode }) {
  const amount = (e: RPointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const rel = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    return Math.round((1 - rel * 0.65) * 100) / 100;
  };
  return (
    <button
      className={`pedal ${className}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        restart();
        set(amount(e));
      }}
      onPointerMove={(e) => e.buttons && set(amount(e))}
      onPointerUp={() => set(0)}
      onPointerCancel={() => set(0)}
      onLostPointerCapture={() => set(0)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

/** Lenkfläche: Finger aufsetzen und nach links/rechts ziehen – stufenlos, beim Loslassen zurück in die Mitte. */
function SteerPad() {
  const origin = useRef<number | null>(null);
  const [angle, setAngle] = useState(0);
  const apply = (v: number) => {
    driveInput.steer = v;
    setAngle(-v * 120);
  };
  return (
    <div
      className="steerpad"
      data-testid="steerpad"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        restart();
        origin.current = e.clientX;
      }}
      onPointerMove={(e) => {
        if (origin.current === null) return;
        // 120 px Weg = voller Einschlag; kleine Bewegungen fein (quadratisch), große schnell
        const d = Math.max(-1, Math.min(1, (e.clientX - origin.current) / 120));
        apply(-Math.sign(d) * (0.35 * Math.abs(d) + 0.65 * d * d));
      }}
      onPointerUp={() => ((origin.current = null), apply(0))}
      onPointerCancel={() => ((origin.current = null), apply(0))}
      onLostPointerCapture={() => ((origin.current = null), apply(0))}
    >
      <svg viewBox="-50 -50 100 100" width="96" height="96" style={{ transform: `rotate(${angle}deg)` }} aria-hidden>
        <circle r="40" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="8" />
        <path d="M-38 4 L-10 8 L0 20 L10 8 L38 4" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="8" strokeLinejoin="round" />
        <circle r="7" fill="rgba(255,255,255,0.85)" />
      </svg>
      <span>Lenken: ziehen ◀ ▶</span>
    </div>
  );
}

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
  const next = (c: DriveCamera): DriveCamera => (c === 'chase' ? 'hood' : c === 'hood' ? 'cockpit' : 'chase');
  return (
    <>
      <div className="topbar">
        <button className="btn ghost" onClick={() => finishDrive(false)}>✕ Abbrechen</button>
        <div className="title">Probefahrt – eine Runde durch alle Pylonen-Tore</div>
        <button className="btn" data-testid="camera" onClick={() => hud.set({ camera: next(hud.camera) })}>🎥 {CAMERA_LABEL[hud.camera]}</button>
        <div className="money">Tor {Math.min(hud.checkpoint, hud.total)}/{hud.total}</div>
      </div>
      <div className="speedo">
        <Gauge />
        <div className="meta">{(hud.distance / 1000).toFixed(1)} km</div>
        {lamps.length > 0 && <div className="lamps">{lamps.map((l) => <span key={l}>{l}</span>)}</div>}
        {hud.offTrack && <div className="bad">Zurück auf die Straße!</div>}
        {hud.checkpoint >= hud.total && <div className="good">Runde geschafft!</div>}
      </div>
      <div className="drive left">
        <SteerPad />
      </div>
      <div className="drive right">
        <Pedal className="brake" set={(v) => (driveInput.brake = v)}>BREMSE</Pedal>
        <Pedal className="gas" set={(v) => (driveInput.throttle = v)}>GAS</Pedal>
      </div>
    </>
  );
}
