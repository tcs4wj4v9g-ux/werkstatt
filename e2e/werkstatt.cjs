// Erweiterungsupdate: Flüssigkeiten, Hof/Ausbau, Waschen, Lack, Auktion, Scheunenfund, Ereignisse – mit echten Taps.
const { chromium } = require('playwright');
const S = process.env.GK_OUT || __dirname + '/out'; const URL = process.env.GK_URL || 'http://localhost:4173/?test';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const errs = []; let fails = 0;
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  const G = (fn, arg) => p.evaluate(fn, arg);
  const st = () => G(() => { const s = window.__gk.getState(); return { money: s.money, screen: s.screen, cars: s.cars, toast: s.toast && s.toast.text, panel: s.panel, upgrades: s.upgrades, stock: s.fluidStock, inv: s.inventory, auctions: s.auctions, waiting: s.waiting.length, events: s.events, listings: s.listings, pan: s.drainPan, day: s.day, tool: s.tool }; });
  const expect = (c, msg) => { if (!c) { fails++; console.log('FAIL:', msg); } else console.log('ok:', msg); };
  const EYE = 1.62, LIFT = 1.7;
  const aimTap = async (from, to, wait = 170) => {
    await G(([from, to, EYE]) => { const pl = window.__gkPlayer; pl.work = null; pl.x = from[0]; pl.z = from[1]; const dx = to[0] - from[0], dz = to[2] - from[1]; pl.yaw = Math.atan2(-dx, -dz); pl.pitch = Math.atan2(to[1] - EYE, Math.hypot(dx, dz)); pl.zoom = true; }, [from, to, EYE]);
    await p.waitForTimeout(wait); await p.mouse.click(590, 410); await p.waitForTimeout(80);
  };
  const stand = async (x, z, yaw = Math.PI / 2) => { await G(([x, z, yaw]) => Object.assign(window.__gkPlayer, { x, z, yaw, pitch: -0.2, zoom: false, work: null }), [x, z, yaw]); await p.waitForTimeout(450); };
  const kit = (active, carried = ['ratchet', 'socket17', 'wrench']) => G(([active, carried]) => window.__gk.setState({ tool: active, carried }), [active, carried]);
  const closeModal = () => p.locator('.modal-head .btn').click();
  const computer = async (tab) => { await aimTap([4.3, 4.0], [4.2, 1.05, 5.3], 500); if (tab) await p.locator('.tabrow .btn', { hasText: tab }).click(); await p.waitForTimeout(200); };
  const BZ = -2.7;
  const W = (lifted, x, y, z) => [x, y + (lifted ? LIFT : 0), z + BZ];

  await p.goto(URL); await p.waitForTimeout(2500);
  await p.getByText('Neues Spiel').click(); await p.getByText("Los geht's").click(); await p.waitForTimeout(600);
  // Sechszylinder mit altem Öl auf Bühne 1
  await G(() => {
    const g = window.__gk; g.setState({ money: 60000 }); g.getState().viewListing(0); g.getState().offer(5400);
    const s = g.getState(); const car = JSON.parse(JSON.stringify(s.cars[0]));
    for (const c of Object.values(car.components)) c.condition = 'ok';
    car.fluids.oil = { level: 3.6, quality: 0.2, product: 'oil_5w30', filterFresh: false };
    car.observed = [];
    g.setState({ cars: [car, ...s.cars.slice(1)], panel: null });
  });
  await p.waitForTimeout(1200);
  const front = [2.95, BZ], under = [2.5, BZ], leftSide = [1.0, BZ - 1.45];

  // === Teile und Flüssigkeiten bestellen ===
  await computer('Teile');
  await p.locator('.shop-row', { hasText: 'Motoröl 5W-30' }).getByRole('button').click();
  await p.locator('.shop-row', { hasText: 'Ölfilter' }).getByRole('button').click();
  let s = await st();
  expect(s.stock.oil_5w30 === 5 && s.inv['oil_filter@R4'] === 1, 'Öl (5 l) und Ölfilter bestellt und im Lager');
  await closeModal();

  // === Ölwechsel ===
  await kit('hand');
  await aimTap(front, W(0, 1.5, 0.9, 0), 400); await p.waitForTimeout(1100);
  await aimTap(front, W(0, 1.12, 0.79, 0.235));
  expect((await st()).panel === 'fluids', 'Ölpeilstab per Tap: Flüssigkeiten-Fenster offen');
  await p.getByTestId('fluid-oil').getByText('Stand ablesen').click(); await p.waitForTimeout(150);
  s = await st();
  expect(s.cars[0].checked.oil && s.toast.includes('3,6'), 'Ölstand abgelesen: ' + s.toast);
  await p.screenshot({ path: S + '/v4p-fluids.png' });
  await closeModal();
  await aimTap(front, W(0, 1.6, 1.75, 0), 400); await p.waitForTimeout(900);
  await aimTap([1.2, -0.4], [0.28, 1.25, -1.2], 500); await p.waitForTimeout(2600);
  expect((await st()).cars[0].lifted, 'Auto angehoben');
  await kit('ratchet');
  await aimTap(under, W(1, 1.4, 0.185, 0.08));
  s = await st();
  expect(s.cars[0].components.drain_plug.installed && s.toast.includes('Auffangwanne'), 'Ablassschraube bleibt drin, solange keine Wanne darunter steht');
  await kit('hand'); await aimTap([1.6, BZ + 0.3], [0.75, 0.12, BZ + 1.45 * -1 * -1], 400);
  if (!(await st()).pan[0]) await G(() => window.__gk.getState().togglePan(0));
  expect((await st()).pan[0], 'Auffangwanne unter den Motor gestellt');
  await kit('wrench'); await aimTap(under, W(1, 1.4, 0.185, 0.08));
  expect((await st()).cars[0].components.drain_plug.installed, 'Schraubenschlüssel löst die Ablassschraube nicht');
  await kit('ratchet'); await aimTap(under, W(1, 1.4, 0.185, 0.08));
  s = await st();
  expect(!s.cars[0].components.drain_plug.installed && s.cars[0].fluids.oil.level === 0, 'Ablassschraube heraus, Altöl in der Wanne: ' + s.toast);
  await p.screenshot({ path: S + '/v4p-drain.png' });
  expect((await G(() => window.__gk.getState().toggleEngine(0), null), (await st()).toast.includes('Ölablassschraube')), 'Motor startet nicht, solange die Ablassschraube fehlt');
  await aimTap(under, W(1, 1.4, 0.185, 0.08));
  expect((await st()).cars[0].components.drain_plug.installed, 'Ablassschraube wieder eingedreht');
  await G(() => { const g = window.__gk.getState(); g.togglePan(0); if (g.cars[0].lifted) g.tapLift(0); });
  await p.waitForTimeout(2600);
  await kit('hand'); await aimTap(front, W(0, 1.5, 0.9, 0), 400); await p.waitForTimeout(1100);
  await kit('wrench'); await aimTap(leftSide, W(0, 1.0, 0.745, -0.27));
  s = await st();
  expect(!s.cars[0].components.oil_filter.installed, 'Alter Ölfilter herausgedreht');
  await G(() => window.__gk.getState().addFluid(0, 'oil', 'oil_5w30', 1));
  expect((await st()).cars[0].fluids.oil.level === 0, 'Ohne Filter lässt sich kein Öl einfüllen');
  await aimTap(leftSide, W(0, 1.0, 0.745, -0.27));
  s = await st();
  expect(s.cars[0].components.oil_filter.installed && s.cars[0].fluids.oil.filterFresh && s.inv['oil_filter@R4'] === 0, 'Neuer Ölfilter eingesetzt');
  await p.getByTestId('fluids').click(); await p.waitForTimeout(200);
  await p.getByTestId('fluid-oil').locator('.chip', { hasText: '+ 4 l 5W-30' }).click();
  await p.getByTestId('fluid-oil').locator('.chip', { hasText: '+ 0,5 l 5W-30' }).click();
  await p.getByTestId('fluid-oil').getByText('Stand ablesen').click(); await p.waitForTimeout(150);
  s = await st();
  expect(s.cars[0].fluids.oil.level === 4.5 && s.stock.oil_5w30 === 0.5 && s.toast.includes('in Ordnung'), 'Frisches Öl eingefüllt, Lager um 4,5 l leerer: ' + s.toast);
  await closeModal();

  // === Neuladen mitten im Spiel ===
  await p.reload(); await p.waitForTimeout(2500);
  s = await st();
  expect(s.cars[0].fluids.oil.level === 4.5 && s.cars[0].fluids.oil.filterFresh && s.stock.oil_5w30 === 0.5 && s.cars[0].hoodOpen, 'Nach Neuladen: Ölstand, Filter, Lager und offene Haube erhalten');

  // === Ausbau: Hof wächst sichtbar ===
  await computer('Ausbau');
  await p.screenshot({ path: S + '/v4p-build.png' });
  await p.locator('.shop-row', { hasText: 'Stufe 4:' }).getByRole('button').click({ force: true, timeout: 2000 }).catch(() => {});
  expect(!(await st()).upgrades.includes('paint'), 'Lackierkabine erst nach dem Waschplatz kaufbar');
  for (const n of ['Stufe 2:', 'Stufe 3:', 'Stufe 4:']) await p.locator('.shop-row', { hasText: n }).getByRole('button').click();
  s = await st();
  expect(s.upgrades.join() === 'parking,wash,paint' && s.money < 60000 - 15000, 'Drei Ausbaustufen gekauft, Geld abgebucht');
  await closeModal();
  // durch das offene Tor in den Hof laufen
  await stand(-3.6, -2.7, Math.PI / 2);
  await p.keyboard.down('w');
  for (let i = 0; i < 40 && (await G(() => window.__gkPlayer.x)) > -6; i++) await p.waitForTimeout(250);
  await p.keyboard.up('w');
  const px = await G(() => window.__gkPlayer.x);
  expect(px < -5.5, 'Zu Fuß durch das offene Tor in den Hof (x = ' + px.toFixed(1) + ')');
  await stand(-3.6, 0, Math.PI / 2);
  await p.keyboard.down('w'); await p.waitForTimeout(1500); await p.keyboard.up('w');
  expect((await G(() => window.__gkPlayer.x)) > -4.6, 'Zwischen den Toren hält die Wand');
  await stand(-12, 0, Math.PI / 2 + 0.3); await p.screenshot({ path: S + '/v4p-yard.png' });

  // === Umparken, Waschen, Polieren, Innenraum ===
  await G(() => { const g = window.__gk; const s = g.getState(); const car = JSON.parse(JSON.stringify(s.cars[0])); for (const z of Object.values(car.zones)) Object.assign(z, { dirt: 0.9, step: 0, shine: 0.3, rust: 0 }); car.zones.rear.rust = 0.6; car.interior = { seats: 0.8, dash: 0.8, floor: 0.8 }; car.hoodOpen = false; car.testDriven = true; g.setState({ cars: [car, ...s.cars.slice(1)] }); });
  const v0 = await G(() => document.title && window.__gk.getState().cars[0].cleanValue);
  await stand(2.95, BZ);
  await p.getByTestId('move').click(); await p.waitForTimeout(200);
  await p.screenshot({ path: S + '/v4p-move.png' });
  await p.getByText('→ Waschplatz').click(); await p.waitForTimeout(600);
  s = await st();
  expect(!s.cars[0] && s.cars[2], 'Auto steht am Waschplatz');
  const WX = -8.6, WZ = 6.6;
  const zones = { front: [[WX + 3.6, WZ - 0.4], [WX + 2.2, 0.72, WZ]], rear: [[WX - 3.6, WZ + 0.4], [WX - 2.25, 0.75, WZ]], left: [[WX - 0.4, WZ - 2.6], [WX - 0.4, 0.7, WZ - 0.9]], right: [[WX - 0.4, WZ + 1.9], [WX - 0.4, 0.75, WZ + 0.9]], top: [[WX - 0.4, WZ - 2.6], [WX - 0.4, 1.3, WZ - 0.7]], wheels: [[WX + 1.38, WZ - 2.4], [WX + 1.38, 0.33, WZ - 0.9]] };
  await stand(WX + 3.4, WZ - 1.2, 0.9);
  await p.getByTestId('station').waitFor({ timeout: 8000 }).catch(() => {});
  expect(await p.getByTestId('station').count() === 1, 'Am Waschplatz liegen die Waschgeräte bereit');
  const pick = (name) => p.getByTestId('station').locator('.tool', { hasText: name }).click();
  await pick('Schaum'); await aimTap(...zones.front);
  expect((await st()).cars[2].zones.front.step === 0, 'Schaum vor dem Vorspülen wirkt nicht: ' + (await st()).toast);
  for (const tool of ['Hochdruck', 'Schaum', 'Hochdruck', 'Trocknen']) {
    await stand(WX + 3.4, WZ - 1.2, 0.9); await pick(tool);
    for (const z of ['front', 'rear', 'left', 'right', 'top']) await aimTap(...zones[z]);
    if (tool === 'Schaum') await p.screenshot({ path: S + '/v4p-foam.png' });
  }
  for (const tool of ['Hochdruck', 'Felgen', 'Hochdruck', 'Trocknen']) { await stand(WX + 3.4, WZ - 1.2, 0.9); await pick(tool); await aimTap(...zones.wheels); }
  s = await st();
  const dirtNow = Object.values(s.cars[2].zones).map((z) => z.dirt);
  expect(dirtNow.every((d) => d === 0), 'Alle sechs Bereiche in vier Schritten sauber gewaschen ' + dirtNow.join('/'));
  await stand(WX + 3.4, WZ - 1.2, 0.9); await pick('Polieren');
  for (const z of ['front', 'rear', 'left', 'right', 'top']) await aimTap(...zones[z]);
  s = await st();
  expect(s.cars[2].zones.front.shine === 1 && s.cars[2].zones.rear.shine < 0.8 && s.cars[2].zones.rear.rust === 0.6, 'Poliert – aber der Rost am Heck bleibt');
  for (const tool of ['Saugen', 'Sitze', 'Cockpit']) { await stand(WX + 3.4, WZ - 1.2, 0.9); await pick(tool); await aimTap(...zones.top); }
  s = await st();
  expect(s.cars[2].interior.seats === 0 && s.cars[2].interior.dash === 0 && s.cars[2].interior.floor === 0, 'Innenraum mit drei Geräten gereinigt');
  await p.screenshot({ path: S + '/v4p-clean.png' });

  // === Lackierkabine ===
  await stand(WX + 3.4, WZ - 1.2, 0.9);
  await G(() => window.__gk.getState().moveCar(2, 3)); await p.waitForTimeout(600);
  const PX = -19.4, PZ = 6.4;
  const pz = { front: [[PX + 3.6, PZ - 0.6], [PX + 2.2, 0.72, PZ]], rear: [[PX - 3.0, PZ - 1.6], [PX - 2.25, 0.75, PZ - 0.3]], left: [[PX - 0.4, PZ - 2.8], [PX - 0.4, 0.7, PZ - 0.9]], right: [[PX + 0.2, PZ + 1.7], [PX - 0.4, 0.75, PZ + 0.9]], top: [[PX - 0.4, PZ - 2.8], [PX - 0.4, 1.3, PZ - 0.7]] };
  await stand(PX + 3.2, PZ - 1.6, 1.0);
  expect(await p.getByTestId('station').locator('.tool').count() === 2, 'In der Kabine: Schleifer und Lackierpistole');
  await pick('Lackieren'); await p.locator('.swatch').nth(5).click();
  const m0 = (await st()).money;
  await aimTap(...pz.rear);
  expect((await st()).money === m0, 'Auf Rost wird nicht lackiert: ' + (await st()).toast);
  await pick('Schleifen'); await aimTap(...pz.rear);
  expect((await st()).cars[3].zones.rear.rust === 0, 'Rost abgeschliffen und grundiert');
  await pick('Lackieren');
  for (const z of ['rear', 'front', 'left', 'right', 'top']) { await stand(PX + 3.2, PZ - 1.6, 1.0); await aimTap(...pz[z]); if (z === 'left') await p.screenshot({ path: S + '/v4p-paint.png' }); }
  s = await st();
  expect(s.cars[3].color === '#1d3fae' && s.money === m0 - 350 && !Object.values(s.cars[3].zones).some((z) => z.paint), 'Fünf Bereiche lackiert (350 €), neue Wagenfarbe übernommen');
  await G(() => window.__gk.getState().moveCar(3, 4));
  await computer('Meine Autos');
  await p.screenshot({ path: S + '/v4p-sellcard.png' });
  const card = await p.locator('.sell-card').first().innerText();
  expect(/Frisch gewaschen/.test(card) && /Lack poliert/.test(card) && /Innenraum aufbereitet/.test(card) && /Frischer Ölwechsel/.test(card), 'Verkaufsbewertung nennt Wäsche, Politur, Innenraum und Ölwechsel als begrenzte Zuschläge');
  await p.locator('.sell-card').first().locator('.chip').click();
  expect((await st()).cars[4].keep === true, 'Als Privatfahrzeug markiert');
  await G(() => window.__gk.getState().sell(4));
  expect(!!(await st()).cars[4], 'Privatfahrzeug lässt sich nicht verkaufen');
  await closeModal();

  // === Auktion: bieten, überboten werden, gewinnen ===
  // Der Test dauert länger als eine echte Auktion – Uhr der ersten Auktion auf jetzt stellen.
  await G(() => { const g = window.__gk; const s = g.getState(); const a = JSON.parse(JSON.stringify(s.auctions[0])); const n = Date.now(); Object.assign(a, { startsAt: n, endsAt: n + 300000, simulatedTo: n, result: undefined, settled: false, leader: null, current: a.startBid }); g.setState({ auctions: [a, ...s.auctions.slice(1)] }); });
  await computer('Auktionen');
  s = await st();
  expect(s.auctions.length >= 1 && s.auctions[0].bidders.length >= 1, 'Auktion läuft mit ' + s.auctions[0].bidders.length + ' Händlern');
  const a0 = s.auctions[0];
  await p.getByTestId('auction-0').getByText(/^Bieten/).click(); await p.waitForTimeout(200);
  s = await st();
  expect(s.auctions[0].log.some((l) => l.startsWith('Du bietest')), 'Gebot angenommen (Höchstbietender: ' + s.auctions[0].leader + ')');
  await p.screenshot({ path: S + '/v4p-auction.png' });
  await p.getByTestId('auction-0').getByText('Ansehen').click(); await p.waitForTimeout(1200);
  expect((await st()).screen === 'market' && await p.getByText('Auktionshaus').count() === 1, '3D-Ansicht im Auktionshaus');
  await p.screenshot({ path: S + '/v4p-auction3d.png' });
  await p.getByText('← Werkstatt').click(); await p.waitForTimeout(800);
  // Zeit vorspulen: mit Höchstgebot über allen Limits gewinnen
  const top = Math.max(a0.startBid, ...a0.bidders.map((x) => x.limit));
  await G(() => window.__gk.setState({ money: 3000000 }));
  const moneyBefore = (await st()).money;
  await G(([top]) => { const g = window.__gk; const s = g.getState(); const auctions = JSON.parse(JSON.stringify(s.auctions)); auctions[0].leader = null; auctions[0].current = auctions[0].startBid; g.setState({ auctions }); g.getState().bid(0, top + 100); }, [top]);
  await G(() => { const g = window.__gk; const a = g.getState().auctions[0]; g.getState().tickAuctions(a.endsAt + 600000); });
  s = await st();
  const wonCar = s.cars.find((c) => c && c.origin === 'auction');
  expect(s.auctions[0].result === 'won' && [0, 750].includes(s.money - (moneyBefore - (top + 100))) && !!wonCar && wonCar.purchasePrice === top + 100, 'Auktion gewonnen: Kaufpreis abgebucht, Auto auf einem Stellplatz');
  await G(() => { const g = window.__gk; g.getState().tickAuctions(Date.now() + 9e6); g.getState().tickAuctions(Date.now() + 9e6); });
  expect((await st()).money === s.money && (await st()).cars.filter((c) => c && c.origin === 'auction').length === 1, 'Erneutes Auswerten bucht nicht doppelt ab');

  // === Ereignisse und Scheunenfund ===
  await G(() => { const g = window.__gk; g.setState({ carsSold: 3 }); for (let i = 0; i < 60 && !g.getState().events.some((e) => e.type === 'barn_hint'); i++) g.getState().nextDay(); });
  s = await st();
  const barn = s.events.find((e) => e.type === 'barn_hint');
  expect(!!barn, 'Nach einigen Tagen: Hinweis auf einen Scheunenfund (Tag ' + s.day + ', aktive Ereignisse: ' + s.events.length + ')');
  await computer('Neuigkeiten');
  await p.screenshot({ path: S + '/v4p-news.png' });
  const nEvents = (await st()).events.length;
  await p.locator('.sell-card', { hasText: 'Scheunenfund' }).getByText('Hinfahren und ansehen').click(); await p.waitForTimeout(1500);
  s = await st();
  expect(s.screen === 'market' && s.listings[0].barn && s.events.length === nEvents - 1, 'Scheunenfund besichtigen; Ereignis ist damit verbraucht');
  await p.screenshot({ path: S + '/v4p-barn.png' });
  await p.getByText('Probefahrt mit dem Verkäufer').click(); await p.waitForTimeout(200);
  expect((await p.locator('.note').innerText()).includes('ausgeschlossen'), 'Scheunenfund: keine Probefahrt möglich');
  const mBarn = (await st()).money;
  await p.getByText(/Sofort kaufen/).click(); await p.waitForTimeout(1200);
  s = await st();
  const bf = s.cars.findIndex((c) => c && c.origin === 'barn');
  expect(bf >= 4 && s.money < mBarn - 180 && s.cars[bf].rarity >= 1, 'Scheunenfund gekauft und in den Hof transportiert (Stellplatz ' + (bf - 3) + ')');
  await G((bf) => window.__gk.getState().toggleEngine(bf), bf);
  s = await st();
  expect(s.cars[bf].observed.includes('no_start') && s.toast.includes('Relais'), 'Scheunenfund springt nicht an: ' + s.toast);
  await stand(-11, -3.2, Math.PI); await p.screenshot({ path: S + '/v4p-barnyard.png' });
  // Sonderangebot Teile wirkt auf den Preis
  await G(() => { const g = window.__gk; const s = g.getState(); g.setState({ events: [...s.events.filter((e) => e.type !== 'parts_sale'), { id: 't', type: 'parts_sale', title: 'x', text: 'x', expiresDay: s.day, sale: { partId: 'alternator', pct: 30 } }] }); });
  const mSale = (await st()).money;
  await G(() => window.__gk.getState().buyPart('alternator'));
  expect(mSale - (await st()).money === 168, 'Teile-Sonderangebot: Lichtmaschine 168 € statt 240 €');

  // === Speichern, Laden, Offline ===
  const before = await st();
  await p.reload(); await p.waitForTimeout(2500);
  s = await st();
  expect(s.money === before.money && s.upgrades.length === 3 && s.cars[bf] && s.cars[bf].origin === 'barn' && s.cars[4].keep && s.cars[4].color === '#1d3fae' && s.day === before.day, 'Nach Neuladen: Ausbau, Stellplätze, Scheunenfund, Lack und Privatfahrzeug erhalten');
  await p.context().setOffline(true); await p.reload(); await p.waitForTimeout(2000);
  expect(await p.locator('canvas').count() === 1, 'Lädt offline');
  console.log('errors:', errs.slice(0, 8)); console.log(fails ? 'FEHLER: ' + fails : 'ALLES OK');
  await b.close();
})();
