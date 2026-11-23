import { describe, expect, it } from 'vitest';
import { createCar } from './market';
import { performance } from './performance';
import { weatherOf } from './grip';
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
    // Jeder dritte Tag: abwechselnd Rallye und Driftwettbewerb
    expect(raceForDay(3)?.kind).toBe('rally');
    expect(raceForDay(6)?.kind).toBe('drift');
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
    // erstes Zeitrennen (Rennen gegen Gegner sind inzwischen häufiger)
    let d0 = 1;
    while (raceForDay(d0)?.kind !== 'time') d0++;
    const race = { ...raceForDay(d0)!, cls: 'c150' as const };
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

  it('Rennen gegen Gegner: die meisten Renntage, fünf Gegner mit passenden Autos, fest je Tag', () => {
    const all = upcomingRaces(1, 40);
    const grid = all.filter((r) => r.kind === 'grid');
    expect(grid.length).toBeGreaterThan(10);
    expect(grid.length).toBeLessThan(36);
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

describe('Rallye und Driftwettbewerb', () => {
  it('Rallye auf einer Rallyepiste, Drift auf breiten Rundkursen; Sollzeiten bzw. Punkteziele steigen', async () => {
    const { RALLY_COURSES, DRIFT_COURSES, driftTargets } = await import('./races');
    for (let d = 3; d < 60; d += 3) {
      const r = raceForDay(d)!;
      expect(r.kind).toBe(d % 6 === 3 ? 'rally' : 'drift');
      expect((r.kind === 'rally' ? RALLY_COURSES : DRIFT_COURSES).includes(r.course)).toBe(true);
      expect(r.prize.gold).toBeGreaterThan(r.prize.silver);
      if (r.kind === 'drift') {
        const t = driftTargets(r);
        expect(t.gold > t.silver && t.silver > t.bronze && t.bronze > 0).toBe(true);
      }
    }
    // Rallye: Sollzeit auf Schotter langsamer als dieselbe Länge auf Asphalt wäre – endlich und plausibel
    const rally = raceForDay(3)!;
    const t = raceTargets(rally);
    expect(Number.isFinite(t.gold) && t.gold > 60).toBe(true);
  });

  it('Driftpunkte: Winkel × Tempo, Kombo wächst, Kette wird nach einer Pause gutgeschrieben, Anstoßen kostet sie', async () => {
    const { newDriftScore, driftStep, driftTotal } = await import('./races');
    const d = newDriftScore();
    for (let i = 0; i < 600; i++) driftStep(d, 30, 60, true, 1 / 60); // 10 s Drift
    expect(d.combo).toBe(3);
    expect(d.chain).toBeGreaterThan(18 * 10);
    for (let i = 0; i < 90; i++) driftStep(d, 0, 60, true, 1 / 60); // Pause > 1,2 s
    expect(d.chain).toBe(0);
    const banked = d.banked;
    expect(banked).toBeGreaterThan(300);
    for (let i = 0; i < 120; i++) driftStep(d, 40, 70, true, 1 / 60);
    driftStep(d, 40, 70, false, 1 / 60); // Leitplanke
    expect(d.chain).toBe(0);
    expect(d.lost).toBeGreaterThan(0);
    expect(driftTotal(d)).toBe(Math.round(banked));
    // zu langsam oder zu wenig Winkel zählt nicht
    const e = newDriftScore();
    driftStep(e, 8, 80, true, 1);
    driftStep(e, 40, 20, true, 1);
    expect(e.chain).toBe(0);
  });

  it('Wetter macht Sollzeiten langsamer (Regentag) als bei Trockenheit', () => {
    let wet = 0;
    for (let d = 1; d < 40; d++) if (d % 3 && weatherOf(d) === 'rain') { wet = d; break; }
    const r = raceForDay(wet)!;
    expect(raceTargets(r).gold).toBeGreaterThan(raceTargets({ course: r.course, cls: r.cls }).gold);
  });
});

describe('Schwierigkeitsgrade bei Rennen gegen Gegner', () => {
  it('Gegner fahren je Stufe langsamer bzw. schneller; Preisgeld halb, voll, zweieinhalbfach', async () => {
    const { opponentFor, opponentSpec, racePrize, DIFFICULTIES } = await import('./races');
    let day = 5;
    let r = raceForDay(day);
    while (!r || r.kind !== 'grid') r = raceForDay(++day);
    const best = (d: (typeof DIFFICULTIES)[number]) => Math.min(...r!.opponents.map((o) => { const oo = opponentFor(o, d); return aiTime(opponentSpec(r!.cls, oo, d), courseOf(r!.course), undefined, true, oo.skill); }));
    const [easy, medium, hard] = DIFFICULTIES.map(best);
    expect(Number.isFinite(hard)).toBe(true);
    expect(easy).toBeGreaterThan(medium * 1.04);
    expect(medium).toBeGreaterThan(hard * 1.01);
    // Schwer: schneller als die Goldzeit eines Zeitrennens auf derselben Strecke und Klasse
    expect(hard).toBeLessThan(raceTargets({ course: r.course, cls: r.cls }).gold);
    expect(racePrize(r, 'easy').gold).toBe(Math.round((r.prize.gold * 0.5) / 50) * 50);
    expect(racePrize(r, 'hard').gold).toBe(Math.round((r.prize.gold * 2.5) / 50) * 50);
    // Platz 1 auf Schwer zahlt das Zweieinhalbfache, auf Leicht danach nur die Differenz (nichts, wenn schon mehr gezahlt)
    expect(payoutFor(r, 100, 0, 1, undefined, 'hard').payout).toBe(racePrize(r, 'hard').gold);
    expect(payoutFor(r, 100, racePrize(r, 'hard').gold, 1, undefined, 'easy').payout).toBe(0);
  });

  it('Rennen gegen Gegner sind häufiger als Zeitrennen', () => {
    const days = Array.from({ length: 300 }, (_, i) => raceForDay(i + 4)).filter((r) => r && (r.kind === 'grid' || r.kind === 'time'));
    const grid = days.filter((r) => r!.kind === 'grid').length;
    expect(grid / days.length).toBeGreaterThan(0.65);
  });
});
