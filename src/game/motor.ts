import { CAR_MODELS, CLASS_FACTOR } from './data/cars';
import { COMPONENT_MAP, defOf, defsOf, engineComponents, engineOf, modelEngine, motorOf } from './data/components';
import { DEFECTS, DEFECT_LIST, defectComponents } from './data/defects';
import { ENGINES, isV, type EngineDef } from './data/engines';
import { PARTS } from './data/parts';
import { isComplete } from './repair';
import { createZones } from './detail';
import type { BoltState, CarInstance, ComponentState, MotorMeta, PartId } from './types';

// Motoren als eigenständige Objekte: Ausbau, Lagerung, Motorständer, Einbau in ein anderes Fahrzeug.
// Reine Funktionen – der Spielzustand (store.ts) ruft sie auf.

/** Ein ausgebauter Motor: Identität, Bauteilzustände und Öl. */
export interface EngineUnit {
  motor: MotorMeta;
  components: Record<string, ComponentState>;
  /** Öl im Motor (Liter). */
  oil: number;
}

/** Gebrauchtteil mit eigener Kennung (aus einem Schrottauto oder beim Umbau ausgebaut). */
export interface UsedPart {
  id: string;
  part: PartId;
  fit: string;
  condition: 'ok' | 'defect';
  /** Zustand bekannt (geprüft)? */
  known: boolean;
  health?: number;
  km: number;
  /** Herkunft, z. B. „Bavaria 330 Limousine (Schrottplatz)“. */
  from: string;
  /** Was dafür bezahlt wurde. */
  price: number;
}

/** Gewicht des Motors mit Anbauteilen (kg) – geht ins Fahrzeuggewicht ein. */
export function engineWeight(e: EngineDef) {
  const base = e.layout === 'R4' ? 140 : e.layout === 'R6' ? 195 : e.layout === 'V6' ? 175 : 225;
  return base + (e.fuel === 'diesel' ? 25 : 0) + (e.turbo ? 12 : 0);
}

/** Baulänge-Klasse: 1 = kurz (R4, V6), 2 = lang (R6), 3 = breit und schwer (V8). */
const SIZE: Record<EngineDef['layout'], number> = { R4: 1, V6: 1.5, R6: 2, V8: 3 };
/** Wie viel Motor passt in den Motorraum dieser Karosserie? */
const BAY: Record<string, number> = { hatch: 1.5, classic: 2.5, wagon: 2.6, sedan: 3, coupe: 3, luxury: 3, sport: 3 };

export interface SwapPlan {
  possible: boolean;
  /** 0 = Original bzw. gleicher Motor, 1 = gleiche Baureihe, 2 = größerer Umbau, 3 = Großprojekt. */
  level: number;
  label: string;
  /** Benötigte Umbauteile (Lagerschlüssel). */
  needs: { part: PartId; key: string }[];
  reasons: string[];
}

const keyFor = (part: PartId, e: EngineDef) => `${part}@${['swap_mounts', 'swap_adapter', 'swap_exhaust'].includes(part) ? e.family : 'alle'}`;

/** Welche Umbauteile ein bestimmter Motor in diesem Fahrzeug braucht. */
export function swapPlan(car: Pick<CarInstance, 'modelId'>, engineId: string): SwapPlan {
  const model = CAR_MODELS[car.modelId];
  const orig = modelEngine(car);
  const e = ENGINES[engineId];
  const reasons: string[] = [];
  const parts = new Set<PartId>();
  if (!e) return { possible: false, level: 9, label: 'Unbekannter Motor', needs: [], reasons: ['Motor unbekannt.'] };
  if (SIZE[e.layout] > BAY[model.body]) {
    return { possible: false, level: 9, label: 'Passt nicht', needs: [], reasons: [`Ein ${e.layout} passt nicht in den Motorraum dieser Karosserie.`] };
  }
  if (e.id === orig.id) return { possible: true, level: 0, label: 'Originalmotor', needs: [], reasons: ['Gleicher Motortyp wie ab Werk – direkt einbaubar.'] };
  if (e.family === orig.family) {
    parts.add('swap_ecu');
    reasons.push('Gleiche Baureihe: Halter und Getriebe passen, nur das Steuergerät muss passen.');
  } else {
    parts.add('swap_mounts');
    parts.add('swap_harness');
    parts.add('swap_ecu');
    reasons.push(`Anderer Motor (${e.layout} statt ${orig.layout}): neue Motorhalter, Kabelbaum und Steuergerät.`);
    if (e.layout !== orig.layout || e.fuel !== orig.fuel) {
      parts.add('swap_adapter');
      parts.add('swap_exhaust');
      reasons.push('Andere Bauform: Getriebeadapter und angepasste Abgasanlage.');
    }
  }
  if (e.fuel !== orig.fuel) {
    parts.add('swap_fuel');
    reasons.push(`${e.fuel === 'diesel' ? 'Diesel' : 'Benziner'} statt ${orig.fuel === 'diesel' ? 'Diesel' : 'Benziner'}: andere Kraftstoffanlage.`);
  }
  if (e.ps > orig.ps * 1.25 || (e.turbo && !orig.turbo)) {
    parts.add('swap_radiator');
    reasons.push('Deutlich mehr Leistung bzw. Turbo: größerer Kühler.');
  }
  if (e.nm > orig.nm * 1.4) {
    parts.add('clutch_hd');
    reasons.push(`${e.nm} Nm statt ${orig.nm} Nm: verstärkte Kupplung.`);
  }
  const level = parts.size <= 1 ? 1 : parts.size <= 4 ? 2 : 3;
  return {
    possible: true,
    level,
    label: ['Original', 'Einfacher Umbau', 'Größerer Umbau', 'Großprojekt'][level],
    needs: [...parts].map((p) => ({ part: p, key: keyFor(p, e) })),
    reasons,
  };
}

/** Schritte vor dem Herausheben des Motors – jeweils mit Erledigt-Status. */
export function removalSteps(car: CarInstance): { label: string; done: boolean }[] {
  const c = car.components;
  const out = (id: string) => !c[id] || !c[id].installed;
  const steps = [
    { label: 'Batterie ausbauen (Strom weg)', done: out('battery') },
    { label: 'Kühlmittel ablassen (Kühlerschlauch ab)', done: out('hose') },
    { label: 'Ansaugschlauch abbauen', done: out('intake_hose') },
    { label: 'Motorkabelbaum abstecken', done: !c.harness || !c.harness.connected || out('harness') },
    { label: 'Hosenrohr vom Krümmer lösen (von unten)', done: out('downpipe') },
    { label: 'Motorlager und Getriebeglocke lösen', done: out('mounts') },
    { label: 'Motorhaube offen, Auto unten', done: car.hoodOpen && !car.lifted },
  ];
  if (c.charge_pipe) steps.splice(3, 0, { label: 'Ladeluftrohr abbauen', done: out('charge_pipe') });
  return steps;
}

const engineIds = (car: CarInstance) => defsOf({ ...car, bare: true }).map((d) => d.id);

/** Nimmt den Motor aus dem (geklonten) Auto heraus. */
export function extractEngine(car: CarInstance): EngineUnit {
  const motor = motorOf(car)!;
  const components: Record<string, ComponentState> = {};
  for (const id of engineIds(car)) {
    if (car.components[id]) components[id] = car.components[id];
    delete car.components[id];
  }
  const unit: EngineUnit = { motor: { ...motor, history: [...motor.history] }, components, oil: car.fluids.oil.level };
  car.motor = null;
  car.fluids.oil.level = 0;
  car.dyno = undefined;
  car.testDriven = false;
  return unit;
}

/** Setzt einen Motor in das (geklonte) Auto ein. */
export function insertEngine(car: CarInstance, unit: EngineUnit, swapParts: PartId[], day: number) {
  const orig = modelEngine(car);
  car.motor = { ...unit.motor, history: [...unit.motor.history, `Tag ${day}: eingebaut in ${CAR_MODELS[car.modelId].name}`] };
  for (const [id, st] of Object.entries(unit.components)) car.components[id] = st;
  car.fluids.oil.level = unit.oil;
  if (unit.motor.engineId !== orig.id || car.swap) {
    car.swap = { from: car.swap?.from ?? orig.id, parts: [...new Set([...(car.swap?.parts ?? []), ...swapParts])] };
  }
  car.dyno = undefined;
  car.testDriven = false;
}

/** Motor komplett montiert? (Voraussetzung für den Einbau ins Auto.) */
export const unitComplete = (unit: EngineUnit) => {
  const probe = asStand(unit, 'bavaria_320');
  return engineIds(probe).every((id) => !probe.components[id] || isComplete(probe, id));
};

/** Ein Motor als Objekt für den Motorständer (die Reparaturlogik behandelt ihn wie ein Fahrzeug ohne Karosserie). */
export function asStand(unit: EngineUnit, fallbackModel: string): CarInstance {
  const modelId = CAR_MODELS[unit.motor.donor] ? unit.motor.donor : fallbackModel;
  return {
    uid: unit.motor.uid,
    modelId,
    color: '#6f757c',
    year: 2000,
    km: unit.motor.km,
    cleanValue: 0,
    components: unit.components,
    hoodOpen: true,
    lifted: false,
    purchasePrice: 0,
    partsSpent: 0,
    testDriven: false,
    haggled: false,
    obdCodes: null,
    observed: [],
    fluids: {
      oil: { level: unit.oil, quality: 0.6, product: 'oil_5w30', filterFresh: false },
      coolant: { level: 0, quality: 1, air: true },
      brake: { level: 0, quality: 1, bled: { fl: true, fr: true } } as any,
    },
    checked: {},
    zones: createZones(0, 0.6, 0, () => 0.5),
    interior: { seats: 0, dash: 0, floor: 0 },
    rarity: 0,
    origin: 'market',
    keep: false,
    motor: unit.motor,
    bare: true,
  };
}
export const fromStand = (car: CarInstance): EngineUnit => ({ motor: car.motor!, components: car.components, oil: car.fluids.oil.level });

/** Frisches Bauteil-Set für einen Motor (alles eingebaut, heil). */
export function freshEngine(engineId: string, turboKit = false): Record<string, ComponentState> {
  const out: Record<string, ComponentState> = {};
  for (const d of engineComponents(engineId, turboKit)) {
    if (!d.engine) continue;
    out[d.id] = { installed: true, bolts: Array(d.bolts).fill(2) as BoltState[], connected: true, condition: 'ok', known: false };
    if (d.partId && ['ignition_coil', 'spark_plug', 'injector', 'glow_plug'].includes(d.partId)) out[d.id].health = 100;
  }
  return out;
}

// ---------------------------------------------------------------- Messwerte am ausgebauten Motor

/** Kompression je Zylinder (bar) und Öldruck – aus dem Zustand der Bauteile. */
export function engineTest(unit: Pick<EngineUnit, 'motor' | 'components'>) {
  const e = ENGINES[unit.motor.engineId];
  const c = unit.components;
  const bad = (id: string) => c[id]?.condition === 'defect';
  const nominal = e.fuel === 'diesel' ? 28 : e.turbo ? 13 : 14;
  const head = (bank: number) => bad(bank > 0 ? 'head_gasket_b' : 'head_gasket');
  const slots = Array.from({ length: e.cylinders }, (_, i) => i + 1);
  const half = e.cylinders / 2;
  const compression = slots.map((n) => {
    let v = nominal;
    if (bad(`piston${n}`)) v *= 0.62;
    if (head(isV(e) && n > half ? 1 : -1) && (n === 2 || n === 3 || n === half + 2)) v *= 0.55;
    if (bad('camshaft') || bad('camshaft_b')) v *= 0.93;
    if (bad('timing_chain')) v *= 0.9;
    return Math.round(v * 10) / 10;
  });
  let oilPressure = 4.2;
  if (bad('oil_pump')) oilPressure -= 2.0;
  if (bad('bearing')) oilPressure -= 0.9;
  if (bad('mainbrg')) oilPressure -= 1.1;
  if (bad('crank')) oilPressure -= 0.5;
  const findings: string[] = [];
  const low = compression.map((v, i) => [v, i + 1] as const).filter(([v]) => v < nominal * 0.85);
  if (low.length) findings.push(`Kompression zu niedrig an Zylinder ${low.map(([, n]) => n).join(', ')}.`);
  if (oilPressure < 2.5) findings.push('Öldruck zu niedrig – Lager oder Ölpumpe verdächtig.');
  if (bad('bearing') || bad('mainbrg')) findings.push('Klopfgeräusch aus dem Kurbelgehäuse unter Last.');
  if (bad('timing_chain')) findings.push('Rasselt beim Start (Steuerkette).');
  return { nominal, compression, oilPressure: Math.max(0.4, Math.round(oilPressure * 10) / 10), findings };
}

/** Zustand eines Motors in Prozent (für Wert und Anzeige). */
export function engineHealth(unit: Pick<EngineUnit, 'motor' | 'components'>) {
  const defects = DEFECT_LIST.filter((d) => defectComponents({ components: unit.components }, d).some((id) => unit.components[id]?.condition === 'defect'));
  const penalty = defects.reduce((s, d) => s + d.penalty, 0);
  const kmFactor = Math.max(0.35, 1 - unit.motor.km / 450000);
  return { defects: defects.map((d) => d.id), pct: Math.max(5, Math.round(100 * kmFactor - penalty / 120)) };
}

/** Händlerwert eines ausgebauten Motors. */
export function engineValue(unit: EngineUnit) {
  const e = ENGINES[unit.motor.engineId];
  const base = e.ps * 14 * (e.turbo ? 1.15 : 1) * (isV(e) ? 1.2 : 1);
  const h = engineHealth(unit);
  const missing = Object.values(unit.components).filter((c) => !c.installed).length;
  return Math.max(150, Math.round((base * (0.25 + 0.75 * (h.pct / 100)) - missing * 40) / 50) * 50);
}

// ---------------------------------------------------------------- Schrottplatz

type Rng = () => number;
const pick = <T,>(xs: T[], rng: Rng) => xs[Math.floor(rng() * xs.length)];

/** Teile, die man aus einem Schrottauto herausholen und verkaufen darf (alles mit Teilenummer). */
export const junkable = (car: CarInstance, id: string) => !!defOf(car, id).partId && !car.components[id]?.missing;

/** Preis eines Gebrauchtteils am Schrottplatz. */
export function junkPartPrice(car: CarInstance, id: string) {
  const def = defOf(car, id);
  const st = car.components[id];
  const part = st.variant ?? def.partId!;
  const cls = Math.sqrt(CLASS_FACTOR[CAR_MODELS[car.modelId].cls]);
  const fam = def.engine ? engineOf(car).partFactor : 1;
  const cond = st.condition === 'defect' ? 0.12 : st.health !== undefined ? 0.2 + 0.25 * (st.health / 100) : 0.38;
  return Math.max(5, Math.round((PARTS[part].price * cls * fam * cond) / 5) * 5);
}

/** Preis des kompletten Motors am Schrottplatz. */
export const junkEnginePrice = (unit: EngineUnit) => Math.max(150, Math.round((engineValue(unit) * 0.55) / 10) * 10);

const STORIES = ['Frontschaden nach Unfall', 'Seitenschaden, Achse verbogen', 'Totalschaden Heck', 'Wasserschaden', 'Motorschaden gemeldet', 'Stillgelegt, TÜV abgelaufen', 'Ausgeschlachtet, Reste', 'Brandschaden im Innenraum'];

/** Neues Schrottfahrzeug: Spenderauto mit Schäden, fehlenden Teilen, manchmal ohne Motor, selten mit Tuningteilen. */
export function junkify(car: CarInstance, rng: Rng, day: number): CarInstance {
  const story = pick(STORIES, rng);
  car.km = Math.round((car.km * (1.2 + rng() * 0.8)) / 1000) * 1000;
  for (const z of Object.values(car.zones)) {
    z.dirt = 0.7 + rng() * 0.3;
    if ('rust' in z) z.rust = Math.min(1, 0.25 + rng() * 0.7);
    if ('shine' in z) z.shine = 0;
  }
  car.interior = { seats: 0.9, dash: 0.8, floor: 1 };
  const defs = defsOf(car);
  // Verschleiß: viele Teile am Ende, einige defekt
  for (const d of defs) {
    const st = car.components[d.id];
    if (st.health !== undefined) st.health = Math.round(rng() * 70);
    if (d.partId && rng() < 0.16) st.condition = 'defect';
  }
  // Fehlende Teile: schon von anderen ausgebaut
  const takeable = defs.filter((d) => d.partId && d.access !== 'stand' && !['harness', 'mounts'].includes(d.id));
  const gone = 2 + Math.floor(rng() * 5);
  for (let i = 0; i < gone; i++) {
    const d = pick(takeable, rng);
    const st = car.components[d.id];
    // Nur Teile, die nichts anderes verdecken (sonst wäre der Rest unerreichbar)
    if (defs.some((x) => x.blockedBy.includes(d.id) && car.components[x.id]?.installed && !car.components[x.id]?.missing)) continue;
    Object.assign(st, { installed: false, missing: true, bolts: st.bolts.map(() => 0), connected: false });
  }
  // Seltene Tuningteile
  if (rng() < 0.18) {
    for (const d of defs) {
      if (!d.variants || car.components[d.id].missing) continue;
      if (rng() < 0.5) car.components[d.id].variant = d.variants[0];
    }
    car.visual = { rim: pick(['multi', 'five', 'turbine'], rng), rimSize: 1, spoiler: rng() < 0.5 ? 1 : 3, front: 1 };
  }
  // Ohne Motor (Teileträger) – der Motorraum ist leer
  if (rng() < 0.2) {
    extractEngine(car);
    car.motor = null;
  }
  const value = car.cleanValue * (0.06 + rng() * 0.05) * (story.startsWith('Ausgeschlachtet') ? 0.6 : 1);
  car.junk = { price: Math.max(300, Math.round(value / 50) * 50), story, until: day + 4 + Math.floor(rng() * 5) };
  car.hoodOpen = false;
  car.keep = false;
  car.purchasePrice = 0;
  return car;
}

/** Defekte, die nur am ausgebauten Motor zu beheben sind. */
export const standOnly = (id: keyof typeof DEFECTS) => DEFECTS[id].components.every((c) => COMPONENT_MAP[c.replace('*', '1')]?.access === 'stand');

/**
 * Folgen von zu starkem Tuning unter Volllast (Probefahrt, Prüfstand): Wer ein Risiko deutlich überschreitet,
 * beschädigt das zugehörige Bauteil. Unterhalb der Schwelle bleibt es bei der Warnung.
 */
export function tuningDamage(car: CarInstance, risks: { id: string; level: number }[], rng: () => number): string[] {
  const out: string[] = [];
  const hit = (id: string, text: string) => {
    const c = car.components[id];
    if (!c || c.condition === 'defect') return;
    c.condition = 'defect';
    out.push(text);
  };
  for (const r of risks) {
    if (r.level < 1 || rng() > Math.min(0.9, r.level * 0.6)) continue;
    const pistons = Object.keys(car.components).filter((k) => /^piston\d$/.test(k));
    if (r.id === 'knock') hit(pistons[Math.floor(rng() * pistons.length)] ?? 'head_gasket', 'Klopfen unter Volllast hat einen Kolben beschädigt – Kompression weg, Ölverbrauch.');
    if (r.id === 'heat') hit('head_gasket', 'Überhitzt: Die Zylinderkopfdichtung ist durchgebrannt.');
    if (r.id === 'mech') hit('bearing', 'Zu viel Drehmoment: Ein Pleuellager hat gefressen – es klopft.');
    if (r.id === 'turbo') hit('turbo', 'Der Turbolader hat den Druck nicht überlebt.');
  }
  return out;
}

export const motorLabel = (m: MotorMeta) => `${ENGINES[m.engineId]?.name ?? m.engineId}`;
