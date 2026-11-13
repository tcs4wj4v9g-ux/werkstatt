// Neue mechanische Bauteile mit echten Taps: Ansaugschlauch, Kettenspanner, Hydrostößel, Pleuellager. Dazu Übernahme eines Spielstands der Vorversion.
const { chromium } = require('playwright');
const S = process.env.GK_OUT || __dirname + '/out'; const URL = process.env.GK_URL || 'http://localhost:4173/?test';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const errs = []; let fails = 0;
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  const expect = (c, msg) => { if (!c) { fails++; console.log('FAIL:', msg); } else console.log('ok:', msg); };
  const EYE = 1.62, BZ = -2.7, LIFT = 1.7;
  const toast = () => p.evaluate(() => { const t = window.__gk.getState().toast; return t && t.text; });
  const comp = (id) => p.evaluate((id) => window.__gk.getState().cars[0].components[id], id);
  const kit = (active, carried = ['ratchet', 'socket10', 'socket13', 'socket17', 'screwdriver', 'wrench']) => p.evaluate(([active, carried]) => window.__gk.setState({ tool: active, carried }), [active, carried]);
  const aimTap = async (from, to, wait = 170) => {
    await p.evaluate(([from, to, EYE]) => { const pl = window.__gkPlayer; pl.work = null; pl.x = from[0]; pl.z = from[1]; const dx = to[0] - from[0], dz = to[2] - from[1]; pl.yaw = Math.atan2(-dx, -dz); pl.pitch = Math.atan2(to[1] - EYE, Math.hypot(dx, dz)); pl.zoom = true; }, [from, to, EYE]);
    await p.waitForTimeout(wait); await p.mouse.click(590, 410); await p.waitForTimeout(80);
  };
  const W = (lifted, x, y, z) => [x, y + (lifted ? LIFT : 0), z + BZ];
  /** Schraube lösen + herausdrehen bzw. ansetzen + festziehen. */
  const boltsOut = async (from, pts, tool, lifted = 0) => { await kit(tool); for (const q of pts) await aimTap(from, W(lifted, ...q)); await kit('hand'); for (const q of pts) await aimTap(from, W(lifted, ...q)); };
  const boltsIn = async (from, pts, tool, lifted = 0) => { await kit('hand'); for (const q of pts) await aimTap(from, W(lifted, ...q)); await kit(tool); for (const q of pts) await aimTap(from, W(lifted, ...q)); };
  const done = async (id) => { const c = await comp(id); return c.installed && c.condition === 'ok' && c.bolts.every((x) => x === 2) && c.connected; };

  // --- Spielstand der Vorversion (Version 2) übernehmen ---
  await p.goto(URL);
  await p.evaluate(() => {
    const c = (n, extra = {}) => ({ installed: true, bolts: Array(n).fill(true), condition: 'ok', known: false, ...extra });
    const components = { coil1: c(1), coil2: c(1, { installed: false, bolts: [false], condition: 'defect', known: true }), coil3: c(1), coil4: c(1), plug1: c(0), plug2: c(0), plug3: c(0), plug4: c(0), valve_cover: c(6), gasket: c(0), belt: c(0), alternator: c(2), water_pump: c(4), hose: c(1), thermostat: c(2), oil_pan: c(4), oil_pan_gasket: c(0, { condition: 'defect' }), wheel_fl: c(5), caliper_fl: c(2), pads_fl: c(0), disc_fl: c(1), wheel_fr: c(5, { bolts: [true, false, false, true, true] }), caliper_fr: c(2), pads_fr: c(0), disc_fr: c(1) };
    const car = { uid: 'v2car', modelId: 'bavaria_320', color: '#2a3a5c', year: 2007, km: 189000, cleanValue: 7800, components, hoodOpen: false, lifted: true, purchasePrice: 4300, partsSpent: 79, testDriven: false, haggled: false, obdCodes: ['P0302 – Zündaussetzer Zylinder 2 erkannt'] };
    const listing = { id: 'x', car: { ...car, uid: 'x' }, seller: 'Herr Alt', asking: 5000, minPrice: 4200, patience: 4, current: 5000, hints: ['coil'], checks: [], closed: false, sellerLine: '' };
    localStorage.setItem('garage-kings-save-v1', JSON.stringify({ version: 2, state: { money: 2222, screen: 'garage', cars: [car, null], liftUp: [true, false], carried: ['ratchet', 'socket17', 'torque'], tool: 'ratchet', inventory: { ignition_coil: 1, brake_pads: 2 }, listings: [listing], selected: 0, day: 5, marketIndex: 1.07, carsSold: 3, totalProfit: 8100, started: true } }));
  });
  await p.reload(); await p.waitForTimeout(2500);
  let s = await p.evaluate(() => { const s = window.__gk.getState(); return { money: s.money, day: s.day, idx: s.marketIndex, sold: s.carsSold, carried: s.carried, tool: s.tool, inv: s.inventory, car: s.cars[0], listings: s.listings.map((l) => l.profile), jobs: s.jobs.length, sound: s.sound }; });
  expect(s.money === 2222 + 250 && s.day === 5 && s.idx === 1.07 && s.sold === 3, 'Alter Spielstand: Geld, Tag, Marktlage, Statistik erhalten');
  expect(s.carried.join() === 'ratchet,socket17,torque' && s.tool === 'ratchet' && s.inv['ignition_coil@R4'] === 1 && s.inv['brake_pads@Fahrwerk Günstige Gebrauchte'] === 2 && !s.inv['rod_bearing@R4'], 'Werkzeuge und Lager erhalten (nach Passform umgestellt)');
  const cc = s.car.components;
  expect(s.car.uid === 'v2car' && s.car.lifted && s.car.purchasePrice === 4300 && !cc.coil2.installed && cc.coil2.known && cc.wheel_fr.bolts.join() === '2,0,0,2,2', 'Auto samt unterbrochener Reparatur erhalten (Spule ausgebaut, Radschrauben teils heraus)');
  expect(!cc.engine_cover.installed && cc.bearing.condition === 'ok' && cc.coil1.connected && Array.isArray(s.car.observed), 'Neue Bauteile und Felder mit sicheren Standardwerten ergänzt');
  expect(s.listings.length === 25 && s.listings.every(Boolean) && s.jobs === 3 && s.sound === true, 'Markt neu gefüllt, Aufträge angelegt, Ton an');

  // --- Neues Spiel mit präpariertem Auto ---
  await p.evaluate(() => {
    const g = window.__gk; g.getState().newGame(); g.getState().viewListing(0); g.getState().offer(5400);
    const s = g.getState(); const car = JSON.parse(JSON.stringify(s.cars[0]));
    for (const c of Object.values(car.components)) c.condition = 'ok';
    for (const id of ['intake_hose', 'chain_tensioner', 'rocker', 'bearing']) car.components[id].condition = 'defect';
    car.hoodOpen = true; car.observed = [];
    const inv = {}; for (const k of ['ignition_coil','spark_plug','valve_cover_gasket','belt','water_pump','thermostat','alternator','oil_pan_gasket','intake_hose','coolant_hose','rod_bearing','lifters','chain_tensioner','oil_filter']) inv[k + '@R4'] = 3; for (const k of ['brake_pads','brake_disc','tire']) inv[k + '@Fahrwerk Günstige Gebrauchte'] = 3; inv['battery@alle'] = 3;
    g.setState({ cars: [car, null], inventory: inv, panel: null });
  });
  await p.waitForTimeout(1500);
  const front = [2.95, BZ], left = [1.5, BZ - 1.45];

  // Motor an: mechanische Geräusche, aber kein OBD-Code dafür
  await p.evaluate(() => window.__gk.getState().toggleEngine(0)); await p.waitForTimeout(300);
  let prof = await p.evaluate(() => window.__gkAudio.profile());
  expect(prof && prof.knock && prof.tick && prof.rattle && prof.hiss, 'Motorklang enthält Klackern, Tickern, Rasseln und Zischen');
  s = await p.evaluate(() => window.__gk.getState().cars[0].observed);
  expect(s.includes('rattle_start') && s.includes('hiss') && !s.includes('metal_noise'), 'Kalt: Rasseln und Zischen bemerkt, Klackern noch nicht');
  await p.evaluate(() => { window.__gk.setState({ engineSince: Date.now() - 20000 }); window.__gk.getState().engineTick(); window.__gk.getState().revEngine(); });
  s = await p.evaluate(() => window.__gk.getState().cars[0].observed);
  expect(s.includes('metal_noise') && s.includes('knock_load') && s.includes('tick_top'), 'Warm und mit Gas: metallisches Geräusch, Klackern unter Last, Tickern');
  const codes = await p.evaluate(() => { window.__gk.getState().scanObd(0); return window.__gk.getState().cars[0].obdCodes; });
  expect(codes.length === 1 && codes[0].startsWith('P0171'), 'OBD: nur der Gemisch-Code, kein Wort zu Lager, Stößeln oder Kette');
  expect(await p.evaluate(() => Object.values(window.__gk.getState().cars[0].components).every((c) => !c.known)), 'Kein Bauteil ist dadurch als defekt bestätigt');
  await p.evaluate(() => window.__gk.getState().toggleEngine(0));
  await kit('hand'); await aimTap(front, W(0, 1.25, 0.875, 0.1));
  expect(!(await comp('engine_cover')).installed, 'Motorabdeckung abgenommen');

  // Ansaugschlauch (Schelle mit Schraubendreher)
  await kit('lamp'); await aimTap(front, W(0, 1.28, 0.66, 0.31)); console.log('  ', await toast());
  expect((await comp('intake_hose')).known, 'Riss im Ansaugschlauch mit der Prüflampe gefunden');
  await boltsOut(front, [[1.28, 0.675, 0.215]], 'screwdriver');
  await aimTap(front, W(0, 1.28, 0.66, 0.31));
  expect(!(await comp('intake_hose')).installed, 'Ansaugschlauch abgenommen');
  await aimTap(front, W(0, 1.28, 0.66, 0.31));
  await boltsIn(front, [[1.28, 0.675, 0.215]], 'screwdriver');
  expect(await done('intake_hose'), 'Neuer Ansaugschlauch montiert, Schelle fest');

  // Kettenspanner (Ratsche + 17er)
  await kit('lamp'); await aimTap(left, W(0, 1.45, 0.6, -0.25)); console.log('  ', await toast());
  expect(!(await comp('chain_tensioner')).known, 'Kettenspanner: eingebaut nichts zu erkennen');
  await kit('ratchet'); await aimTap(left, W(0, 1.45, 0.6, -0.25));
  expect(!(await comp('chain_tensioner')).installed && (await comp('chain_tensioner')).known, 'Kettenspanner herausgedreht und als defekt erkannt');
  await aimTap(left, W(0, 1.45, 0.6, -0.25));
  expect(await done('chain_tensioner'), 'Neuer Kettenspanner eingeschraubt');

  // Hydrostößel unter dem Ventildeckel
  const CX = [1.03, 1.21, 1.39, 1.57];
  const CB = [1.0, 1.3, 1.6].flatMap((x) => [-0.15, 0.15].map((z) => [x, 0.795, z]));
  await boltsOut(front, CX.map((x) => [x, 0.795, -0.085]), 'ratchet');
  for (const x of CX) await aimTap(front, W(0, x, 0.84, 0.095));
  for (const x of CX) await aimTap(front, W(0, x, 0.848, 0));
  await boltsOut(front, CB, 'ratchet');
  await aimTap(front, W(0, 1.3, 0.785, 0.09));
  expect(!(await comp('valve_cover')).installed, 'Ventildeckel ab (4 Spulen mit Stecker, 6 Schrauben)');
  await p.screenshot({ path: S + '/v3x-rocker.png' });
  const RB = [[1.12, 0.755, 0.1], [1.48, 0.755, 0.1]];
  await boltsOut(front, RB, 'ratchet');
  await aimTap(front, W(0, 1.3, 0.745, 0.1));
  expect(!(await comp('rocker')).installed && (await comp('rocker')).known, 'Hydrostößel ausgebaut und als verschlissen erkannt');
  await aimTap(front, W(0, 1.3, 0.745, 0.1));
  await boltsIn(front, RB, 'ratchet');
  expect(await done('rocker'), 'Neue Hydrostößel montiert');
  await kit('hand'); await aimTap(front, W(0, 1.02, 0.925, 0));
  await boltsIn(front, CB, 'ratchet');
  for (const x of CX) await aimTap(front, W(0, x, 0.848, 0)).then(() => 0);
  await kit('hand');
  for (const x of CX) await aimTap(front, W(0, x, 0.848, 0));
  for (const x of CX) await aimTap(front, W(0, x, 0.87, 0.155));
  await boltsIn(front, CX.map((x) => [x, 0.795, -0.085]), 'ratchet');
  await kit('hand'); await aimTap(front, W(0, 1.25, 1.232, 0.1));
  const engineOk = await p.evaluate(() => { const c = window.__gk.getState().cars[0].components; return ['engine_cover', 'coil1', 'coil2', 'coil3', 'coil4', 'valve_cover', 'rocker', 'gasket'].filter((k) => !(c[k].installed && c[k].connected && c[k].bolts.every((x) => x === 2))); });
  expect(engineOk.length === 0, 'Motor oben wieder komplett: ' + engineOk.join(','));

  // Pleuellager unter der Ölwanne
  await p.evaluate(() => { const g = window.__gk.getState(); g.setTool('hand'); g.tapHood(0); g.tapLift(0); });
  await p.waitForTimeout(2800);
  const under = [2.5, BZ];
  const OB = [[1.1, 0.19, -0.12], [1.5, 0.19, -0.12], [1.1, 0.19, 0.12], [1.5, 0.19, 0.12]];
  // Neu seit dem Ölsystem: vor dem Abnehmen der Wanne das Öl ablassen.
  await p.evaluate(() => window.__gk.getState().togglePan(0));
  await kit('ratchet'); await aimTap(under, W(1, 1.4, 0.185, 0.08));
  expect(!(await comp('drain_plug')).installed, 'Öl über die Ablassschraube abgelassen');
  await boltsOut(under, OB, 'ratchet', 1);
  await aimTap(under, W(1, 1.3, 0.2, 0));
  expect(!(await comp('oil_pan')).installed, 'Ölwanne ab');
  await kit('lamp'); await aimTap(under, W(1, 1.36, 0.23, 0)); console.log('  ', await toast());
  expect((await comp('bearing')).known, 'Lagerschaden erst nach Abnahme der Ölwanne sichtbar');
  await p.screenshot({ path: S + '/v3x-bearing.png' });
  const BB = [[1.3, 0.22, -0.06], [1.3, 0.22, 0.06]];
  await boltsOut(under, BB, 'ratchet', 1);
  await aimTap(under, W(1, 1.36, 0.23, 0));
  expect(!(await comp('bearing')).installed, 'Pleuellager ausgebaut');
  await aimTap(under, W(1, 1.36, 0.23, 0));
  await boltsIn(under, BB, 'ratchet', 1);
  expect(await done('bearing'), 'Neues Pleuellager montiert');
  await kit('hand'); await aimTap(under, W(1, 1.5, 0.07, 0.1));
  await boltsIn(under, OB, 'ratchet', 1);
  await kit('ratchet'); await aimTap(under, W(1, 1.4, 0.185, 0.08));
  expect((await comp('drain_plug')).installed, 'Ablassschraube wieder drin');
  await p.evaluate(() => { const g = window.__gk.getState(); g.togglePan(0); g.tapLift(0); }); await p.waitForTimeout(2600);
  await p.evaluate(() => { const g = window.__gk; g.setState({ fluidStock: { ...g.getState().fluidStock, oil_5w30: 5 }, tool: 'hand' }); g.getState().tapHood(0); g.getState().addFluid(0, 'oil', 'oil_5w30', 4.5); });
  expect((await p.evaluate(() => window.__gk.getState().cars[0].fluids.oil.level)) === 4.5, 'Frisches Öl eingefüllt');
  const open = await p.evaluate(() => { const s = window.__gk.getState(); const c = s.cars[0].components; return [s.cars[0].lifted ? 'angehoben' : '', ...Object.keys(c).filter((k) => !(c[k].installed && c[k].connected && c[k].bolts.every((x) => x === 2) && c[k].condition === 'ok'))].filter(Boolean); });
  expect(open.length === 0, 'Auto komplett montiert, alle vier Defekte behoben ' + open.join(','));
  await p.evaluate(() => window.__gk.getState().toggleEngine(0)); await p.waitForTimeout(300);
  prof = await p.evaluate(() => window.__gkAudio.profile());
  expect(prof && !prof.knock && !prof.tick && !prof.rattle && !prof.hiss, 'Motor klingt nach der Reparatur sauber');
  console.log('errors:', errs); console.log(fails ? 'FEHLER: ' + fails : 'ALLES OK');
  await b.close();
})();
