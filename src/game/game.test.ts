import { describe, expect, it } from 'vitest';
import { COMPONENTS, COMPONENT_MAP } from './data/components';
import { DEFECTS, DEFECT_LIST } from './data/defects';
import { PARTS } from './data/parts';
import { SELLERS } from './data/sellers';
import { SYMPTOMS } from './data/symptoms';
import { causeStatus, obdScan, observe, possibleCauses, presentSymptoms, soundProfile } from './diagnosis';
import { billJob, createJobOffer, JOB_TEMPLATES } from './jobs';
import { createCar, createListing, fillListings, inspectListing, makeOffer, nextMarketIndex, refreshListings, starterListing, valuate } from './market';
import * as r from './repair';
import { normalizeCar } from './store';
import type { CarInstance, DefectId, Inventory, ToolId, ToolNeed, Toolset } from './types';

const rng = (seed = 42) => {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
};
const inv = (n = 0): Inventory => Object.fromEntries(Object.keys(PARTS).map((p) => [p, n])) as Inventory;
const ALL: ToolId[] = ['ratchet', 'torque', 'wrench', 'screwdriver', 'obd', 'socket10', 'socket13', 'socket16', 'socket17'];
const HAND: Toolset = { active: 'hand', carried: ALL };
const LAMP: Toolset = { active: 'lamp', carried: [] };
const driver = (need: ToolNeed | undefined, tighten = false): Toolset => ({
  active: !need ? 'hand' : need.torque && tighten ? 'torque' : need.driver,
  carried: ALL,
});

/** Komplett ausbauen: Schrauben lösen, herausdrehen, Stecker ab, Teil heraus. */
const remove = (car: CarInstance, i: Inventory, id: string) => {
  const def = COMPONENT_MAP[id];
  car.components[id].bolts.forEach((_, k) => {
    expect(r.boltAction(car, id, k, driver(def.fastener)).ok).toBe(true);
    expect(car.components[id].bolts[k]).toBe(1);
    expect(r.boltAction(car, id, k, HAND).ok).toBe(true);
  });
  if (def.connector) expect(r.connectorAction(car, id, HAND).ok).toBe(true);
  expect(r.componentAction(car, i, id, driver(def.removeWith)).ok, id).toBe(true);
};
/** Komplett einbauen: Teil, Schrauben ansetzen und festziehen, Stecker drauf. */
const install = (car: CarInstance, i: Inventory, id: string) => {
  const def = COMPONENT_MAP[id];
  expect(r.componentAction(car, i, id, driver(def.removeWith)).ok, id).toBe(true);
  car.components[id].bolts.forEach((_, k) => {
    expect(r.boltAction(car, id, k, HAND).ok).toBe(true);
    expect(r.boltAction(car, id, k, driver(def.fastener, true)).ok).toBe(true);
  });
  if (def.connector) expect(r.connectorAction(car, id, HAND).ok).toBe(true);
};
function removeDeep(car: CarInstance, i: Inventory, id: string, order: string[]) {
  if (!car.components[id].installed) return;
  COMPONENT_MAP[id].blockedBy.forEach((b) => removeDeep(car, i, b, order));
  remove(car, i, id);
  order.push(id);
}
/** Tauscht alle defekten Bauteile eines Defekts und baut alles wieder zusammen. */
function fix(car: CarInstance, i: Inventory, d: DefectId) {
  for (const t of DEFECTS[d].components.filter((c) => car.components[c].condition === 'defect')) {
    const lifted = COMPONENT_MAP[t].access === 'lifted';
    if (lifted !== car.lifted) {
      if (car.hoodOpen) r.toggleHood(car);
      expect(r.toggleLift(car).ok).toBe(true);
    }
    if (!lifted && !car.hoodOpen) r.toggleHood(car);
    const order: string[] = [];
    removeDeep(car, i, t, order);
    order.reverse().forEach((id) => install(car, i, id));
  }
  if (car.lifted) expect(r.toggleLift(car).ok).toBe(true);
}

describe('Schrauben, Stecker, Werkzeuge', () => {
  it('Schraube: fest → gelöst (Werkzeug) → entfernt (Hand) und zurück', () => {
    const car = createCar('bavaria_320', [], rng());
    r.toggleHood(car);
    const i = inv();
    remove(car, i, 'engine_cover');
    const ratchet: Toolset = { active: 'ratchet', carried: ['ratchet', 'socket10'] };
    expect(r.boltAction(car, 'coil1', 0, HAND).ok).toBe(false); // sitzt fest
    expect(r.boltAction(car, 'coil1', 0, { active: 'ratchet', carried: ['ratchet'] }).message).toContain('Stecknuss 10');
    expect(r.boltAction(car, 'coil1', 0, { active: 'wrench', carried: ALL }).ok).toBe(false);
    expect(r.boltAction(car, 'coil1', 0, ratchet).ok).toBe(true);
    expect(car.components.coil1.bolts[0]).toBe(1);
    expect(r.componentAction(car, i, 'coil1', HAND).ok).toBe(false); // Schraube noch drin
    expect(r.boltAction(car, 'coil1', 0, HAND).ok).toBe(true);
    expect(car.components.coil1.bolts[0]).toBe(0);
    expect(r.componentAction(car, i, 'coil1', HAND).message).toContain('Stecker'); // Stecker noch dran
    expect(r.connectorAction(car, 'coil1', ratchet).ok).toBe(false); // Stecker nur von Hand
    expect(r.connectorAction(car, 'coil1', HAND).ok).toBe(true);
    expect(r.componentAction(car, i, 'coil1', HAND).ok).toBe(true);
  });

  it('Reihenfolge: Abdeckung vor Spule, Spulen vor Ventildeckel, Zugang nur mit offener Haube', () => {
    const car = createCar('bavaria_320', [], rng());
    const ratchet = driver(COMPONENT_MAP.coil1.fastener);
    expect(r.boltAction(car, 'coil1', 0, ratchet).message).toContain('Motorhaube');
    r.toggleHood(car);
    expect(r.boltAction(car, 'coil1', 0, ratchet).message).toContain('Motorabdeckung');
    expect(r.connectorAction(car, 'coil1', HAND).ok).toBe(false);
    remove(car, inv(), 'engine_cover');
    expect(r.boltAction(car, 'valve_cover', 0, ratchet).ok).toBe(false);
    expect(r.boltAction(car, 'wheel_fl', 0, driver(COMPONENT_MAP.wheel_fl.fastener)).ok).toBe(false); // nicht angehoben
    r.toggleHood(car);
    r.toggleLift(car);
    expect(r.toggleHood(car).ok).toBe(false); // angehoben keine Motorarbeit
  });

  it('Radschrauben: Ratsche löst und setzt an, festgezogen wird mit dem Drehmomentschlüssel', () => {
    const car = createCar('bavaria_320', [], rng());
    r.toggleLift(car);
    const ratchet: Toolset = { active: 'ratchet', carried: ['ratchet', 'socket17', 'torque'] };
    const torque: Toolset = { ...ratchet, active: 'torque' };
    expect(r.boltAction(car, 'wheel_fl', 0, torque).ok).toBe(false); // nicht zum Lösen
    expect(r.boltAction(car, 'wheel_fl', 0, ratchet).ok).toBe(true);
    expect(r.boltAction(car, 'wheel_fl', 0, ratchet).message).toContain('Drehmomentschlüssel'); // nur handfest
    expect(r.toggleLift(car).ok).toBe(false); // lose Radschraube: nicht ablassen
    expect(r.boltAction(car, 'wheel_fl', 0, torque).ok).toBe(true);
    expect(car.components.wheel_fl.bolts[0]).toBe(2);
    expect(r.toggleLift(car).ok).toBe(true);
  });
});

describe('Reparatur', () => {
  it('jeder Defekt lässt sich einzeln beheben und das Auto wieder komplett montieren', () => {
    for (const d of DEFECT_LIST) {
      const car = createCar('bavaria_320', [d.id], rng());
      const i = inv(4);
      expect(r.activeDefects(car)).toEqual([d.id]);
      fix(car, i, d.id);
      expect(r.activeDefects(car), d.id).toEqual([]);
      expect(r.isAssembled(car), d.id).toBe(true);
      expect(car.partsSpent, d.id).toBeGreaterThan(0);
      expect(presentSymptoms(car), d.id).toEqual([]);
    }
  });

  it('alle Defekte zusammen: abzugsfrei erst nach Reparatur und Probefahrt', () => {
    const all = DEFECT_LIST.map((d) => d.id);
    const car = createCar('bavaria_320', all, rng());
    const i = inv(8);
    expect(valuate(car).deductions.length).toBe(all.length + 1);
    all.forEach((d) => fix(car, i, d));
    expect(r.driveBlocker(car)).toBeNull();
    expect(obdScan(car)).toEqual([]);
    car.testDriven = true;
    expect(valuate(car).deductions).toEqual([]);
  });

  it('ohne Neuteil: Hinweis, Altteil kann notfalls wieder rein', () => {
    const car = createCar('bavaria_320', ['belt'], rng());
    const i = inv();
    r.toggleHood(car);
    remove(car, i, 'belt');
    const wrench = driver(COMPONENT_MAP.belt.removeWith);
    expect(r.componentAction(car, i, 'belt', wrench).needsPart).toBe('belt');
    expect(r.componentAction(car, i, 'belt', wrench, { useOldPart: true }).ok).toBe(true);
    expect(r.activeDefects(car)).toEqual(['belt']);
  });

  it('Motor startet nicht mit demontierten Motorteilen, wohl aber ohne Räder', () => {
    const car = createCar('bavaria_320', [], rng());
    r.toggleLift(car);
    remove(car, inv(), 'wheel_fl');
    expect(r.engineBlocker(car)).toBeNull();
    remove(car, inv(), 'oil_pan');
    expect(r.engineBlocker(car)).toContain('Ölwanne');
  });
});

describe('Diagnose', () => {
  it('Defekte sind gespeichert, aber dem Spieler zunächst unbekannt', () => {
    const car = createCar('bavaria_325', ['bearing', 'coil'], rng());
    expect(r.activeDefects(car).sort()).toEqual(['bearing', 'coil']);
    expect(r.knownDefects(car)).toEqual([]);
    expect(car.observed).toEqual([]);
  });

  it('OBD verrät keinen mechanischen Schaden und nennt bei Aussetzern nur den Zylinder', () => {
    const mech = createCar('bavaria_325', ['bearing', 'lifters', 'chain', 'gasket', 'oil_pan', 'water_pump', 'coolant_hose', 'discs'], rng());
    expect(obdScan(mech)).toEqual([]);
    const coil = createCar('bavaria_320', ['coil'], rng(1));
    const plug = createCar('bavaria_320', ['plugs'], rng(1));
    expect(obdScan(coil).length).toBe(1);
    expect(obdScan(coil)[0].slice(0, 4)).toBe('P030');
    expect(obdScan(plug)[0].slice(0, 4)).toBe('P030'); // gleicher Code – Spule oder Kerze?
    expect(r.knownDefects(coil)).toEqual([]); // der Code allein bestätigt kein Bauteil
  });

  it('Symptome zeigen sich je nach Untersuchung, warme erst bei warmem Motor', () => {
    const car = createCar('bavaria_325', ['bearing'], rng());
    expect(observe(car, ['idle', 'sound', 'dash'], false).added).toEqual([]); // kalt: nichts zu hören
    expect(observe(car, ['idle', 'sound', 'dash'], true).added.map((s) => s.id)).toEqual(['metal_noise']);
    expect(observe(car, ['rev'], true).added.map((s) => s.id)).toEqual(['knock_load']);
    expect(car.observed.sort()).toEqual(['knock_load', 'metal_noise']);
  });

  it('ein Symptom hat mehrere mögliche Ursachen, die der Spieler eingrenzt', () => {
    expect(possibleCauses('rough_idle').map((d) => d.id).sort()).toEqual(['coil', 'plugs', 'vacuum']);
    expect(possibleCauses('metal_noise').map((d) => d.id).sort()).toEqual(['bearing', 'chain', 'lifters']);
    expect(possibleCauses('coolant_wet').map((d) => d.id).sort()).toEqual(['coolant_hose', 'water_pump']);
    DEFECT_LIST.forEach((d) => d.symptoms.forEach((s) => expect(SYMPTOMS[s], `${d.id}:${s}`).toBeTruthy()));

    const car = createCar('bavaria_318', ['vacuum'], rng());
    r.toggleHood(car);
    const vac = DEFECTS.vacuum;
    expect(causeStatus(car, vac)).toBe('open');
    r.componentAction(car, inv(), 'intake_hose', LAMP); // Sichtprüfung findet den Riss
    expect(causeStatus(car, vac)).toBe('confirmed');
    // Spule eingebaut: von außen nichts zu sehen
    remove(car, inv(), 'engine_cover');
    r.componentAction(car, inv(), 'coil1', LAMP);
    expect(car.components.coil1.known).toBe(false);
    remove(car, inv(), 'coil1'); // ausgebaut und begutachtet
    expect(car.components.coil1.known).toBe(true);
    expect(causeStatus(car, DEFECTS.coil)).toBe('open'); // drei Spulen noch ungeprüft
  });

  it('nach der Reparatur verschwindet das Symptom aus der Akte', () => {
    const car = createCar('bavaria_320', ['belt'], rng());
    observe(car, ['idle', 'sound', 'dash'], false);
    expect(car.observed.sort()).toEqual(['battery_lamp', 'squeal']);
    fix(car, inv(2), 'belt');
    const o = observe(car, ['idle', 'sound', 'dash'], false);
    expect(o.gone.length).toBe(2);
    expect(car.observed).toEqual([]);
  });

  it('Motorklang hängt am technischen Zustand', () => {
    const quiet = createCar('bavaria_320', [], rng());
    expect(Object.values(soundProfile(quiet)).every((v) => v === 0)).toBe(true);
    const car = createCar('bavaria_320', ['coil', 'belt', 'bearing', 'lifters', 'chain', 'vacuum'], rng());
    const p = soundProfile(car);
    expect([p.misfire, p.squeal, p.knock, p.tick, p.rattle, p.hiss].every((v) => v > 0)).toBe(true);
    fix(car, inv(4), 'belt');
    expect(soundProfile(car).squeal).toBe(0);
    expect(soundProfile(car).knock).toBe(1);
  });
});

describe('Markt und Verhandlung', () => {
  it('Besichtigung zeigt Symptome, nie den Defekt; Startangebot lohnt sich', () => {
    const l = starterListing(rng());
    expect(l.asking).toBeLessThanOrEqual(6000);
    const text = ['listen', 'dash', 'hood', 'under', 'brakes', 'drive'].map((c) => inspectListing(l, c)).join(' ');
    for (const d of DEFECT_LIST) expect(text).not.toContain(d.name);
    expect(l.hints.length).toBeGreaterThanOrEqual(4);
    expect(r.knownDefects(l.car)).toEqual([]);
    const fixed = createCar('bavaria_320', [], rng(), { year: 2007, km: 189000, testDriven: true });
    expect(valuate(fixed).offer).toBeGreaterThan(l.asking + 500);
  });

  it('nur selbst bemerkte Mängel zählen als Argument – und jedes nur einmal', () => {
    const l = starterListing(rng());
    const floor0 = l.minPrice;
    makeOffer(l, 100, ['rough_idle']); // nicht bemerkt -> wirkungslos
    expect(l.minPrice).toBe(floor0);
    expect(l.usedArgs).toEqual([]);
    const l2 = starterListing(rng());
    inspectListing(l2, 'listen');
    makeOffer(l2, l2.minPrice - 50, ['rough_idle']);
    const floor1 = l2.minPrice;
    expect(floor1).toBeLessThan(floor0);
    makeOffer(l2, floor1 - 400, ['rough_idle', 'misfire']); // gleicher Defekt dahinter: kein zweiter Nachlass
    expect(l2.minPrice).toBe(floor1);
  });

  it('Verkäufertypen reagieren verschieden; wer alles weiß, lässt sich kaum drücken', () => {
    const mk = (profile: string) => {
      const car = createCar('bavaria_325', ['coil', 'gasket', 'belt'], rng(7), { year: 2008, km: 170000 });
      const l = createListing(car, rng(7), 1, SELLERS[profile]);
      ['listen', 'dash', 'hood', 'under'].forEach((c) => inspectListing(l, c));
      const before = l.minPrice;
      makeOffer(l, 1, l.hints);
      return { asking: l.asking, drop: before - l.minPrice };
    };
    const naive = mk('private');
    const expert = mk('tinkerer');
    expect(expert.asking).toBeLessThan(naive.asking); // Schrauber hat die Mängel eingepreist
    expect(naive.drop).toBeGreaterThan(expert.drop * 3); // und gibt auf Argumente kaum nach
  });

  it('annehmen, Gegenangebot, letztes Wort, Abbruch – und nie ein Geschenk', () => {
    const l = starterListing(rng());
    ['listen', 'dash', 'hood', 'under', 'brakes', 'drive'].forEach((c) => inspectListing(l, c));
    const first = makeOffer(l, 3300, l.hints);
    expect(first.accepted).toBe(false);
    expect(l.current).toBeLessThan(l.asking); // Gegenangebot
    expect(l.minPrice).toBeGreaterThanOrEqual(l.asking * 0.7); // Untergrenze trotz aller Argumente
    expect(makeOffer(l, l.minPrice).accepted).toBe(true);

    const stubborn = starterListing(rng());
    for (let n = 0; n < 8 && !stubborn.gone; n++) makeOffer(stubborn, 500);
    expect(stubborn.closed).toBe(true);
    expect(stubborn.gone).toBe(true); // nach Frechheiten bricht er ab
    expect(makeOffer(stubborn, stubborn.asking).accepted).toBe(false);
    expect(fillListings([stubborn], 6000, rng()).some((x) => x.id === stubborn.id)).toBe(false);
  });

  it('Markt bleibt gefüllt und bezahlbar, Marktlage wirkt auf Preise', () => {
    const g = rng();
    let index = 1;
    for (const money of [1500, 4000, 9000, 30000]) {
      let ls = fillListings([], money, g, index);
      for (let n = 0; n < 25; n++) {
        index = nextMarketIndex(index, g);
        expect(index).toBeGreaterThanOrEqual(0.85);
        expect(index).toBeLessThanOrEqual(1.15);
        ls = refreshListings(ls, money, g, index);
        expect(ls.length).toBe(4);
        expect(ls.some((l) => l.asking <= money)).toBe(true);
      }
    }
    const good = createCar('bavaria_320', [], rng(), { testDriven: true });
    expect(valuate(good, 1.1).offer).toBeGreaterThan(valuate(good, 0.9).offer);
  });
});

describe('Kundenaufträge', () => {
  it('bezahlt wird erst, wenn die tatsächliche Ursache behoben und das Auto komplett ist', () => {
    const g = rng(3);
    for (let n = 0; n < 25; n++) {
      const { car } = createJobOffer(g);
      const job = car.job!;
      expect(job.complaint.length).toBeGreaterThan(10);
      expect(billJob(car).done).toBe(false);
      const i = inv(6);
      job.required.forEach((d) => fix(car, i, d));
      const bill = billJob(car);
      expect(bill.done, job.category).toBe(true);
      expect(bill.total).toBeGreaterThan(job.fee);
      expect(bill.profit).toBeGreaterThanOrEqual(job.fee);
    }
    expect(new Set(JOB_TEMPLATES.map((t) => t.category)).size).toBeGreaterThanOrEqual(5);
  });

  it('halb zerlegt oder nur Nebensache repariert: nicht abrechenbar; Zusatzarbeit wird bezahlt', () => {
    const car = createCar('bavaria_318', ['coil', 'belt'], rng());
    car.job = { id: 'j', customer: 'Frau Test', complaint: 'ruckelt', category: 'Motorproblem', fee: 130, required: ['coil'], initial: ['coil', 'belt'] };
    const i = inv(4);
    fix(car, i, 'belt');
    expect(billJob(car).done).toBe(false);
    if (!car.hoodOpen) r.toggleHood(car);
    remove(car, i, 'engine_cover');
    expect(billJob(car).problems.length).toBe(2);
    install(car, i, 'engine_cover');
    fix(car, i, 'coil');
    const bill = billJob(car);
    expect(bill.done).toBe(true);
    expect(bill.lines.some((l) => l.label.includes('Zusatzarbeit'))).toBe(true);
  });
});

describe('Spielstand', () => {
  it('Autos aus älteren Versionen bekommen fehlende Bauteile und Felder, nichts geht verloren', () => {
    const b = (n: number, v: boolean = true) => ({ installed: true, bolts: Array(n).fill(v), condition: 'ok', known: false });
    const old: any = {
      uid: 'old', modelId: 'bavaria_320', color: '#fff', year: 2007, km: 189000, cleanValue: 7800,
      hoodOpen: true, lifted: false, purchasePrice: 4600, partsSpent: 49, testDriven: false, haggled: false, obdCodes: null,
      components: {
        coil1: b(1), coil2: { ...b(1, false), installed: false }, coil3: { ...b(1), condition: 'defect', known: true }, coil4: b(1),
        valve_cover: { installed: true, bolts: [true, true, false, false, true, true], condition: 'ok', known: false },
        gasket: b(0), wheel_fl: b(5), caliper_fl: b(2), pads_fl: b(0), wheel_fr: b(5), caliper_fr: b(2), pads_fr: b(0),
      },
    };
    const car = normalizeCar(old)!;
    expect(Object.keys(car.components).length).toBe(COMPONENTS.length);
    expect(car.components.coil3).toMatchObject({ condition: 'defect', known: true, connected: true, bolts: [2] });
    expect(car.components.coil2).toMatchObject({ installed: false, bolts: [0] });
    expect(car.components.valve_cover.bolts).toEqual([2, 2, 0, 0, 2, 2]); // unterbrochene Reparatur bleibt erhalten
    expect(car.components.engine_cover.installed).toBe(true);
    expect(car.observed).toEqual([]);
    expect(car.purchasePrice).toBe(4600);
    expect(r.activeDefects(car)).toEqual(['coil']);
  });
});
