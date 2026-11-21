import { describe, expect, it } from 'vitest';
import { applyCrash, dentLevel, newCrash, recordImpact } from './crash';
import { createCar, valuate } from './market';
import { activeDefects } from './repair';
import { paintAction } from './detail';

const fresh = () => {
  const c = createCar('bavaria_330', [], () => 0.5, { year: 2005 });
  for (const k of Object.keys(c.components)) c.components[k].condition = 'ok';
  for (const z of Object.values(c.zones)) Object.assign(z, { dirt: 0, step: 0, rust: 0, shine: 0.9 });
  return c;
};

describe('Unfallschäden', () => {
  it('Einschlag trifft den richtigen Bereich; sanfte Berührung bleibt folgenlos', () => {
    const log = newCrash();
    expect(recordImpact(log, 1, 0, 2)).toBeNull();
    expect(recordImpact(log, 1, 0, 6)).toBe('front');
    expect(recordImpact(log, -1, 0, 6)).toBe('rear');
    expect(recordImpact(log, 0, 1, 6)).toBe('left');
    expect(recordImpact(log, 0, -1, 6)).toBe('right');
    expect(log.parts).toEqual([]);
    expect(log.dents.front).toBeGreaterThan(0);
  });

  it('Harter Frontaleinschlag: Beule vorn, Kühler kaputt; Wert sinkt; Ausbeulen in der Lackierkabine', () => {
    const log = newCrash();
    recordImpact(log, 1, 0, 16, () => 0.1);
    const car = fresh();
    const before = valuate(car).value;
    const msg = applyCrash(car, log);
    expect(msg).toMatch(/Beulen an Front/);
    expect(car.zones.front.dent).toBeGreaterThan(0.5);
    expect(activeDefects(car)).toContain('radiator');
    expect(dentLevel(car)).toBeGreaterThan(0.1);
    const after = valuate(car);
    expect(after.deductions.some((d) => /Beulen/.test(d.label))).toBe(true);
    expect(after.value).toBeLessThan(before);
    // lackieren geht erst nach dem Ausbeulen
    expect(paintAction(car, 'front', 'spraygun', '#101114', 5000).ok).toBe(false);
    const r = paintAction(car, 'front', 'sander', '#101114', 5000);
    expect(r.ok && r.cost).toBeTruthy();
    expect(car.zones.front.dent).toBe(0);
    expect(paintAction(car, 'front', 'spraygun', '#101114', 5000).ok).toBe(true);
  });

  it('Seitlich vorn: Querlenker oder Spurstange auf dieser Seite; ohne Einschlag nichts', () => {
    const log = newCrash();
    recordImpact(log, 0.4, 0.9, 12, () => 0.2);
    expect(log.parts.some((p) => p.endsWith('_fl'))).toBe(true);
    const car = fresh();
    expect(applyCrash(car, newCrash())).toBe('');
  });
});
