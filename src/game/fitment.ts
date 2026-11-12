import { CAR_MODELS, CLASS_FACTOR, CLASS_NAMES } from './data/cars';
import { engineOf } from './data/components';
import { DEFECTS } from './data/defects';
import { CHASSIS_PARTS, PARTS, UNIVERSAL_PARTS } from './data/parts';
import type { CarInstance, DefectId, Inventory, PartId } from './types';

// Passform und Preis von Ersatzteilen. Motorteile passen nur innerhalb einer
// Motorfamilie, Fahrwerksteile nur innerhalb einer Fahrzeugklasse. Teile für
// teure Autos kosten entsprechend mehr.

type Car = Pick<CarInstance, 'modelId'>;

/** Passform eines Teils an diesem Auto, z. B. „R6", „V8-Turbo" oder „Fahrwerk Sportliche Oberklasse". */
export function fitOf(car: Car, part: PartId): string {
  if (UNIVERSAL_PARTS.includes(part)) return 'alle';
  if (CHASSIS_PARTS.includes(part)) return `Fahrwerk ${CLASS_NAMES[CAR_MODELS[car.modelId].cls]}`;
  return engineOf(car).family;
}

/** Lagerschlüssel für ein Teil in der Passform dieses Autos. */
export const partKey = (car: Car, part: PartId) => `${part}@${fitOf(car, part)}`;
export const splitKey = (key: string): { part: PartId; fit: string } => {
  const [part, fit] = key.split('@');
  return { part: part as PartId, fit: fit ?? 'alle' };
};
export const stockOf = (inv: Inventory, car: Car, part: PartId) => inv[partKey(car, part)] ?? 0;

/** Kostenfaktor eines Autos für Schäden, Arbeitslohn und Fahrwerksteile. */
export const costFactor = (car: Car) => CLASS_FACTOR[CAR_MODELS[car.modelId].cls];

/** Listenpreis eines Teils für dieses Auto (ohne Rabatte). */
export function basePartPrice(car: Car, part: PartId): number {
  const model = CAR_MODELS[car.modelId];
  const f = UNIVERSAL_PARTS.includes(part)
    ? Math.sqrt(CLASS_FACTOR[model.cls])
    : CHASSIS_PARTS.includes(part)
      ? CLASS_FACTOR[model.cls]
      : engineOf(car).partFactor * Math.sqrt(CLASS_FACTOR[model.cls]);
  return Math.round(PARTS[part].price * f);
}

const round50 = (n: number) => Math.round(n / 50) * 50;
/** Wertminderung durch einen Schaden – an teuren Autos kostet derselbe Schaden mehr. */
export const defectPenalty = (car: Car, d: DefectId) => round50(DEFECTS[d].penalty * costFactor(car));
/** Arbeitslohn für die Behebung eines Schadens an diesem Auto. */
export const defectLabor = (car: Car, d: DefectId) => Math.round((DEFECTS[d].labor * (1 + costFactor(car))) / 2 / 5) * 5;

/** Alte Lagerschlüssel ohne Passform (Spielstände bis Version 4) passen zu den damaligen Autos. */
export function migrateInventory(old: Record<string, number> | undefined): Inventory {
  const out: Inventory = {};
  for (const [k, n] of Object.entries(old ?? {})) {
    if (!(n > 0)) continue;
    const part = k.split('@')[0] as PartId;
    if (!PARTS[part]) continue;
    const key = k.includes('@') ? k : `${part}@${UNIVERSAL_PARTS.includes(part) ? 'alle' : CHASSIS_PARTS.includes(part) ? `Fahrwerk ${CLASS_NAMES.budget}` : 'R4'}`;
    out[key] = (out[key] ?? 0) + n;
  }
  return out;
}
