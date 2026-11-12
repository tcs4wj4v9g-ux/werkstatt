import { describe, expect, it } from 'vitest';
import { COMPONENTS, COMPONENT_MAP } from './data/components';
import { DEFECTS, DEFECT_LIST } from './data/defects';
import { PARTS } from './data/parts';
import { SELLERS } from './data/sellers';
import { SYMPTOMS } from './data/symptoms';
import { causeStatus, obdScan, observe, possibleCauses, presentSymptoms, soundProfile } from './diagnosis';
import { advanceAuction, createAuction, heldMoney, minBid, placeBid } from './auctions';
import { CAR_MODELS } from './data/cars';
import { availableSlots, SLOTS, UPGRADES } from './data/workshop';
import { BODY_ZONES, detailFactor, dirtLevel, paintAction, PAINT_COST, rustLevel, shineLevel, washAction } from './detail';
import { rollEvents } from './events';
import * as fl from './fluids';
import { billJob, createJobOffer, JOB_TEMPLATES } from './jobs';
import { createBarnFind, createCar, createListing, fillListings, inspectListing, makeOffer, nextMarketIndex, refreshListings, starterListing, valuate } from './market';
import * as r from './repair';
import { normalizeCar } from './store';
import type { CarInstance, DefectId, FluidStock, Inventory, ToolId, ToolNeed, Toolset } from './types';

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
const stock = (): FluidStock => ({ oil_5w30: 20, oil_5w40: 20, coolant: 20, brake_fluid: 5 });
/** Frisch gewartetes Auto: alle Flüssigkeiten voll, sauber, entlüftet. */
function service(car: CarInstance) {
  const m = CAR_MODELS[car.modelId];
  car.fluids = {
    oil: { level: m.oilCapacity, quality: 1, product: m.oilSpec, filterFresh: true },
    coolant: { level: m.coolantCapacity, quality: 1, air: false },
    brake: { level: 1, quality: 1, air: false, bled: { fl: false, fr: false } },
  };
  return car;
}
/** Sauber, poliert, rostfrei, Innenraum gereinigt. */
function detail(car: CarInstance) {
  for (const z of Object.values(car.zones)) Object.assign(z, { dirt: 0, step: 0, shine: 1, rust: 0, paint: undefined });
  car.interior = { seats: 0, dash: 0, floor: 0 };
  return car;
}
const mk = (model: string, defects: DefectId[], seed = 42, opts = {}) => service(createCar(model, defects, rng(seed), opts));

function removeDeep(car: CarInstance, i: Inventory, id: string, order: string[]) {
  if (!car.components[id].installed) return;
  COMPONENT_MAP[id].blockedBy.forEach((b) => removeDeep(car, i, b, order));
  // Die Ölwanne kommt erst ab, wenn das Öl abgelassen ist.
  if (id === 'oil_pan' && car.components.drain_plug.installed) {
    remove(car, i, 'drain_plug');
    order.push('drain_plug');
  }
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
  if (car.fluids.oil.level === 0) car.fluids.oil.level = CAR_MODELS[car.modelId].oilCapacity; // wieder aufgefüllt
  if (car.fluids.coolant.air) Object.assign(car.fluids.coolant, { air: false, level: CAR_MODELS[car.modelId].coolantCapacity });
}

describe('Schrauben, Stecker, Werkzeuge', () => {
  it('Schraube: fest → gelöst (Werkzeug) → entfernt (Hand) und zurück', () => {
    const car = mk('bavaria_320', []);
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
    const car = mk('bavaria_320', []);
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
    const car = mk('bavaria_320', []);
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
      const car = mk('bavaria_320', [d.id]);
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
    const car = mk('bavaria_320', all);
    const i = inv(8);
    expect(valuate(car).deductions.filter((d) => d.defect).length).toBe(all.length);
    all.forEach((d) => fix(car, i, d));
    expect(r.driveBlocker(car)).toBeNull();
    expect(obdScan(car)).toEqual([]);
    car.testDriven = true;
    service(car);
    expect(valuate(car).deductions).toEqual([]);
  });

  it('ohne Neuteil: Hinweis, Altteil kann notfalls wieder rein', () => {
    const car = mk('bavaria_320', ['belt']);
    const i = inv();
    r.toggleHood(car);
    remove(car, i, 'belt');
    const wrench = driver(COMPONENT_MAP.belt.removeWith);
    expect(r.componentAction(car, i, 'belt', wrench).needsPart).toBe('belt');
    expect(r.componentAction(car, i, 'belt', wrench, { useOldPart: true }).ok).toBe(true);
    expect(r.activeDefects(car)).toEqual(['belt']);
  });

  it('Motor startet nicht mit demontierten Motorteilen, wohl aber ohne Räder', () => {
    const car = mk('bavaria_320', []);
    r.toggleLift(car);
    remove(car, inv(), 'wheel_fl');
    expect(r.engineBlocker(car)).toBeNull();
    expect(r.componentAction(car, inv(), 'oil_pan', HAND).ok).toBe(false);
    remove(car, inv(), 'drain_plug');
    expect(r.engineBlocker(car)).toContain('Ölablassschraube');
  });
});

describe('Diagnose', () => {
  it('Defekte sind gespeichert, aber dem Spieler zunächst unbekannt', () => {
    const car = mk('bavaria_325', ['bearing', 'coil']);
    expect(r.activeDefects(car).sort()).toEqual(['bearing', 'coil']);
    expect(r.knownDefects(car)).toEqual([]);
    expect(car.observed).toEqual([]);
  });

  it('OBD verrät keinen mechanischen Schaden und nennt bei Aussetzern nur den Zylinder', () => {
    const mech = mk('bavaria_325', ['bearing', 'lifters', 'chain', 'gasket', 'oil_pan', 'water_pump', 'coolant_hose', 'discs']);
    expect(obdScan(mech)).toEqual([]);
    const coil = mk('bavaria_320', ['coil'], 1);
    const plug = mk('bavaria_320', ['plugs'], 1);
    expect(obdScan(coil).length).toBe(1);
    expect(obdScan(coil)[0].slice(0, 4)).toBe('P030');
    expect(obdScan(plug)[0].slice(0, 4)).toBe('P030'); // gleicher Code – Spule oder Kerze?
    expect(r.knownDefects(coil)).toEqual([]); // der Code allein bestätigt kein Bauteil
  });

  it('Symptome zeigen sich je nach Untersuchung, warme erst bei warmem Motor', () => {
    const car = mk('bavaria_325', ['bearing']);
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

    const car = mk('bavaria_318', ['vacuum']);
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
    const car = mk('bavaria_320', ['belt']);
    observe(car, ['idle', 'sound', 'dash'], false);
    expect(car.observed.sort()).toEqual(['battery_lamp', 'squeal']);
    fix(car, inv(2), 'belt');
    const o = observe(car, ['idle', 'sound', 'dash'], false);
    expect(o.gone.length).toBe(2);
    expect(car.observed).toEqual([]);
  });

  it('Motorklang hängt am technischen Zustand', () => {
    const quiet = mk('bavaria_320', []);
    expect(Object.values(soundProfile(quiet)).every((v) => v === 0)).toBe(true);
    const car = mk('bavaria_320', ['coil', 'belt', 'bearing', 'lifters', 'chain', 'vacuum']);
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
    const fixed = mk('bavaria_320', [], 42, { year: 2007, km: 189000, testDriven: true });
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
    const deal = (profile: string) => {
      const car = mk('bavaria_325', ['coil', 'gasket', 'belt'], 7, { year: 2008, km: 170000 });
      const l = createListing(car, rng(7), 1, SELLERS[profile]);
      ['listen', 'dash', 'hood', 'under'].forEach((c) => inspectListing(l, c));
      const before = l.minPrice;
      makeOffer(l, 1, l.hints);
      return { asking: l.asking, drop: before - l.minPrice };
    };
    const naive = deal('private');
    const expert = deal('tinkerer');
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
    const good = mk('bavaria_320', [], 42, { testDriven: true });
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
      expect(billJob(car).done, job.category).toBe(false);
      const i = inv(6);
      job.required.forEach((d) => fix(car, i, d));
      if (job.service === 'oil_change') {
        expect(billJob(car).done).toBe(false); // Wartung noch nicht gemacht
        service(car);
      }
      const bill = billJob(car);
      expect(bill.done, job.category).toBe(true);
      expect(bill.total).toBeGreaterThanOrEqual(job.fee);
    }
    expect(new Set(JOB_TEMPLATES.map((t) => t.category)).size).toBeGreaterThanOrEqual(5);
  });

  it('halb zerlegt oder nur Nebensache repariert: nicht abrechenbar; Zusatzarbeit wird bezahlt', () => {
    const car = mk('bavaria_318', ['coil', 'belt']);
    car.job = { id: 'j', customer: 'Frau Test', complaint: 'ruckelt', category: 'Motorproblem', fee: 130, required: ['coil'], initial: ['coil', 'belt'], approved: ['belt'] };
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
    car.job.approved = [];
    expect(billJob(car).lines.some((l) => l.label.includes('Zusatzarbeit'))).toBe(false); // ohne Freigabe keine Rechnung
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
    // Felder der neuen Version bekommen feste Standardwerte
    expect(car.fluids.oil.level).toBeGreaterThan(2);
    expect(car.components.drain_plug.installed && car.components.battery.condition === 'ok').toBe(true);
    expect(Object.keys(car.zones).length).toBe(6);
    expect(normalizeCar(old)!.fluids).toEqual(car.fluids); // kein Würfeln bei jedem Laden
    expect(car.keep).toBe(false);
    expect(car.purchasePrice).toBe(4600);
    expect(r.activeDefects(car)).toEqual(['coil']);
  });
});

describe('Betriebsflüssigkeiten', () => {
  it('kompletter Ölwechsel: ablassen, Filter, Schraube, richtiges Öl, Stand prüfen', () => {
    const car = createCar('bavaria_325', [], rng());
    car.fluids.oil = { level: 5.2, quality: 0.2, product: 'oil_5w40', filterFresh: false };
    const st = stock();
    const i = inv(2);
    expect(fl.serviceState(car).oilChanged).toBe(false);
    expect(fl.checkFluid(car, 'oil', 1).ok).toBe(false); // Haube zu
    r.toggleHood(car);
    expect(fl.checkFluid(car, 'oil', 1).message).toContain('überaltert');
    expect(car.checked.oil?.level).toBe(5.2);
    // Nachfüllen allein macht altes Öl nicht neu
    fl.addFluid(car, st, 'oil', 'oil_5w40', 1);
    expect(fl.serviceState(car).oilChanged).toBe(false);
    r.toggleHood(car);
    r.toggleLift(car);
    remove(car, i, 'drain_plug');
    expect(car.fluids.oil.level).toBe(0);
    expect(r.engineBlocker(car)).toBeTruthy();
    install(car, i, 'drain_plug');
    r.toggleLift(car);
    r.toggleHood(car);
    remove(car, i, 'oil_filter');
    expect(fl.addFluid(car, st, 'oil', 'oil_5w40', 1).ok).toBe(false); // ohne Filter
    expect(r.componentAction(car, inv(0), 'oil_filter', driver(COMPONENT_MAP.oil_filter.removeWith)).needsPart).toBe('oil_filter'); // alter Filter kommt nicht wieder rein
    install(car, i, 'oil_filter');
    expect(i.oil_filter).toBe(1);
    expect(fl.addFluid(car, st, 'oil', 'coolant', 1).ok).toBe(false); // falscher Behälter
    expect(fl.addFluid(car, st, 'oil', 'oil_5w40', 6.5).ok).toBe(true);
    expect(st.oil_5w40).toBe(12.5); // 1 l vorhin + 6,5 l jetzt
    expect(fl.checkFluid(car, 'oil', 2).message).toContain('in Ordnung');
    expect(fl.serviceState(car).oilChanged).toBe(true);
    expect(r.engineBlocker(car)).toBeNull();
  });

  it('falsches Öl, Überfüllen und leeres Lager haben Folgen', () => {
    const car = mk('bavaria_320', []);
    car.fluids.oil.level = 0;
    r.toggleHood(car);
    const st = stock();
    fl.addFluid(car, st, 'oil', 'oil_5w40', 4.5); // Vierzylinder braucht 5W-30
    expect(fl.serviceState(car).oilOk).toBe(false);
    expect(valuate({ ...car, testDriven: true }).deductions.some((d) => d.label.includes('Motoröl'))).toBe(true);
    expect(fl.addFluid(car, { ...st, oil_5w30: 0 }, 'oil', 'oil_5w30', 1).ok).toBe(false);
    fl.addFluid(car, st, 'oil', 'oil_5w30', 5);
    expect(car.fluids.oil.product).toBe('mixed');
    expect(car.fluids.oil.level).toBeLessThanOrEqual(4.5 * 1.1 + 0.05);
  });

  it('Kühlsystem: Öffnen lässt Kühlmittel ab, danach auffüllen und bei laufendem Motor entlüften', () => {
    const car = mk('bavaria_320', ['water_pump']);
    const i = inv(2);
    const st = stock();
    r.toggleHood(car);
    const order: string[] = [];
    removeDeep(car, i, 'water_pump', order);
    expect(car.fluids.coolant.air).toBe(true);
    expect(fl.fill(car, 'coolant')).toBeLessThan(0.5);
    expect(fl.addFluid(car, st, 'coolant', 'coolant', 5).ok).toBe(false); // System noch offen
    order.reverse().forEach((id) => install(car, i, id));
    expect(fl.fluidSymptoms(car)).toContain('temp_high');
    expect(fl.bleedCoolant(car, true).ok).toBe(false); // erst auffüllen
    fl.addFluid(car, st, 'coolant', 'coolant', 7);
    expect(fl.bleedCoolant(car, false).ok).toBe(false); // Motor muss laufen
    expect(fl.bleedCoolant(car, true).ok).toBe(true);
    expect(fl.fluidSymptoms(car)).not.toContain('temp_high');
    expect(presentSymptoms(car)).toEqual([]);
  });

  it('Bremsflüssigkeit: beide Seiten entlüften, mit Schlüssel, Rad ab, Vorrat nötig', () => {
    const car = mk('bavaria_320', []);
    car.fluids.brake = { level: 0.8, quality: 0.15, air: true, bled: { fl: false, fr: false } };
    expect(presentSymptoms(car)).toEqual(['brake_soft']);
    const st = stock();
    const wrench: Toolset = { active: 'wrench', carried: ['wrench'] };
    expect(fl.bleedBrake(car, st, 'fl', wrench).ok).toBe(false); // nicht angehoben
    r.toggleLift(car);
    expect(fl.bleedBrake(car, st, 'fl', wrench).ok).toBe(false); // Rad dran
    remove(car, inv(), 'wheel_fl');
    remove(car, inv(), 'wheel_fr');
    expect(fl.bleedBrake(car, st, 'fl', HAND).ok).toBe(false);
    expect(fl.bleedBrake(car, { ...st, brake_fluid: 0.2 }, 'fl', wrench).ok).toBe(false);
    expect(fl.bleedBrake(car, st, 'fl', wrench).ok).toBe(true);
    expect(car.fluids.brake.air).toBe(true); // eine Seite reicht nicht
    expect(fl.bleedBrake(car, st, 'fr', wrench).ok).toBe(true);
    expect(car.fluids.brake).toMatchObject({ air: false, quality: 1 });
    expect(st.brake_fluid).toBe(4);
  });

  it('undichte Autos verlieren über Nacht Flüssigkeit; Füllmengen sind je Motor verschieden', () => {
    const car = mk('bavaria_330', ['oil_pan', 'coolant_hose']);
    const before = { ...car.fluids.oil }.level;
    fl.dailyLeaks(car);
    expect(car.fluids.oil.level).toBeLessThan(before);
    expect(car.fluids.coolant.level).toBeLessThan(CAR_MODELS.bavaria_330.coolantCapacity);
    expect(fl.capacity(mk('bavaria_318', []), 'oil')).toBeLessThan(fl.capacity(car, 'oil'));
  });
});

describe('Aufbereitung und Lack', () => {
  const dirty = () => {
    const car = mk('bavaria_320', []);
    for (const z of Object.values(car.zones)) Object.assign(z, { dirt: 0.9, step: 0, shine: 0.3, rust: 0 });
    car.interior = { seats: 0.8, dash: 0.8, floor: 0.8 };
    return car;
  };

  it('Waschen braucht die richtige Reihenfolge je Bereich', () => {
    const car = dirty();
    expect(washAction(car, 'front', 'foam').ok).toBe(false); // erst vorspülen
    expect(washAction(car, 'front', 'towel').ok).toBe(false);
    for (const t of ['washer', 'foam', 'washer', 'towel'] as ToolId[]) expect(washAction(car, 'front', t).ok).toBe(true);
    expect(car.zones.front.dirt).toBe(0);
    expect(washAction(car, 'wheels', 'washer').ok).toBe(true);
    expect(washAction(car, 'wheels', 'foam').ok).toBe(false); // Felgen werden gebürstet
    expect(washAction(car, 'wheels', 'brush').ok).toBe(true);
    expect(dirtLevel(car)).toBeGreaterThan(0.4); // der Rest ist noch schmutzig
  });

  it('Polieren nur auf sauberem Lack, Rost bleibt; Innenraum mit drei Geräten', () => {
    const car = dirty();
    expect(washAction(car, 'left', 'polisher').ok).toBe(false);
    for (const t of ['washer', 'foam', 'washer', 'towel'] as ToolId[]) washAction(car, 'left', t);
    car.zones.left.rust = 0.5;
    expect(washAction(car, 'left', 'polisher').ok).toBe(true);
    expect(car.zones.left.shine).toBeLessThan(0.8);
    expect(car.zones.left.rust).toBe(0.5);
    expect(washAction(car, 'left', 'vacuum').ok).toBe(false); // falsche Stelle
    for (const t of ['vacuum', 'upholstery', 'cockpit'] as ToolId[]) expect(washAction(car, 'top', t).ok).toBe(true);
    expect(car.interior).toEqual({ seats: 0, dash: 0, floor: 0 });
  });

  it('Aufbereitung hebt den Preis nur begrenzt und rettet kein defektes Auto', () => {
    const base = mk('bavaria_320', [], 42, { testDriven: true });
    for (const z of Object.values(base.zones)) Object.assign(z, { dirt: 0.3, shine: 0.5, rust: 0 });
    base.interior = { seats: 0.3, dash: 0.3, floor: 0.3 };
    const clean = detail(JSON.parse(JSON.stringify(base)));
    const gain = valuate(clean).value - valuate(base).value;
    expect(gain).toBeGreaterThan(0);
    expect(gain).toBeLessThan(base.cleanValue * 0.06);
    const wreck = mk('bavaria_320', ['bearing', 'alternator', 'gasket'], 42, { testDriven: true });
    const wreckClean = detail(JSON.parse(JSON.stringify(wreck)));
    expect(valuate(wreckClean).value).toBeLessThan(valuate(clean).value - 3500);
    expect(detailFactor(dirty()).some((f) => f.pct < 0)).toBe(true);
  });

  it('Lackierkabine: Rost schleifen, dann lackieren; fertig erst, wenn alle Bereiche einheitlich sind', () => {
    const car = detail(mk('bavaria_328_klassik', []));
    car.zones.rear.rust = 0.6;
    const pct = (c: CarInstance) => detailFactor(c).reduce((s, f) => s + f.pct, 0);
    const rusty = pct(car);
    expect(paintAction(car, 'rear', 'spraygun', '#101114', 5000).ok).toBe(false); // Rost zuerst
    expect(paintAction(car, 'rear', 'sander', '#101114', 5000).ok).toBe(true);
    expect(rustLevel(car)).toBe(0);
    expect(paintAction(car, 'rear', 'spraygun', '#101114', 10).ok).toBe(false); // kein Geld
    let cost = 0;
    for (const z of BODY_ZONES) {
      const res = paintAction(car, z, 'spraygun', '#101114', 5000);
      expect(res.ok).toBe(true);
      cost += res.cost ?? 0;
      if (z !== BODY_ZONES[BODY_ZONES.length - 1]) expect(pct(car)).toBeLessThan(0.05); // halb lackiert bringt Abzug
    }
    expect(cost).toBe(PAINT_COST * 5);
    expect(car.color).toBe('#101114');
    expect(shineLevel(car)).toBe(1);
    expect(pct(car)).toBeGreaterThan(rusty);
  });
});

describe('Werkstattausbau und Scheunenfunde', () => {
  it('Stellplätze kommen mit den Ausbaustufen', () => {
    expect(availableSlots([]).map((s) => s.kind)).toEqual(['lift', 'lift', 'park']);
    expect(availableSlots(['parking']).filter((s) => s.kind === 'park').length).toBe(4);
    expect(availableSlots(['parking', 'wash', 'paint', 'expansion']).length).toBe(SLOTS.length);
    expect(UPGRADES.map((u) => u.stage)).toEqual([2, 3, 4, 5]);
  });

  it('Scheunenfund: selten, verdreckt, rostig, tot – und nur Schritt für Schritt zu retten', () => {
    const g = rng(5);
    for (let n = 0; n < 12; n++) {
      const l = createBarnFind(g, 1, 3);
      const car = l.car;
      expect(CAR_MODELS[car.modelId].rare).toBe(true);
      expect(car.rarity).toBeGreaterThanOrEqual(1);
      expect(dirtLevel(car)).toBeGreaterThan(0.6);
      expect(rustLevel(car)).toBeGreaterThan(0.05);
      expect(r.engineBlocker(car)).toBeTruthy();
      expect(r.activeDefects(car)).toEqual(expect.arrayContaining(['battery', 'tires']));
      expect(Object.values(car.components).some((c) => !c.installed)).toBe(true); // fehlende Teile
      expect(inspectListing(l, 'drive')).toContain('ausgeschlossen');
      expect(l.asking).toBeLessThan(car.cleanValue * 0.3);
      expect(l.expiresDay).toBe(6);
      // Restauriert ist er ein Vielfaches wert
      const restored = detail(service(JSON.parse(JSON.stringify(car)) as CarInstance));
      Object.values(restored.components).forEach((c) => Object.assign(c, { installed: true, condition: 'ok', connected: true, bolts: c.bolts.map(() => 2) }));
      restored.testDriven = true;
      expect(valuate(restored).value).toBeGreaterThan(l.asking * 3);
      expect(valuate(car).value).toBeLessThan(valuate(restored).value * 0.6);
    }
    expect(fillListings([createBarnFind(g, 1, 3)], 6000, g).length).toBe(5); // zählt nicht zum normalen Markt
    expect(refreshListings([createBarnFind(g, 1, 3)], 6000, g, 1, 9).some((l) => l.barn)).toBe(false); // abgelaufen
  });
});

describe('Auktionen', () => {
  it('Händler bieten nachvollziehbar bis zu ihrem Limit; Ergebnis ist reproduzierbar', () => {
    const run = (stepMs: number) => {
      const a = createAuction(rng(11), 1, 1_000_000);
      for (let t = a.startsAt; !a.result && t < a.startsAt + 3_600_000; t += stepMs) advanceAuction(a, t);
      return a;
    };
    const fine = run(1000);
    const coarse = run(1_800_000); // Spiel war geschlossen, ein großer Sprung
    expect(fine.result).toBeTruthy();
    expect([coarse.result, coarse.current, coarse.leader]).toEqual([fine.result, fine.current, fine.leader]);
    const top = Math.max(0, ...fine.bidders.map((b) => b.limit));
    expect(fine.current).toBeLessThanOrEqual(Math.max(top, fine.startBid));
    if (fine.leader) expect(fine.bidders.find((b) => b.name === fine.leader)!.limit).toBeGreaterThanOrEqual(fine.current);
  });

  it('Gebotsregeln: Mindestschritt, Geld, kein Überbieten des eigenen Gebots; gewinnen und verlieren', () => {
    let won = 0;
    let lost = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const a = createAuction(rng(seed), 1, 0);
      expect(placeBid(a, minBid(a) - 10, 1e6, 1000).ok).toBe(false);
      expect(placeBid(a, minBid(a), 100, 1000).ok).toBe(false);
      expect(placeBid(a, minBid(a), 1e6, 1000).ok).toBe(true);
      expect(placeBid(a, minBid(a), 1e6, 1500).ok).toBe(false);
      expect(heldMoney([a])).toBe(a.current);
      // einmal bieten und abwarten
      advanceAuction(a, a.endsAt + 3_600_000);
      expect(a.result).toBeTruthy();
      expect(placeBid(a, a.current + 500, 1e6, a.endsAt + 1).ok).toBe(false);
      a.result === 'won' ? won++ : lost++;
    }
    expect(lost).toBeGreaterThan(5); // ein Mindestgebot reicht meistens nicht
    expect(won + lost).toBe(30);
  });

  it('wer über dem höchsten Händlerlimit bietet, gewinnt – auch gegen späte Bieter', () => {
    const a = createAuction(rng(4), 1, 0);
    const top = Math.max(a.startBid, ...a.bidders.map((b) => b.limit));
    expect(placeBid(a, top + a.increment, 1e6, 1000).ok).toBe(true);
    advanceAuction(a, a.endsAt + 3_600_000);
    expect(a.result).toBe('won');
    expect(a.report.join(' ')).not.toMatch(/Zündspule|Lager|Dichtung/);
  });
});

describe('Ereignisse', () => {
  it('treten nicht ständig auf, passen zum Fortschritt und bringen fertige Daten mit', () => {
    const g = rng(9);
    let total = 0;
    const seen = new Set<string>();
    for (let day = 1; day <= 200; day++) {
      const ev = rollEvents([], g, { day, marketIndex: 1, deals: 0, now: 0 });
      total += ev.length;
      ev.forEach((e) => seen.add(e.type));
    }
    expect(total).toBeGreaterThan(60);
    expect(total).toBeLessThan(140);
    expect(seen.has('barn_hint')).toBe(false); // erst nach ein paar Geschäften
    expect(seen.has('rare_auction')).toBe(false);
    const later = new Set<string>();
    for (let day = 1; day <= 300; day++) rollEvents([], g, { day, marketIndex: 1, deals: 5, now: 0 }).forEach((e) => later.add(e.type));
    expect([...later].sort()).toEqual(['barn_hint', 'parts_sale', 'rare_auction', 'special_listing', 'urgent_job']);
  });

  it('abgelaufene verschwinden, gleiche Art nicht doppelt, höchstens drei aktiv', () => {
    const g = rng(2);
    let ev = rollEvents([], g, { day: 1, marketIndex: 1, deals: 5, now: 0 });
    for (let day = 1; day <= 60; day++) {
      ev = rollEvents(ev, g, { day, marketIndex: 1, deals: 5, now: 0 });
      expect(ev.length).toBeLessThanOrEqual(3);
      expect(new Set(ev.map((e) => e.type)).size).toBe(ev.length);
      expect(ev.every((e) => e.expiresDay >= day)).toBe(true);
    }
    const barn = [...Array(400)].map((_, d) => rollEvents([], g, { day: d, marketIndex: 1, deals: 5, now: 0 })).flat().find((e) => e.type === 'barn_hint')!;
    expect(barn.listing!.barn).toBe(true);
    expect(barn.text).not.toContain(CAR_MODELS[barn.listing!.car.modelId].name); // der Hinweis verrät nicht alles
  });
});
