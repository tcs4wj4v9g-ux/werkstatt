import { describe, expect, it } from 'vitest';
import { COMPONENTS, COMPONENT_MAP } from './data/components';
import { DEFECT_LIST } from './data/defects';
import { PARTS } from './data/parts';
import { createCar, fillListings, inspectListing, makeOffer, nextMarketIndex, refreshListings, sellerFloor, starterListing, valuate } from './market';
import * as r from './repair';
import type { CarInstance, DefectId, Inventory, ToolId, ToolNeed, Toolset } from './types';

const rng = () => {
  let s = 42;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
};
const inv = (n = 0): Inventory => Object.fromEntries(Object.keys(PARTS).map((p) => [p, n])) as Inventory;
const ALL: ToolId[] = ['ratchet', 'torque', 'wrench', 'screwdriver', 'obd', 'socket10', 'socket13', 'socket16', 'socket17'];
/** Werkzeugsatz, der zur Anforderung passt (Test trägt der Einfachheit halber alles). */
const kit = (need: ToolNeed | undefined, tightening = false): Toolset => ({
  active: !need ? 'hand' : need.torque && tightening ? 'torque' : need.driver,
  carried: ALL,
});

function turnBolts(car: CarInstance, id: string) {
  const def = COMPONENT_MAP[id];
  car.components[id].bolts.forEach((b, i) => expect(r.boltAction(car, id, i, kit(def.fastener, !b)).ok).toBe(true));
}
const remove = (car: CarInstance, i: Inventory, id: string) => {
  const def = COMPONENT_MAP[id];
  if (def.bolts) turnBolts(car, id);
  expect(r.componentAction(car, i, id, kit(def.removeWith)).ok).toBe(true);
};
const install = (car: CarInstance, i: Inventory, id: string) => {
  const def = COMPONENT_MAP[id];
  expect(r.componentAction(car, i, id, kit(def.removeWith)).ok).toBe(true);
  if (def.bolts) turnBolts(car, id);
};
/** Baut ein Bauteil samt allem, was davor sitzt, aus – und danach in umgekehrter Reihenfolge wieder ein. */
function removeDeep(car: CarInstance, i: Inventory, id: string, order: string[]) {
  if (!car.components[id].installed) return;
  COMPONENT_MAP[id].blockedBy.forEach((b) => removeDeep(car, i, b, order));
  remove(car, i, id);
  order.push(id);
}

describe('Werkzeuge', () => {
  it('verlangt Zugang, richtiges Werkzeug, Stecknuss und Reihenfolge', () => {
    const car = createCar('bavaria_320', ['coil', 'brakes', 'gasket'], rng());
    const ratchet10: Toolset = { active: 'ratchet', carried: ['ratchet', 'socket10'] };
    expect(r.boltAction(car, 'coil1', 0, ratchet10).ok).toBe(false); // Haube zu
    r.toggleHood(car);
    expect(r.boltAction(car, 'coil1', 0, { active: 'ratchet', carried: ['ratchet'] }).message).toContain('Stecknuss 10');
    expect(r.boltAction(car, 'coil1', 0, { active: 'wrench', carried: ['wrench', 'socket10'] }).ok).toBe(false);
    expect(r.boltAction(car, 'valve_cover', 0, ratchet10).ok).toBe(false); // Spulen im Weg
    expect(r.componentAction(car, inv(), 'coil1', { active: 'hand', carried: [] }).ok).toBe(false); // Schraube noch drin
    expect(r.boltAction(car, 'coil1', 0, ratchet10).ok).toBe(true);
    expect(r.boltAction(car, 'wheel_fl', 0, { active: 'ratchet', carried: ['ratchet', 'socket17'] }).ok).toBe(false); // nicht angehoben
  });

  it('Radschrauben: lösen mit Ratsche, anziehen nur mit Drehmomentschlüssel', () => {
    const car = createCar('bavaria_320', [], rng());
    r.toggleLift(car);
    const ratchet: Toolset = { active: 'ratchet', carried: ['ratchet', 'socket17', 'torque'] };
    const torque: Toolset = { active: 'torque', carried: ['ratchet', 'socket17', 'torque'] };
    expect(r.boltAction(car, 'wheel_fl', 0, torque).ok).toBe(false); // nicht zum Lösen
    expect(r.boltAction(car, 'wheel_fl', 0, ratchet).ok).toBe(true);
    expect(r.boltAction(car, 'wheel_fl', 0, ratchet).ok).toBe(false); // nicht zum Anziehen
    expect(r.boltAction(car, 'wheel_fl', 0, torque).ok).toBe(true);
  });

  it('im Motorraum wird nur am abgelassenen Auto gearbeitet', () => {
    const car = createCar('bavaria_320', [], rng());
    r.toggleHood(car);
    r.toggleLift(car);
    expect(r.boltAction(car, 'coil1', 0, kit(COMPONENT_MAP.coil1.fastener)).ok).toBe(false);
  });
});

describe('Reparatur', () => {
  it('jeder Defekt lässt sich einzeln finden, tauschen und wieder zusammenbauen', () => {
    for (const d of DEFECT_LIST) {
      const car = createCar('bavaria_320', [d.id], rng());
      const i = inv(4);
      expect(r.activeDefects(car)).toEqual([d.id]);
      r.toggleHood(car);
      const targets = d.components.filter((c) => car.components[c].condition === 'defect');
      for (const t of targets) {
        if (COMPONENT_MAP[t].access === 'lifted' && !car.lifted) {
          r.toggleHood(car);
          expect(r.toggleLift(car).ok).toBe(true);
        }
        const order: string[] = [];
        removeDeep(car, i, t, order);
        expect(car.components[t].known).toBe(true);
        order.reverse().forEach((id) => install(car, i, id));
      }
      if (car.lifted) expect(r.toggleLift(car).ok).toBe(true);
      expect(r.activeDefects(car), d.id).toEqual([]);
      expect(r.isAssembled(car), d.id).toBe(true);
      expect(car.partsSpent, d.id).toBeGreaterThan(0);
    }
  });

  it('alle zehn Defekte zusammen: Wert ohne Abzüge erst nach Reparatur und Probefahrt', () => {
    const all = DEFECT_LIST.map((d) => d.id) as DefectId[];
    const car = createCar('bavaria_320', all, rng());
    const i = inv(8);
    expect(valuate(car).deductions.length).toBe(all.length + 1);
    r.toggleHood(car);
    const hood = COMPONENTS.filter((c) => c.access === 'hood' && c.partId).map((c) => c.id);
    for (const t of hood) {
      const order: string[] = [];
      removeDeep(car, i, t, order);
      order.reverse().forEach((id) => install(car, i, id));
    }
    r.toggleHood(car);
    r.toggleLift(car);
    for (const t of COMPONENTS.filter((c) => c.access === 'lifted' && c.partId).map((c) => c.id)) {
      const order: string[] = [];
      removeDeep(car, i, t, order);
      order.reverse().forEach((id) => install(car, i, id));
    }
    expect(r.toggleLift(car).ok).toBe(true);
    expect(r.driveBlocker(car)).toBeNull();
    expect(r.activeDefects(car)).toEqual([]);
    expect(r.obdScan(car)).toEqual([]);
    car.testDriven = true;
    const v = valuate(car);
    expect(v.deductions).toEqual([]);
    expect(v.haggleOffer).toBeGreaterThan(v.offer);
  });

  it('ohne Räder lässt sich die Bühne nicht ablassen', () => {
    const car = createCar('bavaria_320', [], rng());
    r.toggleLift(car);
    remove(car, inv(), 'wheel_fl');
    expect(r.toggleLift(car).ok).toBe(false);
  });

  it('ohne Neuteil: Hinweis, Altteil kann notfalls wieder rein', () => {
    const car = createCar('bavaria_320', ['belt'], rng());
    const i = inv();
    r.toggleHood(car);
    remove(car, i, 'belt');
    const wrench = kit(COMPONENT_MAP.belt.removeWith);
    expect(r.componentAction(car, i, 'belt', wrench).needsPart).toBe('belt');
    expect(r.componentAction(car, i, 'belt', wrench, { useOldPart: true }).ok).toBe(true);
    expect(r.activeDefects(car)).toEqual(['belt']);
  });

  it('nicht jeder Defekt ist sofort sichtbar', () => {
    const car = createCar('bavaria_320', ['alternator', 'thermostat', 'water_pump', 'gasket'], rng());
    r.toggleHood(car);
    const lamp: Toolset = { active: 'lamp', carried: [] };
    r.componentAction(car, inv(), 'alternator', lamp);
    r.componentAction(car, inv(), 'thermostat', lamp);
    expect(r.knownDefects(car)).toEqual([]); // elektrisch/innen: Lampe hilft nicht
    r.componentAction(car, inv(), 'water_pump', lamp);
    r.componentAction(car, inv(), 'valve_cover', lamp);
    expect(r.knownDefects(car).sort()).toEqual(['gasket', 'water_pump']);
    expect(r.obdScan(car).length).toBe(2);
    expect(r.knownDefects(car).length).toBe(4);
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
    ['listen', 'hood', 'brakes', 'under', 'dash'].forEach((c) => inspectListing(l, c));
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

  it('Markt bleibt gefüllt und bezahlbar, Marktlage schwankt in Grenzen', () => {
    const g = rng();
    let index = 1;
    for (const money of [1500, 4000, 9000, 30000]) {
      let ls = fillListings([], money, g, index);
      for (let n = 0; n < 30; n++) {
        index = nextMarketIndex(index, g);
        expect(index).toBeGreaterThanOrEqual(0.85);
        expect(index).toBeLessThanOrEqual(1.15);
        ls = refreshListings(ls, money, g, index);
        expect(ls.length).toBe(4);
        expect(ls.some((l) => l.asking <= money)).toBe(true);
      }
    }
  });

  it('Marktlage und Schäden bestimmen den Verkaufspreis', () => {
    const good = createCar('bavaria_320', [], rng(), { testDriven: true });
    const bad = createCar('bavaria_320', ['alternator'], rng(), { year: good.year, km: good.km, testDriven: true });
    expect(valuate(good, 1.1).offer).toBeGreaterThan(valuate(good, 0.9).offer);
    expect(valuate(bad, 1).offer).toBeLessThan(valuate(good, 1).offer);
  });
});
