import { describe, expect, it } from 'vitest';
import { COMPONENT_MAP } from './data/components';
import { createCar, generateListings, inspectListing, makeOffer, sellerFloor, starterListing, valuate } from './market';
import * as r from './repair';
import type { CarInstance, Inventory, ToolId } from './types';

const rng = () => {
  let s = 42;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
};
const inv = (): Inventory => ({ ignition_coil: 0, brake_pads: 0, valve_cover_gasket: 0 });

function unbolt(car: CarInstance, id: string, tool: ToolId) {
  car.components[id].bolts.forEach((_, i) => expect(r.boltAction(car, id, i, tool).ok).toBe(true));
}
const remove = (car: CarInstance, i: Inventory, id: string) => {
  const def = COMPONENT_MAP[id];
  if (def.bolts) unbolt(car, id, def.boltTool);
  expect(r.componentAction(car, i, id, 'hand').ok).toBe(true);
};
const install = (car: CarInstance, i: Inventory, id: string) => {
  expect(r.componentAction(car, i, id, 'hand').ok).toBe(true);
  if (COMPONENT_MAP[id].bolts) unbolt(car, id, COMPONENT_MAP[id].boltTool);
};

describe('Reparatur', () => {
  it('verlangt Zugang, richtiges Werkzeug und Reihenfolge', () => {
    const car = createCar('bavaria_320', ['coil', 'brakes', 'gasket'], rng());
    expect(r.boltAction(car, 'coil1', 0, 'ratchet').ok).toBe(false); // Haube zu
    r.toggleHood(car);
    expect(r.boltAction(car, 'coil1', 0, 'wheelWrench').ok).toBe(false);
    expect(r.boltAction(car, 'valve_cover', 0, 'ratchet').ok).toBe(false); // Spulen im Weg
    expect(r.componentAction(car, inv(), 'coil1', 'hand').ok).toBe(false); // Schraube noch drin
    expect(r.boltAction(car, 'wheel_fl', 0, 'wheelWrench').ok).toBe(false); // nicht angehoben
  });

  it('kompletter Reparaturdurchlauf behebt alle drei Defekte', () => {
    const car = createCar('bavaria_320', ['coil', 'brakes', 'gasket'], rng());
    const i = inv();
    expect(r.activeDefects(car).sort()).toEqual(['brakes', 'coil', 'gasket']);
    expect(r.obdScan(car).length).toBe(2);

    r.toggleHood(car);
    const coils = ['coil1', 'coil2', 'coil3', 'coil4'];
    coils.forEach((c) => remove(car, i, c));
    remove(car, i, 'valve_cover');
    remove(car, i, 'gasket');

    // Ohne Neuteil: Hinweis auf fehlendes Teil
    expect(r.componentAction(car, i, 'gasket', 'hand').needsPart).toBe('valve_cover_gasket');
    // Deckel darf nicht vor der Dichtung drauf
    expect(r.componentAction(car, i, 'valve_cover', 'hand').ok).toBe(false);
    i.valve_cover_gasket = 1;
    i.ignition_coil = 1;
    i.brake_pads = 2;
    install(car, i, 'gasket');
    install(car, i, 'valve_cover');
    coils.forEach((c) => install(car, i, c));
    expect(i.ignition_coil).toBe(0); // nur die defekte Spule verbraucht ein Neuteil
    expect(i.valve_cover_gasket).toBe(0);

    r.toggleLift(car);
    for (const s of ['fl', 'fr']) {
      remove(car, i, `wheel_${s}`);
      expect(r.toggleLift(car).ok).toBe(false); // nicht ohne Räder ablassen
      remove(car, i, `caliper_${s}`);
      remove(car, i, `pads_${s}`);
      install(car, i, `pads_${s}`);
      install(car, i, `caliper_${s}`);
      install(car, i, `wheel_${s}`);
    }
    expect(r.driveBlocker(car)).not.toBeNull();
    expect(r.toggleLift(car).ok).toBe(true);
    expect(r.driveBlocker(car)).toBeNull();
    expect(r.activeDefects(car)).toEqual([]);
    expect(r.obdScan(car)).toEqual([]);

    car.testDriven = true;
    const v = valuate(car);
    expect(v.deductions).toEqual([]);
    expect(v.haggleOffer).toBeGreaterThan(v.offer);
  });

  it('Altteil kann notfalls wieder eingebaut werden', () => {
    const car = createCar('bavaria_320', ['gasket'], rng());
    const i = inv();
    r.toggleHood(car);
    ['coil1', 'coil2', 'coil3', 'coil4', 'valve_cover', 'gasket'].forEach((c) => remove(car, i, c));
    expect(r.componentAction(car, i, 'gasket', 'hand', { useOldPart: true }).ok).toBe(true);
    expect(r.activeDefects(car)).toEqual(['gasket']);
  });
});

describe('Markt', () => {
  it('Startangebot ist mit 6.000 € bezahlbar und lohnt sich', () => {
    const l = starterListing(rng());
    expect(l.asking).toBeLessThanOrEqual(6000);
    const fixed = createCar('bavaria_320', [], rng(), { year: 2007, km: 189000, testDriven: true });
    expect(valuate(fixed).offer).toBeGreaterThan(l.asking + 500);
  });

  it('Untersuchen senkt die Schmerzgrenze, Verhandeln funktioniert', () => {
    const l = starterListing(rng());
    const before = sellerFloor(l);
    ['listen', 'hood', 'brakes'].forEach((c) => inspectListing(l, c));
    expect(l.hints.length).toBe(3);
    expect(sellerFloor(l)).toBeLessThan(before);
    expect(makeOffer(l, 2000).accepted).toBe(false);
    expect(l.current).toBeLessThan(l.asking);
    expect(makeOffer(l, sellerFloor(l)).accepted).toBe(true);
  });

  it('Verkäufer macht nach zu vielen Versuchen dicht', () => {
    const l = starterListing(rng());
    for (let n = 0; n < 6; n++) makeOffer(l, 1000);
    expect(l.closed).toBe(true);
    expect(makeOffer(l, l.current - 50).accepted).toBe(false);
    expect(makeOffer(l, l.current).accepted).toBe(true);
  });

  it('es gibt immer drei Angebote, mindestens eines bezahlbar', () => {
    const g = rng();
    for (const money of [1500, 4000, 9000, 30000]) {
      for (let n = 0; n < 30; n++) {
        const ls = generateListings(money, g);
        expect(ls.length).toBe(3);
        expect(ls.some((l) => l.asking <= money)).toBe(true);
      }
    }
  });
});
