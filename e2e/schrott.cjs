// Mega-Update: Schrottplatz → Motor ausbauen → Motorständer-Revision → Motorumbau R4→R6 → Turbo → Prüfstand → Optik → Neustart → alter Spielstand.
// Alle Schritte laufen über dieselben Spielaktionen wie die Tipps im Spiel (tapBolt, tapConnector, tapComponent, Kran, Ständer).
const { chromium } = require('playwright');
const S = process.env.GK_OUT || __dirname + '/out';
const URL = process.env.GK_URL || 'http://localhost:4173/?test';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const errs = []; let fails = 0;
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 200)); });
  const expect = (c, msg) => { if (!c) { fails++; console.log('FAIL:', msg); } else console.log('ok:', msg); };
  const G = (fn, arg) => p.evaluate(fn, arg);
  const st = () => G(() => { const s = window.__gk.getState(); return { money: s.money, used: s.used, engines: s.engines.map((u) => u.motor), crane: s.crane && s.crane.motor, toast: s.toast && s.toast.text, inv: s.inventory, visualStock: s.visualStock }; });
  const car = (slot) => G((slot) => window.__gk.getState().cars[slot], slot);
  await p.goto(URL); await p.waitForTimeout(1500);
  await p.getByText('Neues Spiel').click(); await p.getByText("Los geht's").click(); await p.waitForTimeout(600);
  // Hilfsfunktionen im Spiel: Bauteil samt allem davor mit dem richtigen Werkzeug ausbauen bzw. wieder einbauen
  await G(() => {
    const kit = ['ratchet', 'socket10', 'socket13', 'socket16', 'socket17', 'wrench', 'screwdriver', 'obd', 'torque'];
    const g = window.__gk; const L = window.__gkLib;
    const use = (t) => g.setState({ tool: t, carried: kit.filter((x) => x !== 'obd' && x !== 'torque').slice(0, 99) });
    window.__t = {
      strip(slot, id) {
        const c = g.getState().cars[slot]; const d = L.defOf(c, id); const s0 = c.components[id];
        if (!s0 || !s0.installed || s0.missing) return;
        for (const x of d.blockedBy) this.strip(slot, x);
        const cc = () => g.getState().cars[slot];
        if (cc().bare && cc().lifted !== !!(d.access === 'lifted' || d.under)) g.getState().flipEngine();
        if (!cc().bare && !cc().junk && (d.access === 'lifted') !== cc().lifted) g.getState().tapLift(slot);
        if (!cc().bare && d.access === 'hood' && !cc().hoodOpen) { use('hand'); g.getState().tapHood(slot); }
        cc().components[id].bolts.forEach((b, i) => { if (b === 0) return; if (b === 2) { use(d.fastener.driver); g.getState().tapBolt(slot, id, i); } use('hand'); g.getState().tapBolt(slot, id, i); });
        if (d.connector && cc().components[id].connected) { use('hand'); g.getState().tapConnector(slot, id); }
        use(d.removeWith ? d.removeWith.driver : 'hand'); g.getState().tapComponent(slot, id);
      },
      mount(slot, id, choice) {
        const c = g.getState().cars[slot]; const d = L.defOf(c, id); const s0 = c.components[id];
        if (!s0 || s0.installed) return;
        for (const x of L.defsOf(c).filter((x) => x.blockedBy.includes(id))) this.mount(slot, x.id);
        const cc = () => g.getState().cars[slot];
        if (cc().bare && cc().lifted !== !!(d.access === 'lifted' || d.under)) g.getState().flipEngine();
        if (!cc().bare && (d.access === 'lifted') !== cc().lifted) g.getState().tapLift(slot);
        use(d.removeWith ? d.removeWith.driver : 'hand');
        if (choice) g.getState().installWith(slot, id, choice);
        else g.getState().installWith(slot, id, { kind: 'old' });
        cc().components[id].bolts.forEach((_, i) => { use('hand'); g.getState().tapBolt(slot, id, i); use(d.fastener.torque ? 'torque' : d.fastener.driver); if (d.fastener.torque) g.setState({ carried: ['ratchet', 'socket17', 'torque'] }); g.getState().tapBolt(slot, id, i); });
        if (d.connector && !cc().components[id].connected) { use('hand'); g.getState().tapConnector(slot, id); }
      },
    };
  });

  // ---------- 1: Schrottplatz, Teil ausbauen und kaufen ----------
  expect(await G(() => window.__gk.getState().cars.slice(16, 22).filter(Boolean).length) === 6, 'Schrottplatz: sechs Spenderautos stehen bereit');
  await G(() => window.__gkLib.travel('schrott')); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${S}/schrott-platz.png` });
  // Spenderauto mit R6 und bekanntem Lagerschaden vorbereiten (der Zufall bestimmt sonst, was dasteht)
  await G(() => { const g = window.__gk; const L = window.__gkLib; const s = g.getState(); const c = L.createCar('bavaria_330', ['bearing'], Math.random, {}); L.motor.junkify(c, () => 0.99, s.day); c.motor = undefined; for (const k of Object.keys(c.components)) { c.components[k].missing = false; c.components[k].installed = true; c.components[k].bolts = c.components[k].bolts.map(() => 2); c.components[k].connected = true; } c.components.bearing.condition = 'defect'; const cars = [...s.cars]; cars[16] = c; g.setState({ cars, money: 50000 }); });
  let m0 = (await st()).money;
  await G(() => window.__t.strip(16, 'alternator'));
  let s1 = await st();
  const alt = s1.used.find((u) => u.part === 'alternator');
  expect(alt && s1.money < m0 && (await car(16)).components.alternator.missing, `Lichtmaschine ausgebaut und bezahlt (${m0 - s1.money} €), Gebrauchtteil mit Kennung ${alt && alt.id}`);
  await G(() => { window.__gk.setState({ tool: 'hand' }); window.__gk.getState().tapComponent(16, 'alternator'); });
  expect((await st()).used.filter((u) => u.part === 'alternator').length === 1 && /fehlt/.test((await st()).toast), 'Dasselbe Teil lässt sich nicht noch einmal ausbauen (keine Duplikate)');
  // ---------- 1/2: Kompletten Motor ausbauen und in die Werkstatt liefern lassen ----------
  for (const id of ['battery', 'hose', 'intake_hose', 'harness', 'downpipe', 'mounts']) await G((id) => window.__t.strip(16, id), id);
  m0 = (await st()).money;
  await G(() => window.__gk.getState().liftEngine(16));
  s1 = await st();
  const r6 = s1.engines.find((m) => m.engineId === 'r6_30');
  expect(r6 && s1.money < m0 && (await car(16)).motor === null, `R6 aus dem Schrottauto gekauft und ausgebaut (${m0 - s1.money} €), liegt im Motorlager: ${r6 && r6.uid}`);
  await G(() => window.__gkLib.travel('werkstatt')); await p.waitForTimeout(800);

  // ---------- 3/4/5: Motorständer, Zerlegen, Pleuellager tauschen, Zusammenbauen ----------
  await G(() => { const g = window.__gk; g.setState({ upgrades: [...g.getState().upgrades, 'hoist', 'dyno', 'expansion', 'parking'] }); });
  await G((uid) => { const g = window.__gk.getState(); g.storageToCrane(uid); window.__gk.getState().craneToStand(); }, r6.uid);
  let stand = await car(15);
  expect(stand && stand.bare && stand.motor.uid === r6.uid, 'Motor sitzt mit derselben Kennung auf dem Motorständer');
  await p.evaluate(() => Object.assign(window.__gkPlayer, { x: 4.4, z: -0.55, yaw: Math.PI / 2, pitch: -0.35, zoom: false, work: null })); await p.waitForTimeout(800);
  await p.screenshot({ path: `${S}/schrott-staender.png` });
  await G(() => { window.__gk.setState((s) => ({ cars: s.cars.map((c, i) => (i === 15 ? { ...c, fluids: { ...c.fluids, oil: { ...c.fluids.oil, level: 0 } } } : c)) })); window.__t.strip(15, 'crank'); });
  stand = await car(15);
  expect(!stand.components.crank.installed && !stand.components.bearing.installed && !stand.components.mainbrg.installed, 'Motor bis zur Kurbelwelle zerlegt (Ölwanne, Ölpumpe, Pleuel- und Hauptlager, Steuerkette)');
  expect(stand.components.bearing.known && stand.components.bearing.condition === 'defect', 'Verschlissene Pleuellager beim Ausbau erkannt');
  await G(() => window.__gk.getState().buyPart('rod_bearing', 15));
  await G(() => window.__t.mount(15, 'bearing', { kind: 'new' }));
  // Die am Schrottplatz gekaufte Lichtmaschine fehlt am Motor: das gebrauchte Exemplar wird eingesetzt
  await G((id) => window.__t.mount(15, 'alternator', { kind: 'used', id }), alt.id);
  expect((await car(15)).components.alternator.installed && !(await st()).used.some((u) => u.id === alt.id), 'Fehlende Lichtmaschine mit dem gebrauchten Exemplar vom Schrottplatz ersetzt');
  // Weitere fehlende Teile (z. B. der Riemen, der vor der Lichtmaschine saß): Gebrauchtteil, sonst neu bestellen
  await G(() => {
    const g = window.__gk; const c = g.getState().cars[15];
    for (const [id, v] of Object.entries(c.components)) {
      if (!v.missing) continue;
      const d = window.__gkLib.defOf(c, id);
      const u = g.getState().used.find((x) => x.part === d.partId);
      if (u) window.__t.mount(15, id, { kind: 'used', id: u.id });
      else { g.getState().buyPart(d.partId, 15); window.__t.mount(15, id, { kind: 'new' }); }
    }
  });
  await G(() => { const g = window.__gk; for (const d of window.__gkLib.defsOf(g.getState().cars[15])) window.__t.mount(15, d.id); });
  stand = await car(15);
  stand = await car(15);
  expect(stand.components.bearing.condition === 'ok' && (await G(() => window.__gkLib.motor.unitComplete(window.__gkLib.motor.fromStand(window.__gk.getState().cars[15])))), 'Neue Pleuellager, Motor komplett wieder zusammengebaut');
  await G(() => window.__gk.getState().testEngine());
  const rep = await G(() => window.__gk.getState().engineReport);
  expect(rep && rep.compression.length === 6 && rep.oilPressure > 3, `Motorprüfstand: 6 Zylinder, Kompression ${rep && rep.compression.join('/')} bar, Öldruck ${rep && rep.oilPressure} bar`);
  await G(() => window.__gk.getState().setPanel(null));

  // ---------- 6/7/8: Vierzylinder-Limousine bekommt den Sechszylinder ----------
  await G(() => { const g = window.__gk; const s = g.getState(); const c = window.__gkLib.createCar('bavaria_318', [], Math.random, { year: 2008 }); c.purchasePrice = 4000; c.testDriven = true; const cars = [...s.cars]; cars[0] = c; g.setState({ cars }); });
  const before = await G(() => { const p = window.__gkLib.perf(window.__gk.getState().cars[0]); return { ps: p.ps, accel: p.accel, vmax: p.vmax, weight: p.weight }; });
  for (const id of ['battery', 'hose', 'intake_hose', 'harness', 'downpipe', 'mounts']) await G((id) => window.__t.strip(0, id), id);
  await G(() => { const g = window.__gk; if (g.getState().cars[0].lifted) g.getState().tapLift(0); if (!g.getState().cars[0].hoodOpen) { g.setState({ tool: 'hand' }); g.getState().tapHood(0); } g.getState().liftEngine(0); });
  const r4uid = (await st()).crane && (await st()).crane.uid;
  expect(r4uid && (await car(0)).motor === null, 'Originaler Vierzylinder mit dem Kran herausgehoben');
  await G(() => { const g = window.__gk.getState(); g.craneToStorage(); window.__gk.getState().standToCrane(); });
  expect((await st()).engines.some((m) => m.uid === r4uid) && (await st()).crane.uid === r6.uid, 'Originalmotor im Lager aufbewahrt, Sechszylinder am Kran');
  await G(() => { const g = window.__gk.getState(); const plan = window.__gkLib.motor.swapPlan(g.cars[0], g.crane.motor.engineId); for (const n of plan.needs) window.__gk.getState().buySwapPart(n.part, n.key); window.__gk.getState().installEngine(0); });
  let c0 = await car(0);
  expect(c0.motor && c0.motor.uid === r6.uid && c0.components.coil6 && c0.swap && c0.swap.parts.includes('swap_adapter'), `Sechszylinder eingebaut (Umbauteile: ${c0.swap && c0.swap.parts.join(', ')})`);
  for (const id of ['mounts', 'harness', 'downpipe', 'intake_hose', 'hose', 'battery']) await G((id) => window.__t.mount(0, id), id);
  await G(() => { const g = window.__gk; if (g.getState().cars[0].lifted) g.getState().tapLift(0); g.setState({ fluidStock: { ...g.getState().fluidStock, coolant: 20, oil_5w40: 10, oil_5w30: 10 } }); g.getState().addFluid(0, 'coolant', 'coolant', 10); g.getState().bleedCoolant(0); g.getState().addFluid(0, 'oil', 'oil_5w30', 6.5); });
  c0 = await car(0);
  const after = await G(() => { const p = window.__gkLib.perf(window.__gk.getState().cars[0]); return { ps: p.ps, accel: p.accel, vmax: p.vmax, weight: p.weight }; });
  expect(after.ps > before.ps * 1.4 && after.accel > before.accel * 1.15 && after.weight > before.weight, `Leistung und Fahrverhalten: ${before.ps}→${after.ps} PS, Beschleunigung ${before.accel.toFixed(1)}→${after.accel.toFixed(1)}, ${Math.round(before.weight)}→${Math.round(after.weight)} kg`);
  await p.evaluate(() => { const pl = window.__gkPlayer; pl.work = null; pl.x = 2.95; pl.z = -2.7; pl.yaw = Math.PI / 2; pl.pitch = -0.75; pl.zoom = true; }); await p.waitForTimeout(900);
  await p.screenshot({ path: `${S}/schrott-umbau-r6.png` });

  // ---------- 9/10: Turbo nachrüsten, Steuergerät, Prüfstand ----------
  await G(() => { const g = window.__gk.getState(); g.buyPart('turbo_kit', 0); window.__gk.getState().fitTurboKit(0); window.__t.mount(0, 'turbo'); window.__t.mount(0, 'charge_pipe'); });
  c0 = await car(0);
  expect(c0.motor.turboKit && c0.components.turbo.installed && c0.components.charge_pipe.installed, 'Turbolader und Ladeluftrohr nachgerüstet und festgeschraubt');
  await G(() => { const g = window.__gk; g.setState({ carried: ['obd', 'ratchet', 'socket10'] }); g.getState().setEcu(0, { boost: 0.6 }, 2); });
  const turbo = await G(() => window.__gkLib.perf(window.__gk.getState().cars[0]));
  expect(turbo.ps > after.ps * 1.1 && turbo.output.boost > 0.4, `Mit Kennfeld Stufe 2: ${turbo.ps} PS bei ${turbo.output.boost} bar (vorher ${after.ps} PS)`);
  await G(() => { const g = window.__gk; g.setState({ tool: 'hand' }); if (!g.getState().cars[0].hoodOpen) g.getState().tapHood(0); g.getState().tapHood(0); g.getState().runDyno(0); });
  c0 = await car(0);
  expect(c0.dyno && c0.dyno.ps > before.ps * 1.5, `Leistungsprüfstand misst ${c0.dyno && c0.dyno.ps} PS – ${(await st()).toast}`);
  await G(() => window.__gk.getState().setPanel(null));

  // ---------- 11: Felgen und Stoßstange sichtbar ----------
  await G(() => { const g = window.__gk.getState(); for (const id of ['rim:five', 'front:1', 'susp:sport', 'spoiler:2']) window.__gk.getState().buyVisual(id); for (const id of ['rim:five', 'front:1', 'susp:sport', 'spoiler:2']) window.__gk.getState().mountVisual(0, id); });
  c0 = await car(0);
  expect(c0.visual.rim === 'five' && c0.visual.front === 1 && c0.visual.suspension === 'sport' && c0.visual.spoiler === 2, 'Sportfelgen, Frontstoßstange, Sportfahrwerk und Entenbürzel montiert');
  await p.evaluate(() => { const pl = window.__gkPlayer; pl.work = null; pl.x = 4.6; pl.z = -0.5; pl.yaw = Math.atan2(4.6, -2.2); pl.pitch = -0.15; pl.zoom = false; }); await p.waitForTimeout(900);
  await p.screenshot({ path: `${S}/schrott-optik.png` });

  // ---------- 13: Gebrauchtteil nur einmal einbaubar ----------
  await G(() => { const g = window.__gk; const s = g.getState(); const cars = [...s.cars]; const c = structuredClone(cars[17]); c.components.battery = { installed: true, bolts: [2], connected: true, condition: 'ok', known: false }; c.hoodOpen = true; cars[17] = c; g.setState({ cars }); window.__t.strip(17, 'battery'); });
  const bat = (await st()).used.find((u) => u.part === 'battery');
  await G(() => window.__t.strip(0, 'battery'));
  await G((id) => { window.__gk.setState({ tool: 'hand' }); window.__gk.getState().installWith(0, 'battery', { kind: 'used', id }); }, bat.id);
  const gone = !(await st()).used.some((u) => u.id === bat.id) && (await car(0)).components.battery.installed;
  await G(() => window.__t.strip(0, 'battery'));
  await G((id) => window.__gk.getState().installWith(0, 'battery', { kind: 'used', id }), bat.id);
  expect(gone && !(await car(0)).components.battery.installed && /nicht mehr da/.test((await st()).toast), 'Gebrauchte Batterie vom Schrottplatz eingebaut – dasselbe Exemplar gibt es kein zweites Mal');
  await G(() => window.__t.mount(0, 'battery'));

  // ---------- 16: Nach Neustart alles erhalten ----------
  const keep = await G(() => { const s = window.__gk.getState(); return JSON.stringify({ m: s.cars[0].motor.uid, sw: s.cars[0].swap, v: s.cars[0].visual, e: s.engines.map((u) => u.motor.uid), used: s.used.map((u) => u.id), stand: !!s.cars[15], ecu: s.cars[0].ecu }); });
  await p.waitForTimeout(500); await p.reload(); await p.waitForTimeout(1500);
  const again = await G(() => { const s = window.__gk.getState(); return JSON.stringify({ m: s.cars[0].motor.uid, sw: s.cars[0].swap, v: s.cars[0].visual, e: s.engines.map((u) => u.motor.uid), used: s.used.map((u) => u.id), stand: !!s.cars[15], ecu: s.cars[0].ecu }); });
  expect(keep === again, 'Nach Neuladen: Motor im Auto, Umbauteile, Optik, Motorlager, Gebrauchtteile, Steuergerät erhalten');

  // ---------- 17: Alter Einzelspieler-Spielstand (Version 5, 15 Stellplätze) ----------
  await G(() => {
    const car = window.__gkLib.createCar('bavaria_320', ['coil'], Math.random, {}); car.purchasePrice = 3000;
    for (const k of ['harness', 'mounts', 'downpipe', 'fuel_pump', 'intake_manifold', 'exhaust_manifold', 'timing_chain', 'camshaft', 'oil_pump', 'mainbrg', 'crank', 'piston1', 'piston2', 'piston3', 'piston4']) delete car.components[k];
    const cars = Array(15).fill(null); cars[0] = car;
    localStorage.setItem('garage-kings-save-v1', JSON.stringify({ version: 5, state: { money: 7777, cars, started: true, screen: 'garage', upgrades: [], inventory: { 'spark_plug@R4': 2 }, day: 9 } }));
  });
  await p.reload(); await p.waitForTimeout(1500);
  const old = await G(() => { const s = window.__gk.getState(); return { money: s.money, len: s.cars.length, junk: s.cars.slice(16).filter(Boolean).length, coil: Object.keys(s.cars[0].components).filter((k) => /^coil/.test(k)).length, harness: s.cars[0].components.harness && s.cars[0].components.harness.installed, def: window.__gkLib.defsOf(s.cars[0]).length === Object.keys(s.cars[0].components).length, engines: s.engines.length }; });
  expect(old.money === 7777 && old.len === 22 && old.junk === 6 && old.harness && old.def && old.engines === 0, `Alter Spielstand übernommen: Geld, Auto mit neuen Teilen ergänzt, Schrottplatz gefüllt (${JSON.stringify(old)})`);

  console.log('errors:', JSON.stringify(errs));
  console.log(fails || errs.length ? `FEHLER: ${fails + errs.length}` : 'ALLES OK');
  await b.close();
})().catch((e) => { console.log('Error:', e.message); process.exit(1); });
