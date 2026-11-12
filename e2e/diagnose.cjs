// Durchlauf des Gameplay-Updates mit echten Taps in der Ego-Perspektive.
const { chromium } = require('playwright');
const S = process.env.GK_OUT || __dirname + '/out'; const URL = process.env.GK_URL || 'http://localhost:4173/?test';
(async () => {
  const launch = { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] };
  if (URL.startsWith('https')) launch.proxy = { server: process.env.HTTPS_PROXY };
  const b = await chromium.launch(launch);
  const p = await b.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const errs = []; let fails = 0;
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  const st = () => p.evaluate(() => { const s = window.__gk.getState(); return { money: s.money, screen: s.screen, cars: s.cars, toast: s.toast && s.toast.text, carried: s.carried, panel: s.panel, listings: s.listings, jobs: s.jobs.length, jobsDone: s.jobsDone, engineBay: s.engineBay, sound: s.sound, day: s.day }; });
  const expect = (c, msg) => { if (!c) { fails++; console.log('FAIL:', msg); } else console.log('ok:', msg); };
  const EYE = 1.62, BZ = [-2.7, 2.7];
  const aimTap = async (from, to, wait = 170) => {
    await p.evaluate(([from, to, EYE]) => { const pl = window.__gkPlayer; pl.work = null; pl.x = from[0]; pl.z = from[1]; const dx = to[0] - from[0], dz = to[2] - from[1]; pl.yaw = Math.atan2(-dx, -dz); pl.pitch = Math.atan2(to[1] - EYE, Math.hypot(dx, dz)); pl.zoom = true; }, [from, to, EYE]);
    await p.waitForTimeout(wait); await p.mouse.click(590, 410); await p.waitForTimeout(80);
  };
  const kit = (active, carried) => p.evaluate(([active, carried]) => window.__gk.setState({ tool: active, carried }), [active, carried]);
  const W = (bay, x, y, z) => [x, y, z + BZ[bay]];
  const comp = async (bay, id) => (await st()).cars[bay].components[id];
  const closeModal = () => p.locator('.modal-head .btn').click();
  const computer = async () => { await aimTap([4.3, 4.0], [4.2, 1.05, 5.3], 500); };
  const names = ['Zündspule', 'Zündkerze', 'Falschluft', 'Lagerschaden', 'Hydrostößel', 'Kettenspanner', 'Ventildeckeldichtung', 'Bremsbeläge'];

  await p.goto(URL); await p.waitForTimeout(2500);
  await p.getByText('Neues Spiel').click(); await p.getByText("Los geht's").click(); await p.waitForTimeout(600);

  // === Markt: Symptome statt Diagnose, Verhandlung mit Argumenten ===
  await computer();
  expect((await st()).panel === 'computer', 'Computer per Tap geöffnet');
  await p.evaluate(() => window.__gk.getState().viewListing(0)); await p.waitForTimeout(1000);
  await p.getByText('Motor starten & anhören').click(); await p.waitForTimeout(300);
  expect(await p.evaluate(() => window.__gkAudio.running() && window.__gkAudio.profile().misfire > 0), 'Hörprobe beim Händler: Motor läuft hörbar unrund');
  const note = await p.locator('.note').innerText();
  expect(!names.some((n) => note.includes(n)), 'Besichtigung nennt Symptome, keine Ursache: ' + note.slice(0, 60));
  await p.screenshot({ path: S + '/v3-market.png' });
  let s = await st();
  expect(s.listings[0].hints.length >= 1 && s.listings[0].car.components.coil1.known === false, 'Auffälligkeiten notiert, Bauteile weiter unbekannt');
  await p.evaluate(() => { const g = window.__gk.getState(); g.offer(3000, []); });
  s = await st();
  expect(s.screen === 'market' && s.listings[0].current < 5400, 'Zu niedriges Angebot abgelehnt, Verkäufer macht Gegenangebot ' + s.listings[0].current);
  const floor0 = s.listings[0].minPrice;
  for (const c of await p.locator('.chip').all()) await c.click();
  await p.evaluate(() => window.__gkAudio.stop());
  await p.locator('.offer .btn', { hasText: '−500' }).click();
  await p.getByText('Angebot machen').click(); await p.waitForTimeout(500);
  s = await st();
  const bought = s.screen === 'garage';
  if (!bought) { expect(s.listings[0].minPrice < floor0, 'Argumente senken die Schmerzgrenze'); await p.evaluate(() => { const g = window.__gk.getState(); g.offer(g.listings[0].minPrice, []); }); await p.waitForTimeout(500); s = await st(); }
  expect(s.screen === 'garage' && s.cars[0] && s.cars[0].purchasePrice < 5400, 'Preis heruntergehandelt und gekauft für ' + (s.cars[0] && s.cars[0].purchasePrice));
  expect(s.cars[0].observed.length >= 1 && Object.values(s.cars[0].components).every((c) => !c.known), 'Auto mit verstecktem Schaden gekauft: Symptome in der Akte, Ursache unbekannt');

  // === Motor starten, hinhören ===
  const front = [2.95, BZ[0]];
  await p.evaluate(([x, z]) => Object.assign(window.__gkPlayer, { x, z, yaw: Math.PI / 2, pitch: -0.3, zoom: false }), front);
  await p.waitForTimeout(500);
  await p.getByTestId('engine').click(); await p.waitForTimeout(400);
  s = await st();
  expect(s.engineBay === 0 && await p.evaluate(() => window.__gkAudio.profile().misfire > 0), 'Motor läuft, Klang passt zum Defekt (unrund)');
  expect(s.cars[0].observed.includes('rough_idle'), 'Unrunder Leerlauf wahrgenommen');
  await p.getByTestId('sound').click();
  expect((await st()).sound === false, 'Ton lässt sich ausschalten');
  await p.getByTestId('sound').click();

  // === OBD: Code ja, Ursache nein ===
  await kit('obd', ['obd', 'ratchet', 'socket10']);
  await aimTap(front, W(0, 1.6, 0.86, 0), 400);
  await p.getByText('Fehlerspeicher auslesen').click(); await p.waitForTimeout(200);
  s = await st();
  const code = s.cars[0].obdCodes.find((c) => c.startsWith('P030'));
  const cyl = Number(code[4]);
  expect(!!code && Object.values(s.cars[0].components).every((c) => !c.known), 'OBD zeigt ' + code.slice(0, 5) + ', bestätigt aber kein Bauteil');
  expect(!s.cars[0].obdCodes.some((c) => /Dichtung|Öl/.test(c)), 'OBD verrät die undichte Dichtung (mechanisch) nicht');
  await closeModal();
  await p.getByTestId('file').click(); await p.waitForTimeout(200);
  await p.screenshot({ path: S + '/v3-file.png' });
  expect(await p.locator('.cause').count() >= 3, 'Akte listet mehrere mögliche Ursachen je Symptom');
  await closeModal();

  // === Zündspule: Abdeckung, Stecker, Schraube, Reihenfolge ===
  await kit('hand', ['ratchet', 'socket10', 'wrench']);
  await aimTap(front, W(0, 1.5, 0.9, 0), 400); await p.waitForTimeout(1100);
  expect((await st()).cars[0].hoodOpen, 'Motorhaube geöffnet');
  const X = [1.03, 1.21, 1.39, 1.57][cyl - 1], id = 'coil' + cyl;
  const bolt = W(0, X, 0.795, -0.085), plugc = W(0, X, 0.84, 0.095), coil = W(0, X, 0.848, 0.0);
  await aimTap(front, W(0, 1.25, 0.875, 0.1));
  expect((await st()).toast.includes('Motor abstellen'), 'Am laufenden Motor wird nicht geschraubt');
  await p.getByTestId('engine').click();
  await aimTap(front, W(0, 1.25, 0.875, 0.1));
  expect(!(await comp(0, 'engine_cover')).installed, 'Motorabdeckung abgenommen');
  await aimTap(front, coil);
  expect((await comp(0, id)).installed, 'Spule lässt sich nicht vor Schraube und Stecker ziehen');
  await kit('wrench', ['ratchet', 'socket10', 'wrench']); await aimTap(front, bolt);
  expect((await comp(0, id)).bolts[0] === 2, 'Schraubenschlüssel löst die Spulenschraube nicht');
  await kit('ratchet', ['ratchet', 'wrench']); await aimTap(front, bolt);
  expect((await comp(0, id)).bolts[0] === 2, 'Ratsche ohne passende Stecknuss löst nicht');
  await kit('ratchet', ['ratchet', 'socket10', 'wrench']); await aimTap(front, bolt);
  expect((await comp(0, id)).bolts[0] === 1, 'Schraube gelöst (Ratsche + 10er Nuss)');
  await kit('hand', ['ratchet', 'socket10', 'wrench']); await aimTap(front, bolt);
  expect((await comp(0, id)).bolts[0] === 0, 'Schraube mit der Hand herausgedreht');
  await aimTap(front, coil);
  expect((await comp(0, id)).installed, 'Spule sitzt noch: Stecker ist dran');
  await aimTap(front, plugc);
  expect((await comp(0, id)).connected === false, 'Stecker abgezogen');
  await p.screenshot({ path: S + '/v3-coil.png' });
  await aimTap(front, coil);
  s = await st();
  expect(!s.cars[0].components[id].installed && s.cars[0].components[id].known, 'Zündspule ausgebaut und begutachtet: ' + s.toast);

  // === Unterbrochene Reparatur übersteht Neuladen ===
  await p.reload(); await p.waitForTimeout(2500);
  s = await st();
  expect(s.cars[0] && !s.cars[0].components[id].installed && !s.cars[0].components.engine_cover.installed && s.cars[0].hoodOpen && s.cars[0].purchasePrice > 0, 'Nach Neuladen: Reparaturstand, Haube und Kaufpreis erhalten');
  const coilBad = s.cars[0].components[id].condition === 'defect';
  console.log('  Befund Zylinder', cyl, ':', coilBad ? 'Spule defekt' : 'Spule in Ordnung');
  await p.evaluate(() => window.__gk.getState().buyPart('ignition_coil'));
  await kit('hand', ['ratchet', 'socket10', 'wrench']);
  await aimTap(front, coil);
  await aimTap(front, W(0, X, 0.87, 0.155)); // abgezogener Stecker hängt neben der Spule
  await aimTap(front, bolt);
  await kit('ratchet', ['ratchet', 'socket10', 'wrench']); await aimTap(front, bolt);
  const c2 = await comp(0, id);
  expect(c2.installed && c2.connected && c2.bolts[0] === 2 && c2.condition === 'ok', 'Neue Spule eingesetzt, Stecker verbunden, Schraube fest');
  await kit('hand', ['ratchet', 'socket10', 'wrench']);
  await aimTap(front, W(0, 1.25, 1.232, 0.1));
  expect((await comp(0, 'engine_cover')).installed, 'Motorabdeckung wieder montiert');
  await p.evaluate(([x, z]) => Object.assign(window.__gkPlayer, { x, z, yaw: Math.PI / 2, pitch: -0.3, zoom: false }), front);
  await p.waitForTimeout(400);
  await p.getByTestId('engine').click(); await p.waitForTimeout(400);
  s = await st();
  expect(await p.evaluate(() => window.__gkAudio.profile().misfire === 0) && !s.cars[0].observed.includes('rough_idle'), 'Erfolgskontrolle: Motor läuft rund, Symptom aus der Akte gestrichen');
  // Arbeitsansicht
  await p.getByText('Motor von vorn').click(); await p.waitForTimeout(700);
  expect(await p.evaluate(() => !!window.__gkPlayer.work) && await p.getByTestId('joystick').count() === 0, 'Arbeitsansicht: Kamera am Motor, Laufen gesperrt');
  await p.screenshot({ path: S + '/v3-work.png' });
  await p.getByTestId('leave').click();
  expect(await p.evaluate(() => !window.__gkPlayer.work), 'Arbeitsansicht verlassen');
  await p.getByTestId('engine').click();

  // === Kundenauftrag auf Bühne 2, eigenes Auto bleibt unberührt ===
  const before0 = JSON.stringify((await st()).cars[0]);
  await p.evaluate(() => {
    // Fester Testauftrag: quietschender Riemen
    const g = window.__gk; const s = g.getState(); const j = JSON.parse(JSON.stringify(s.jobs[0]));
    for (const c of Object.values(j.car.components)) c.condition = 'ok';
    j.car.components.belt.condition = 'defect';
    j.car.job = { ...j.car.job, category: 'Wartung', complaint: 'Beim Anlassen quietscht es laut. Bitte nachsehen.', required: ['belt'], initial: ['belt'], fee: 100 };
    g.setState({ jobs: [j, ...s.jobs.slice(1)] });
  });
  await computer();
  await p.getByText('Aufträge').click(); await p.waitForTimeout(200);
  await p.screenshot({ path: S + '/v3-jobs.png' });
  await p.getByText('Annehmen').first().click(); await p.waitForTimeout(300);
  s = await st();
  expect(s.cars[1] && s.cars[1].job && s.cars[1].job.required[0] === 'belt', 'Kundenfahrzeug steht auf Bühne 2');
  const m0 = s.money;
  await p.evaluate(() => window.__gk.getState().sell(1));
  expect(!!(await st()).cars[1], 'Kundenfahrzeug lässt sich nicht verkaufen');
  await p.evaluate(() => window.__gk.getState().returnJob(1));
  s = await st();
  expect(!!s.cars[1] && s.money === m0, 'Ohne behobene Ursache keine Bezahlung: ' + s.toast);
  await closeModal();
  const front1 = [2.95, BZ[1]];
  await p.evaluate(([x, z]) => Object.assign(window.__gkPlayer, { x, z, yaw: Math.PI / 2, pitch: -0.3, zoom: false }), front1);
  await p.waitForTimeout(500);
  await p.getByTestId('engine').click(); await p.waitForTimeout(300);
  expect(await p.evaluate(() => window.__gkAudio.profile().squeal > 0) && (await st()).cars[1].observed.includes('squeal'), 'Kundenauto: Riemenquietschen hörbar und notiert');
  await p.getByTestId('engine').click();
  await kit('hand', ['wrench']);
  await aimTap(front1, W(1, 1.5, 0.9, 0), 400); await p.waitForTimeout(1100);
  await kit('lamp', ['wrench']); await aimTap(front1, W(1, 1.69, 0.627, 0.1));
  expect((await comp(1, 'belt')).known, 'Sichtprüfung bestätigt den rissigen Riemen');
  await kit('wrench', ['wrench']); await aimTap(front1, W(1, 1.69, 0.627, 0.1));
  expect(!(await comp(1, 'belt')).installed, 'Riemen abgenommen');
  await p.evaluate(() => window.__gk.getState().buyPart('belt', 1));
  await aimTap(front1, W(1, 1.69, 0.627, 0.1));
  expect((await comp(1, 'belt')).condition === 'ok', 'Neuer Riemen aufgelegt');
  await kit('hand', ['wrench']); await aimTap(front1, W(1, 1.6, 1.75, 0), 400); await p.waitForTimeout(900);
  expect(JSON.stringify((await st()).cars[0]) === before0, 'Auto auf Bühne 1 hat sich währenddessen nicht verändert');
  await computer();
  await p.getByText('Aufträge').click(); await p.waitForTimeout(200);
  await p.screenshot({ path: S + '/v3-bill.png' });
  await p.getByText(/Übergeben & kassieren/).click(); await p.waitForTimeout(400);
  s = await st();
  expect(!s.cars[1] && s.money > m0 - 29 + 100 && s.jobsDone === 1, 'Auftrag abgerechnet: +' + (s.money - (m0 - 29)) + ' € eingenommen');
  await p.getByRole('button', { name: 'Weiter', exact: true }).click();
  await closeModal();

  // === Probefahrt und Verkauf des eigenen Autos ===
  await kit('hand', []);
  await aimTap(front, W(0, 1.6, 1.75, 0), 400); await p.waitForTimeout(900);
  await p.evaluate(([x, z]) => Object.assign(window.__gkPlayer, { x, z, yaw: Math.PI / 2, pitch: -0.3, zoom: false }), front);
  await p.waitForTimeout(500);
  await p.getByTestId('drive').click(); await p.waitForTimeout(1500);
  expect((await st()).screen === 'track' && await p.evaluate(() => window.__gkAudio.running()), 'Probefahrt gestartet, Motor zu hören');
  await p.evaluate(() => {
    const d = window.__gkDrive; const N = d.samples.length;
    setInterval(() => {
      let near = 0, best = 1e9;
      d.samples.forEach((q, i) => { const dd = (q.x - d.sim.x) ** 2 + (q.z - d.sim.z) ** 2; if (dd < best) { best = dd; near = i; } });
      const t = d.samples[(near + 8) % N];
      let diff = Math.atan2(-(t.z - d.sim.z), t.x - d.sim.x) - d.sim.heading; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
      d.input.steer = Math.max(-1, Math.min(1, diff * 3)); d.input.throttle = d.sim.v < 16 ? 1 : 0; d.input.brake = 0;
    }, 30);
  });
  for (let i = 0; i < 200 && (await st()).screen === 'track'; i++) await p.waitForTimeout(1000);
  s = await st();
  expect(s.screen === 'garage' && s.cars[0].testDriven && s.cars[0].observed.includes('brake_grind'), 'Probefahrt gewertet; Bremsproblem erst dabei bemerkt');
  expect(!(await p.evaluate(() => window.__gkAudio.running())), 'Motorklang nach der Fahrt beendet');
  await p.screenshot({ path: S + '/v3-report.png' });
  await p.getByText('Zur Werkstatt').click();
  const m1 = (await st()).money;
  await computer(); await p.getByText('Meine Autos').click(); await p.waitForTimeout(200);
  await p.locator('.sell-card').first().getByText(/Verkaufen für/).click(); await p.waitForTimeout(500);
  s = await st();
  expect(!s.cars[0] && s.money > m1, 'Eigenes Auto verkauft (+' + (s.money - m1) + ' €)');
  await p.getByRole('button', { name: 'Weiter', exact: true }).click();
  await p.getByText('Gebrauchtwagen').click(); await p.getByText(/Feierabend/).click(); await p.waitForTimeout(200);
  s = await st(); expect(s.day === 2 && s.listings.length === 25 && s.jobs === 3, 'Nächster Tag: Markt und Auftragsliste gefüllt');
  await closeModal();
  await p.reload(); await p.waitForTimeout(2500);
  const r = await st();
  expect(r.money === s.money && r.jobsDone === 1 && r.day === 2, 'Spielstand nach Neuladen erhalten');
  await p.context().setOffline(true); await p.reload(); await p.waitForTimeout(2000);
  expect(await p.locator('canvas').count() === 1, 'Lädt offline');
  console.log('errors:', errs.slice(0, 8)); console.log(fails ? 'FEHLER: ' + fails : 'ALLES OK');
  await b.close();
})();
