// Tiefgaragen: kaufen, Auto einparken, begehen, wieder herausholen, Spielstand.
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
  const cars = () => G(() => window.__gk.getState().cars.map((c) => c && c.uid));
  await p.goto(URL); await p.waitForTimeout(1500);
  await p.getByText('Neues Spiel').click(); await p.getByText("Los geht's").click(); await p.waitForTimeout(600);

  // ---------- Kauf am Computer ----------
  await G(() => window.__gk.setState({ money: 100000 }));
  const before = await G(() => window.__gk.getState().money);
  await G(() => window.__gk.getState().buyUpgrade('tg_klein'));
  const st = await G(() => ({ money: window.__gk.getState().money, up: window.__gk.getState().upgrades }));
  expect(st.up.includes('tg_klein') && before - st.money === 25000, `Tiefgarage Klein für ${before - st.money} € gekauft`);

  // ---------- Auto von der Hebebühne in die Tiefgarage ----------
  await G(() => { const g = window.__gk; const c = window.__gkLib.createCar('audy_a4_b5', [], Math.random, {}); c.purchasePrice = 4000; const cars = [...g.getState().cars]; cars[0] = c; g.setState({ cars }); g.getState().setPanel('move', 0); });
  await p.waitForTimeout(300);
  const uid = (await cars())[0];
  expect(await p.locator('[data-testid=move-tg_klein]').count() === 1 && /6 von 6 frei/.test(await p.locator('[data-testid=move-tg_klein]').textContent()), 'Umparken bietet die Tiefgarage als eine Zeile an (6 von 6 frei)');
  await p.locator('[data-testid=move-tg_klein]').click(); await p.waitForTimeout(300);
  let c = await cars();
  expect(c[0] === null && c[22] === uid, 'Auto steht in der Tiefgarage auf Platz 1');

  // ---------- Einfahrt im Hof, hinunter ----------
  await G(() => Object.assign(window.__gkPlayer, { x: -21.6, z: -6.65, yaw: Math.PI / 2, pitch: -0.1, work: null, zoom: false })); await p.waitForTimeout(800);
  const label = await G(() => window.__gkLib.focus.getState().label);
  expect(/Rampe hinunter/.test(label || ''), 'Einfahrt im Hof anvisiert: ' + label);
  await p.screenshot({ path: `${S}/tg-einfahrt.png` });
  await G(() => window.__gkLib.stations.get(window.__gkLib.focus.getState().id)());
  await p.waitForTimeout(300);
  expect(/1 von 6 Plätzen belegt/.test(await p.locator('.modal').textContent()), 'Garagenliste zeigt Belegung');
  await p.locator('[data-testid=goto-tg_klein]').click(); await p.waitForTimeout(1500);
  expect(await G(() => window.__gkLib.place.at) === 'tg_klein', 'In der Tiefgarage angekommen');
  await p.screenshot({ path: `${S}/tg-innen.png` });
  // Laufen: Wände halten den Spieler in der Garage
  await G(() => { for (let i = 0; i < 200; i++) window.__gkLib.movePlayer(0, -0.2, []); });
  const pz = await G(() => window.__gkPlayer.z);
  expect(pz > -8.7 && pz < -8, `Spieler läuft bis zur Rückwand und bleibt drin (z = ${pz.toFixed(2)})`);

  // ---------- Am Auto: Akte und wieder herausholen ----------
  const slot = await G(() => window.__gkLib.slots[22]);
  await G((s) => Object.assign(window.__gkPlayer, { x: s.x, z: s.z + 3.6, yaw: 0, pitch: -0.4 }), slot); await p.waitForTimeout(800);
  expect(await G(() => window.__gkLib.focus.getState().nearBay) === 22, 'Spieler steht am Auto auf Platz 1');
  await p.locator('[data-testid=file]').click(); await p.waitForTimeout(300);
  expect(/Tiefgarage Klein · Platz 1/.test(await p.locator('.modal').textContent()), 'Akte des eingelagerten Autos');
  await G(() => window.__gk.getState().setPanel(null));
  await p.locator('[data-testid=move]').click(); await p.waitForTimeout(300);
  await p.getByRole('button', { name: /Hebebühne 2/ }).click(); await p.waitForTimeout(300);
  c = await cars();
  expect(c[22] === null && c[1] === uid, 'Aus der Tiefgarage wieder auf Hebebühne 2 geholt');

  // ---------- Mehrere Autos, Ausfahrt, Neustart ----------
  await G(() => { const g = window.__gk; const L = window.__gkLib; const cars = [...g.getState().cars]; for (let i = 22; i < 28; i++) cars[i] = L.createCar(['zuffen_365', 'bavaria_323i', 'renard_twingle', 'zuffen_946', 'ingol_tc', 'zuffen_929'][i - 22], [], Math.random, {}); g.setState({ cars }); });
  await G(() => Object.assign(window.__gkPlayer, { x: 201, z: 0, yaw: -Math.PI / 2, pitch: -0.1 })); await p.waitForTimeout(800);
  await p.screenshot({ path: `${S}/tg-voll.png` });
  await G(() => window.__gk.getState().setPanel('move', 1)); await p.waitForTimeout(200);
  expect(await p.locator('[data-testid=move-tg_klein]').count() === 0, 'Volle Tiefgarage wird beim Umparken nicht mehr angeboten');
  await G(() => window.__gk.getState().setPanel(null));
  await G(() => window.__gkLib.stations.get('tg_exit_tg_klein')()); await p.waitForTimeout(800);
  const back = await G(() => ({ at: window.__gkLib.place.at, x: window.__gkPlayer.x, z: window.__gkPlayer.z }));
  expect(back.at === 'werkstatt' && Math.abs(back.z + 6.65) < 0.1 && back.x > -23, 'Rampe hoch: zurück im Hof an der Einfahrt');
  await p.waitForTimeout(1500); await p.reload(); await p.waitForTimeout(1500);
  const kept = await G(() => { const s = window.__gk.getState(); return { n: s.cars.slice(22, 28).filter(Boolean).length, up: s.upgrades.includes('tg_klein'), len: s.cars.length }; });
  expect(kept.n === 6 && kept.up && kept.len === 132, `Nach Neuladen: Garage gekauft, 6 Autos eingelagert (${JSON.stringify(kept)})`);

  // ---------- Luxus: 50 Plätze, zwei Fahrgassen ----------
  await G(() => { const g = window.__gk; const L = window.__gkLib; g.setState({ money: 400000 }); g.getState().buyUpgrade('tg_luxus'); const ids = Object.keys(L.models); const cars = [...g.getState().cars]; L.slots.filter((s) => s.place === 'tg_luxus').forEach((s, i) => { cars[s.id] = L.createCar(ids[i % ids.length], [], Math.random, {}); }); g.setState({ cars }); L.travel('tg_luxus'); });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${S}/tg-luxus.png` });
  const lux = await G(() => { const s = window.__gk.getState(); return window.__gkLib.slots.filter((x) => x.place === 'tg_luxus' && s.cars[x.id]).length; });
  expect(lux === 50, 'Luxus-Tiefgarage mit 50 Autos belegt und dargestellt');
  await G(() => window.__gkLib.travel('werkstatt'));

  // ---------- Autohaus: zwei Plätze, dritter kaufbar, Rundum-Ansicht, Verkaufsbonus ----------
  await G(() => { const g = window.__gk; const L = window.__gkLib; const s = g.getState(); const c = L.createCar('bmv_m5_e34', [], Math.random, {}); c.purchasePrice = 20000; c.testDriven = true; const cars = [...s.cars]; cars[0] = c; cars[1] = null; g.setState({ cars, money: 50000, panel: null }); g.getState().setPanel('move', 0); });
  await p.waitForTimeout(300);
  const expoBtns = await p.locator('.modal button', { hasText: 'Autohaus · Platz' }).allTextContents();
  expect(expoBtns.length === 2 && /ausstellen/.test(expoBtns[0]), 'Umparken bietet zwei Autohaus-Plätze an: ' + expoBtns.join(' | '));
  await p.locator('.modal button', { hasText: 'Autohaus · Platz 1' }).click(); await p.waitForTimeout(300);
  expect(!!(await cars())[123] && !(await cars())[0], 'Auto steht im Autohaus auf Platz 1');
  const mBefore = await G(() => window.__gk.getState().money);
  await G(() => window.__gk.getState().buyUpgrade('expo3'));
  const expo3 = await G(() => ({ up: window.__gk.getState().upgrades.includes('expo3'), money: window.__gk.getState().money }));
  expect(expo3.up && mBefore - expo3.money === 8000, 'Dritter Ausstellungsplatz für 8.000 € gekauft');
  await G(() => Object.assign(window.__gkPlayer, { x: -15.15, z: 7.3, yaw: Math.PI, pitch: 0, work: null })); await p.waitForTimeout(800);
  expect(/Autohaus betreten/.test((await G(() => window.__gkLib.focus.getState().label)) || ''), 'Eingang zum Autohaus im Hof anvisiert');
  await G(() => window.__gkLib.stations.get('expo_gate')()); await p.waitForTimeout(1500);
  expect(await G(() => window.__gkLib.place.at) === 'autohaus', 'Im Autohaus angekommen');
  const es = await G(() => window.__gkLib.slots[123]);
  await G((s) => Object.assign(window.__gkPlayer, { x: s.x, z: s.z + 2.9, yaw: 0, pitch: -0.2 }), es); await p.waitForTimeout(900);
  expect(await G(() => window.__gkLib.focus.getState().nearBay) === 123, 'Spieler steht am ausgestellten Auto');
  await p.screenshot({ path: `${S}/autohaus.png` });
  await p.locator('[data-testid=orbit]').click(); await p.waitForTimeout(1200);
  const c0 = await G(() => window.__gkCamera.position.toArray());
  await p.mouse.move(600, 420); await p.mouse.down(); await p.mouse.move(300, 420, { steps: 10 }); await p.mouse.up(); await p.waitForTimeout(700);
  const c1 = await G(() => window.__gkCamera.position.toArray());
  const dist = Math.hypot(c1[0] - es.x, c1[2] - es.z);
  expect(Math.hypot(c1[0] - c0[0], c1[2] - c0[2]) > 0.8 && dist > 2 && dist < 4.3, `Rundum-Ansicht: Wischen dreht die Kamera um das Auto (Abstand ${dist.toFixed(1)} m)`);
  await p.screenshot({ path: `${S}/autohaus-rundum.png` });
  await p.locator('[data-testid=turntable]').click(); await p.waitForTimeout(200);
  expect(/starten/.test(await p.locator('[data-testid=turntable]').textContent()), 'Drehteller lässt sich anhalten');
  await p.locator('[data-testid=orbit-leave]').click(); await p.waitForTimeout(500);
  const sale = await G(() => { const g = window.__gk; const before = g.getState().money; g.getState().sell(123); return { got: g.getState().money - before, gone: !g.getState().cars[123] }; });
  expect(sale.gone && sale.got > 0, `Aus dem Autohaus verkauft (${sale.got} €)`);
  await G(() => { window.__gk.setState({ lastSale: null }); window.__gkLib.stations.get('expo_exit')(); }); await p.waitForTimeout(800);
  expect(await G(() => window.__gkLib.place.at) === 'werkstatt', 'Ausgang: zurück im Hof');

  console.log('errors:', JSON.stringify(errs));
  console.log(fails || errs.length ? `FEHLER: ${fails + errs.length}` : 'ALLES OK');
  await b.close();
})().catch((e) => { console.log('Error:', e.message); process.exit(1); });
