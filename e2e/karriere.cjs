// Pakete B und C im Browser: Erfolge, Prüfstand, Getriebe mit Heber, Zylinderkopf, Halle 2, Showroom, Wettbewerb, Treffen, Spielstand-Übernahme.
const { chromium } = require('playwright');
const S = process.env.GK_OUT || __dirname + '/out'; const URL = process.env.GK_URL || 'http://localhost:4173/?test';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const errs = []; let fails = 0;
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 200)); });
  const expect = (c, msg) => { if (!c) { fails++; console.log('FAIL:', msg); } else console.log('ok:', msg); };
  const EYE = 1.62, LIFT = 1.7;
  const G = (fn, arg) => p.evaluate(fn, arg);
  const toast = () => G(() => { const t = window.__gk.getState().toast; return t && t.text; });
  const comp = (slot, id) => G(([slot, id]) => window.__gk.getState().cars[slot].components[id], [slot, id]);
  const kit = (active) => G((active) => window.__gk.setState({ tool: active, carried: ['ratchet', 'socket10', 'socket13', 'socket17'] }), active);
  const aim = async (from, to, zoom = true) => { await G(([from, to, EYE, zoom]) => { const pl = window.__gkPlayer; pl.work = null; pl.x = from[0]; pl.z = from[1]; const dx = to[0] - from[0], dz = to[2] - from[1]; pl.yaw = Math.atan2(-dx, -dz); pl.pitch = Math.atan2(to[1] - EYE, Math.hypot(dx, dz)); pl.zoom = zoom; }, [from, to, EYE, zoom]); await p.waitForTimeout(520); };
  const aimTap = async (from, to) => { await aim(from, to); await p.mouse.click(590, 410); await p.waitForTimeout(200); };
  const shot = async (name, from, to) => { await aim(from, to, false); await p.waitForTimeout(700); await p.screenshot({ path: `${S}/c-${name}.png` }); };

  // ---------- Spielstand der Vorversion (Version 4) mit Sechszylinder ----------
  await p.goto(URL); await p.waitForTimeout(1500);
  await G(() => {
    const c = (n, extra = {}) => ({ installed: true, bolts: Array(n).fill(2), connected: true, condition: 'ok', known: false, ...extra });
    const components = { engine_cover: c(0, { installed: false }), coil1: c(1), coil2: c(1, { installed: false, bolts: [0], connected: false, condition: 'defect', known: true }), coil3: c(1), coil4: c(1), plug1: c(0), plug2: c(0), plug3: c(0), plug4: c(0), valve_cover: c(6), gasket: c(0), rocker: c(2), oil_filter: c(0), battery: c(1), intake_hose: c(1), chain_tensioner: c(0), belt: c(0), alternator: c(2), water_pump: c(4), hose: c(1), thermostat: c(2), oil_pan: c(4), drain_plug: c(0), oil_pan_gasket: c(0), bearing: c(2), wheel_fl: c(5), caliper_fl: c(2), pads_fl: c(0), disc_fl: c(1), wheel_fr: c(5), caliper_fr: c(2), pads_fr: c(0), disc_fr: c(1) };
    const zone = { dirt: 0.3, step: 0, shine: 0.5, rust: 0 };
    const car = { uid: 'v4car', modelId: 'bavaria_330', color: '#101114', year: 2008, km: 150000, cleanValue: 12400, components, hoodOpen: true, lifted: false, purchasePrice: 8000, partsSpent: 49, testDriven: false, haggled: false, obdCodes: null, observed: ['rough_idle'], fluids: { oil: { level: 6.2, quality: 0.6, product: 'oil_5w40', filterFresh: false }, coolant: { level: 8, quality: 0.8, air: false }, brake: { level: 1, quality: 0.7, air: false, bled: { fl: false, fr: false } } }, checked: {}, zones: { front: zone, rear: zone, left: zone, right: zone, top: zone, wheels: zone }, interior: { seats: 0.3, dash: 0.3, floor: 0.3 }, rarity: 0, origin: 'market', keep: false };
    localStorage.setItem('garage-kings-save-v1', JSON.stringify({ version: 4, state: { money: 31337, screen: 'garage', cars: [car, null, null, null, null, null, null, null, null, null], upgrades: ['parking', 'wash'], fluidStock: { oil_5w30: 2, oil_5w40: 0, coolant: 1, brake_fluid: 0 }, drainPan: [false, false], auctions: [], waiting: [], events: [], liftUp: [false, false], carried: ['ratchet', 'socket10'], tool: 'hand', inventory: { ignition_coil: 2, spark_plug: 3, brake_pads: 2, battery: 1, oil_filter: 0 }, listings: [], selected: 0, jobs: [], day: 12, marketIndex: 1.04, carsSold: 7, totalProfit: 21500, jobsDone: 4, jobEarnings: 900, sound: true, started: true } }));
  });
  await p.reload(); await p.waitForTimeout(3000);
  let s = await G(() => { const s = window.__gk.getState(); return { money: s.money, day: s.day, sold: s.carsSold, inv: s.inventory, car: s.cars[0], n: s.cars.length, listings: s.listings.length, achieved: s.achieved, unlocked: s.unlocked.length, upgrades: s.upgrades, liftUp: s.liftUp.length }; });
  expect(s.day === 12 && s.sold === 7 && s.upgrades.join() === 'parking,wash', 'Version-4-Spielstand: Tag, Statistik und Ausbauten erhalten');
  expect(s.inv['ignition_coil@R4'] === 2 && s.inv['spark_plug@R4'] === 3 && s.inv['battery@alle'] === 1 && Object.keys(s.inv).length === 4, 'Altes Teilelager nach Passform umgestellt: ' + JSON.stringify(s.inv));
  const cc = s.car.components;
  expect(s.car.uid === 'v4car' && cc.coil5 && cc.coil6 && cc.plug6 && cc.coil5.installed && !cc.coil2.installed && cc.coil2.condition === 'defect' && cc.coil2.known, 'Alter Sechszylinder: Zylinder 5 und 6 ergänzt, ausgebaute defekte Spule 2 unverändert');
  expect(cc.cyl_head.installed && cc.gearbox.installed && cc.head_gasket.condition === 'ok' && s.car.partsSpent === 49 && s.car.observed.join() === 'rough_idle', 'Neue Bauteile (Kopf, Getriebe) heil ergänzt, Reparaturstand und Beobachtungen erhalten');
  expect(s.listings === 25 && s.n === 15 && s.liftUp === 15, 'Markt auf 25 Inserate gefüllt, Stellplatzliste auf neue Größe gebracht');
  expect(s.achieved.includes('first_sale') && s.money > 31337, 'Bereits erreichte Erfolge werden einmalig nachgetragen (Geld ' + s.money + ', Erfolge ' + s.achieved.join(',') + ')');
  const moneyAfter = s.money;
  await p.reload(); await p.waitForTimeout(2500);
  s = await G(() => { const s = window.__gk.getState(); return { money: s.money, achieved: s.achieved.length }; });
  expect(s.money === moneyAfter, 'Nach erneutem Laden keine zweite Belohnung (' + s.money + ')');
  await G(() => window.__gk.getState().dismissUnlocked());

  // ---------- Standorte kaufen ----------
  await G(() => { const g = window.__gk; g.setState({ money: 2000000, upgrades: ['parking', 'wash', 'paint', 'expansion'] }); for (const id of ['hoist', 'loc_pro', 'loc_center', 'loc_hq']) g.getState().buyUpgrade(id); });
  await p.waitForTimeout(2500);
  s = await G(() => { const s = window.__gk.getState(); return { up: s.upgrades, money: s.money, achieved: s.achieved }; });
  expect(['loc_pro', 'loc_center', 'loc_hq', 'dyno', 'hoist'].every((u) => s.up.includes(u)), 'Standorte gekauft, Prüfstand im Performance-Center enthalten');
  expect(s.achieved.includes('hq') && s.achieved.includes('equipment'), 'Erfolge „Headquarters" und „Voll ausgestattet" ausgelöst');
  await G(() => window.__gk.getState().dismissUnlocked());
  // Autos auf Bühne 3, 4 und in den Showroom
  await G(() => {
    const g = window.__gk; const s = g.getState(); const cars = [...s.cars];
    const mk = (m, d = []) => { const c = window.__gkLib.createCar(m, d, Math.random); for (const z of Object.values(c.zones)) Object.assign(z, { dirt: 0, step: 0, shine: 1, rust: 0 }); c.interior = { seats: 0, dash: 0, floor: 0 }; c.fluids.oil.level = 8; c.purchasePrice = 1000; return c; };
    cars[0] = null; cars[10] = mk('bavaria_320', ['gearbox']); cars[11] = mk('bavaria_335_coupe');
    cars[12] = { ...mk('bavaria_30cs'), keep: true, testDriven: true }; cars[13] = { ...mk('veloce_stradale'), testDriven: true }; cars[14] = mk('kaiser_600');
    g.setState({ cars, inventory: {}, panel: null });
  });
  await p.waitForTimeout(3500);
  s = await G(() => { const st = window.__gk.getState(); const a = st.achieved; st.dismissUnlocked(); return a; });
  expect(s.includes('collector_car'), 'Erfolg „Kronjuwel": Sammlerfahrzeug in Bestzustand als Privatfahrzeug');
  // Zu Fuß durch den Durchgang in Halle 2
  await G(() => { Object.assign(window.__gkPlayer, { x: -1, z: -4.4, yaw: 0, pitch: 0, zoom: false, work: null }); });
  const walk = (dz, n) => G(([dz, n]) => { for (let i = 0; i < n; i++) window.__gkLib.movePlayer(0, dz, []); return { x: window.__gkPlayer.x, z: window.__gkPlayer.z }; }, [dz, n]);
  // Neben dem Durchgang hält die Wand, im Durchgang geht es hindurch.
  await G(() => { Object.assign(window.__gkPlayer, { x: 3.5, z: -4.4 }); });
  let blocked = await walk(-0.05, 80);
  expect(blocked.z > -5.4, 'Neben dem Durchgang hält die Wand (z = ' + blocked.z.toFixed(2) + ')');
  await G(() => { Object.assign(window.__gkPlayer, { x: -1, z: -4.4 }); });
  await walk(-0.05, 80);
  let pos = await G(() => ({ x: window.__gkPlayer.x, z: window.__gkPlayer.z }));
  expect(pos.z < -8, 'Durch den Durchgang in Halle 2 gelaufen (z = ' + pos.z.toFixed(2) + ')');
  const far = await walk(-0.05, 400);
  expect(far.z > -16.4 && far.z < -15.5, 'Halle 2 endet an der Stirnwand (z = ' + far.z.toFixed(2) + ')');
  await shot('halle2', [4.6, -6.6], [0, 1.2, -11]);
  await shot('halle2b', [-3.5, -15.5], [1, 1.0, -9]);
  // Bühne 3: Haube per Tipp öffnen, Bühne per Bedienkasten? -> über Aktion; Getriebe mit Heber
  const bz = -8.1;
  await kit('hand'); await aimTap([2.95, bz], [1.5, 0.9, bz]);
  expect((await G(() => window.__gk.getState().cars[10].hoodOpen)) === true, 'Bühne 3: Motorhaube per Tipp geöffnet – ' + (await toast()));
  await aimTap([2.95, bz], [1.5, 0.95, bz]);
  await G(() => window.__gk.getState().tapLift(10)); await p.waitForTimeout(2600);
  expect(await G(() => window.__gk.getState().cars[10].lifted), 'Bühne 3 fährt hoch');
  const gb = [[0.58, -0.11], [0.78, -0.03], [0.58, 0.11], [0.78, 0.03]].map(([x, z]) => [x, 0.122 + LIFT - 0.02, bz + z]);
  const under = [1.9, bz];
  await kit('ratchet'); for (const q of gb) await aimTap(under, q);
  await kit('hand'); for (const q of gb) await aimTap(under, q);
  expect((await comp(10, 'gearbox')).bolts.join() === '0,0,0,0', 'Getriebe: vier Schrauben von unten gelöst und herausgedreht – ' + (await comp(10, 'gearbox')).bolts);
  await shot('getriebe', under, [0.7, LIFT + 0.2, bz]);
  await G(() => window.__gk.setState({ upgrades: window.__gk.getState().upgrades.filter((u) => u !== 'hoist') }));
  await aimTap(under, [0.965, LIFT + 0.16, bz]);
  expect((await comp(10, 'gearbox')).installed && /Getriebeheber/.test(await toast()), 'Ohne Heber bleibt das Getriebe drin – ' + (await toast()));
  await G(() => window.__gk.setState({ upgrades: [...window.__gk.getState().upgrades, 'hoist'] }));
  await aimTap(under, [0.965, LIFT + 0.16, bz]);
  expect(!(await comp(10, 'gearbox')).installed && (await comp(10, 'gearbox')).known, 'Mit Heber: Getriebe ausgebaut und als defekt erkannt – ' + (await toast()));
  await G(() => window.__gk.getState().buyPart('gearbox', 10));
  await aimTap(under, [0.965, LIFT + 0.16 - 0.12, bz]);
  for (const q of gb) await aimTap(under, q); await kit('ratchet'); for (const q of gb) await aimTap(under, q);
  const g2 = await comp(10, 'gearbox');
  expect(g2.installed && g2.condition === 'ok' && g2.bolts.join() === '2,2,2,2', 'Austauschgetriebe eingebaut und verschraubt');
  s = await G(() => { const s = window.__gk.getState(); return { severe: s.career.severeFixed, achieved: s.achieved }; });
  expect(s.severe === 1 && s.achieved.includes('severe'), 'Karriere zählt den kapitalen Schaden, Erfolg ausgelöst');
  await G(() => { window.__gk.getState().dismissUnlocked(); window.__gk.getState().tapLift(10); }); await p.waitForTimeout(2500);

  // ---------- Prüfstand ----------
  await G(() => { Object.assign(window.__gkPlayer, { x: 2.9, z: -13.5, yaw: Math.PI / 2, pitch: -0.2, zoom: false, work: null }); });
  await p.waitForTimeout(900);
  await p.locator('[data-testid=dyno]').click(); await p.waitForTimeout(800);
  const dyno = await p.locator('[data-testid=dyno-result]').textContent();
  expect(/306 PS/.test(dyno) && (await p.locator('svg.dyno path').count()) === 2, 'Prüfstand zeigt Messwert und zwei Kurven: ' + dyno);
  await p.screenshot({ path: S + '/c-dyno.png' });
  s = await G(() => { const s = window.__gk.getState(); return { dyno: s.cars[11].dyno, runs: s.career.dynoRuns }; });
  expect(s.dyno && s.dyno.ps === 306 && s.runs === 1, 'Messprotokoll am Auto gespeichert');
  await G(() => { window.__gk.getState().setPanel(null); window.__gk.getState().dismissUnlocked(); });

  // ---------- Showroom ----------
  await G(() => { Object.assign(window.__gkPlayer, { x: -1, z: 4.4, yaw: Math.PI, pitch: 0, zoom: false, work: null }); });
  await walk(0.05, 80);
  pos = await G(() => ({ x: window.__gkPlayer.x, z: window.__gkPlayer.z }));
  expect(pos.z > 7, 'Durch den Durchgang in den Showroom gelaufen (z = ' + pos.z.toFixed(2) + ')');
  await shot('showroom', [-4.0, 6.4], [1.5, 0.9, 10.5]);
  await shot('showroom2', [5.6, 13.8], [0.5, 0.8, 9.5]);
  s = await G(() => { const s = window.__gk.getState(); s.setPanel('computer'); return 1; });
  await p.getByText('Sammlung', { exact: true }).click(); await p.waitForTimeout(300);
  expect((await p.locator('[data-testid=collection]').count()) === 1 && /Showroom 1/.test(await p.locator('.modal').textContent()), 'Sammlung zeigt das ausgestellte Sammlerfahrzeug');
  await p.screenshot({ path: S + '/c-sammlung.png' });
  await p.getByText(/^Erfolge/).click(); await p.waitForTimeout(300);
  expect((await p.locator('[data-testid=achievement]').count()) >= 25, 'Erfolgsliste vollständig');
  await p.screenshot({ path: S + '/c-erfolge.png' });
  // Verkauf aus dem Showroom: 4 % Aufschlag
  const offer = await G(() => { const g = window.__gk; const before = g.getState().money; g.getState().sell(13); const st = g.getState(); return { got: st.money - before, last: st.lastSale && st.lastSale.price, achieved: st.achieved }; });
  expect(offer.got > 150000 && offer.achieved.includes('sale_50k'), 'Supersportwagen aus dem Showroom verkauft: ' + offer.got + ' € (inkl. Showroom-Aufschlag), Erfolg „Oberklasse"');
  await G(() => { const g = window.__gk.getState(); g.dismissSale(); g.dismissUnlocked(); });

  // ---------- Wettbewerb und Treffen ----------
  await G(() => { const g = window.__gk; while (!g.getState().contest) g.getState().nextDay(); g.getState().dismissUnlocked(); g.getState().setPanel('computer'); });
  await p.waitForTimeout(400);
  await p.getByText(/^Wettbewerbe/).click(); await p.waitForTimeout(300);
  expect((await p.locator('[data-testid=contest]').count()) === 1, 'Wettbewerb ausgeschrieben: ' + (await G(() => window.__gk.getState().contest.title)));
  await p.getByText(/^Anmelden für/).click(); await p.waitForTimeout(200);
  expect(await G(() => window.__gk.getState().contest.joined), 'Für den Wettbewerb angemeldet');
  await p.screenshot({ path: S + '/c-wettbewerb.png' });
  const res = await G(() => { const g = window.__gk; let n = 0; while (!g.getState().contestResult && n++ < 12) g.getState().nextDay(); return g.getState().contestResult; });
  expect(res && res.table.length === 5 && res.place >= 1, 'Wettbewerb ausgewertet: Platz ' + (res && res.place) + ' von ' + (res && res.of) + ', Auszahlung ' + (res && res.payout));
  await G(() => window.__gk.getState().setPanel(null)); await p.waitForTimeout(300);
  expect(await p.getByText(/– Ergebnis$/).count(), 'Ergebnistafel wird angezeigt');
  await p.screenshot({ path: S + '/c-ergebnis.png' });
  await G(() => { const g = window.__gk; g.getState().dismissContestResult(); let n = 0; while (!g.getState().meet && n++ < 6) g.getState().nextDay(); g.getState().dismissContestResult(); g.getState().dismissUnlocked(); g.getState().setPanel('computer'); });
  await p.waitForTimeout(300); await p.getByText(/^Wettbewerbe/).click(); await p.waitForTimeout(300);
  expect((await p.locator('[data-testid=meet]').count()) === 1, 'Treffen findet statt: ' + (await G(() => window.__gk.getState().meet.title)));
  await p.locator('[data-testid=meet] .shop-row button:not([disabled])').first().click(); await p.waitForTimeout(300);
  const meet = await G(() => window.__gk.getState().meet.result);
  expect(meet && meet.place >= 1 && meet.table.length === 6, 'Am Treffen teilgenommen: ' + (meet && meet.car) + ', Platz ' + (meet && meet.place) + ', ' + (meet && meet.score) + ' Punkte');
  await G(() => { const g = window.__gk.getState(); g.dismissContestResult(); g.setPanel(null); });
  // Speichern und Laden: alles bleibt
  const before = await G(() => { const s = window.__gk.getState(); return JSON.stringify({ m: s.money, a: s.achieved, c: s.career, u: s.upgrades, cars: s.cars.map((c) => c && c.uid), dyno: s.cars[11] && s.cars[11].dyno, meet: s.meet && s.meet.result && s.meet.result.place }); });
  await p.reload(); await p.waitForTimeout(3000);
  const after = await G(() => { const s = window.__gk.getState(); return JSON.stringify({ m: s.money, a: s.achieved, c: s.career, u: s.upgrades, cars: s.cars.map((c) => c && c.uid), dyno: s.cars[11] && s.cars[11].dyno, meet: s.meet && s.meet.result && s.meet.result.place }); });
  expect(before === after, 'Nach Neuladen identisch: Geld, Erfolge, Karriere, Standorte, Autos, Prüfstandsprotokoll, Treffen-Ergebnis');
  console.log('errors:', errs.slice(0, 8)); console.log(fails ? 'FEHLER: ' + fails : 'ALLES OK');
  await b.close();
})();
