import { CAR_MODELS } from './data/cars';
import { engineOf, modelEngine } from './data/components';
import { engineWeight } from './motor';
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

/** Ergebnis des Leistungsmodells für den eingebauten Motor samt Tuning. */
export interface EngineOutput {
  /** Faktor gegenüber Serienleistung, bevor Schäden abgezogen werden. */
  factor: number;
  boost: number;
  stockBoost: number;
  /** Was die Leistung gerade begrenzt. */
  limit: 'Serie' | 'Luft' | 'Kraftstoff' | 'Kühlung' | 'Steuergerät';
  risks: { id: 'knock' | 'heat' | 'mech' | 'clutch'; label: string; level: number }[];
  notes: string[];
  /** Mehr Ladedruck bzw. Drehzahl: Sound und Kurve. */
  redlineShift: number;
}

const has = (car: CarInstance, id: string, variant: string) => car.components[id]?.installed && car.components[id]?.variant === variant;
const share = (car: CarInstance, prefix: string, variant: string) => {
  const list = Object.entries(car.components).filter(([k]) => k.startsWith(prefix) && /\d$/.test(k));
  return list.length ? list.filter(([, c]) => c.variant === variant).length / list.length : 0;
};

/** Vereinfachtes, nachvollziehbares Leistungsmodell: Luft × Ladedruck, begrenzt durch Kraftstoff, Kühlung und Steuergerät. */
export function engineOutput(car: CarInstance): EngineOutput {
  const e = engineOf(car);
  const orig = modelEngine(car);
  const ecu = car.ecu ?? { map: 0, boost: 0, limiter: 0 };
  // Ein defekter Lader zählt bei den Schäden (siehe LOSSES), nicht doppelt hier.
  const turboOk = !!car.components.turbo?.installed && !!car.components.charge_pipe?.installed;
  const charged = e.turbo || !!car.motor?.turboKit;
  const stockBoost = e.turbo ? (e.fuel === 'diesel' ? 1.3 : 0.8) : 0;
  const kit = !e.turbo && !!car.motor?.turboKit;
  // Was der Lader liefern kann
  const capacity = !charged || !turboOk ? 0 : (kit ? 0.65 : stockBoost + 0.2) + (has(car, 'turbo', 'turbo_big') ? 0.6 : 0);
  // Was das Steuergerät erlaubt: Serie hält den Werksdruck (Nachrüstsatz nur 0,3 bar), Stufe 1 etwas mehr, Stufe 2 alles
  const mapLimit = ecu.map === 0 ? (kit ? 0.3 : stockBoost) : ecu.map === 1 ? (kit ? 0.6 : stockBoost + 0.35) : 9;
  const target = ecu.boost > 0 ? ecu.boost : kit ? 0.5 : stockBoost;
  const boost = Math.round(Math.min(target, capacity, mapLimit) * 100) / 100;
  const notes: string[] = [];
  if (charged && target > capacity + 0.01 && capacity > 0) notes.push(`Der Turbolader schafft nur ${capacity.toFixed(2)} bar.`);
  if (charged && target > mapLimit + 0.01) notes.push(`Das Steuergerät (${ecu.map ? `Stufe ${ecu.map}` : 'Serie'}) begrenzt auf ${mapLimit.toFixed(2)} bar.`);
  // Luftdurchsatz
  const breathe = 1 + 0.035 * +has(car, 'intake_hose', 'intake_sport') + 0.05 * +has(car, 'downpipe', 'exhaust_sport') + 0.04 * +has(car, 'exhaust_manifold', 'manifold_sport') + 0.07 * share(car, 'camshaft', 'camshaft_sport') * (car.components.camshaft_b ? 1 : 1);
  const camshaftSport = has(car, 'camshaft', 'camshaft_sport');
  const air = ((1 + boost) / (1 + stockBoost)) * breathe * (1 + 0.04 * ecu.map);
  // Kraftstoff: Einspritzdüsen (Diesel), Pumpe, Steuergerät
  const injHp = e.fuel === 'diesel' ? share(car, 'inj', 'injector_hp') : ecu.map >= 1 ? 1 : 0;
  const pump = has(car, 'fuel_pump', 'fuelpump_hp') ? 1 : 0;
  const fuel = 1.16 * (1 + 0.3 * injHp) * (1 + 0.28 * pump) * (car.swap?.parts.includes('swap_fuel') ? 1.08 : 1);
  // Kühlung: Ladeluftkühler und größerer Kühler
  const cooling = 1.25 + 0.35 * +has(car, 'charge_pipe', 'intercooler') + 0.25 * +!!car.swap?.parts.includes('swap_radiator');
  let factor = Math.min(air, fuel);
  let limit: EngineOutput['limit'] = air <= 1.001 ? 'Serie' : air > fuel ? 'Kraftstoff' : 'Luft';
  if (factor > cooling) {
    factor = cooling + (factor - cooling) * 0.4;
    limit = 'Kühlung';
  }
  if (charged && target > mapLimit + 0.01 && limit !== 'Kraftstoff' && limit !== 'Kühlung') limit = 'Steuergerät';
  const risks: EngineOutput['risks'] = [];
  const lean = air / fuel;
  if (lean > 1) risks.push({ id: 'knock', label: `Zu mager: ${Math.round((lean - 1) * 100)} % mehr Luft als Kraftstoff – Klopfgefahr (Einspritzung/Pumpe aufrüsten)`, level: Math.min(1.5, (lean - 1) * 6) });
  if (kit && ecu.map === 0 && boost > 0.2) risks.push({ id: 'knock', label: 'Turbo ohne angepasstes Kennfeld – Klopfgefahr', level: 0.5 });
  const heat = air / cooling;
  if (heat > 1) risks.push({ id: 'heat', label: `Kühlung überlastet (${Math.round(heat * 100)} %) – Ladeluftkühler oder größerer Kühler`, level: (heat - 1) * 4 });
  const nm = e.nm * Math.pow(factor, e.turbo || kit ? 1 : 0.92);
  const forged = share(car, 'piston', 'piston_forged');
  const mechLimit = e.nm * (1.45 + 0.75 * forged);
  if (nm > mechLimit * 0.9) risks.push({ id: 'mech', label: `Motorinnereien an der Grenze (${Math.round(nm)} von ${Math.round(mechLimit)} Nm) – geschmiedete Kolben/Pleuel`, level: Math.max(0, (nm / mechLimit - 0.9) * 5) });
  const clutchLimit = orig.nm * (car.swap?.parts.includes('clutch_hd') ? 2.3 : 1.35);
  if (nm > clutchLimit) risks.push({ id: 'clutch', label: `Kupplung rutscht (${Math.round(nm)} Nm, hält ${Math.round(clutchLimit)} Nm) – verstärkte Kupplung`, level: Math.min(1.5, (nm / clutchLimit - 1) * 4) });
  return { factor, boost, stockBoost, limit, risks, notes, redlineShift: (camshaftSport ? 400 : 0) + (ecu.limiter ?? 0) };
}

/** Gewicht des Autos mit dem tatsächlich eingebauten Motor. */
export function carWeight(car: CarInstance) {
  const model = CAR_MODELS[car.modelId];
  if (car.motor === null) return model.weight - engineWeight(modelEngine(car));
  return model.weight + engineWeight(engineOf(car)) - engineWeight(modelEngine(car)) + (car.visual?.hood === 2 ? -9 : 0);
}

export function performance(car: CarInstance): Performance & { output: EngineOutput; weight: number; grip: number } {
  const model = CAR_MODELS[car.modelId];
  const e = engineOf(car);
  const out = engineOutput(car);
  const defects = activeDefects(car) as string[];
  const losses = defects.filter((d) => LOSSES[d]).map((d) => ({ label: LOSSES[d][0], pct: LOSSES[d][1] }));
  // Verschlissene, aber noch nicht defekte Zünd- und Einspritzteile kosten ein paar Prozent.
  const health = Object.values(car.components).filter((c) => c.health !== undefined && c.condition === 'ok' && c.installed);
  const wear = health.length ? health.reduce((s, c) => s + (100 - c.health!), 0) / health.length / 100 : 0;
  if (wear > 0.3) losses.push({ label: 'Zünd-/Einspritzteile gealtert', pct: Math.round(wear * 12) / 100 });
  const clutch = out.risks.find((r) => r.id === 'clutch');
  if (clutch) losses.push({ label: 'Kupplung rutscht unter Volllast', pct: Math.min(0.35, 0.1 + clutch.level * 0.15) });
  const factor = losses.reduce((f, l) => f * (1 - l.pct), 1);
  const ps = car.motor === null ? 0 : Math.round(e.ps * out.factor * factor);
  const nm = car.motor === null ? 0 : Math.round(e.nm * Math.pow(out.factor, e.turbo || car.motor?.turboKit ? 1 : 0.92) * (0.35 + 0.65 * factor));
  const weight = carWeight(car);
  const powerToWeight = ps / (weight / 1000);
  // Fahrwerk und Reifen: Lenkwilligkeit und Traktion
  const susp = car.visual?.suspension ?? 'stock';
  const suspK = susp === 'springs' ? 1.05 : susp === 'sport' ? 1.12 : susp === 'coilover' ? 1.18 : 1;
  const grip = (1 + 0.05 * (car.visual?.rimSize ?? 0)) * (susp === 'stock' ? 1 : 1.04) * (car.visual?.flares ? 1.04 : 1);
  // Traktion: viel Drehmoment auf leichtem Auto dreht die Räder durch – begrenzt die Beschleunigung.
  const tractionCap = 15 * grip;
  const rawAccel = 7.5 * (powerToWeight / 105) ** 0.62;
  const accel = rawAccel > tractionCap ? tractionCap + (rawAccel - tractionCap) * 0.3 : rawAccel;
  return {
    ps, nm, ratedPs: e.ps, ratedNm: e.nm, powerToWeight, losses,
    accel,
    vmax: 38 * (ps / 150) ** 0.34 * (car.visual?.spoiler === 3 ? 0.985 : 1),
    brake: 15 * (model.cls === 'budget' ? 1 : model.cls === 'mid' ? 1.08 : 1.25) * (susp === 'stock' ? 1 : 1.05),
    agility: BODY_AGILITY[model.body] * (1420 / weight) ** 0.25 * suspK,
    output: out,
    weight,
    grip,
  };
}

/** Leistungs- und Drehmomentkurve über der Drehzahl (für den Prüfstand). */
export function powerCurve(car: CarInstance, steps = 24): { rpm: number; ps: number; nm: number }[] {
  const e = engineOf(car);
  const p = performance(car);
  const diesel = e.fuel === 'diesel';
  const redline = (diesel ? 4800 : e.id === 'v8_40' || e.id === 'v8_45s' ? 8400 : e.turbo ? 6800 : 7000) + p.output.redlineShift;
  const turbo = e.turbo || !!car.motor?.turboKit;
  // Drehmomentverlauf: Turbomotoren haben ein breites Plateau ab niedriger Drehzahl, Sauger eine Kuppe weiter oben.
  const peak = diesel ? 2000 : turbo ? 2600 + (p.output.boost - p.output.stockBoost) * 900 : redline * 0.62;
  const shape = (rpm: number) => {
    if (turbo) {
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
