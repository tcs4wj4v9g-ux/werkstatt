import { COMPONENT_MAP } from './data/components';
import { DEFECTS, DEFECT_LIST, type DefectDef } from './data/defects';
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
export const possibleCauses = (symptomId: string): DefectDef[] => DEFECT_LIST.filter((d) => d.symptoms.includes(symptomId));

export type CauseStatus = 'confirmed' | 'ruled_out' | 'open';

/** Wissensstand des Spielers zu einer möglichen Ursache – unabhängig von der Wahrheit. */
export function causeStatus(car: CarInstance, d: DefectDef): CauseStatus {
  const comps = d.components.map((c) => car.components[c]);
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
  const bad = (id: string) => car.components[id].condition === 'defect';
  for (let n = 1; n <= 4; n++) {
    if (bad(`coil${n}`) || bad(`plug${n}`) || !car.components[`coil${n}`].installed || !car.components[`coil${n}`].connected) {
      codes.push(`P030${n} – Zündaussetzer Zylinder ${n} erkannt`);
    }
  }
  if (bad('intake_hose')) codes.push('P0171 – Gemisch zu mager (Bank 1)');
  if (['pads_fl', 'pads_fr'].some(bad)) codes.push('5E20 – Bremsbelagverschleiß Vorderachse, Verschleißgrenze erreicht');
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
}

/** Welche Geräusche der Motor im aktuellen technischen Zustand macht (0 = keins). */
export function soundProfile(car: CarInstance): SoundProfile {
  const d = activeDefects(car);
  const has = (id: string) => d.includes(id as never);
  return {
    misfire: has('coil') ? 1 : has('plugs') ? 0.7 : has('vacuum') ? 0.4 : 0,
    hiss: has('vacuum') ? 1 : 0,
    knock: has('bearing') ? 1 : 0,
    tick: has('lifters') ? 1 : 0,
    rattle: has('chain') ? 1 : 0,
    squeal: has('belt') ? 1 : 0,
  };
}

export const componentName = (id: string) => COMPONENT_MAP[id].name;
