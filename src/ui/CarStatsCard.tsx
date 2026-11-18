import { useMemo } from 'react';
import { carStats, DRIVE_LABEL } from '../game/carStats';
import type { CarInstance } from '../game/types';

const Bar = ({ label, value, text }: { label: string; value: number; text: string }) => (
  <div className="stat-row">
    <span className="stat-label">{label}</span>
    <span className="stat-bar">
      <span style={{ width: `${Math.max(3, value)}%` }} />
    </span>
    <span className="stat-text">{text}</span>
  </div>
);

/**
 * Fahrleistungen des Autos im aktuellen Zustand – gemessen mit der Fahrphysik der Probefahrt
 * (Tuning, Fahrwerk, Reifen und Defekte zählen mit).
 */
export function CarStatsCard({ car }: { car: CarInstance }) {
  // Serienautos haben kein eigenes Motor-Feld (undefined), nur ein ausgebauter Motor steht auf null
  const st = useMemo(() => (car.motor === null ? null : carStats(car)), [car]);
  if (!st) return <p className="meta">Ohne Motor lassen sich keine Fahrleistungen messen.</p>;
  const de = (x: number, d = 1) => x.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  return (
    <div className="stats-card" data-testid="car-stats">
      <div className="stat-facts">
        <span><b>{st.ps}</b> PS</span>
        <span><b>{st.nm}</b> Nm</span>
        <span><b>{st.weight.toLocaleString('de-DE')}</b> kg</span>
        <span><b>{st.powerToWeight}</b> PS/t</span>
        <span>{DRIVE_LABEL[st.drive]}</span>
        <span>{st.gears} Gänge</span>
      </div>
      <Bar label="Beschleunigung" value={st.rating.accel} text={`0–100 in ${de(st.t100)} s`} />
      <Bar label="Höchstgeschw." value={st.rating.speed} text={`${Math.round(st.vmax)} km/h`} />
      <Bar label="Bremsen" value={st.rating.braking} text={`100–0 in ${de(st.brake100, 0)} m`} />
      <Bar label="Handling" value={st.rating.handling} text={`${de(st.lateralG, 2)} g quer`} />
      <p className="meta">Gemessen mit der Fahrphysik der Probefahrt im aktuellen Zustand – Tuning, Fahrwerk, Reifen und Defekte zählen mit.</p>
    </div>
  );
}
