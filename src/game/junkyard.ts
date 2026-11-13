import { CAR_MODELS } from './data/cars';
import { JUNK_SLOTS } from './data/workshop';
import { applicableDefects, createCar } from './market';
import { junkify } from './motor';
import type { CarInstance } from './types';

// Schrottplatz: sechs Plätze, die regelmäßig mit neuen Spenderautos belegt werden.

type Rng = () => number;

/** Neues Schrottauto. Seltene Modelle kommen seltener vor. */
export function createJunkCar(rng: Rng, day: number): CarInstance {
  const pool = Object.values(CAR_MODELS).flatMap((m) => Array(m.collector ? 1 : m.rare ? 2 : m.cls === 'budget' || m.cls === 'mid' ? 6 : 3).fill(m.id));
  const modelId = pool[Math.floor(rng() * pool.length)];
  const all = applicableDefects(modelId);
  const defects = all.filter(() => rng() < 0.12);
  const car = createCar(modelId, defects, rng, { origin: 'market' });
  car.uid = `junk-${day}-${Math.floor(rng() * 1e9).toString(36)}`;
  return junkify(car, rng, day);
}

/** Abgelaufene Schrottautos verschwinden (Presse), leere Plätze werden neu belegt. */
export function refreshJunk(cars: (CarInstance | null)[], rng: Rng, day: number): (CarInstance | null)[] {
  const out = [...cars];
  for (const slot of JUNK_SLOTS) {
    const c = out[slot];
    if (c && c.junk && c.junk.until >= day) continue;
    out[slot] = createJunkCar(rng, day);
  }
  return out;
}
