// Motoren mit echten Taps: R6 (Zylinder 6), V8 (Zylinder 8 auf Bank 2), Diesel (Düse + Glühkerze), Turbo (Rohr + Lader). Dazu Klangbild und Bildschirmfotos.
const { chromium } = require('playwright');
const S = process.env.GK_OUT || __dirname + '/out'; const URL = process.env.GK_URL || 'http://localhost:4173/?test';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const errs = []; let fails = 0;
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 200)); });
  const expect = (c, msg) => { if (!c) { fails++; console.log('FAIL:', msg); } else console.log('ok:', msg); };
  const EYE = 1.62, BZ = -2.7;
  const toast = () => p.evaluate(() => { const t = window.__gk.getState().toast; return t && t.text; });
  const focus = () => p.evaluate(() => { const f = document.querySelector('.focus-label'); return f && f.textContent; });
  const comp = (id) => p.evaluate((id) => window.__gk.getState().cars[0].components[id], id);
  const kit = (active) => p.evaluate((active) => window.__gk.setState({ tool: active, carried: ['ratchet', 'socket10', 'socket13', 'socket16', 'screwdriver', 'wrench'].slice(0, 6) }), active);
  const aimTap = async (from, to, wait = 480) => {
    await p.evaluate(([from, to, EYE]) => { const pl = window.__gkPlayer; pl.work = null; pl.x = from[0]; pl.z = from[1]; const dx = to[0] - from[0], dz = to[2] - from[1]; pl.yaw = Math.atan2(-dx, -dz); pl.pitch = Math.atan2(to[1] - EYE, Math.hypot(dx, dz)); pl.zoom = true; }, [from, to, EYE]);
    await p.waitForTimeout(wait); await p.mouse.click(590, 410); await p.waitForTimeout(180);
  };
  const W = (x, y, z) => [x, y, z + BZ];
  const front = [2.95, BZ], right = [1.75, BZ + 1.25];
  const setup = async (model, defectId) => {
    await p.evaluate(([model, defectId]) => {
      const g = window.__gk; const s = g.getState();
      const car = window.__gkLib.createCar(model, [], Math.random, { year: 2010 });
      car.components[defectId].condition = 'defect'; if (car.components[defectId].health !== undefined) car.components[defectId].health = 7;
      car.hoodOpen = true; car.fluids.oil.level = 6; car.purchasePrice = 1000;
      const cars = s.cars.map(() => null); cars[0] = car;
      g.setState({ cars, liftUp: [false, false], panel: null, tool: 'hand', money: 900000, inventory: {}, engineBay: null, partPrompt: null });
    }, [model, defectId]);
    await p.waitForTimeout(2600);
  };
  const shot = async (name, from, to) => { await p.evaluate(([from, to, EYE]) => { const pl = window.__gkPlayer; pl.work = null; pl.x = from[0]; pl.z = from[1]; const dx = to[0] - from[0], dz = to[2] - from[1]; pl.yaw = Math.atan2(-dx, -dz); pl.pitch = Math.atan2(to[1] - EYE, Math.hypot(dx, dz)); pl.zoom = true; }, [from, to, EYE]); await p.waitForTimeout(500); await p.screenshot({ path: `${S}/eng-${name}.png` }); };
  const sound = async () => { await p.evaluate(() => window.__gk.getState().toggleEngine(0)); await p.waitForTimeout(400); const pr = await p.evaluate(() => window.__gkAudio.profile()); const obs = await p.evaluate(() => window.__gk.getState().cars[0].observed); await p.evaluate(() => window.__gk.getState().toggleEngine(0)); return { pr, obs }; };
  /** Die Bänke eines V-Motors sind um 0,2 rad geneigt (Drehpunkt in 0,62 m Höhe) – Punkt aus Bank-Koordinaten umrechnen. */
  const tilt = (q, bank) => { if (!bank) return q; const a = bank * 0.2, dy = q[1] - 0.62; return [q[0], 0.62 + dy * Math.cos(a) - q[2] * Math.sin(a), dy * Math.sin(a) + q[2] * Math.cos(a)]; };
  /** Zylinderteil tauschen: Schraube, Stecker, oberes Teil, unteres Teil prüfen. */
  const cylinder = async (label, top, low, x, z, bank, lowSocket) => {
    const bolt = tilt(bank ? [x + 0.05, 0.795, z - bank * 0.06] : [x, 0.795, -0.085], bank);
    const out = bank || 1;
    const con = tilt([x, 0.845, z + out * 0.095], bank);
    const body = tilt([x, 0.85, z + out * 0.03], bank);
    await kit('ratchet'); await aimTap(front, W(...bolt));
    expect((await comp(top)).bolts[0] === 1, `${label}: Schraube gelöst (${await focus()})`);
    await kit('hand'); await aimTap(front, W(...bolt));
    expect((await comp(top)).bolts[0] === 0, `${label}: Schraube herausgedreht`);
    await aimTap(front, W(...con));
    expect(!(await comp(top)).connected, `${label}: Stecker abgezogen (${await focus()})`);
    await aimTap(front, W(...body));
    expect(!(await comp(top)).installed, `${label}: ausgebaut – ${await toast()}`);
    return { bolt, con: tilt([x, 0.875, z + out * 0.155], bank), body, low: tilt([x, 0.81, z], bank) };
  };

  await p.goto(URL); await p.waitForTimeout(2000);
  await p.getByText('Neues Spiel').click(); await p.getByText("Los geht's").click(); await p.waitForTimeout(800);

  const ONLY = (process.env.ONLY || 'r6,v8,diesel,turbo').split(',');
  if (ONLY.includes('r6')) {
  // ---------- Reihensechszylinder: Zündspule Zylinder 6 ----------
  await setup('bavaria_330', 'coil6');
  expect(await p.evaluate(() => Object.keys(window.__gk.getState().cars[0].components).filter((k) => /^coil\d$/.test(k)).length) === 6, 'R6: sechs Zündspulen vorhanden');
  let r, codes, c, cc, inv, prompt; r = await sound();
  expect(r.pr && r.pr.layout === 'R6' && r.pr.cylinders === 6 && r.pr.misfire === 1 && !r.pr.diesel, 'R6: Klangbild Reihensechszylinder mit Aussetzern');
  codes = await p.evaluate(() => { window.__gk.getState().scanObd(0); return window.__gk.getState().cars[0].obdCodes; });
  expect(codes.length === 1 && codes[0].startsWith('P0306'), 'R6: OBD meldet Zylinder 6 – ' + codes);
  await kit('hand'); await aimTap(front, W(1.2, 0.875, 0.1));
  expect(!(await comp('engine_cover')).installed, 'R6: Motorabdeckung abgenommen');
  await shot('r6', front, W(1.3, 0.8, 0));
  c = await cylinder('R6 Spule 6', 'coil6', 'plug6', 1.575, 0, 0);
  expect((await comp('coil6')).known && (await comp('coil5')).installed, 'R6: Spule 6 als defekt erkannt, Spule 5 unberührt');
  // Kerze 6 prüfen (16er Nuss), wieder einsetzen
  await kit('ratchet'); await aimTap(front, W(...c.low));
  expect(!(await comp('plug6')).installed, 'R6: Zündkerze 6 einzeln herausgedreht – ' + (await toast()));
  await aimTap(front, W(...c.low));
  expect((await comp('plug6')).installed, 'R6: Zündkerze 6 wieder eingesetzt');
  // Ohne passendes Teil: Hinweis mit Motorfamilie
  await kit('hand'); await aimTap(front, W(...c.body));
  prompt = await p.evaluate(() => { const s = window.__gk.getState(); return s.partPrompt && document.querySelector('.modal') && document.querySelector('.modal').textContent; });
  expect(prompt && prompt.includes('R6'), 'R6: Neuteil fehlt – Hinweis nennt die Passform R6');
  await p.evaluate(() => { const g = window.__gk.getState(); g.closePartPrompt(); g.buyPart('ignition_coil', 0); });
  inv = await p.evaluate(() => window.__gk.getState().inventory);
  expect(inv['ignition_coil@R6'] === 1, 'R6: Zündspule passend für R6 gekauft – ' + JSON.stringify(inv));
  await aimTap(front, W(...c.body));
  await aimTap(front, W(...c.con)); await aimTap(front, W(...c.bolt)); await kit('ratchet'); await aimTap(front, W(...c.bolt));
  cc = await comp('coil6');
  expect(cc.installed && cc.condition === 'ok' && cc.connected && cc.bolts[0] === 2 && cc.health === 100, 'R6: neue Spule 6 montiert, Stecker dran, Schraube fest, Zustand 100 %');
  await kit('hand'); await aimTap(front, W(1.2, 0.86 + 0.36, 0.1));
  expect((await comp('engine_cover')).installed, 'R6: Motorabdeckung wieder drauf');
  r = await sound();
  expect(r.pr && r.pr.misfire === 0, 'R6: Motor startet und läuft rund');

  }
  if (ONLY.includes('v8')) {
  // ---------- V8: Zündspule Zylinder 8 (Bank 2) ----------
  await setup('bavaria_340_ms', 'coil8');
  expect(await p.evaluate(() => Object.keys(window.__gk.getState().cars[0].components).filter((k) => /^coil\d$/.test(k)).length) === 8, 'V8: acht Zündspulen vorhanden');
  r = await sound();
  expect(r.pr && r.pr.layout === 'V8' && r.pr.cylinders === 8, 'V8: Klangbild V8');
  await kit('hand'); await aimTap(front, W(1.2, 0.875, 0.05));
  expect(!(await comp('engine_cover')).installed, 'V8: Motorabdeckung abgenommen');
  await shot('v8', front, W(1.3, 0.8, 0));
  c = await cylinder('V8 Spule 8', 'coil8', 'plug8', 1.54, 0.105, 1);
  expect((await comp('coil4')).installed && (await comp('coil7')).installed, 'V8: Nachbarspulen und andere Bank unberührt');
  await p.evaluate(() => window.__gk.getState().buyPart('ignition_coil', 0));
  inv = await p.evaluate(() => window.__gk.getState().inventory);
  expect(inv['ignition_coil@V8'] === 1 && !inv['ignition_coil@R6'], 'V8: Spule für V8 gekauft (R6-Spule würde nicht passen)');
  await aimTap(front, W(...c.body)); await aimTap(front, W(...c.con)); await aimTap(front, W(...c.bolt)); await kit('ratchet'); await aimTap(front, W(...c.bolt));
  cc = await comp('coil8');
  expect(cc.installed && cc.condition === 'ok' && cc.connected && cc.bolts[0] === 2, 'V8: neue Spule 8 montiert');
  // Erste Bank: Spule 1 Schraube erreichbar
  await aimTap(front, W(...tilt([1.06 + 0.05, 0.795, -0.045], -1)));
  expect((await comp('coil1')).bolts[0] === 1, 'V8: Schraube der Spule 1 auf Bank 1 erreichbar – ' + (await focus()));
  await aimTap(front, W(...tilt([1.06 + 0.05, 0.795, -0.045], -1)));

  }
  if (ONLY.includes('diesel')) {
  // ---------- Diesel: Einspritzdüse 3 und Glühkerze ----------
  await setup('bavaria_320d', 'inj3');
  r = await sound();
  expect(r.pr && r.pr.diesel && r.pr.turbo && r.pr.layout === 'R4', 'Diesel: Klangbild Diesel mit Turbo');
  codes = await p.evaluate(() => { window.__gk.getState().scanObd(0); return window.__gk.getState().cars[0].obdCodes; });
  expect(codes.length === 1 && codes[0].startsWith('P0203'), 'Diesel: OBD meldet Einspritzdüse 3 – ' + codes);
  await kit('hand'); await aimTap(front, W(1.2, 0.875, 0.1));
  expect(!(await comp('engine_cover')).installed, 'Diesel: Motorabdeckung abgenommen (Tipp genau über einem Stecker)');
  await shot('diesel', front, W(1.3, 0.8, 0));
  c = await cylinder('Diesel Düse 3', 'inj3', 'glow3', 1.39, 0, 0);
  await kit('ratchet'); await aimTap(front, W(...c.low));
  expect(!(await comp('glow3')).installed, 'Diesel: Glühkerze 3 herausgedreht – ' + (await toast()));
  await aimTap(front, W(...c.low));
  await p.evaluate(() => window.__gk.getState().buyPart('injector', 0));
  await kit('hand'); await aimTap(front, W(...c.body)); await aimTap(front, W(...c.con)); await aimTap(front, W(...c.bolt)); await kit('ratchet'); await aimTap(front, W(...c.bolt));
  cc = await comp('inj3');
  expect(cc.installed && cc.condition === 'ok' && cc.connected && cc.bolts[0] === 2, 'Diesel: neue Einspritzdüse 3 montiert');
  // AGR-Ventil und Lader sind anfassbar
  await kit('lamp'); await aimTap([0.97, BZ + 1.3], W(0.97, 0.775, 0.28)); await p.waitForTimeout(300);
  expect(/AGR/.test((await toast()) || ''), 'Diesel: AGR-Ventil mit der Prüflampe angesehen – ' + (await toast()));

  }
  if (ONLY.includes('turbo')) {
  // ---------- Turbo-Benziner: Ladeluftrohr und Turbolader ----------
  await setup('bavaria_335_coupe', 'turbo');
  r = await sound();
  expect(r.pr && r.pr.whine === 1 && r.pr.layout === 'R6', 'Turbo: defekter Lader heult im Klangbild');
  await shot('turbo', right, W(1.7, 0.7, 0.46));
  await kit('screwdriver'); await aimTap(right, W(1.69, 0.76, 0.52));
  expect((await comp('charge_pipe')).bolts[0] === 1, 'Turbo: Schelle am Ladeluftrohr gelöst – ' + (await focus()));
  await kit('hand'); await aimTap(right, W(1.69, 0.76, 0.52)); await aimTap(right, W(1.52, 0.72, 0.52));
  expect(!(await comp('charge_pipe')).installed, 'Turbo: Ladeluftrohr abgenommen – ' + (await toast()));
  const tb = [[1.73, 0.75, 0.46], [1.8, 0.765, 0.42], [1.8, 0.765, 0.5]]; const front2 = [2.95, BZ + 0.46];
  await kit('ratchet'); for (const q of tb) await aimTap(right, W(...q));
  await kit('hand'); for (const q of tb) await aimTap(right, W(...q));
  expect((await comp('turbo')).bolts.join() === '0,0,0', 'Turbo: drei Schrauben heraus – ' + (await comp('turbo')).bolts);
  await aimTap(right, W(1.8, 0.68, 0.535));
  expect(!(await comp('turbo')).installed && (await comp('turbo')).known, 'Turbo: Lader ausgebaut und als defekt erkannt – ' + (await toast()));
  await p.evaluate(() => window.__gk.getState().buyPart('turbo', 0));
  await aimTap(right, W(1.8, 0.68, 0.535));
  for (const q of tb) await aimTap(right, W(...q)); await kit('ratchet'); for (const q of tb) await aimTap(right, W(...q));
  await kit('hand'); await aimTap(right, W(1.52, 0.72 + 0.12, 0.52));
  await aimTap(right, W(1.69, 0.76, 0.52)); await kit('screwdriver'); await aimTap(right, W(1.69, 0.76, 0.52));
  const t = await comp('turbo'), cp = await comp('charge_pipe');
  expect(t.installed && t.condition === 'ok' && t.bolts.join() === '2,2,2' && cp.installed && cp.bolts[0] === 2, 'Turbo: neuer Lader und Rohr montiert');
  r = await sound();
  expect(r.pr && r.pr.whine === 0 && r.pr.turbo, 'Turbo: Motor läuft, Lader pfeift normal');
  }
  console.log('errors:', errs.slice(0, 8)); console.log(fails ? 'FEHLER: ' + fails : 'ALLES OK');
  await b.close();
})();
