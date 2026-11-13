import { COMPONENT_MAP, engineOf } from './data/components';
import { DEFECTS, DEFECT_LIST, defectApplies, defectComponents, type DefectDef } from './data/defects';
import type { EngineLayout } from './data/engines';
import { SYMPTOMS, type Channel, type SymptomDef } from './data/symptoms';
import { fluidSymptoms } from './fluids';
import { activeDefects } from './repair';
import type { CarInstance } from './types';

// Diagnose: trennt die tatsächliche Ursache (Bauteilzustand) von dem, was der
// Spieler wahrnimmt (Symptome), untersucht (OBD, Sichtprüfung) und weiß.

/** Symptome, die das Auto im aktuellen technischen Zustand zeigt. */
export function presentSymptoms(car: CarInstance): string[] {
  return [...new Set([...activeDefects(car).flatMap((d) => DEFECTS[d].symptoms), ...fluidSymptoms(car)])];
}

export interface Observation {
  added: SymptomDef[];
  gone: SymptomDef[];
}

/**
 * Der Spieler nimmt das Auto über bestimmte Kanäle wahr (Motor läuft,
 * Probefahrt, Sichtprüfung …). Neue Symptome kommen in die Fahrzeugakte,
 * verschwundene werden gestrichen – so prüft man auch den Reparaturerfolg.
 */
export function observe(car: CarInstance, channels: Channel[], warm: boolean): Observation {
  const inScope = (s: SymptomDef) => channels.includes(s.channel) && (warm || !s.warm);
  const present = presentSymptoms(car).map((id) => SYMPTOMS[id]).filter(inScope);
  const before = car.observed.map((id) => SYMPTOMS[id]).filter(Boolean);
  const gone = before.filter((s) => inScope(s) && !present.includes(s));
  const added = present.filter((s) => !car.observed.includes(s.id));
  car.observed = [...car.observed.filter((id) => !gone.some((g) => g.id === id)), ...added.map((s) => s.id)];
  return { added, gone };
}

/** Alle Defekte, die ein Symptom grundsätzlich verursachen können. */
export const possibleCauses = (symptomId: string, car?: CarInstance): DefectDef[] =>
  DEFECT_LIST.filter((d) => d.symptoms.includes(symptomId) && (!car || defectApplies(car, d)));

export type CauseStatus = 'confirmed' | 'ruled_out' | 'open';

/** Wissensstand des Spielers zu einer möglichen Ursache – unabhängig von der Wahrheit. */
export function causeStatus(car: CarInstance, d: DefectDef): CauseStatus {
  const comps = defectComponents(car, d).map((c) => car.components[c]);
  if (comps.some((c) => c.known && c.condition === 'defect')) return 'confirmed';
  if (comps.every((c) => c.known && c.condition === 'ok')) return 'ruled_out';
  return 'open';
}

/**
 * OBD-Diagnose: nur elektronisch erfassbare Fehler, und nur als Fehlercode –
 * welcher Zylinder aussetzt, nicht ob Spule oder Kerze schuld ist.
 * Mechanische Schäden (Lager, Ventiltrieb, Kette, Lecks) erzeugen keinen Code.
 */
export function obdScan(car: CarInstance): string[] {
  const codes: string[] = [];
  const bad = (id: string) => car.components[id]?.condition === 'defect';
  const off = (id: string) => !!car.components[id] && (!car.components[id].installed || !car.components[id].connected);
  const engine = engineOf(car);
  for (let n = 1; n <= engine.cylinders; n++) {
    if (engine.fuel === 'diesel') {
      if (bad(`inj${n}`) || off(`inj${n}`)) codes.push(`P020${n} – Einspritzdüse Zylinder ${n}: Fehlfunktion`);
      if (bad(`glow${n}`)) codes.push(`P067${n} – Glühkerze Zylinder ${n}: Stromkreis`);
    } else if (bad(`coil${n}`) || bad(`plug${n}`) || off(`coil${n}`)) {
      codes.push(`P030${n} – Zündaussetzer Zylinder ${n} erkannt`);
    }
  }
  // Ladedruck zu niedrig: ob Lader oder Leck, verrät der Code nicht.
  if (bad('turbo') || bad('charge_pipe')) codes.push('P0299 – Ladedruck zu niedrig');
  if (bad('egr') || off('egr')) codes.push('P0401 – Abgasrückführung: Durchfluss unzureichend');
  if (bad('dpf')) codes.push('P2002 – Partikelfilter: Wirkungsgrad unter Schwellenwert');
  if (bad('intake_hose')) codes.push('P0171 – Gemisch zu mager (Bank 1)');
  if (['pads_fl', 'pads_fr'].some(bad)) codes.push('5E20 – Bremsbelagverschleiß Vorderachse, Verschleißgrenze erreicht');
  if (['pads_rl', 'pads_rr'].some(bad)) codes.push('5E21 – Bremsbelagverschleiß Hinterachse, Verschleißgrenze erreicht');
  if (bad('alternator') || !car.components.alternator.connected) codes.push('P0562 – Bordnetzspannung zu niedrig');
  else if (bad('belt')) codes.push('P0562 – Bordnetzspannung zu niedrig (sporadisch)');
  if (bad('thermostat')) codes.push('P0128 – Kühlmitteltemperatur unter Thermostat-Regeltemperatur');
  car.obdCodes = codes;
  return codes;
}

export interface SoundProfile {
  misfire: number;
  hiss: number;
  knock: number;
  tick: number;
  rattle: number;
  squeal: number;
  /** Turbo heult (Laderschaden) bzw. zischt (Leck in der Ladeluft). */
  whine: number;
  boostHiss: number;
  /** Grundcharakter des Motors. */
  layout: EngineLayout;
  cylinders: number;
  diesel: boolean;
  turbo: boolean;
  liters: number;
  /** Sportteile an Ansaugung und Abgas (0–3): lauter, kerniger. */
  sport?: number;
}

/** Welche Geräusche der Motor im aktuellen technischen Zustand macht (0 = keins). */
export function soundProfile(car: CarInstance): SoundProfile {
  const d = activeDefects(car);
  const has = (id: string) => d.includes(id as never);
  const e = engineOf(car);
  return {
    misfire: has('coil') || has('injector') ? 1 : has('plugs') ? 0.7 : has('vacuum') || has('egr') || has('glow') ? 0.4 : 0,
    hiss: has('vacuum') ? 1 : 0,
    knock: has('bearing') ? 1 : 0,
    tick: has('lifters') ? 1 : 0,
    rattle: has('chain') ? 1 : 0,
    squeal: has('belt') ? 1 : 0,
    whine: has('turbo') ? 1 : 0,
    boostHiss: has('boost_leak') ? 1 : 0,
    layout: e.layout,
    cylinders: e.cylinders,
    diesel: e.fuel === 'diesel',
    turbo: (e.turbo || !!car.components.turbo?.installed) && !has('turbo'),
    liters: e.liters,
    sport: ['exhaust_sport', 'manifold_sport', 'intake_sport'].filter((v) => Object.values(car.components).some((c) => c.installed && c.variant === v)).length,
  };
}

export const componentName = (id: string) => COMPONENT_MAP[id].name;
