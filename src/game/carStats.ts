/**
 * Fahrzeugstatistik aus der Fahrphysik: dieselbe Rechnung wie auf der Probefahrt, damit die Zahlen zum Fahrgefühl passen.
 * Gemessen wird wie bei einem Testbericht auf ebener Strecke: 0–100 km/h, Höchstgeschwindigkeit, Bremsweg aus 100 km/h,
 * Querbeschleunigung im Kreis (Handling). Tuning und Defekte gehen über `vehicleSpec` ein.
 */
import { CAR_MODELS } from './data/cars';
import { performance } from './performance';
import type { CarInstance } from './types';
import { initialState, stepVehicle, vehicleSpec, type Drivetrain, type VehicleSpec } from './vehicle';

const FLAT = { grade: 0, grip: 1, drag: 0 };
const DT = 1 / 60;

export function zeroTo100(spec: VehicleSpec) {
  const s = initialState(0, 0, 0);
  let t = 0;
  while (t < 40 && s.vx < 100 / 3.6) {
    stepVehicle(spec, s, { throttle: 1, brake: 0, steer: 0 }, FLAT, DT);
    t += DT;
  }
  return t;
}

export function topSpeed(spec: VehicleSpec) {
  const s = initialState(0, 0, 0);
  let last = 0;
  for (let t = 0; t < 150; t += DT) {
    stepVehicle(spec, s, { throttle: 1, brake: 0, steer: 0 }, FLAT, DT);
    // Ende, wenn das Tempo praktisch nicht mehr steigt
    if (t > 20 && Math.abs(t % 5) < DT) {
      if (s.vx - last < 0.05) break;
      last = s.vx;
    }
  }
  return s.vx * 3.6;
}

export function brakeDistance(spec: VehicleSpec) {
  const s = initialState(0, 0, 0);
  s.vx = 100 / 3.6;
  s.gear = 4;
  for (let t = 0; t < 20 && s.vx > 0.3; t += DT) stepVehicle(spec, s, { throttle: 0, brake: 1, steer: 0 }, FLAT, DT);
  return s.x;
}

/** Größte dauerhafte Querbeschleunigung (g) bei 70 km/h mit vollem Einschlag. */
export function lateralG(spec: VehicleSpec) {
  const s = initialState(0, 0, 0);
  s.vx = 70 / 3.6;
  s.gear = 3;
  let ay = 0;
  for (let i = 0; i < 240; i++) {
    stepVehicle(spec, s, { throttle: 0.3, brake: 0, steer: 1 }, FLAT, DT);
    if (i > 120) ay = Math.max(ay, Math.abs(s.ay));
  }
  return ay / 9.81;
}

export interface CarStats {
  ps: number;
  nm: number;
  weight: number;
  /** PS je Tonne */
  powerToWeight: number;
  drive: Drivetrain;
  gears: number;
  t100: number;
  vmax: number;
  brake100: number;
  lateralG: number;
  /** Noten 0–100 für die Balken */
  rating: { accel: number; speed: number; braking: number; handling: number };
}

const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)));
const cache = new Map<string, CarStats>();

/** Schlüssel aus allem, was die Fahrleistung beeinflusst (Motor, Teile, Defekte, Fahrwerk, Kennfeld). */
function key(car: CarInstance) {
  const comps = Object.entries(car.components)
    .filter(([, c]) => c.variant || c.condition === 'defect' || !c.installed)
    .map(([id, c]) => `${id}:${c.variant ?? ''}:${c.condition}:${c.installed ? 1 : 0}`)
    .sort()
    .join(',');
  return JSON.stringify([car.modelId, car.year, car.motor?.engineId, car.motor?.turboKit, car.ecu, car.visual?.suspension, car.visual?.rimSize, car.visual?.flares, car.visual?.spoiler, car.visual?.hood, car.swap, comps]);
}

export function carStats(car: CarInstance): CarStats {
  const k = key(car);
  const hit = cache.get(k);
  if (hit) return hit;
  const spec = vehicleSpec(car);
  const p = performance(car);
  const t100 = zeroTo100(spec);
  const vmax = topSpeed(spec);
  const brake100 = brakeDistance(spec);
  const g = lateralG(spec);
  const stats: CarStats = {
    ps: p.ps,
    nm: p.nm,
    weight: Math.round(p.weight),
    powerToWeight: Math.round(p.ps / (p.weight / 1000)),
    drive: spec.drive,
    gears: spec.gears.length,
    t100,
    vmax,
    brake100,
    lateralG: g,
    rating: {
      // 16 s → 0, 3 s → 100
      accel: clamp(((16 - Math.min(16, t100)) / 13) * 100),
      // 140 km/h → 0, 330 km/h → 100
      speed: clamp(((vmax - 140) / 190) * 100),
      // 48 m → 0, 33 m → 100
      braking: clamp(((48 - brake100) / 15) * 100),
      // 0,8 g → 0, 1,25 g → 100
      handling: clamp(((g - 0.8) / 0.45) * 100),
    },
  };
  if (cache.size > 300) cache.clear();
  cache.set(k, stats);
  return stats;
}

export const DRIVE_LABEL: Record<Drivetrain, string> = { FWD: 'Frontantrieb', RWD: 'Heckantrieb', AWD: 'Allradantrieb' };
/** Modellname für Anzeigen. */
export const modelName = (car: CarInstance) => CAR_MODELS[car.modelId].name;
