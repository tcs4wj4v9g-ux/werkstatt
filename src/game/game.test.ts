import { describe, expect, it } from 'vitest';
import { COMPONENT_MAP, defOf, defsOf } from './data/components';
import { applicableDefects, CLASS_TARGETS, randomDefects } from './market';
import { basePartPrice, defectLabor, defectPenalty, migrateInventory, partKey } from './fitment';
import { cylinderSlots, ENGINES } from './data/engines';
import { firingHz, VOICES } from './audio';
import { ACHIEVEMENTS, collection, countRepair, emptyCareer, newlyAchieved, type CareerView } from './career';
import { performance, powerCurve } from './performance';
import { adCondition, DEFAULT_FILTER, filterListings, type MarketFilter } from './marketFilter';
import { engineOf } from './data/components';
import { defectComponents, DEFECTS, DEFECT_LIST } from './data/defects';
import { PARTS } from './data/parts';
import { SELLERS } from './data/sellers';
import { SYMPTOMS } from './data/symptoms';
import { causeStatus, obdScan, observe, possibleCauses, presentSymptoms, soundProfile } from './diagnosis';
import { advanceAuction, createAuction, heldMoney, minBid, placeBid } from './auctions';
import { CAR_MODELS, MODEL_LIST } from './data/cars';
import { availableSlots, SLOTS, UPGRADES } from './data/workshop';
import { BODY_ZONES, detailFactor, dirtLevel, paintAction, PAINT_COST, rustLevel, shineLevel, washAction } from './detail';
import { rollEvents } from './events';
import * as fl from './fluids';
import { billJob, createJobOffer, JOB_TEMPLATES } from './jobs';
import { MAX_LISTINGS, createBarnFind, createCar, createListing, fillListings, inspectListing, makeOffer, nextMarketIndex, refreshListings, starterListing, valuate } from './market';
import * as r from './repair';
import { normalizeCar } from './store';
import type { CarInstance, DefectId, FluidStock, Inventory, ToolId, ToolNeed, Toolset } from './types';

const rng = (seed = 42) => {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
};
/** Lager, das von jedem Teil in jeder Passform `n` Stück enthält. */
const inv = (n = 0): Inventory => new Proxy({} as Inventory, { get: (t, k: string) => t[k] ?? n });
const ALL: ToolId[] = ['ratchet', 'torque', 'wrench', 'screwdriver', 'obd', 'socket10', 'socket13', 'socket16', 'socket17'];
const HAND: Toolset = { active: 'hand', carried: ALL, equipment: ['hoist'] };
const LAMP: Toolset = { active: 'lamp', carried: [] };
const driver = (need: ToolNeed | undefined, tighten = false): Toolset => ({
  active: !need ? 'hand' : need.torque && tighten ? 'torque' : need.driver,
  carried: ALL,
  equipment: ['hoist'],
});

/** Komplett ausbauen: Schrauben lösen, herausdrehen, Stecker ab, Teil heraus. */
const remove = (car: CarInstance, i: Inventory, id: string) => {
  const def = defOf(car, id);
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
  const def = defOf(car, id);
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
  defOf(car, id).blockedBy.forEach((b) => removeDeep(car, i, b, order));
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
  for (const t of defectComponents(car, DEFECTS[d]).filter((c) => car.components[c].condition === 'defect')) {
    const lifted = defOf(car, t).access === 'lifted';
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
    for (const model of ['bavaria_320', 'bavaria_320d', 'bavaria_335_coupe', 'nordwind_s6', 'bavaria_550']) for (const id of applicableDefects(model)) {
      const d = DEFECTS[id];
      const car = mk(model, [d.id]);
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
    const all = applicableDefects('bavaria_320');
    expect(all.length).toBe(19);
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
    expect(possibleCauses('rough_idle', mk('bavaria_320', [])).map((d) => d.id).sort()).toEqual(['coil', 'plugs', 'vacuum']);
    expect(possibleCauses('rough_idle', mk('bavaria_320d', [])).map((d) => d.id).sort()).toEqual(['egr', 'glow', 'injector', 'vacuum']);
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
    const q = soundProfile(quiet);
    expect([q.misfire, q.hiss, q.knock, q.tick, q.rattle, q.squeal, q.whine, q.boostHiss].every((v) => v === 0)).toBe(true);
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
        expect(ls.length).toBe(MAX_LISTINGS);
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
    expect(Object.keys(car.components).length).toBe(defsOf(car).length);
    expect(car.components.coil3).toMatchObject({ condition: 'defect', known: true, connected: true, bolts: [2] });
    expect(car.components.coil2).toMatchObject({ installed: false, bolts: [0] });
    expect(car.components.valve_cover.bolts).toEqual([2, 2, 0, 0, 2, 2]); // unterbrochene Reparatur bleibt erhalten
    expect(car.components.engine_cover.installed).toBe(false); // neu hinzugekommene Abdeckung versperrt die ausgebaute Spule nicht
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
    expect(i[partKey(car, 'oil_filter')]).toBe(1);
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
    expect(fl.bleedBrake(car, st, 'fl', { active: 'hand', carried: [] }).ok).toBe(false); // kein Schlüssel dabei
    expect(fl.bleedBrake(car, st, 'fl', { active: 'ratchet', carried: ['ratchet', 'wrench'] }).ok).toBe(false); // falsches Werkzeug in der Hand
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
    expect(UPGRADES.filter((u) => !u.equipment).map((u) => u.stage)).toEqual([2, 3, 4, 5]);
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
    expect(fillListings([createBarnFind(g, 1, 3)], 6000, g).length).toBe(MAX_LISTINGS + 1); // zählt nicht zum normalen Markt
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

describe('Motoren', () => {
  const count = (car: CarInstance, prefix: string) => Object.keys(car.components).filter((id) => new RegExp(`^${prefix}\\d+$`).test(id)).length;
  const sample: Record<string, string> = { R4: 'bavaria_320', R6: 'bavaria_330', V6: 'nordwind_s6', V8: 'bavaria_340_ms' };

  it('jede Bauart hat so viele einzeln zugängliche Zündspulen und Kerzen wie Zylinder', () => {
    for (const [layout, model] of Object.entries(sample)) {
      const car = mk(model, []);
      const e = engineOf(car);
      expect(e.layout).toBe(layout);
      expect(count(car, 'coil'), layout).toBe(e.cylinders);
      expect(count(car, 'plug'), layout).toBe(e.cylinders);
      expect(cylinderSlots(e).length).toBe(e.cylinders);
      // Jede Kerze lässt sich einzeln ausbauen, ohne eine andere Spule anzufassen.
      r.toggleHood(car);
      const i = inv(2);
      remove(car, i, 'engine_cover');
      const n = e.cylinders;
      remove(car, i, `coil${n}`);
      remove(car, i, `plug${n}`);
      expect(Object.keys(car.components).filter((id) => !car.components[id].installed).sort()).toEqual([`coil${n}`, 'engine_cover', `plug${n}`].sort());
      expect(car.components[`plug${n}`].health).toBeGreaterThan(50);
    }
    expect(count(mk('bavaria_330', []), 'coil')).toBe(6);
    expect(count(mk('bavaria_340_ms', []), 'coil')).toBe(8);
  });

  it('V-Motoren haben zwei Bänke mit je eigenem Ventildeckel', () => {
    const v8 = mk('bavaria_340_ms', []);
    const slots = cylinderSlots(engineOf(v8));
    expect(slots.filter((s) => s.bank === -1).map((s) => s.n)).toEqual([1, 2, 3, 4]);
    expect(slots.filter((s) => s.bank === 1).map((s) => s.n)).toEqual([5, 6, 7, 8]);
    expect(defOf(v8, 'valve_cover').blockedBy).toEqual(['coil1', 'coil2', 'coil3', 'coil4']);
    expect(defOf(v8, 'valve_cover_b').blockedBy).toEqual(['coil5', 'coil6', 'coil7', 'coil8']);
    expect(mk('bavaria_330', []).components.valve_cover_b).toBeUndefined();
    expect(defOf(mk('bavaria_330', []), 'valve_cover').blockedBy.length).toBe(6);
  });

  it('Diesel: Einspritzdüsen und Glühkerzen statt Zündanlage; Turbo-Teile nur am Turbomotor', () => {
    const d = mk('bavaria_330d_kombi', []);
    expect(count(d, 'coil') + count(d, 'plug')).toBe(0);
    expect(count(d, 'inj')).toBe(6);
    expect(count(d, 'glow')).toBe(6);
    expect(d.components.turbo && d.components.egr && d.components.dpf).toBeTruthy();
    const na = mk('bavaria_330', []);
    expect(na.components.turbo ?? na.components.egr ?? na.components.dpf ?? na.components.charge_pipe).toBeUndefined();
    expect(mk('bavaria_335_coupe', []).components.turbo).toBeTruthy();
    expect(mk('bavaria_335_coupe', []).components.dpf).toBeUndefined();
    expect(applicableDefects('bavaria_320d')).not.toContain('coil');
    expect(applicableDefects('bavaria_320d')).toEqual(expect.arrayContaining(['glow', 'injector', 'turbo', 'boost_leak', 'egr', 'dpf']));
    expect(applicableDefects('bavaria_320')).not.toContain('turbo');
  });

  it('alle Motoren und Modelle sind in sich stimmig', () => {
    expect(MODEL_LIST.length).toBeGreaterThanOrEqual(22);
    for (const cls of ['budget', 'mid', 'sport', 'luxury', 'collector']) expect(MODEL_LIST.some((m) => m.cls === cls), cls).toBe(true);
    for (const m of MODEL_LIST) {
      expect(ENGINES[m.engineId], m.id).toBeTruthy();
      const defs = defsOf({ modelId: m.id });
      const ids = defs.map((d) => d.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const d of defs) for (const b of d.blockedBy) expect(ids, `${m.id}:${d.id}`).toContain(b);
      for (const d of defs) if (d.partId) expect(PARTS[d.partId], d.id).toBeTruthy();
    }
    for (const e of Object.values(ENGINES)) expect(e.ps / e.liters, e.id).toBeGreaterThan(40);
  });

  it('Diagnose nennt den richtigen Zylinder – auch den sechsten und achten', () => {
    const r6 = mk('bavaria_330', []);
    r6.components.coil6.condition = 'defect';
    expect(obdScan(r6)).toEqual(['P0306 – Zündaussetzer Zylinder 6 erkannt']);
    const v8 = mk('bavaria_550', []);
    v8.components.plug8.condition = 'defect';
    v8.components.charge_pipe.condition = 'defect';
    expect(obdScan(v8).map((c) => c.slice(0, 5))).toEqual(['P0308', 'P0299']);
    expect(r.activeDefects(v8).sort()).toEqual(['boost_leak', 'plugs']);
    const d = mk('bavaria_320d', ['glow', 'injector', 'egr', 'dpf', 'turbo']);
    const codes = obdScan(d).map((c) => c.slice(0, 4));
    expect(codes).toEqual(expect.arrayContaining(['P020', 'P067', 'P029', 'P040', 'P200']));
    expect(obdScan(d).some((c) => c.includes('Zündaussetzer'))).toBe(false);
    // OBD verrät nie, ob Lader oder Leck – und setzt kein Bauteil auf „bekannt".
    expect(Object.values(d.components).some((c) => c.known)).toBe(false);
    const p = soundProfile(d);
    expect(p).toMatchObject({ diesel: true, layout: 'R4', cylinders: 4, whine: 1 });
    expect(soundProfile(mk('bavaria_340_ms', []))).toMatchObject({ layout: 'V8', cylinders: 8, diesel: false, turbo: false });
  });

  it('Ersatzteile passen nur zur eigenen Motorfamilie und Fahrzeugklasse', () => {
    const r6 = mk('bavaria_330', ['coil']);
    const v8 = mk('bavaria_340_ms', ['coil']);
    expect(partKey(r6, 'ignition_coil')).not.toBe(partKey(v8, 'ignition_coil'));
    expect(partKey(r6, 'ignition_coil')).toBe(partKey(mk('bavaria_325', []), 'ignition_coil')); // gleiche Familie
    expect(partKey(r6, 'battery')).toBe(partKey(v8, 'battery'));
    expect(partKey(r6, 'brake_pads')).not.toBe(partKey(v8, 'brake_pads'));
    expect(basePartPrice(v8, 'ignition_coil')).toBeGreaterThan(basePartPrice(r6, 'ignition_coil') * 1.5);
    expect(basePartPrice(mk('veloce_250', []), 'water_pump')).toBeGreaterThan(1000);
    // Im Lager liegt nur eine R6-Spule: Sie passt nicht in den V8.
    const stock: Inventory = { [partKey(r6, 'ignition_coil')]: 1 };
    const bad = Object.keys(v8.components).find((id) => v8.components[id].condition === 'defect')!;
    r.toggleHood(v8);
    remove(v8, stock, 'engine_cover');
    remove(v8, stock, bad);
    const res = r.componentAction(v8, stock, bad, HAND);
    expect(res.needsPart).toBe('ignition_coil');
    expect(res.message).toContain('V8');
    expect(stock[partKey(r6, 'ignition_coil')]).toBe(1);
    stock[partKey(v8, 'ignition_coil')] = 1;
    install(v8, stock, bad);
    expect(v8.components[bad]).toMatchObject({ condition: 'ok', health: 100 });
    expect(stock[partKey(v8, 'ignition_coil')]).toBe(0);
  });

  it('Motor startet nach vollständiger Reparatur wieder – bei jeder Bauart', () => {
    for (const [model, defect] of [['bavaria_330', 'coil'], ['bavaria_340_ms', 'plugs'], ['nordwind_s6', 'gasket'], ['bavaria_330d_kombi', 'injector'], ['bavaria_550', 'turbo'], ['bavaria_320d', 'dpf']] as [string, DefectId][]) {
      const car = mk(model, [defect]);
      expect(presentSymptoms(car).length, model).toBeGreaterThan(0);
      r.toggleHood(car);
      const i = inv(8);
      remove(car, i, 'engine_cover');
      expect(r.engineBlocker(car), model).toContain('Motorabdeckung');
      install(car, i, 'engine_cover');
      r.toggleHood(car);
      fix(car, i, defect);
      expect(r.activeDefects(car), model).toEqual([]);
      expect(r.engineBlocker(car), model).toBeNull();
      expect(r.driveBlocker(car), model).toBeNull();
      expect(presentSymptoms(car), model).toEqual([]);
      expect(obdScan(car), model).toEqual([]);
    }
  });

  it('defekte Zünd- und Einspritzteile haben einen schlechten, heile einen guten Restzustand', () => {
    const car = mk('bavaria_330', ['coil', 'plugs']);
    for (const [id, c] of Object.entries(car.components)) {
      if (!/^(coil|plug)\d$/.test(id)) expect(c.health, id).toBeUndefined();
      else if (c.condition === 'defect') expect(c.health, id).toBeLessThan(25);
      else expect(c.health, id).toBeGreaterThanOrEqual(55);
    }
  });

  it('Spielstand: Motorzustand übersteht Speichern und Laden unverändert', () => {
    const car = mk('bavaria_550', ['coil', 'turbo']);
    r.toggleHood(car);
    const i = inv(2);
    remove(car, i, 'engine_cover');
    remove(car, i, 'coil7');
    const loaded = normalizeCar(JSON.parse(JSON.stringify(car)))!;
    expect(loaded.components).toEqual(car.components);
    expect(loaded.modelId).toBe('bavaria_550');
    expect(normalizeCar(JSON.parse(JSON.stringify(loaded)))!.components).toEqual(car.components);
  });

  it('Migration: alter Sechszylinder mit vier Spulen bekommt Zylinder 5 und 6, Reparaturstand bleibt', () => {
    const b = (bolts: number, installed = true) => ({ installed, bolts: Array(bolts).fill(installed ? 2 : 0), connected: installed, condition: 'ok', known: false });
    const old: any = {
      uid: 'alt-330', modelId: 'bavaria_330', color: '#101114', year: 2008, km: 150000, cleanValue: 12000, hoodOpen: true, lifted: false,
      purchasePrice: 9000, partsSpent: 120, testDriven: false, haggled: false, obdCodes: null, observed: ['rough_idle'],
      components: {
        engine_cover: b(0, false), coil1: b(1, false), coil2: b(1, false), coil3: { ...b(1, false), condition: 'defect', known: true }, coil4: b(1, false),
        plug1: b(0), plug2: b(0), plug3: b(0), plug4: b(0), valve_cover: b(6, false), gasket: { ...b(0, false), condition: 'defect', known: true },
        rocker: b(0), oil_filter: b(0), battery: b(0), wheel_fl: b(5), wheel_fr: b(5),
      },
    };
    const car = normalizeCar(old)!;
    expect(engineOf(car).layout).toBe('R6');
    expect(Object.keys(car.components).sort()).toEqual(defsOf(car).map((d) => d.id).sort());
    // Der Ventildeckel war schon ab – die neuen Spulen 5 und 6 liegen daneben und versperren nichts.
    expect(car.components.coil5).toMatchObject({ installed: false, condition: 'ok', bolts: [0] });
    expect(car.components.coil6.installed).toBe(false);
    expect(car.components.plug5).toMatchObject({ installed: true, condition: 'ok' });
    expect(car.components.coil3).toMatchObject({ installed: false, condition: 'defect', known: true });
    expect(car.components.gasket).toMatchObject({ installed: false, condition: 'defect', known: true });
    expect(car.partsSpent).toBe(120);
    expect(car.observed).toEqual(['rough_idle']);
    expect(typeof car.components.coil1.health).toBe('number');
    expect(car.components.coil3.health).toBeLessThan(25);
    // Zusammenbau gelingt mit passenden Teilen.
    const i = inv(3);
    for (const id of ['gasket', 'valve_cover', 'coil1', 'coil2', 'coil3', 'coil4', 'coil5', 'coil6', 'engine_cover']) install(car, i, id);
    expect(r.isAssembled(car)).toBe(true);
    expect(r.activeDefects(car)).toEqual([]);
    // Intakter alter Sechszylinder: alles bleibt montiert.
    const whole = normalizeCar({ ...old, uid: 'alt-2', components: Object.fromEntries(Object.entries(old.components).map(([k, v]: any) => [k, { ...v, installed: true, connected: true, bolts: v.bolts.map(() => 2) }])) })!;
    expect(r.isAssembled(whole)).toBe(true);
    expect(whole.components.gasket.condition).toBe('defect');
  });

  it('Migration: altes Teilelager passt weiter zu den damaligen Autos', () => {
    const inv5 = migrateInventory({ ignition_coil: 2, spark_plug: 0, brake_pads: 2, battery: 1, quatsch: 3 } as any);
    const r4 = mk('bavaria_320', []);
    expect(inv5[partKey(r4, 'ignition_coil')]).toBe(2);
    expect(inv5[partKey(r4, 'brake_pads')]).toBe(2);
    expect(inv5[partKey(r4, 'battery')]).toBe(1);
    expect(Object.keys(inv5).length).toBe(3);
    expect(migrateInventory(inv5)).toEqual(inv5); // bereits umgestellt: unverändert
  });
});

describe('Großer Markt', () => {
  it('25 Inserate aus allen fünf Preisklassen, Preise passen zur Klasse', () => {
    const g = rng(11);
    const ls = fillListings([], 6000, g, 1, true, 1);
    expect(ls.length).toBe(25);
    expect(ls[0].car.modelId).toBe('bavaria_320'); // Einstiegsangebot bleibt
    const by = (cls: string) => ls.filter((l) => CAR_MODELS[l.car.modelId].cls === cls);
    for (const cls of Object.keys(CLASS_TARGETS)) expect(by(cls).length, cls).toBe(CLASS_TARGETS[cls as keyof typeof CLASS_TARGETS]);
    expect(new Set(ls.map((l) => l.car.modelId)).size).toBeGreaterThanOrEqual(12);
    expect(new Set(ls.map((l) => engineOf(l.car).layout)).size).toBe(4);
    for (const l of by('budget')) expect(l.asking).toBeLessThan(13000);
    for (const l of by('luxury')) expect(l.asking).toBeGreaterThan(40000);
    for (const l of by('collector')) expect(l.asking).toBeGreaterThan(100000);
    expect(Math.max(...ls.map((l) => l.asking))).toBeGreaterThan(250000);
  });

  it('Inserate bleiben mehrere Tage stehen und verschwinden erst nach Ablauf', () => {
    const g = rng(5);
    let ls = fillListings([], 6000, g, 1, false, 1);
    const first = ls.map((l) => l.id);
    ls = refreshListings(ls, 6000, g, 1, 2);
    expect(ls.filter((l) => first.includes(l.id)).length).toBe(25); // am nächsten Tag noch alle da
    ls = refreshListings(ls, 6000, g, 1, 4);
    const left = ls.filter((l) => first.includes(l.id)).length;
    expect(left).toBeGreaterThan(5);
    expect(left).toBeLessThan(25);
    ls = refreshListings(ls, 6000, g, 1, 12);
    expect(ls.filter((l) => first.includes(l.id)).length).toBe(0);
    expect(ls.length).toBe(25);
  });

  it('Schäden an teuren Autos kosten mehr – Abzüge und Arbeitslohn skalieren', () => {
    const cheap = mk('bavaria_320', ['water_pump']);
    const dear = mk('veloce_stradale', ['water_pump']);
    expect(defectPenalty(dear, 'water_pump')).toBe(defectPenalty(cheap, 'water_pump') * 4);
    expect(defectLabor(dear, 'water_pump')).toBeGreaterThan(defectLabor(cheap, 'water_pump') * 2);
    expect(valuate(dear).deductions[0].amount).toBe(defectPenalty(dear, 'water_pump'));
    expect(valuate(dear).value).toBeGreaterThan(100000);
  });
});

describe('Fahrleistungen und Motorklang', () => {
  it('Leistung, Gewicht und Zustand bestimmen das Fahrverhalten', () => {
    const small = performance(mk('tanaka_piccolo', []));
    const mid = performance(mk('bavaria_320', []));
    const fast = performance(mk('veloce_stradale', []));
    expect(small.accel).toBeLessThan(mid.accel);
    expect(fast.accel).toBeGreaterThan(mid.accel * 1.8);
    expect(fast.vmax).toBeGreaterThan(mid.vmax * 1.4);
    expect(fast.agility).toBeGreaterThan(performance(mk('kaiser_600', [])).agility);
    expect(mid.losses).toEqual([]);
    const sick = performance(mk('bavaria_550', ['turbo']));
    expect(sick.ps).toBeLessThan(sick.ratedPs * 0.65);
    expect(sick.losses[0].label).toContain('Turbolader');
    const car = mk('bavaria_550', ['turbo']);
    fix(car, inv(3), 'turbo');
    expect(performance(car).ps).toBeGreaterThan(sick.ratedPs * 0.95);
  });

  it('Leistungskurve: Spitzenwerte stimmen, Turbo hat Drehmoment unten, Diesel dreht niedrig', () => {
    for (const m of MODEL_LIST) {
      const car = mk(m.id, []);
      const curve = powerCurve(car);
      const p = performance(car);
      expect(Math.max(...curve.map((c) => c.ps)), m.id).toBe(p.ps);
      expect(Math.max(...curve.map((c) => c.nm)), m.id).toBe(p.nm);
      expect(curve.every((c) => c.ps > 0 && c.nm > 0), m.id).toBe(true);
    }
    const peakRpm = (id: string) => powerCurve(mk(id, [])).reduce((a, b) => (b.nm > a.nm ? b : a)).rpm;
    expect(peakRpm('bavaria_335_coupe')).toBeLessThan(peakRpm('bavaria_330'));
    expect(Math.max(...powerCurve(mk('bavaria_320d', [])).map((c) => c.rpm))).toBeLessThan(5000);
    expect(Math.max(...powerCurve(mk('bavaria_340_ms', [])).map((c) => c.rpm))).toBeGreaterThan(8000);
  });

  it('jede Bauart hat ihre eigene Zündfrequenz und Klangfarbe', () => {
    expect(firingHz(3000, 4)).toBe(100);
    expect(firingHz(3000, 6)).toBe(150);
    expect(firingHz(3000, 8)).toBe(200);
    const voices = ['R4', 'R6', 'V6', 'V8'].map((l) => JSON.stringify(VOICES[l]));
    expect(new Set(voices).size).toBe(4);
    for (const e of Object.values(ENGINES)) expect(VOICES[e.layout], e.id).toBeTruthy();
    expect(VOICES.V8.exhaust).toBeGreaterThan(VOICES.R6.exhaust);
  });
});

describe('Marktfilter', () => {
  const ls = fillListings([], 6000, rng(21), 1, true, 1);
  const f = (patch: Partial<MarketFilter>, money = Infinity) => filterListings(ls, { ...DEFAULT_FILTER, ...patch }, money).map((x) => x.listing);
  it('filtert nach Klasse, Marke, Motor, Seltenheit, Inseratszustand und Kontostand', () => {
    expect(f({}).length).toBe(25);
    expect(f({ cls: 'luxury' }).every((l) => CAR_MODELS[l.car.modelId].cls === 'luxury')).toBe(true);
    expect(f({ cls: 'luxury' }).length).toBe(CLASS_TARGETS.luxury);
    expect(f({ brand: 'Veloce' }).every((l) => CAR_MODELS[l.car.modelId].brand === 'Veloce')).toBe(true);
    expect(f({ engine: 'V8' }).every((l) => engineOf(l.car).layout === 'V8')).toBe(true);
    expect(f({ engine: 'diesel' }).every((l) => engineOf(l.car).fuel === 'diesel')).toBe(true);
    expect(f({ engine: 'turbo' }).every((l) => engineOf(l.car).turbo)).toBe(true);
    expect(f({ rare: true }).length).toBe(CLASS_TARGETS.collector);
    expect(f({ damaged: true }).every((l) => adCondition(l) !== 'gepflegt')).toBe(true);
    expect(f({ affordable: true }, 6000).every((l) => l.current <= 6000)).toBe(true);
    expect(f({ affordable: true }, 6000).length).toBeGreaterThan(0);
    expect(f({ cls: 'collector', engine: 'diesel' })).toEqual([]);
  });
  it('sortiert nach Preis, Kilometern, Baujahr, Leistung und Zustand; Index zeigt auf das Original', () => {
    const sorted = (xs: number[]) => xs.every((v, i) => i === 0 || xs[i - 1] <= v);
    expect(sorted(f({ sort: 'price_asc' }).map((l) => l.current))).toBe(true);
    expect(sorted(f({ sort: 'price_desc' }).map((l) => -l.current))).toBe(true);
    expect(sorted(f({ sort: 'km' }).map((l) => l.car.km))).toBe(true);
    expect(sorted(f({ sort: 'year' }).map((l) => -l.car.year))).toBe(true);
    expect(sorted(f({ sort: 'power' }).map((l) => -engineOf(l.car).ps))).toBe(true);
    expect(sorted(f({ sort: 'condition' }).map((l) => -l.asking / l.car.cleanValue))).toBe(true);
    for (const row of filterListings(ls, { ...DEFAULT_FILTER, sort: 'power' })) expect(ls[row.index]).toBe(row.listing);
  });
});

describe('Kapitale Schäden und Spezialgeräte', () => {
  it('Getriebe: ohne Motor- und Getriebeheber weder Aus- noch Einbau', () => {
    const car = mk('bavaria_320', ['gearbox']);
    expect(presentSymptoms(car)).toEqual(expect.arrayContaining(['gear_grind']));
    expect(obdScan(car)).toEqual([]); // rein mechanisch: kein Fehlercode
    r.toggleLift(car);
    const i = inv(1);
    const noHoist: Toolset = { active: 'hand', carried: ALL };
    const ratchet = driver(defOf(car, 'gearbox').fastener);
    car.components.gearbox.bolts.forEach((_, n) => { r.boltAction(car, 'gearbox', n, ratchet); r.boltAction(car, 'gearbox', n, HAND); });
    const res = r.componentAction(car, i, 'gearbox', noHoist);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('Getriebeheber');
    expect(r.componentAction(car, i, 'gearbox', HAND).ok).toBe(true);
    expect(r.engineBlocker(car)).toContain('Getriebe');
    expect(r.componentAction(car, i, 'gearbox', noHoist).ok).toBe(false);
    install(car, i, 'gearbox');
    expect(r.activeDefects(car)).toEqual([]);
  });

  it('Zylinderkopfdichtung: erst Ventildeckel, Dichtung, Stößel und Kopf – Kühlsystem ist danach offen', () => {
    for (const model of ['bavaria_320', 'bavaria_340_ms', 'bavaria_320d']) {
      const car = mk(model, ['head_gasket']);
      expect(presentSymptoms(car), model).toEqual(expect.arrayContaining(['white_smoke', 'oil_milky']));
      expect(performance(car).ps).toBeLessThan(performance(mk(model, [])).ps);
      r.toggleHood(car);
      const order: string[] = [];
      removeDeep(car, inv(2), 'head_gasket', order);
      expect(order, model).toEqual(expect.arrayContaining(['engine_cover', 'valve_cover', 'gasket', 'rocker', 'cyl_head', 'head_gasket']));
      expect(order.indexOf('cyl_head')).toBeGreaterThan(order.indexOf('rocker'));
      expect(car.fluids.coolant.air).toBe(true);
      expect(car.components.head_gasket.known).toBe(true);
    }
  });

  it('kapitale Schäden sind selten, teuer und an teuren Autos teils unwirtschaftlich', () => {
    const g = rng(8);
    let severe = 0;
    let common = 0;
    for (let n = 0; n < 600; n++) {
      const d = randomDefects('bavaria_320', 2, g);
      severe += d.filter((x) => x === 'gearbox' || x === 'head_gasket').length;
      common += d.filter((x) => x === 'belt' || x === 'plugs').length;
    }
    expect(severe).toBeGreaterThan(5);
    expect(severe).toBeLessThan(common * 0.5);
    const cheap = mk('tanaka_piccolo', ['gearbox', 'head_gasket']);
    const v = valuate(cheap);
    // Am Kleinwagen übersteigen Teile und Abzüge schnell den Fahrzeugwert.
    expect(basePartPrice(cheap, 'gearbox') + basePartPrice(cheap, 'head_gasket')).toBeGreaterThan(v.cleanValue * 0.5);
    expect(defectPenalty(mk('kaiser_600', []), 'gearbox')).toBeGreaterThan(10000);
  });
});

describe('Karriere: Erfolge, Sammlung, Prüfstand', () => {
  const view = (patch: Partial<CareerView> = {}): CareerView => ({ career: emptyCareer(), carsSold: 0, totalProfit: 0, jobsDone: 0, money: 6000, upgrades: [], cars: [], ...patch });

  it('Erfolge werden genau einmal ausgelöst', () => {
    expect(newlyAchieved(view(), [])).toEqual([]);
    const first = newlyAchieved(view({ carsSold: 1 }), []);
    expect(first.map((a) => a.id)).toEqual(['first_sale']);
    expect(newlyAchieved(view({ carsSold: 1 }), ['first_sale'])).toEqual([]); // nach Neuladen keine zweite Belohnung
    expect(newlyAchieved(view({ carsSold: 10, totalProfit: 60000 }), ['first_sale']).map((a) => a.id).sort()).toEqual(['dealer_10', 'profit_50k']);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) {
      expect(a.reward, a.id).toBeGreaterThan(0);
      const [n, of] = a.progress(view());
      expect(n < of, a.id).toBe(true); // nichts ist zu Spielbeginn schon erreicht
    }
  });

  it('reparierte Autos zählen je Motorbauart, Diesel und Turbo', () => {
    let c = emptyCareer();
    const untouched = mk('bavaria_330', []);
    expect(countRepair(c, untouched)).toBe(c); // ohne eigene Reparatur zählt nichts
    for (const m of ['bavaria_320', 'bavaria_330', 'nordwind_s6', 'bavaria_550', 'bavaria_320d']) c = countRepair(c, { ...mk(m, []), partsSpent: 100 });
    expect(c.layouts.sort()).toEqual(['R4', 'R6', 'V6', 'V8']);
    expect(c.dieselFixed).toBe(1);
    expect(c.turboFixed).toBe(2);
    expect(newlyAchieved(view({ career: c }), []).map((a) => a.id)).toEqual(expect.arrayContaining(['six', 'vee', 'all_layouts']));
  });

  it('Sammlung: nur eigene Privatfahrzeuge; seltene Autos in Bestzustand bringen Ansehen und Sammlerzuschlag', () => {
    const daily = detail(mk('bavaria_320', [], 1, { keep: true, testDriven: true }));
    const jewel = detail(mk('bavaria_30cs', [], 2, { keep: true, testDriven: true }));
    const broken = detail(mk('bavaria_30cs', ['head_gasket'], 3, { keep: true }));
    const forSale = mk('veloce_gt', [], 4);
    const entries = collection([daily, null, jewel, broken, forSale]);
    expect(entries.map((e) => e.slot)).toEqual([0, 2, 3]);
    expect(entries[1].prestige).toBeGreaterThan(entries[0].prestige * 10);
    expect(entries[2].prestige).toBeLessThan(entries[1].prestige * 0.5);
    expect(valuate(jewel).extras.some((e) => e.label.startsWith('Sammlerzustand'))).toBe(true);
    expect(valuate(broken).extras.some((e) => e.label.startsWith('Sammlerzustand'))).toBe(false);
    expect(valuate(daily).extras.some((e) => e.label.includes('Sammler'))).toBe(false);
    expect(newlyAchieved(view({ cars: [daily, jewel, broken] }), []).map((a) => a.id).sort()).toEqual(['collection_3', 'collector_car']);
    expect(newlyAchieved(view({ cars: [broken] }), [])).toEqual([]);
  });

  it('Prüfstandsprotokoll mit voller Leistung steigert den Wert, mit Minderleistung nicht', () => {
    const car = detail(mk('bavaria_335_coupe', [], 5, { testDriven: true }));
    const base = valuate(car).value;
    const p = performance(car);
    car.dyno = { ps: p.ps, nm: p.nm, ratedPs: p.ratedPs, day: 3 };
    expect(valuate(car).value).toBeGreaterThan(base);
    car.dyno.ps = Math.round(p.ratedPs * 0.8);
    expect(valuate(car).value).toBe(base);
  });
});
