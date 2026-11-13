import { describe, expect, it } from 'vitest';
import { defOf, defsOf, engineOf } from './data/components';
import { createCar } from './market';
import { asStand, engineTest, extractEngine, fromStand, insertEngine, junkify, junkPartPrice, removalSteps, swapPlan, unitComplete, tuningDamage } from './motor';
import { carWeight, engineOutput, performance } from './performance';
import * as r from './repair';
import type { CarInstance, ToolId, Toolset } from './types';

const rng = () => 0.37;
const mk = (model: string, defects: any[] = []) => createCar(model, defects, rng, { year: 2008 });
const kit: ToolId[] = ['ratchet', 'socket10', 'socket13', 'socket16', 'socket17', 'wrench', 'screwdriver'];
const tool = (active: ToolId): Toolset => ({ active, carried: kit, equipment: ['hoist'] });

/** Baut ein Bauteil samt allem, was davor sitzt, mit dem jeweils richtigen Werkzeug aus. */
function strip(car: CarInstance, id: string): void {
  const def = defOf(car, id);
  const st = car.components[id];
  if (!st || !st.installed) return;
  for (const b of def.blockedBy) strip(car, b);
  if (car.bare && car.lifted !== !!(def.access === 'lifted' || def.under)) car.lifted = !!(def.access === 'lifted' || def.under);
  st.bolts.forEach((b, i) => {
    if (b === 2) expect(r.boltAction(car, id, i, tool(def.fastener!.driver as ToolId)).ok, `${id} lösen`).toBe(true);
    expect(r.boltAction(car, id, i, tool('hand')).ok, `${id} herausdrehen`).toBe(true);
  });
  if (def.connector && st.connected) expect(r.connectorAction(car, id, tool('hand')).ok).toBe(true);
  const res = r.componentAction(car, {}, id, tool(def.removeWith ? (def.removeWith.driver as ToolId) : 'hand'));
  expect(res.ok, `${id}: ${res.message}`).toBe(true);
}
/** Baut ein Bauteil wieder ein (zuerst alles darunter), Schrauben fest, Stecker drauf. */
function mount(car: CarInstance, id: string, source?: any): void {
  const def = defOf(car, id);
  const st = car.components[id];
  if (!st || st.installed) return;
  for (const d of defsOf(car).filter((x) => x.blockedBy.includes(id))) mount(car, d.id);
  if (car.bare) car.lifted = !!(def.access === 'lifted' || def.under);
  const res = r.componentAction(car, {}, id, tool(def.removeWith ? (def.removeWith.driver as ToolId) : 'hand'), source ? { source } : { useOldPart: true });
  expect(res.ok, `${id}: ${res.message}`).toBe(true);
  st.bolts.forEach((_, i) => {
    r.boltAction(car, id, i, tool('hand'));
    const need = def.fastener!;
    expect(r.boltAction(car, id, i, tool(need.torque ? 'torque' : (need.driver as ToolId))).ok, `${id} festziehen`).toBe(true);
  });
  if (def.connector && !st.connected) r.connectorAction(car, id, tool('hand'));
}

describe('Motor ausbauen, lagern, wieder einbauen', () => {
  it('Ausbau nur nach allen Vorbereitungen; der Motor behält Identität und Zustand', () => {
    const car = mk('bavaria_318', ['bearing']);
    car.hoodOpen = true;
    expect(removalSteps(car).filter((s) => !s.done).length).toBeGreaterThan(4);
    for (const id of ['battery', 'hose', 'intake_hose', 'harness', 'mounts']) strip(car, id);
    car.lifted = true;
    strip(car, 'downpipe');
    car.lifted = false;
    expect(removalSteps(car).every((s) => s.done)).toBe(true);
    const coils = Object.keys(car.components).filter((k) => /^coil\d$/.test(k)).length;
    const unit = extractEngine(car);
    expect(car.motor).toBeNull();
    expect(defsOf(car).some((d) => d.engine)).toBe(false);
    expect(r.engineBlocker(car)).toContain('kein Motor');
    expect(Object.keys(unit.components).filter((k) => /^coil\d$/.test(k)).length).toBe(coils);
    expect(unit.components.bearing.condition).toBe('defect');
    expect(unit.motor.engineId).toBe(engineOf({ modelId: 'bavaria_318' }).id);
    expect(car.components.wheel_fl && car.components.battery).toBeTruthy();
  });

  it('Motorständer: komplette Revision bis zur Kurbelwelle, Lager tauschen, wieder zusammenbauen (R6)', () => {
    const car = mk('bavaria_330', ['bearing']);
    const unit = extractEngine(car);
    const stand = asStand(unit, 'bavaria_330');
    expect(defsOf(stand).filter((d) => /^piston\d$/.test(d.id)).length).toBe(6);
    expect(defsOf(stand).some((d) => d.id === 'wheel_fl')).toBe(false);
    // Unten liegende Teile nur gedreht
    expect(r.componentAction(stand, {}, 'oil_pan', tool('hand')).message).toContain('drehen');
    // Kurbelwelle ist blockiert, solange Lager und Kette drin sind
    stand.lifted = true;
    expect(r.componentAction(stand, {}, 'crank', tool('hand')).message).toContain('erst ausbauen');
    // Öl ablassen, dann alles bis zur Kurbelwelle
    stand.fluids.oil.level = 0;
    strip(stand, 'crank');
    for (let n = 1; n <= 6; n++) strip(stand, `piston${n}`);
    expect(stand.components.crank.installed).toBe(false);
    expect(stand.components.bearing.known && stand.components.bearing.condition).toBe('defect');
    // Lager mit Neuteil, Rest mit Altteilen wieder einbauen
    mount(stand, 'bearing', { condition: 'ok', known: true, cost: 380, label: 'Pleuellager-Satz' });
    for (const d of defsOf(stand)) mount(stand, d.id);
    const back = fromStand(stand);
    expect(unitComplete(back)).toBe(true);
    expect(back.components.bearing.condition).toBe('ok');
    const t = engineTest(back);
    expect(t.compression.length).toBe(6);
    expect(t.oilPressure).toBeGreaterThan(3.5);
  });

  it('Prüfstand am ausgebauten Motor erkennt Kolbenringe und Ölpumpe', () => {
    const car = mk('bavaria_318', []);
    const unit = extractEngine(car);
    unit.components.piston3.condition = 'defect';
    unit.components.oil_pump.condition = 'defect';
    const t = engineTest(unit);
    expect(t.compression[2]).toBeLessThan(t.nominal * 0.8);
    expect(t.compression[0]).toBe(t.nominal);
    expect(t.oilPressure).toBeLessThan(2.5);
    expect(t.findings.join(' ')).toContain('Zylinder 3');
  });
});

describe('Motorumbau', () => {
  it('Kompatibilität: gleiche Baureihe einfach, R4→R6 größerer Umbau, V8 passt nicht in den Kompakten', () => {
    expect(swapPlan({ modelId: 'bavaria_318' }, engineOf({ modelId: 'bavaria_318' }).id).level).toBe(0);
    const r6 = swapPlan({ modelId: 'bavaria_318' }, engineOf({ modelId: 'bavaria_330' }).id);
    expect(r6.possible).toBe(true);
    expect(r6.level).toBeGreaterThanOrEqual(2);
    expect(r6.needs.map((n) => n.part)).toEqual(expect.arrayContaining(['swap_mounts', 'swap_adapter', 'swap_ecu']));
    expect(swapPlan({ modelId: 'tanaka_piccolo' }, engineOf({ modelId: 'bavaria_340_ms' }).id).possible).toBe(false);
    const diesel = swapPlan({ modelId: 'bavaria_320' }, engineOf({ modelId: 'bavaria_320d' }).id);
    expect(diesel.needs.map((n) => n.part)).toContain('swap_fuel');
  });

  it('Vierzylinder-Limousine bekommt den Sechszylinder: Bauteile, Leistung, Gewicht, Fahrverhalten', () => {
    const car = mk('bavaria_318', []);
    const before = performance(car);
    const donor = mk('bavaria_330', []);
    const unit = extractEngine(donor);
    extractEngine(car);
    insertEngine(car, unit, ['swap_mounts', 'swap_adapter', 'swap_harness', 'swap_ecu'], 5);
    expect(engineOf(car).layout).toBe('R6');
    expect(car.components.coil6).toBeTruthy();
    expect(car.swap?.parts).toContain('swap_adapter');
    expect(car.motor?.history.at(-1)).toContain('eingebaut');
    const after = performance(car);
    expect(after.ps).toBeGreaterThan(before.ps * 1.4);
    expect(after.accel).toBeGreaterThan(before.accel * 1.2);
    expect(carWeight(car)).toBeGreaterThan(carWeight(mk('bavaria_318', [])));
    expect(after.vmax).toBeGreaterThan(before.vmax);
  });
});

describe('Leistungstuning', () => {
  it('Turbo-Nachrüstung: ohne Abstimmung wenig, mit Kennfeld mehr – bis Kraftstoff und Kühlung begrenzen', () => {
    const car = mk('bavaria_330', []);
    const base = performance(car).ps;
    car.motor = { uid: 'm1', engineId: engineOf(car).id, km: car.km, donor: car.modelId, history: [], turboKit: true };
    for (const id of ['turbo', 'charge_pipe']) {
      const d = defOf(car, id);
      car.components[id] = { installed: true, bolts: Array(d.bolts).fill(2), connected: true, condition: 'ok', known: true };
    }
    const stock = performance(car);
    expect(stock.ps).toBeGreaterThan(base);
    expect(engineOutput(car).boost).toBeLessThanOrEqual(0.3);
    car.ecu = { map: 2, boost: 0.65, limiter: 0 };
    const mapped = performance(car);
    expect(mapped.ps).toBeGreaterThan(stock.ps);
    // Ohne mehr Kraftstoff und Kühlung bleibt der Gewinn klein – die Grenze nennt das Modell
    expect(['Kraftstoff', 'Kühlung']).toContain(engineOutput(car).limit);
    expect(engineOutput(car).risks.map((x) => x.id)).toEqual(expect.arrayContaining(['knock']));
    // Mehr Kraftstoff und Kühlung beseitigen die Risiken und bringen mehr
    car.components.fuel_pump.variant = 'fuelpump_hp';
    car.components.charge_pipe.variant = 'intercooler';
    car.swap = { from: car.motor.engineId, parts: ['clutch_hd', 'swap_radiator'] };
    const clean = engineOutput(car);
    expect(clean.risks.filter((x) => x.id === 'knock' || x.id === 'heat')).toEqual([]);
    expect(performance(car).ps).toBeGreaterThan(mapped.ps * 1.15);
  });

  it('größerer Turbo bringt nur mit passender Abstimmung etwas', () => {
    const car = mk('bavaria_550', []);
    const stock = performance(car).ps;
    car.components.turbo.variant = 'turbo_big';
    expect(performance(car).ps).toBe(stock);
    car.ecu = { map: 2, boost: 1.5, limiter: 0 };
    expect(performance(car).ps).toBeGreaterThan(stock * 1.2);
  });

  it('weit überschrittene Grenzen beschädigen den Motor unter Volllast', () => {
    const car = mk('bavaria_330', []);
    const msgs = tuningDamage(car, [{ id: 'heat', level: 1.4 }], () => 0.1);
    expect(msgs.length).toBe(1);
    expect(car.components.head_gasket.condition).toBe('defect');
    expect(tuningDamage(mk('bavaria_330', []), [{ id: 'heat', level: 0.6 }], () => 0.1)).toEqual([]);
  });
});

describe('Schrottplatz', () => {
  it('Schrottauto: verschlissen, Teile fehlen, Preise für Gebrauchtteile', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 12; i++) {
      const car = junkify(createCar('bavaria_320', [], rnd, {}), rnd, 3);
      expect(car.junk!.price).toBeGreaterThanOrEqual(300);
      expect(Object.values(car.components).some((c) => c.missing) || car.motor === null).toBe(true);
      const ids = defsOf(car).filter((d) => d.partId && !car.components[d.id].missing).map((d) => d.id);
      for (const id of ids) expect(junkPartPrice(car, id)).toBeGreaterThan(0);
    }
  });
});
