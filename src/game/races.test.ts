import { describe, expect, it } from 'vitest';
import { createCar } from './market';
import { performance } from './performance';
import { aiTime, courseOf, medalFor, opponentSpec, payoutFor, raceBlocker, raceForDay, raceTargets, upcomingRaces, RACE_CLASSES } from './races';
import { CAR_MODELS } from './data/cars';
import { vehicleSpec } from './vehicle';

const fresh = (id: string) => {
  const c = createCar(id, [], () => 0.5, { year: 2005 });
  for (const k of Object.keys(c.components)) c.components[k].condition = 'ok';
  c.fluids.oil.level = 99;
  return c;
};

describe('Zeitrennen', () => {
  it('Rennkalender: zwei von drei Tagen, fest je Tag (gleich auf allen Geräten), nennenswertes Preisgeld', () => {
    expect(raceForDay(3)).toBeNull();
    expect(raceForDay(4)).toEqual(raceForDay(4));
    const r = upcomingRaces(1, 8);
    expect(r.length).toBe(8);
    for (const x of r) {
      expect(x.prize.gold).toBeGreaterThanOrEqual(6000);
      expect(x.prize.silver).toBeLessThan(x.prize.gold);
      expect(x.prize.bronze).toBeLessThan(x.prize.silver);
      expect(x.fee).toBeLessThan(x.prize.bronze);
    }
  });

  it('Strecken liegen auf dem Straßennetz; Sollzeiten: stärkere Klassen schneller, Gold < Silber < Bronze', () => {
    expect(courseOf('runde').length).toBeGreaterThan(courseOf('ost').length * 2);
    for (const course of ['ost', 'west', 'runde'] as const) {
      let prev = Infinity;
      for (const cls of ['c150', 'c250', 'c400', 'open'] as const) {
        const t = raceTargets({ course, cls });
        expect(t.gold).toBeLessThan(t.silver);
        expect(t.silver).toBeLessThan(t.bronze);
        expect(t.gold).toBeLessThan(prev);
        prev = t.gold;
      }
    }
  });

  it('Tuning lohnt sich: ein schwaches Auto schafft in seiner Klasse kein Gold, ein starkes in der offenen Klasse schon', () => {
    const twingo = fresh('renard_twingle');
    expect(performance(twingo).ps).toBeLessThan(RACE_CLASSES.c150.ps);
    const t150 = raceTargets({ course: 'ost', cls: 'c150' });
    const tw = aiTime(vehicleSpec(twingo), courseOf('ost'));
    expect(tw).toBeGreaterThan(t150.gold);
    expect(tw).toBeLessThan(t150.bronze);
    const fast = aiTime(vehicleSpec(fresh('veloce_stradale')), courseOf('ost'));
    expect(fast).toBeLessThan(raceTargets({ course: 'ost', cls: 'open' }).gold);
  });

  it('Klassengrenze und Auszahlung: zu stark darf nicht starten; Preisgeld nur einmal, Verbesserung zahlt die Differenz', () => {
    const race = { ...raceForDay(1)!, cls: 'c150' as const };
    expect(raceBlocker(fresh('bmv_m4_g82'), race)).toMatch(/Zu stark/);
    expect(raceBlocker(fresh('renard_twingle'), race)).toBeNull();
    const t = raceTargets(race);
    expect(medalFor(race, t.gold - 1)).toBe('gold');
    expect(medalFor(race, t.bronze + 1)).toBeNull();
    const bronze = payoutFor(race, t.bronze - 0.1, 0);
    expect(bronze.payout).toBe(race.prize.bronze);
    const gold = payoutFor(race, t.gold - 0.1, bronze.prize);
    expect(gold.payout).toBe(race.prize.gold - race.prize.bronze);
    expect(payoutFor(race, t.gold - 0.5, race.prize.gold).payout).toBe(0);
  });

  it('Rennen gegen Gegner: etwa jedes zweite, fünf Gegner mit passenden Autos, fest je Tag', () => {
    const all = upcomingRaces(1, 40);
    const grid = all.filter((r) => r.kind === 'grid');
    expect(grid.length).toBeGreaterThan(10);
    expect(grid.length).toBeLessThan(30);
    for (const r of grid.slice(0, 6)) {
      expect(r.opponents.length).toBe(5);
      expect(new Set(r.opponents.map((o) => o.name)).size).toBe(5);
      for (const o of r.opponents) expect(CAR_MODELS[o.modelId]).toBeTruthy();
      expect(raceForDay(r.day)).toEqual(r);
      expect(r.title).toMatch(/^Rennen /);
    }
  });

  it('Gegner: der Schnellste fährt etwa auf Gold-Niveau, der Langsamste deutlich langsamer; Preisgeld nach Platz', () => {
    const r = upcomingRaces(1, 40).find((x) => x.kind === 'grid' && x.course === 'ost') ?? upcomingRaces(1, 40).find((x) => x.kind === 'grid')!;
    const times = r.opponents.map((o) => aiTime(opponentSpec(r.cls, o), courseOf(r.course), undefined, true, o.skill));
    const gold = raceTargets(r).gold;
    expect(Math.min(...times) / gold).toBeGreaterThan(0.95);
    expect(Math.min(...times) / gold).toBeLessThan(1.04);
    expect(Math.max(...times)).toBeGreaterThan(Math.min(...times) * 1.04);
    expect(payoutFor(r, 999, 0, 1).payout).toBe(r.prize.gold);
    expect(payoutFor(r, 1, 0, 4).payout).toBe(0);
    expect(payoutFor(r, 999, r.prize.bronze, 2).payout).toBe(r.prize.silver - r.prize.bronze);
  });
});
