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
  console.log('errors:', errs); console.log(fails ? 'FEHLER: ' + fails : 'ALLES OK');
  await b.close();
})();
