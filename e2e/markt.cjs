// Bildschirmfotos: jede Karosserie beim Händler, Marktliste mit Filtern, Teileshop, Fahrzeugakte. Dazu Klick-Durchlauf durch Markt und Kauf.
const { chromium } = require('playwright');
const S = process.env.GK_OUT || __dirname + '/out'; const URL = process.env.GK_URL || 'http://localhost:4173/?test';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const errs = []; let fails = 0;
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 200)));
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  const expect = (c, msg) => { if (!c) { fails++; console.log('FAIL:', msg); } else console.log('ok:', msg); };
  await p.goto(URL); await p.waitForTimeout(2500);
  await p.getByText('Neues Spiel').click(); await p.getByText("Los geht's").click(); await p.waitForTimeout(800);
  let n = await p.evaluate(() => window.__gk.getState().listings.length);
  expect(n === 25, 'Neues Spiel: 25 Inserate am Markt (' + n + ')');
  // Marktliste am Computer
  await p.evaluate(() => window.__gk.getState().setPanel('computer')); await p.waitForTimeout(500);
  expect((await p.locator('[data-testid=listing]').count()) === 25, 'Computer zeigt 25 Inserate');
  await p.screenshot({ path: S + '/s5-list.png' });
  await p.locator('.filters select').nth(0).selectOption('luxury'); await p.waitForTimeout(200);
  let rows = await p.locator('[data-testid=listing]').count();
  expect(rows === 3, 'Filter „Luxus- und Sportwagen": 3 Inserate (' + rows + ')');
  await p.locator('.filters select').nth(0).selectOption('all');
  await p.locator('.filters select').nth(2).selectOption('V8'); await p.waitForTimeout(200);
  rows = await p.locator('[data-testid=listing]').count();
  const txt = await p.locator('[data-testid=listing]').allTextContents();
  expect(rows > 0 && txt.every((t) => /V8/.test(t)), 'Filter „V8": nur V8-Inserate (' + rows + ')');
  await p.locator('.filters select').nth(3).selectOption('price_desc'); await p.waitForTimeout(200);
  await p.screenshot({ path: S + '/s5-filter.png' });
  await p.getByText('Filter zurücksetzen').click();
  await p.getByText('nur bezahlbare').click(); await p.waitForTimeout(200);
  rows = await p.locator('[data-testid=listing]').count();
  expect(rows >= 1 && rows < 25, 'Filter „nur bezahlbare" mit 6.000 €: ' + rows + ' Inserate');
  // Besichtigen per Knopf, Blättern, zurück zur Liste
  await p.locator('[data-testid=listing] button').first().click(); await p.waitForTimeout(1800);
  expect(await p.evaluate(() => window.__gk.getState().screen) === 'market', 'Besichtigen öffnet den Händlerhof');
  const sel0 = await p.evaluate(() => window.__gk.getState().selected);
  await p.getByText('Nächstes ▶').click(); await p.waitForTimeout(900);
  const sel1 = await p.evaluate(() => window.__gk.getState().selected);
  expect(sel1 === (sel0 + 1) % 25, 'Blättern zum nächsten Inserat');
  await p.getByText('☰ Alle Inserate').click(); await p.waitForTimeout(600);
  expect(await p.evaluate(() => window.__gk.getState().panel) === 'computer', 'Zurück zur Liste am Computer');
  expect((await p.locator('[data-testid=listing]').count()) === rows, 'Filter ist nach der Besichtigung noch gesetzt');
  await p.getByText('Filter zurücksetzen').click();
  // Jede Karosserie einmal beim Händler ansehen
  const models = ['tanaka_piccolo', 'nordwind_245', 'bavaria_320', 'bavaria_335_coupe', 'albrecht_350', 'veloce_gt', 'veloce_stradale', 'bavaria_30cs', 'veloce_250', 'kaiser_600', 'bavaria_340_ms', 'nordwind_s6'];
  for (const m of models) {
    await p.evaluate((m) => {
      const g = window.__gk; const s = g.getState();
      const l = JSON.parse(JSON.stringify(s.listings[1]));
      l.car = window.__gkLib.createCar(m, [], Math.random); l.id = l.car.uid; for (const z of Object.values(l.car.zones)) { z.dirt = 0.05; z.rust = 0; z.shine = 0.9; }
      const ls = [...s.listings]; ls[1] = l; g.setState({ listings: ls }); g.getState().viewListing(1);
    }, m);
    await p.waitForTimeout(1700);
    await p.screenshot({ path: `${S}/s5-${m}.png` });
  }
  // Teileshop je Auto und Fahrzeugakte
  await p.evaluate(() => {
    const g = window.__gk; g.getState().goto('garage'); const s = g.getState();
    const cars = s.cars.map(() => null);
    cars[0] = window.__gkLib.createCar('bavaria_320d', ['injector'], Math.random); cars[1] = window.__gkLib.createCar('bavaria_340_ms', ['coil'], Math.random);
    g.setState({ cars, money: 50000 }); g.getState().setPanel('shop');
  });
  await p.waitForTimeout(600);
  let shop = await p.locator('.modal').textContent();
  expect(/Einspritzdüse/.test(shop) && /Glühkerze/.test(shop) && /Partikelfilter/.test(shop) && !/Zündkerze/.test(shop), 'Shop für den Diesel: Einspritzdüse, Glühkerze, DPF – keine Zündkerzen');
  await p.screenshot({ path: S + '/s5-shop-diesel.png' });
  await p.locator('.chips button').nth(1).click(); await p.waitForTimeout(300);
  shop = await p.locator('.modal').textContent();
  expect(/Zündkerze/.test(shop) && /V8/.test(shop) && !/Einspritzdüse/.test(shop) && !/Turbolader/.test(shop), 'Shop für den V8-Sauger: Zündteile für V8, kein Turbo, keine Dieselteile');
  await p.getByText('Zündspule').first().locator('xpath=ancestor::div[contains(@class,"shop-row")]').locator('button').click(); await p.waitForTimeout(200);
  const inv = await p.evaluate(() => window.__gk.getState().inventory);
  expect(inv['ignition_coil@V8'] === 1, 'Kauf per Knopf legt die V8-Spule ins Regal – ' + JSON.stringify(inv));
  await p.screenshot({ path: S + '/s5-shop-v8.png' });
  await p.evaluate(() => window.__gk.getState().setPanel('file', 1)); await p.waitForTimeout(400);
  const file = await p.locator('.modal').textContent();
  expect(/8 Zylinder/.test(file) && /420 PS/.test(file) && /V-Motor/.test(file), 'Fahrzeugakte zeigt Motordaten des V8');
  await p.screenshot({ path: S + '/s5-file.png' });
  // Werkstatt mit zwei verschiedenen Autos
  await p.evaluate(() => { window.__gk.getState().setPanel(null); Object.assign(window.__gkPlayer, { x: 4.6, z: 0, yaw: Math.PI / 2, pitch: -0.05, zoom: false, work: null }); });
  await p.waitForTimeout(1500); await p.screenshot({ path: S + '/s5-hall.png' });
  // Probefahrt mit dem V8: Klang und Leistung
  await p.evaluate(() => { const g = window.__gk; const s = g.getState(); const cars = [...s.cars]; const c = window.__gkLib.createCar('veloce_stradale', [], Math.random); c.fluids.oil.level = 8; cars[0] = c; g.setState({ cars }); g.getState().startDrive(0); });
  await p.waitForTimeout(2500);
  const scr = await p.evaluate(() => window.__gk.getState().screen);
  expect(scr === 'track', 'Probefahrt mit dem Supersportwagen startet (' + scr + ')');
  await p.keyboard.down('ArrowUp'); await p.waitForTimeout(6000);
  const v = await p.evaluate(() => window.__gkDrive.sim.v); await p.keyboard.up('ArrowUp');
  const prof = await p.evaluate(() => window.__gkAudio.profile());
  expect(prof && prof.layout === 'V8', 'Auf der Strecke klingt er als V8');
  console.log('  Tempo nach 6 s Vollgas:', (v * 3.6).toFixed(0), 'km/h');
  await p.screenshot({ path: S + '/s5-track.png' });
  console.log('errors:', errs.slice(0, 8)); console.log(fails ? 'FEHLER: ' + fails : 'ALLES OK');
  await b.close();
})();
