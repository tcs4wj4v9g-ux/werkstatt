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
  for (const b of r.blockersOf(car, id)) strip(car, b);
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
  for (const d of defsOf(car).filter((x) => r.blockersOf(car, x.id).includes(id))) mount(car, d.id);
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
    for (const id of ['battery', 'hose', 'intake_hose', 'harness']) strip(car, id);
    // Motorlager und Hosenrohr von unten (Hebebühne)
    car.lifted = true;
    strip(car, 'mounts');
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
  it('fremder Motor bringt fehlende Teile am Auto mit (Kühler im luftgekühlten Auto, Partikelfilter beim Diesel)', () => {
    for (const [target, donorModel] of [['zuffen_929', 'bavaria_550'], ['zuffen_365', 'bavaria_320d'], ['bavaria_330', 'bavaria_320d']]) {
      const car = createCar(target, [], () => 0.5, {});
      const unit = extractEngine(createCar(donorModel, [], () => 0.5, {}));
      extractEngine(car);
      insertEngine(car, unit, [], 1);
      expect(defsOf(car).filter((d) => !car.components[d.id]).map((d) => d.id), `${donorModel} in ${target}`).toEqual([]);
      expect(() => r.isAssembled(car)).not.toThrow();
    }
  });
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

describe('Öl und Motorschaden', () => {
  it('ohne Öl startet der Motor, nach Sekunden fressen die Lager; falsches Öl lässt die Stößel klappern', async () => {
    const { oilHarm, DRY_RUN_MS, WRONG_OIL_MS } = await import('./fluids');
    const car = mk('bavaria_330');
    car.fluids.oil.level = 0;
    expect(r.engineBlocker(car)).toBeNull();
    expect(r.driveBlocker(car)).toMatch(/Öldruck/);
    expect(oilHarm(car, 1000)).toBeNull();
    expect(oilHarm(car, DRY_RUN_MS)!.ids).toEqual(expect.arrayContaining(['bearing', 'camshaft']));
    const wrong = mk('bavaria_330');
    wrong.fluids.oil.product = wrong.fluids.oil.product === 'oil_5w40' ? 'oil_5w30' : 'oil_5w40';
    expect(oilHarm(wrong, WRONG_OIL_MS - 1)).toBeNull();
    expect(oilHarm(wrong, WRONG_OIL_MS)!.ids).toEqual(['rocker']);
    wrong.components.rocker.condition = 'defect';
    expect(oilHarm(wrong, WRONG_OIL_MS)).toBeNull();
    expect(oilHarm(mk('bavaria_330'), 60000)).toBeNull();
  });
});

describe('Ausgebauter Motor gehört weiter zum Auto', () => {
  it('Akte und Teileshop kennen die Motorteile, solange der Motor am Kran, Ständer oder im Lager ist', async () => {
    const { withRemovedEngine } = await import('./motor');
    const { possibleCauses } = await import('./diagnosis');
    const car = mk('bavaria_330');
    const unit = extractEngine(car);
    car.motorOut = unit.motor.uid;
    expect(car.motor).toBeNull();
    expect(possibleCauses('blue_smoke', car).map((d) => d.id)).not.toContain('rings');
    const both = withRemovedEngine(car, [unit]);
    expect(possibleCauses('blue_smoke', both).map((d) => d.id)).toContain('rings');
    expect(defsOf(both).some((d) => d.partId === 'spark_plug')).toBe(true);
    expect(withRemovedEngine(car, [])).toBe(car);
    // Auf den Ständer gesetzt: gleicher Motor, gleiche Teile
    const stand = asStand(unit, 'bavaria_330');
    expect(Object.keys(withRemovedEngine(car, [fromStand(stand)]).components)).toContain('piston1');
  });
});

describe('Motorständer: Nockenwellen vor dem Zylinderkopf', () => {
  it('Kopf erst ab, wenn die Nockenwellen raus sind; Nockenwellen nur auf den Kopf', () => {
    const car = mk('bavaria_330');
    const stand = asStand(extractEngine(car), 'bavaria_330');
    expect(r.blockersOf(stand, 'cyl_head')).toContain('camshaft');
    expect(r.blockersOf(car, 'cyl_head')).not.toContain('camshaft'); // im Auto: Kopfdichtung ohne Ständer
    strip(stand, 'cyl_head');
    expect(stand.components.camshaft.installed).toBe(false);
    expect(r.installReady(stand, 'camshaft')).toBe(false);
    mount(stand, 'camshaft');
    expect(stand.components.cyl_head.installed && stand.components.camshaft.installed).toBe(true);
  });
});

describe('Heckmotor-Boxer', () => {
  it('Boxer auf dem Ständer bis zum Kolben zerlegen und wieder zusammenbauen; Umbau nur Boxer ↔ Heckmotor', () => {
    const car = mk('zuffen_365');
    expect(engineOf(car).layout).toBe('B4');
    expect(car.components.water_pump).toBeUndefined();
    const stand = asStand(extractEngine(car), 'zuffen_365');
    strip(stand, 'drain_plug');
    strip(stand, 'piston1');
    strip(stand, 'piston4');
    expect(stand.components.piston1.installed || stand.components.piston4.installed).toBe(false);
    for (const id of Object.keys(stand.components)) mount(stand, id);
    expect(r.isAssembled(stand)).toBe(true);
    expect(swapPlan(car, 'r4_20').possible).toBe(false);
    expect(swapPlan(mk('bavaria_320'), 'b4_16').possible).toBe(false);
    expect(swapPlan(car, 'b4_16').possible).toBe(true);
  });
});

describe('Gerissener Motorblock', () => {
  it('Ohne Öl weiterlaufen lassen reißt den Block – danach startet der Motor nicht mehr', async () => {
    const { oilHarm, CRACK_MS } = await import('./fluids');
    const { crackBlock } = await import('./motor');
    const car = mk('bavaria_330');
    car.fluids.oil.level = 0;
    expect(oilHarm(car, CRACK_MS - 1)?.crack).toBeFalsy();
    expect(oilHarm(car, CRACK_MS)!.crack).toBe(true);
    crackBlock(car, 'Test');
    expect(car.motor!.cracked).toBe(true);
    expect(oilHarm(car, CRACK_MS * 2)?.crack).toBeFalsy();
    car.fluids.oil.level = 5;
    expect(r.engineBlocker(car)).toBe(r.CRACKED_TEXT);
    expect(r.driveBlocker(car)).toBe(r.CRACKED_TEXT);
  });
  it('Gerissener Motor ist nur noch Schrott wert, das Auto verliert stark an Wert', async () => {
    const { engineValue, crackBlock } = await import('./motor');
    const { valuate } = await import('./market');
    const car = mk('bavaria_330');
    const before = valuate(car).value;
    const unitOk = extractEngine(structuredClone(car));
    crackBlock(car, 'Test');
    const unitBad = extractEngine(structuredClone(car));
    expect(engineValue(unitBad)).toBeLessThan(engineValue(unitOk) * 0.3);
    expect(engineTest(unitBad).findings.join(' ')).toContain('Motorblock');
    expect(valuate(car).value).toBeLessThan(before * 0.7);
  });
  it('Motortausch behebt den Schaden; Austauschmotor kostet mehr als einer vom Schrottplatz', async () => {
    const { crackBlock, freshEngine, newEnginePrice, junkEnginePrice } = await import('./motor');
    const car = mk('bavaria_330');
    crackBlock(car, 'Test');
    extractEngine(car);
    const engineId = engineOf({ ...car, motor: undefined }).id;
    insertEngine(car, { motor: { uid: 'neu', engineId, km: 0, donor: car.modelId, history: [] }, components: freshEngine(engineId), oil: 6 }, [], 3);
    expect(car.motor!.cracked).toBeFalsy();
    expect(r.engineBlocker(car)).toBeNull();
    const used = extractEngine(structuredClone(mk('bavaria_330')));
    expect(newEnginePrice(engineId)).toBeGreaterThan(junkEnginePrice(used) * 1.5);
  });
  it('Schrottautos mit gemeldetem Motorschaden haben oft einen gerissenen Block', () => {
    let cracked = 0;
    for (let i = 0; i < 60; i++) {
      let seed = i * 7919 + 13;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const c = junkify(mk('bavaria_330'), rnd, 1);
      if (c.motor?.cracked) {
        cracked++;
        expect(r.engineBlocker(c)).not.toBeNull();
      }
    }
    expect(cracked).toBeGreaterThan(0);
  });
});

describe('Schrottplatz: Hebebühne und fehlende Teile', () => {
  it('Ein am Schrottplatz fehlendes Teil lässt sich mit einem Ersatzteil wieder einbauen', () => {
    const car = mk('bavaria_330');
    const st = car.components.battery;
    Object.assign(st, { installed: false, missing: true, bolts: st.bolts.map(() => 0), connected: false });
    car.hoodOpen = true;
    // Ohne Teil: Hinweis auf Neuteil, mit Teil im Lager: eingebaut
    const none = r.componentAction(car, {}, 'battery', tool('hand'));
    expect(none.ok).toBe(false);
    const res = r.componentAction(car, {}, 'battery', tool('hand'), { source: { condition: 'ok', known: true, cost: 50, label: 'Batterie' } as any });
    expect(res.ok, res.message).toBe(true);
    expect(car.components.battery.missing).toBeUndefined();
    expect(car.components.battery.installed).toBe(true);
  });
});

describe('Kupplung und Kühler im Tuning', () => {
  it('verstärkte Kupplung und größerer Kühler wirken als eingebaute Tuningteile – ohne Motorumbau', async () => {
    const { engineOutput } = await import('./performance');
    const car = mk('bavaria_335_coupe', []);
    car.ecu = { map: 2, boost: 1.6, limiter: 0 };
    car.components.charge_pipe.variant = 'intercooler';
    for (const k of Object.keys(car.components)) if (/^piston\d$/.test(k)) car.components[k].variant = 'piston_forged';
    car.components.fuel_pump.variant = 'fuelpump_hp';
    for (const k of Object.keys(car.components)) if (/^inj\d$/.test(k)) car.components[k].variant = 'injector_hp';
    car.components.turbo.variant = 'turbo_big';
    const before = engineOutput(car);
    expect(before.risks.some((r) => r.id === 'clutch')).toBe(true);
    car.components.clutch.variant = 'clutch_hd';
    car.components.radiator.variant = 'swap_radiator';
    const after = engineOutput(car);
    expect(after.risks.some((r) => r.id === 'clutch')).toBe(false);
    const heat = (o: typeof before) => o.risks.find((r) => r.id === 'heat')?.level ?? 0;
    expect(heat(after)).toBeLessThanOrEqual(heat(before));
    expect(performance(car).ps).toBeGreaterThanOrEqual(performance({ ...car, components: { ...car.components, clutch: { ...car.components.clutch, variant: undefined } } }).ps);
  });
  it('Kupplung sitzt hinter dem Getriebe, der Kühler hinter dem Kühlmittelschlauch; luftgekühlte Boxer haben keinen Kühler', () => {
    const car = mk('bavaria_320', []);
    expect(defOf(car, 'clutch').blockedBy).toEqual(['gearbox']);
    expect(defOf(car, 'radiator').blockedBy).toEqual(['hose']);
    expect(defOf(car, 'clutch').variants).toEqual(['clutch_hd']);
    expect(mk('zuffen_929', []).components.radiator).toBeUndefined();
    expect(mk('zuffen_929', []).components.clutch).toBeDefined();
  });
  it('alter Motorumbau mit verstärkter Kupplung: beim Laden als sichtbares Tuningteil übernommen', async () => {
    const { normalizeCar } = await import('./store');
    const car = mk('bavaria_320', []);
    delete (car.components as any).clutch;
    delete (car.components as any).radiator;
    car.swap = { from: 'r4_20', parts: ['clutch_hd', 'swap_radiator'] };
    const loaded = normalizeCar(JSON.parse(JSON.stringify(car)))!;
    expect(loaded.components.clutch.variant).toBe('clutch_hd');
    expect(loaded.components.radiator.variant).toBe('swap_radiator');
  });
});

describe('Wirkung der Tuningteile', () => {
  it('Sportnockenwellen bringen Leistung (früher übersehen), Sport-Endtopf auch; Grenzteile erklären, warum sie (noch) nichts bringen', async () => {
    const { tuningEffects } = await import('./performance');
    const car = mk('bavaria_330', []);
    const stock = performance(car).ps;
    car.components.camshaft.variant = 'camshaft_sport';
    expect(performance(car).ps).toBeGreaterThan(stock);
    car.components.muffler.variant = 'muffler_sport';
    car.components.fuel_pump.variant = 'fuelpump_hp';
    const fx = tuningEffects(car);
    expect(fx.find((t) => t.part === 'camshaft_sport')!.ps).toBeGreaterThan(0);
    expect(fx.find((t) => t.part === 'muffler_sport')!.ps).toBeGreaterThan(0);
    const pump = fx.find((t) => t.part === 'fuelpump_hp')!;
    expect(pump.ps).toBe(0);
    expect(pump.note).toMatch(/Kraftstoffgrenze/);
    // V8: beide Bänke zusammen
    const v8 = mk('bavaria_340_ms', []);
    const s8 = performance(v8).ps;
    v8.components.camshaft.variant = 'camshaft_sport';
    v8.components.camshaft_b.variant = 'camshaft_sport';
    expect(performance(v8).ps).toBeGreaterThan(s8);
    expect(tuningEffects(v8).filter((t) => t.part === 'camshaft_sport').length).toBe(1);
  });
});
