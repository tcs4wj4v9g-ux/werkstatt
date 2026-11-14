import type { FluidProduct } from '../types';

// Motoren. Bauart, Kraftstoff und Aufladung bestimmen, welche Bauteile ein
// Auto hat, wie der Motorraum aussieht, wie er klingt, was Teile kosten und
// wie das Auto fährt. Neue Motoren = neuer Eintrag hier.

export type EngineLayout = 'R4' | 'R6' | 'V6' | 'V8';
export type Fuel = 'benzin' | 'diesel';

export interface EngineDef {
  id: string;
  name: string;
  layout: EngineLayout;
  fuel: Fuel;
  turbo: boolean;
  cylinders: number;
  /** Hubraum in Litern. */
  liters: number;
  ps: number;
  nm: number;
  oilCapacity: number;
  coolantCapacity: number;
  oilSpec: FluidProduct;
  /** Teilefamilie: Motorteile passen nur innerhalb derselben Familie. */
  family: string;
  /** Preisfaktor für Motorteile gegenüber dem einfachen Vierzylinder. */
  partFactor: number;
}

const e = (
  id: string, name: string, layout: EngineLayout, fuel: Fuel, turbo: boolean, liters: number, ps: number, nm: number,
  family: string, partFactor: number,
): EngineDef => {
  const cylinders = layout === 'R4' ? 4 : layout === 'V8' ? 8 : 6;
  return {
    id, name, layout, fuel, turbo, cylinders, liters, ps, nm, family, partFactor,
    oilCapacity: cylinders === 4 ? (fuel === 'diesel' ? 5 : 4.5) : cylinders === 6 ? 6.5 : 8.5,
    coolantCapacity: cylinders === 4 ? 7 : cylinders === 6 ? 8.5 : 11,
    oilSpec: cylinders === 4 ? 'oil_5w30' : 'oil_5w40',
  };
};

export const ENGINES: Record<string, EngineDef> = Object.fromEntries(
  [
    e('r4_14', '1,4-l-Vierzylinder', 'R4', 'benzin', false, 1.4, 75, 126, 'R4', 0.8),
    e('r4_12', '1,2-l-Vierzylinder', 'R4', 'benzin', false, 1.2, 58, 93, 'R4', 0.7),
    e('r4_20', '2,0-l-Vierzylinder', 'R4', 'benzin', false, 2.0, 150, 200, 'R4', 1),
    e('r4d_20', '2,0-l-Vierzylinder-Turbodiesel', 'R4', 'diesel', true, 2.0, 163, 340, 'R4-Diesel', 1.25),
    e('r6_23', '2,3-l-Reihensechszylinder', 'R6', 'benzin', false, 2.3, 150, 205, 'R6', 1.2),
    e('r6_25', '2,5-l-Reihensechszylinder', 'R6', 'benzin', false, 2.5, 218, 250, 'R6', 1.35),
    e('r6_28k', '2,8-l-Reihensechszylinder', 'R6', 'benzin', false, 2.8, 193, 280, 'R6', 1.6),
    e('r6_30', '3,0-l-Reihensechszylinder', 'R6', 'benzin', false, 3.0, 258, 300, 'R6', 1.4),
    e('r6_30cs', '3,0-l-Reihensechszylinder (Vergaser)', 'R6', 'benzin', false, 3.0, 180, 255, 'R6-Klassik', 4.5),
    e('r6t_30', '3,0-l-Reihensechszylinder Biturbo', 'R6', 'benzin', true, 3.0, 306, 400, 'R6-Turbo', 1.8),
    e('r6d_30', '3,0-l-Reihensechszylinder-Turbodiesel', 'R6', 'diesel', true, 3.0, 245, 520, 'R6-Diesel', 1.7),
    e('v6_35', '3,5-l-V6', 'V6', 'benzin', false, 3.5, 272, 350, 'V6', 1.6),
    e('v6t_30', '3,0-l-V6 Biturbo', 'V6', 'benzin', true, 3.0, 340, 450, 'V6-Turbo', 2.4),
    e('v8_40', '4,0-l-V8 Hochdrehzahl', 'V8', 'benzin', false, 4.0, 420, 400, 'V8', 2.6),
    e('v8t_44', '4,4-l-V8 Biturbo', 'V8', 'benzin', true, 4.4, 450, 650, 'V8-Turbo', 2.8),
    e('v8_45s', '4,5-l-V8 Mittelmotor-Charakter', 'V8', 'benzin', false, 4.5, 570, 540, 'V8-Sport', 5),
    e('v8_30k', '3,0-l-V8 (Rennsport-Klassiker)', 'V8', 'benzin', false, 3.0, 280, 290, 'V8-Klassik', 9),
  ].map((x) => [x.id, x]),
);

export interface CylinderSlot {
  n: number;
  x: number;
  z: number;
  /** 0 bei Reihenmotoren; -1 / +1 für die beiden Bänke eines V-Motors. */
  bank: number;
}

/** Wo die Zylinder im Motorraum sitzen (Fahrzeugkoordinaten, Front = +x). */
export function cylinderSlots(engine: EngineDef): CylinderSlot[] {
  if (engine.layout === 'R4') return [1.03, 1.21, 1.39, 1.57].map((x, i) => ({ n: i + 1, x, z: 0, bank: 0 }));
  if (engine.layout === 'R6') return [1.0, 1.115, 1.23, 1.345, 1.46, 1.575].map((x, i) => ({ n: i + 1, x, z: 0, bank: 0 }));
  const xs = engine.layout === 'V6' ? [1.1, 1.3, 1.5] : [1.06, 1.22, 1.38, 1.54];
  // Bank 1 (links, -z) trägt die Zylinder 1…n/2, Bank 2 (rechts, +z) den Rest.
  return [-1, 1].flatMap((bank, b) => xs.map((x, i) => ({ n: b * xs.length + i + 1, x, z: bank * 0.105, bank })));
}

export const isV = (engine: EngineDef) => engine.layout === 'V6' || engine.layout === 'V8';
