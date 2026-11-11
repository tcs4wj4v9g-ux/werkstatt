import type { ReactNode } from 'react';
import { driveInput, useDriveHud } from '../game/drive';
import { DEFECTS } from '../game/data/defects';
import { activeDefects } from '../game/repair';
import { startEngine } from '../game/sfx';
import { useGame } from '../game/store';

function Hold({ on, off, className, children }: { on(): void; off(): void; className: string; children: ReactNode }) {
  return (
    <button
      className={`pedal ${className}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        startEngine(); // falls der Ton erst jetzt freigeschaltet wurde
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

export function TrackUI() {
  const hud = useDriveHud();
  const finishDrive = useGame((s) => s.finishDrive);
  const car = useGame((s) => s.cars[s.driveBay]);
  const lamps = car ? activeDefects(car).map((d) => DEFECTS[d].lamp).filter(Boolean) : [];
  return (
    <>
      <div className="topbar">
        <button className="btn ghost" onClick={() => finishDrive(false)}>✕ Abbrechen</button>
        <div className="title">Probefahrt – fahre eine Runde durch alle Pylonen-Tore</div>
        <div className="money">Tor {Math.min(hud.checkpoint, hud.total)}/{hud.total}</div>
      </div>
      <div className="speedo">
        <b>{Math.round(hud.speed)}</b> km/h
        {lamps.length > 0 && <div className="lamps">{lamps.map((l) => <span key={l}>{l}</span>)}</div>}
        {hud.offTrack && <div className="bad">Zurück auf die Strecke!</div>}
        {hud.checkpoint >= hud.total && <div className="good">Runde geschafft!</div>}
      </div>
      <div className="drive left">
        <Hold className="steer" on={() => (driveInput.steer = 1)} off={() => driveInput.steer === 1 && (driveInput.steer = 0)}>◀</Hold>
        <Hold className="steer" on={() => (driveInput.steer = -1)} off={() => driveInput.steer === -1 && (driveInput.steer = 0)}>▶</Hold>
      </div>
      <div className="drive right">
        <Hold className="brake" on={() => (driveInput.brake = 1)} off={() => (driveInput.brake = 0)}>BREMSE</Hold>
        <Hold className="gas" on={() => (driveInput.throttle = 1)} off={() => (driveInput.throttle = 0)}>GAS</Hold>
      </div>
    </>
  );
}
