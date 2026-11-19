import { describe, expect, it } from 'vitest';
import { CIRCUITS, circuitWorld, worldFor, type CircuitId } from './circuits';
import { aiTime, courseOf } from '../game/races';
import { createCar } from '../game/market';
import { vehicleSpec } from '../game/vehicle';

describe('Rennstrecken', () => {
  it('jede Strecke ist ein sauberer Rundkurs: 2–5 km, keine Überschneidung, fahrbare Kurven und Steigungen', () => {
    for (const id of Object.keys(CIRCUITS) as CircuitId[]) {
      const w = circuitWorld(id);
      const n = w.samples.length;
      expect(w.length / 1000, id).toBeGreaterThan(2);
      expect(w.length / 1000, id).toBeLessThan(5);
      let minD = Infinity;
      for (let i = 0; i < n; i += 3)
        for (let j = i + 3; j < n; j += 3) {
          if (Math.min(j - i, n - (j - i)) < 100) continue;
          minD = Math.min(minD, Math.hypot(w.samples[i].x - w.samples[j].x, w.samples[i].z - w.samples[j].z));
        }
      expect(minD, `${id}: Abstand zwischen fremden Streckenteilen`).toBeGreaterThan(2 * w.railOffset + 6);
      expect(Math.min(...w.samples.map((p) => 1 / Math.max(1e-6, Math.abs(p.curv)))), `${id}: engster Radius`).toBeGreaterThan(14);
      expect(Math.max(...w.samples.map((p, i) => Math.abs(w.samples[(i + 1) % n].y - p.y) / 2)), `${id}: Steigung`).toBeLessThan(0.16);
      expect(worldFor(id)).toBe(w);
    }
  });

  it('Computerfahrer kommt auf jeder Strecke ins Ziel; Leistung zählt auf dem Motodrom mehr als im Hafen', () => {
    const spec = (id: string) => {
      const c = createCar(id, [], () => 0.5, { year: 2005 });
      for (const k of Object.keys(c.components)) c.components[k].condition = 'ok';
      c.fluids.oil.level = 99;
      return vehicleSpec(c);
    };
    const golf = spec('vw_golf2_gti');
    const m4 = spec('bmv_m4_g82');
    const ratio: Record<string, number> = {};
    for (const id of Object.keys(CIRCUITS) as CircuitId[]) {
      const a = aiTime(golf, courseOf(id));
      const b = aiTime(m4, courseOf(id));
      expect(Number.isFinite(a) && Number.isFinite(b), id).toBe(true);
      ratio[id] = a / b;
    }
    expect(ratio.motodrom).toBeGreaterThan(ratio.hafen);
  });
});
