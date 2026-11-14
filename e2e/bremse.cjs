const { chromium } = require('playwright');
const S = process.env.GK_OUT || __dirname + '/out'; const URL = process.env.GK_URL || 'http://localhost:4173/?test';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const errs = []; let fails = 0;
  p.on('pageerror', (e) => errs.push(e.message));
  const expect = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok:', m); };
  const EYE = 1.62, BZ = -2.7, LIFT = 1.7;
  const st = () => p.evaluate(() => { const s = window.__gk.getState(); return { brake: s.cars[0].fluids.brake, toast: s.toast && s.toast.text, stock: s.fluidStock.brake_fluid, focus: document.querySelector('.focus-label') && document.querySelector('.focus-label').textContent }; });
  const aimTap = async (from, to) => { await p.evaluate(([from, to, EYE]) => { const pl = window.__gkPlayer; pl.work = null; pl.x = from[0]; pl.z = from[1]; const dx = to[0] - from[0], dz = to[2] - from[1]; pl.yaw = Math.atan2(-dx, -dz); pl.pitch = Math.atan2(to[1] - EYE, Math.hypot(dx, dz)); pl.zoom = true; }, [from, to, EYE]); await p.waitForTimeout(400); await p.mouse.click(590, 410); await p.waitForTimeout(150); };
  await p.goto(URL); await p.waitForTimeout(2000);
  await p.getByText('Neues Spiel').click(); await p.getByText("Los geht's").click();
  await p.evaluate(() => {
    const g = window.__gk; g.getState().viewListing(0); g.getState().offer(5400);
    const s = g.getState(); const car = JSON.parse(JSON.stringify(s.cars[0]));
    car.lifted = true; car.fluids.brake = { level: 0.8, quality: 0.15, air: true, bled: { fl: false, fr: false } };
    for (const w of ['wheel_fl', 'wheel_fr']) car.components[w] = { ...car.components[w], installed: false, bolts: [0, 0, 0, 0, 0] };
    g.setState({ cars: [car, ...s.cars.slice(1)], liftUp: [true, false], panel: null, tool: 'hand', carried: [], money: 6000 });
  });
  await p.waitForTimeout(2800);
  const nip = (sg) => [1.455, 0.525 + LIFT, BZ + sg * 0.805];
  const fromL = [1.6, BZ - 1.6], fromR = [1.6, BZ + 1.6];
  await aimTap(fromL, nip(-1)); await p.waitForTimeout(600);
  let s = await st();
  expect(s.focus && s.focus.includes('Entlüfternippel'), 'Nippel im Fadenkreuz: ' + s.focus);
  expect(s.toast && s.toast.includes('Schraubenschlüssel'), 'Ohne Schlüssel: Hinweis – ' + (s.toast || ''));
  await p.screenshot({ path: S + '/bleed1.png' });
  await p.evaluate(() => window.__gk.setState({ tool: 'wrench', carried: ['wrench'] }));
  await aimTap(fromL, nip(-1));
  s = await st();
  expect(!s.brake.bled.fl && s.toast.includes('Bremsflüssigkeit'), 'Ohne Bremsflüssigkeit im Lager: Hinweis – ' + s.toast);
  await p.evaluate(() => window.__gk.getState().buyFluid('brake_fluid'));
  await aimTap(fromL, nip(-1));
  s = await st();
  expect(s.brake.bled.fl && s.brake.air && s.stock === 0.5, 'Links entlüftet, Luft noch drin: ' + s.toast);
  await p.waitForTimeout(300); await p.screenshot({ path: S + '/bleed2.png' });
  await aimTap(fromR, nip(1));
  s = await st();
  expect(!s.brake.air && s.brake.quality === 1 && s.stock === 0, 'Rechts entlüftet: Bremse frisch und ohne Luft – ' + s.toast);
  // Knopf im Fenster funktioniert mit Schlüssel am Gürtel
  await p.evaluate(() => { const g = window.__gk; const s = g.getState(); const car = JSON.parse(JSON.stringify(s.cars[0])); car.fluids.brake.air = true; g.setState({ cars: [car, ...s.cars.slice(1)], tool: 'hand', carried: ['wrench'], fluidStock: { ...s.fluidStock, brake_fluid: 1 } }); g.getState().setPanel('fluids', 0); });
  await p.waitForTimeout(300);
  await p.getByText('Entlüften vorne links').click(); await p.getByText('Entlüften vorne rechts').click(); await p.waitForTimeout(200);
  s = await st();
  expect(!s.brake.air, 'Knöpfe im Flüssigkeiten-Fenster funktionieren mit Schlüssel am Gürtel');
  // ---------- Hinterachse: Rad, Sattel, Beläge hinten links wechseln ----------
  await p.evaluate(() => { const g = window.__gk; g.getState().setPanel(null); const s = g.getState(); const car = JSON.parse(JSON.stringify(s.cars[0])); car.lifted = true; car.components.pads_rl.condition = 'defect'; car.components.pads_rr.condition = 'defect'; g.setState({ cars: [car, ...s.cars.slice(1)], liftUp: [true, false], tool: 'ratchet', carried: ['ratchet', 'socket17', 'torque'], money: 6000 }); });
  await p.waitForTimeout(800);
  await p.evaluate(() => Object.assign(window.__gkPlayer, { x: -0.5, z: -5.2, yaw: 0 }));
  await p.waitForTimeout(600);
  const labels = await p.$$eval('.car-actions button', (b) => b.map((x) => x.textContent));
  expect(labels.some((t) => t.includes('Rad hinten links')) && labels.some((t) => t.includes('Rad hinten rechts')), 'Arbeitsansichten für die Hinterräder: ' + labels.filter((t) => t.includes('🎯')).join(', '));
  await p.locator('.car-actions button', { hasText: 'Rad hinten links' }).click(); await p.waitForTimeout(800);
  // Schrauben im Bild suchen (Beschriftung nennt das Werkzeug) und eine echte Schraube antippen
  const findBolts = (prefix) => p.evaluate((prefix) => {
    const out = []; const cam = window.__gkCamera; const v = new cam.position.constructor();
    window.__gkScene.traverse((o) => { if (o.userData && typeof o.userData.label === 'string' && o.userData.label.startsWith(prefix)) { o.getWorldPosition(v); v.project(cam); out.push({ label: o.userData.label, x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }); } });
    return out;
  }, prefix);
  let bolts = await findBolts('Schraube – Rad hinten links');
  expect(bolts.length === 5 && bolts[0].label.includes('Ratsche + 17er Nuss') && bolts[0].label.includes('Drehmomentschlüssel'), 'Fünf Radschrauben hinten links, Beschriftung nennt das Werkzeug: ' + (bolts[0] && bolts[0].label));
  const onScreen = bolts.filter((b) => b.x > 0 && b.x < 1180 && b.y > 0 && b.y < 820);
  if (onScreen[0]) { await p.mouse.click(onScreen[0].x, onScreen[0].y); await p.waitForTimeout(300); }
  const rl = () => p.evaluate(() => window.__gk.getState().cars[0].components);
  expect((await rl()).wheel_rl.bolts.includes(1), 'Radschraube hinten links per Antippen im Bild gelöst');
  await p.screenshot({ path: S + '/rad-hinten.png' });
  // Rest über die Spielaktionen: Rad, Sattel, Beläge ab, neue Beläge rein, alles fest
  const done = await p.evaluate(() => {
    const g = window.__gk; const use = (t) => g.setState({ tool: t });
    const strip = (id) => { const c = () => g.getState().cars[0].components[id]; c().bolts.forEach((b, i) => { if (b === 2) { use('ratchet'); g.getState().tapBolt(0, id, i); } if (c().bolts[i] === 1) { use('hand'); g.getState().tapBolt(0, id, i); } }); use('hand'); g.getState().tapComponent(0, id); return !c().installed; };
    const out = { wheel: strip('wheel_rl'), caliper: strip('caliper_rl'), pads: strip('pads_rl') };
    g.getState().buyPart('brake_pads', 0); use('hand'); g.getState().tapComponent(0, 'pads_rl');
    if (g.getState().partPrompt) g.getState().resolvePrompt?.('new');
    const fit = (id) => { use('hand'); g.getState().tapComponent(0, id); g.getState().cars[0].components[id].bolts.forEach((_, i) => { use('hand'); g.getState().tapBolt(0, id, i); use(id.startsWith('wheel') ? 'torque' : 'ratchet'); g.getState().tapBolt(0, id, i); }); };
    fit('caliper_rl'); fit('wheel_rl');
    const c = g.getState().cars[0].components;
    return { ...out, padsOk: c.pads_rl.installed && c.pads_rl.condition === 'ok', back: c.caliper_rl.bolts.every((b) => b === 2) && c.wheel_rl.bolts.every((b) => b === 2), prompt: g.getState().partPrompt, toast: g.getState().toast && g.getState().toast.text };
  });
  expect(done.wheel && done.caliper && done.pads, 'Rad, Bremssattel und Beläge hinten links ausgebaut');
  expect(done.padsOk && done.back, 'Neue Beläge hinten links eingebaut, Sattel und Rad festgezogen – ' + JSON.stringify(done));
  // ---------- Kleinstwagen (Monospace-Form): Räder vorn/hinten und Motorraum im Bild erreichbar ----------
  await p.evaluate(() => { const g = window.__gk; const s = g.getState(); const car = window.__gkLib.createCar('renard_twingle', [], Math.random, {}); car.lifted = true; g.setState({ cars: [car, ...s.cars.slice(1)], liftUp: [true, false], tool: 'ratchet', carried: ['ratchet', 'socket17', 'socket10'], panel: null }); Object.assign(window.__gkPlayer, { x: -0.5, z: -5.2, yaw: 0, work: null }); });
  await p.waitForTimeout(900);
  for (const view of ['Rad vorne links', 'Rad hinten links']) {
    await p.locator('.car-actions button', { hasText: view }).click(); await p.waitForTimeout(800);
    const bolts = (await findBolts('Schraube – ' + view.replace('Rad', 'Rad'))).filter((b) => b.x > 0 && b.x < 1180 && b.y > 0 && b.y < 820);
    const id = view.includes('hinten') ? 'wheel_rl' : 'wheel_fl';
    if (bolts[0]) { await p.mouse.click(bolts[0].x, bolts[0].y); await p.waitForTimeout(300); }
    const st0 = await p.evaluate((id) => window.__gk.getState().cars[0].components[id].bolts, id);
    expect(bolts.length === 5 && st0.includes(1), `Kleinstwagen: ${view} – Radschraube im Bild angetippt und gelöst`);
    await p.locator('[data-testid=leave]').click(); await p.waitForTimeout(300);
  }
  await p.evaluate(() => { const g = window.__gk; const s = g.getState(); const c = { ...s.cars[0], lifted: false, hoodOpen: true }; g.setState({ cars: [c, ...s.cars.slice(1)], liftUp: [false, false], tool: 'hand' }); Object.assign(window.__gkPlayer, { x: 3.2, z: -2.7, yaw: Math.PI / 2, work: null }); });
  await p.waitForTimeout(900);
  await p.locator('.car-actions button', { hasText: 'Motor von vorn' }).click(); await p.waitForTimeout(900);
  const cover = (await findBolts('Motorabdeckung')).filter((b) => b.x > 0 && b.x < 1180 && b.y > 0 && b.y < 820);
  if (cover[0]) { await p.evaluate(() => window.__gk.setState({ toast: null })); await p.mouse.click(cover[0].x, cover[0].y); await p.waitForTimeout(300); }
  const t = await p.evaluate(() => window.__gk.getState().toast && window.__gk.getState().toast.text);
  expect(cover.length > 0 && !!t, 'Kleinstwagen: Motorabdeckung unter der kurzen Haube im Bild antippbar – ' + t);
  // ---------- Vorn angeschlagene Motorhaube (Zweitürer der 80er): Ansicht „Motor von oben“, Teile erreichbar ----------
  await p.evaluate(() => { const g = window.__gk; const s = g.getState(); const c = window.__gkLib.createCar('bavaria_323i', [], Math.random, {}); c.hoodOpen = true; g.setState({ cars: [c, ...s.cars.slice(1)], liftUp: [false, false], tool: 'hand', panel: null }); Object.assign(window.__gkPlayer, { x: 0.6, z: -1.0, yaw: Math.PI, work: null }); });
  await p.waitForTimeout(900);
  const views = await p.$$eval('.car-actions button', (b) => b.map((x) => x.textContent));
  await p.locator('.car-actions button', { hasText: 'Motor von oben' }).click(); await p.waitForTimeout(900);
  const cov = (await findBolts('Motorabdeckung')).filter((b) => b.x > 0 && b.x < 1180 && b.y > 0 && b.y < 820);
  if (cov[0]) { await p.evaluate(() => window.__gk.setState({ toast: null })); await p.mouse.click(cov[0].x, cov[0].y); await p.waitForTimeout(300); }
  const t2 = await p.evaluate(() => window.__gk.getState().toast && window.__gk.getState().toast.text);
  expect(views.some((v) => v.includes('Motor von oben')) && /Motorabdeckung/.test(t2 || ''), 'Vorn angeschlagene Haube: Ansicht „Motor von oben“, Motorabdeckung antippbar – ' + t2);
  await p.locator('[data-testid=leave]').click(); await p.waitForTimeout(300);
  // ---------- Heckmotor (Boxer, luftgekühlt): Motordeckel hinten, Ansichten, Teile erreichbar, kein Kühlmittel ----------
  await p.evaluate(() => { const g = window.__gk; const s = g.getState(); const c = window.__gkLib.createCar('zuffen_365', [], Math.random, {}); c.hoodOpen = true; g.setState({ cars: [c, ...s.cars.slice(1)], liftUp: [false, false], tool: 'hand', panel: null }); Object.assign(window.__gkPlayer, { x: -2.3, z: -2.7, yaw: -Math.PI / 2, work: null }); });
  await p.waitForTimeout(900);
  const rv = await p.$$eval('.car-actions button', (b) => b.map((x) => x.textContent));
  await p.locator('.car-actions button', { hasText: 'Motor von hinten' }).click(); await p.waitForTimeout(900);
  const rc = (await findBolts('Motorabdeckung')).filter((b) => b.x > 0 && b.x < 1180 && b.y > 0 && b.y < 820);
  if (rc[0]) { await p.evaluate(() => window.__gk.setState({ toast: null })); await p.mouse.click(rc[0].x, rc[0].y); await p.waitForTimeout(300); }
  const t3 = await p.evaluate(() => window.__gk.getState().toast && window.__gk.getState().toast.text);
  const air = await p.evaluate(() => { const c = window.__gk.getState().cars[0].components; return !c.water_pump && !c.hose && !c.thermostat && !!c.valve_cover_b && Object.keys(c).filter((k) => /^coil\d$/.test(k)).length === 4; });
  expect(rv.some((v) => v.includes('Motor von hinten')) && /Motorabdeckung/.test(t3 || '') && air, 'Heckmotor-Boxer: Ansicht „Motor von hinten“, Motorabdeckung antippbar, luftgekühlt ohne Kühlteile, zwei Bänke mit vier Spulen – ' + t3);
  await p.locator('[data-testid=leave]').click(); await p.waitForTimeout(300);
  // ---------- Heckmotor mit Sechszylinder-Boxer weiter hinten (Sportcoupé der 80er) ----------
  await p.evaluate(() => { const g = window.__gk; const s = g.getState(); const c = window.__gkLib.createCar('zuffen_946', [], Math.random, {}); c.hoodOpen = true; g.setState({ cars: [c, ...s.cars.slice(1)], liftUp: [false, false], tool: 'hand', panel: null, toast: null }); Object.assign(window.__gkPlayer, { x: -2.6, z: -2.7, yaw: -Math.PI / 2, work: null }); });
  await p.waitForTimeout(900);
  await p.locator('.car-actions button', { hasText: 'Motor von hinten' }).click(); await p.waitForTimeout(900);
  const nc = (await findBolts('Motorabdeckung')).filter((b) => b.x > 0 && b.x < 1180 && b.y > 0 && b.y < 820);
  if (nc[0]) { await p.mouse.click(nc[0].x, nc[0].y); await p.waitForTimeout(300); }
  const t4 = await p.evaluate(() => window.__gk.getState().toast && window.__gk.getState().toast.text);
  const six = await p.evaluate(() => Object.keys(window.__gk.getState().cars[0].components).filter((k) => /^coil\d$/.test(k)).length);
  expect(/Motorabdeckung/.test(t4 || '') && six === 6, `Sechszylinder-Boxer im Heck: Motorabdeckung antippbar, ${six} Zündspulen – ${t4}`);
  await p.locator('[data-testid=leave]').click(); await p.waitForTimeout(300);
  // ---------- Heckmotor mit wassergekühltem Biturbo-Boxer (aktuelles Sportcoupé) ----------
  await p.evaluate(() => { const g = window.__gk; const s = g.getState(); const c = window.__gkLib.createCar('zuffen_929', [], Math.random, {}); c.hoodOpen = true; g.setState({ cars: [c, ...s.cars.slice(1)], liftUp: [false, false], tool: 'hand', panel: null, toast: null }); Object.assign(window.__gkPlayer, { x: -2.9, z: -2.7, yaw: -Math.PI / 2, work: null }); });
  await p.waitForTimeout(900);
  await p.locator('.car-actions button', { hasText: 'Motor von hinten' }).click(); await p.waitForTimeout(900);
  const qc = (await findBolts('Motorabdeckung')).filter((b) => b.x > 0 && b.x < 1180 && b.y > 0 && b.y < 820);
  if (qc[0]) { await p.mouse.click(qc[0].x, qc[0].y); await p.waitForTimeout(300); }
  const t5 = await p.evaluate(() => window.__gk.getState().toast && window.__gk.getState().toast.text);
  const wc = await p.evaluate(() => { const c = window.__gk.getState().cars[0].components; return !!c.water_pump && !!c.turbo && Object.keys(c).filter((k) => /^coil\d$/.test(k)).length === 6; });
  expect(/Motorabdeckung/.test(t5 || '') && wc, 'Biturbo-Boxer im Heck: Motorabdeckung antippbar, Wasserpumpe und Turbolader vorhanden, sechs Spulen – ' + t5);
  await p.locator('[data-testid=leave]').click(); await p.waitForTimeout(300);
  // ---------- Fünfzylinder-Turbo vorn (Rallye-Coupé der 80er) ----------
  await p.evaluate(() => { const g = window.__gk; const s = g.getState(); const c = window.__gkLib.createCar('audy_urquattro', [], Math.random, {}); c.hoodOpen = true; g.setState({ cars: [c, ...s.cars.slice(1)], liftUp: [false, false], tool: 'hand', panel: null, toast: null }); Object.assign(window.__gkPlayer, { x: 3.2, z: -2.7, yaw: Math.PI / 2, work: null }); });
  await p.waitForTimeout(900);
  await p.locator('.car-actions button', { hasText: 'Motor von vorn' }).click(); await p.waitForTimeout(900);
  await p.screenshot({ path: S + '/r5-motor.png' });
  const fc = (await findBolts('Motorabdeckung')).filter((b) => b.x > 0 && b.x < 1180 && b.y > 0 && b.y < 820);
  if (fc[0]) { await p.mouse.click(fc[0].x, fc[0].y); await p.waitForTimeout(300); }
  const t6 = await p.evaluate(() => window.__gk.getState().toast && window.__gk.getState().toast.text);
  const five = await p.evaluate(() => Object.keys(window.__gk.getState().cars[0].components).filter((k) => /^coil\d$/.test(k)).length);
  expect(/Motorabdeckung/.test(t6 || '') && five === 5, `Fünfzylinder-Turbo: ${five} Zündspulen, Motorabdeckung antippbar – ${t6}`);
  await p.locator('[data-testid=leave]').click(); await p.waitForTimeout(300);
  // ---------- Unterboden: Endschalldämpfer, Querlenker, Spurstangenköpfe ----------
  await p.evaluate(() => { const g = window.__gk; const s = g.getState(); const car = window.__gkLib.createCar('renard_twingle', ['muffler', 'control_arm', 'tie_rod'], () => 0.1, {}); car.lifted = true; car.hoodOpen = false; g.setState({ cars: [car, ...s.cars.slice(1)], liftUp: [true, false], tool: 'lamp', carried: ['ratchet', 'socket17', 'socket16', 'socket13'], panel: null, money: 9000 }); Object.assign(window.__gkPlayer, { x: 2.9, z: -2.7, yaw: Math.PI / 2, pitch: 0, work: null }); });
  await p.waitForTimeout(900);
  await p.evaluate(() => window.__gk.getState().tapBody(0));
  const seen = await p.evaluate(() => window.__gk.getState().cars[0].observed);
  expect(['exhaust_look', 'arm_look', 'tie_look'].every((x) => seen.includes(x)), 'Sichtprüfung von unten: Endtopf, Querlenkerlager und Spurstangenkopf auffällig – ' + seen.join(', '));
  const armSide = await p.evaluate(() => (window.__gk.getState().cars[0].components.arm_fl.condition === 'defect' ? 'fl' : 'fr'));
  await p.locator('.car-actions button', { hasText: 'Unterboden' }).click(); await p.waitForTimeout(900);
  await p.evaluate(() => window.__gk.setState({ tool: 'ratchet' }));
  const armBolts = (await findBolts(`Schraube – Querlenker vorne ${armSide === 'fl' ? 'links' : 'rechts'}`)).filter((b) => b.x > 0 && b.x < 1180 && b.y > 0 && b.y < 820);
  for (const b of armBolts) { await p.mouse.click(b.x, b.y); await p.waitForTimeout(250); }
  const ab = await p.evaluate((s) => window.__gk.getState().cars[0].components[`arm_${s}`].bolts, armSide);
  expect(armBolts.length === 2 && ab.every((x) => x === 1), `Querlenker ${armSide}: beide Schrauben im Unterboden-Bild angetippt und gelöst (${ab})`);
  await p.screenshot({ path: S + '/unterboden.png' });
  await p.locator('[data-testid=leave]').click(); await p.waitForTimeout(300);
  // Ausbauen, prüfen, Neuteile einbauen (über die Spielaktionen, wie beim Tippen)
  const fixed = await p.evaluate((armSide) => {
    const g = window.__gk; const L = window.__gkLib;
    const use = (t) => g.setState({ tool: t });
    const out = (id) => { const c = g.getState().cars[0]; const d = L.defOf(c, id); c.components[id].bolts.forEach((b, i) => { if (b === 2) { use(d.fastener.driver); g.setState({ carried: ['ratchet', d.fastener.socket] }); g.getState().tapBolt(0, id, i); } use('hand'); g.getState().tapBolt(0, id, i); }); use('hand'); g.getState().tapComponent(0, id); };
    const back = (id) => { const c = g.getState().cars[0]; const d = L.defOf(c, id); g.getState().buyPart(d.partId, 0); use('hand'); g.getState().installWith(0, id, { kind: 'new' }); g.getState().cars[0].components[id].bolts.forEach((_, i) => { use('hand'); g.getState().tapBolt(0, id, i); use(d.fastener.driver); g.setState({ carried: ['ratchet', d.fastener.socket] }); g.getState().tapBolt(0, id, i); }); };
    const tie = g.getState().cars[0].components.tie_fl.condition === 'defect' ? 'tie_fl' : 'tie_fr';
    const ids = ['muffler', `arm_${armSide}`, tie];
    const known = [];
    for (const id of ids) { out(id); known.push(g.getState().cars[0].components[id].known && !g.getState().cars[0].components[id].installed); back(id); }
    const c = g.getState().cars[0].components;
    return { known, ok: ids.every((id) => c[id].installed && c[id].condition === 'ok' && c[id].bolts.every((b) => b === 2)), active: L.motor ? null : null };
  }, armSide);
  expect(fixed.known.every(Boolean) && fixed.ok, 'Endtopf, Querlenker und Spurstangenkopf ausgebaut, als defekt erkannt, Neuteile eingebaut und festgezogen');

  // ---------- Hosenrohr bei tiefer Karosserie (B5) und beim Diesel mit Partikelfilter: im Unterboden-Bild ausbaubar ----------
  for (const model of ['audy_a4_b5', 'bavaria_320d']) {
    await p.evaluate((model) => { const g = window.__gk; const s = g.getState(); const c = window.__gkLib.createCar(model, [], Math.random, {}); c.lifted = true; g.setState({ cars: [c, ...s.cars.slice(1)], liftUp: [true, false], tool: 'ratchet', carried: ['ratchet', 'socket13'], panel: null }); Object.assign(window.__gkPlayer, { x: 2.9, z: -2.7, yaw: Math.PI / 2, work: null }); }, model);
    await p.waitForTimeout(900);
    await p.locator('.car-actions button', { hasText: 'Unterboden' }).click(); await p.waitForTimeout(900);
    const dpb = (await findBolts('Schraube – Hosenrohr')).filter((b) => b.x > 0 && b.x < 1180 && b.y > 0 && b.y < 820);
    for (const b of dpb) { await p.mouse.click(b.x, b.y); await p.waitForTimeout(200); }
    await p.evaluate(() => window.__gk.setState({ tool: 'hand' }));
    for (const b of dpb) { await p.mouse.click(b.x, b.y); await p.waitForTimeout(200); }
    const pipe = await p.evaluate(() => { let r = null; const cam = window.__gkCamera; const v = new cam.position.constructor(); window.__gkScene.traverse((o) => { if (!r && o.userData && o.userData.label === 'Hosenrohr (Abgasanlage)') o.traverse((m) => { if (!r && m.isMesh) { m.getWorldPosition(v); v.project(cam); r = { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; } }); }); return r; });
    if (pipe) { await p.mouse.click(pipe.x, pipe.y); await p.waitForTimeout(300); }
    const dp = await p.evaluate(() => window.__gk.getState().cars[0].components.downpipe);
    expect(dpb.length === 2 && !dp.installed, `${model}: Hosenrohr-Schrauben und Rohr im Unterboden-Bild angetippt – ausgebaut`);
    await p.locator('[data-testid=leave]').click(); await p.waitForTimeout(300);
  }

  console.log('errors:', errs); console.log(fails ? 'FEHLER: ' + fails : 'ALLES OK');
  await b.close();
})();
