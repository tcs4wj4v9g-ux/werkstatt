import { CAR_MODELS } from './data/cars';
import { engineOf } from './data/components';
import { activeDefects } from './repair';
import type { CarInstance } from './types';

// Fahrleistungen aus den echten Fahrzeugdaten: Motorleistung, Drehmoment,
// Gewicht und aktueller technischer Zustand. Dieselbe Rechnung speist
// Probefahrt, Leistungsprüfstand und Veranstaltungen.

export interface Performance {
  /** Tatsächlich anliegende Leistung und Drehmoment im aktuellen Zustand. */
  ps: number;
  nm: number;
  /** Werksangabe. */
  ratedPs: number;
  ratedNm: number;
  /** PS je Tonne. */
  powerToWeight: number;
  /** Was Leistung kostet, in Klartext. */
  losses: { label: string; pct: number }[];
  /** Spielwerte für die Probefahrt. */
  accel: number;
  vmax: number;
  brake: number;
  /** Lenkwilligkeit: 1 = Limousine, höher = agiler. */
  agility: number;
}

const LOSSES: Record<string, [string, number]> = {
  coil: ['Zündaussetzer (Zündspule)', 0.3],
  plugs: ['Zündaussetzer (Zündkerzen)', 0.18],
  injector: ['Einspritzdüse defekt', 0.25],
  vacuum: ['Falschluft', 0.1],
  turbo: ['Kein Ladedruck (Turbolader)', 0.4],
  boost_leak: ['Ladedruckverlust (Leck)', 0.3],
  egr: ['AGR-Ventil klemmt', 0.12],
  dpf: ['Partikelfilter zu – Notlauf', 0.45],
  lifters: ['Ventiltrieb verschlissen', 0.06],
  chain: ['Steuerzeiten ungenau (Kette)', 0.08],
  bearing: ['Lagerschaden', 0.15],
  head_gasket: ['Kompressionsverlust (Kopfdichtung)', 0.28],
};
const BODY_AGILITY = { sedan: 1, wagon: 0.94, hatch: 1.08, coupe: 1.12, sport: 1.3, luxury: 0.88, classic: 0.96 };

export function performance(car: CarInstance): Performance {
  const model = CAR_MODELS[car.modelId];
  const e = engineOf(car);
  const defects = activeDefects(car) as string[];
  const losses = defects.filter((d) => LOSSES[d]).map((d) => ({ label: LOSSES[d][0], pct: LOSSES[d][1] }));
  // Verschlissene, aber noch nicht defekte Zünd- und Einspritzteile kosten ein paar Prozent.
  const health = Object.values(car.components).filter((c) => c.health !== undefined && c.condition === 'ok' && c.installed);
  const wear = health.length ? health.reduce((s, c) => s + (100 - c.health!), 0) / health.length / 100 : 0;
  if (wear > 0.3) losses.push({ label: 'Zünd-/Einspritzteile gealtert', pct: Math.round(wear * 12) / 100 });
  const factor = losses.reduce((f, l) => f * (1 - l.pct), 1);
  const ps = Math.round(e.ps * factor);
  const nm = Math.round(e.nm * (0.35 + 0.65 * factor));
  const powerToWeight = ps / (model.weight / 1000);
  return {
    ps, nm, ratedPs: e.ps, ratedNm: e.nm, powerToWeight, losses,
    accel: 7.5 * (powerToWeight / 105) ** 0.62,
    vmax: 38 * (ps / 150) ** 0.34,
    brake: 15 * (model.cls === 'budget' ? 1 : model.cls === 'mid' ? 1.08 : 1.25),
    agility: BODY_AGILITY[model.body] * (1420 / model.weight) ** 0.25,
  };
}

/** Leistungs- und Drehmomentkurve über der Drehzahl (für den Prüfstand). */
export function powerCurve(car: CarInstance, steps = 24): { rpm: number; ps: number; nm: number }[] {
  const e = engineOf(car);
  const p = performance(car);
  const diesel = e.fuel === 'diesel';
  const redline = diesel ? 4800 : e.id === 'v8_40' || e.id === 'v8_45s' ? 8400 : e.turbo ? 6800 : 7000;
  // Drehmomentverlauf: Turbomotoren haben ein breites Plateau ab niedriger Drehzahl, Sauger eine Kuppe weiter oben.
  const peak = diesel ? 2000 : e.turbo ? 2600 : redline * 0.62;
  const shape = (rpm: number) => {
    if (e.turbo) {
      const spool = Math.min(1, Math.max(0.35, (rpm - 900) / (peak - 900)));
      const fall = rpm > redline * 0.72 ? 1 - ((rpm - redline * 0.72) / (redline * 0.28)) * 0.38 : 1;
      return spool * fall;
    }
    return Math.max(0.5, 1 - ((rpm - peak) / (redline * 0.9)) ** 2 * 1.35);
  };
  const raw = Array.from({ length: steps + 1 }, (_, i) => {
    const rpm = 1000 + ((redline - 1000) * i) / steps;
    const nm = shape(rpm);
    return { rpm, nm, ps: (nm * rpm) / 7023 };
  });
  // Auf die tatsächlichen Spitzenwerte normieren.
  const maxNm = Math.max(...raw.map((r) => r.nm));
  const maxPs = Math.max(...raw.map((r) => r.ps));
  return raw.map((r) => ({ rpm: Math.round(r.rpm / 50) * 50, nm: Math.round((r.nm / maxNm) * p.nm), ps: Math.round((r.ps / maxPs) * p.ps) }));
}
