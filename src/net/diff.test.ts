import { describe, expect, it } from 'vitest';
import { createCar } from '../game/market';
import { useGame } from '../game/store';
import { apply, clean, cleanShared, diff, pickShared, same, SHARED_KEYS, type Shared } from './diff';

const rng = () => 0.42;
const base = (): Shared => {
  const s = useGame.getState();
  const cars = s.cars.map(() => null) as any[];
  cars[0] = createCar('bavaria_330', [], rng, { year: 2010 });
  return JSON.parse(JSON.stringify({ ...pickShared(s as any), cars, money: 10000, inventory: { 'spark_plug@R6': 6 } }));
};
const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe('Koop-Abgleich: Schritte bilden', () => {
  it('gleiche Stände ergeben keine Schritte (auch bei anderer Schlüsselreihenfolge und null/fehlend)', () => {
    const a = base();
    const b = copy(a);
    b.cars[0] = Object.fromEntries(Object.entries(b.cars[0]).reverse());
    b.cars[0].job = null;
    expect(diff(a, b)).toEqual([]);
    expect(same({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(same([null, 1], [undefined, 1])).toBe(true);
    expect(same([1], [1, 2])).toBe(false);
  });

  it('Schritt an einem Auto, das hier schon weg ist, erzeugt kein halbes Auto (Absturz im Koop)', () => {
    const a = base();
    const partner = copy(a);
    partner.cars[0].components.coil3.installed = false;
    const p = diff(a, partner);
    const here = copy(a);
    here.cars[0] = null;
    expect(apply(here, p).cars[0]).toBeNull();
    // steht das Auto noch da, kommt der Schritt an
    expect(apply(copy(a), p).cars[0].components.coil3.installed).toBe(false);
  });

  it('ein ausgebautes Bauteil ist genau ein kleiner Schritt', () => {
    const a = base();
    const b = copy(a);
    b.cars[0].components.coil3.installed = false;
    const p = diff(a, b);
    expect(p).toHaveLength(1);
    expect(p[0].path).toEqual(['cars', '0', 'components', 'coil3']);
    expect(p[0].before).toEqual(a.cars[0].components.coil3);
    expect(JSON.stringify(p).length).toBeLessThan(400);
  });

  it('Motor und Bremse am selben Auto sind getrennte Pfade', () => {
    const a = base();
    const mine = copy(a);
    const theirs = copy(a);
    mine.cars[0].components.coil1.connected = false;
    theirs.cars[0].components.wheel_fl.installed = false;
    const pm = diff(a, mine);
    const pt = diff(a, theirs);
    expect(pm[0].path.join('/')).not.toBe(pt[0].path.join('/'));
    // Beide Änderungen lassen sich nacheinander anwenden
    const merged = apply(apply(a, pm), pt);
    expect(merged.cars[0].components.coil1.connected).toBe(false);
    expect(merged.cars[0].components.wheel_fl.installed).toBe(false);
  });

  it('Kauf: Geld, Stellplatz und Inseratliste in einer Änderung', () => {
    const a = base();
    const b = copy(a);
    b.money = 2000;
    b.cars[1] = createCar('bavaria_318', [], rng, { year: 2008 });
    b.listings = [{ id: 'x' }];
    const p = diff(a, b, { listings: 7 });
    expect(p.map((x) => x.path.join('/')).sort()).toEqual(['cars/1', 'listings', 'money']);
    expect(p.find((x) => x.path[0] === 'listings')).toMatchObject({ ver: 7 });
    expect(p.find((x) => x.path[0] === 'listings')!.before).toBeUndefined();
    expect(p.find((x) => x.path[0] === 'money')).toMatchObject({ before: 10000, after: 2000 });
    expect(p.find((x) => x.path[0] === 'cars')!.before).toBeNull();
  });

  it('Lager und Flüssigkeiten je Posten; Haube, Türen und Hebebühne je Feld', () => {
    const a = base();
    const b = copy(a);
    b.inventory['spark_plug@R6'] = 3;
    b.inventory['oil_filter@R6'] = 1;
    b.cars[0].hoodOpen = true;
    b.cars[0].doors = [true, false];
    b.liftUp[1] = true;
    expect(diff(a, b).map((x) => x.path.join('/')).sort()).toEqual(['cars/0/doors', 'cars/0/hoodOpen', 'inventory/oil_filter@R6', 'inventory/spark_plug@R6', 'liftUp/1']);
  });

  it('anwenden stellt den Zielstand her und verändert das Ausgangsobjekt nicht', () => {
    const a = base();
    const frozen = JSON.stringify(a);
    const b = copy(a);
    b.cars[0].components.plug2.condition = 'defect';
    b.cars[0].fluids.oil.level = 1.5;
    b.cars[2] = createCar('veloce_gt', [], rng, {});
    b.money -= 120;
    b.inventory['spark_plug@R6'] = 0;
    b.day = 2;
    delete b.cars[0].job;
    const out = apply(a, diff(a, b));
    expect(same(pickShared(out), b)).toBe(true);
    expect(JSON.stringify(a)).toBe(frozen);
    expect(diff(out, b)).toEqual([]);
  });

  it('null aus der Datenbank wird wie "nicht vorhanden" behandelt; leere Stellplätze bleiben', () => {
    const a = base();
    const withJob = copy(a);
    withJob.cars[0].job = { customer: 'K', required: [] };
    const removed = apply(withJob, diff(withJob, a));
    expect('job' in removed.cars[0]).toBe(false);
    expect(clean({ a: null, b: [null, { c: null, d: 1 }] })).toEqual({ b: [null, { d: 1 }] });
    const s = cleanShared({ ...a, contest: null, extra: 1 });
    expect(s.contest).toBeNull();
    expect(Object.keys(s).sort()).toEqual([...SHARED_KEYS].sort());
  });

  it('ausgelassene Pfade: eigene, noch nicht bestätigte Änderungen gehen beim Einspielen fremder nicht verloren', () => {
    const a = base();
    const theirs = copy(a);
    theirs.money = 9000;
    theirs.cars[0].hoodOpen = true;
    const out = apply(a, diff(a, theirs), new Set(['money']));
    expect(out.money).toBe(10000);
    expect(out.cars[0].hoodOpen).toBe(true);
  });
});

describe('Chat', () => {
  it('Sprechblase bleibt mindestens fünf Sekunden, lange Nachrichten länger', async () => {
    const { bubbleMs } = await import('./coop');
    expect(bubbleMs('Hi')).toBe(5000);
    expect(bubbleMs('x'.repeat(40))).toBe(5600);
    expect(bubbleMs('x'.repeat(160))).toBeGreaterThan(15000);
  });
});

describe('Ausgebauter Motor im Koop-Abgleich', () => {
  it('Ausbau kommt beim Partner an (Merkmal noEngine) und der Motor taucht nicht wieder auf', async () => {
    const { createCar } = await import('../game/market');
    const { extractEngine, insertEngine } = await import('../game/motor');
    const { restoreNoEngine, normalizeCar } = await import('../game/store');
    const { defsOf, hasEngine } = await import('../game/data/components');
    const car = createCar('audy_urquattro', [], () => 0.5, { year: 1985 });
    const before = cleanShared({ cars: [car] } as any);
    const out = structuredClone(car);
    const unit = extractEngine(out);
    const after = cleanShared({ cars: [out] } as any);
    // Schritte über den Server (null in Objekten = fehlt): beim Partner landet motor als „fehlt“
    const partner = apply(before, diff(before, after));
    const pc = (partner as any).cars[0];
    expect(pc.motor).toBeUndefined();
    expect(pc.noEngine).toBe(true);
    // Ohne Reparatur hielte das Spiel das für den Werksmotor – mit Reparatur wieder motorlos, keine Motorteile ergänzt
    expect(hasEngine(pc)).toBe(true);
    const fixed = restoreNoEngine(pc);
    expect(fixed.motor).toBeNull();
    expect(Object.keys(fixed.components).some((id) => unit.components[id])).toBe(false);
    expect(normalizeCar(fixed)!.motor).toBeNull();
    expect(defsOf(fixed).every((d) => !d.engine)).toBe(true);
    // Spielstand, der schon kaputt ist (alte Version: kein Merkmal, Motorteile neu ergänzt): Vermerk motorOut bzw. der Motor
    // liegt am Ständer/im Lager → ebenfalls wieder ohne Motor
    const broken = normalizeCar({ ...pc, noEngine: undefined, motorOut: unit.motor.uid } as any)!;
    expect(broken.motor).toBeUndefined();
    expect(restoreNoEngine(broken).motor).toBeNull();
    const junk = normalizeCar({ ...pc, noEngine: undefined } as any)!;
    expect(restoreNoEngine(junk)).toBe(junk);
    expect(restoreNoEngine(junk, [unit]).motor).toBeNull();
    // Wieder eingebaut: Merkmal weg, Reparatur greift nicht
    const back = structuredClone(out);
    insertEngine(back, unit, [], 5);
    expect(back.noEngine).toBeUndefined();
    expect(restoreNoEngine(back)).toBe(back);
  });
});
