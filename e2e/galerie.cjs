// Bildergalerie in voller Grafik (kein Testmodus): je Karosserieform Ansichten von vorn, seitlich, hinten und in den Motorraum.
// Dient dem Vorher-Nachher-Vergleich; prüft nur, dass keine Seitenfehler auftreten.
//   GK_TAG=vorher node e2e/galerie.cjs [modell …]
const { chromium } = require('playwright');
const S = process.env.GK_OUT || __dirname + '/out'; const URL = (process.env.GK_URL || 'http://localhost:4173/?test').replace('?test', '?gfx=' + (process.env.GK_GFX || 'medium'));
const TAG = process.env.GK_TAG || 'galerie';
const MODELS = process.argv.slice(2).length ? process.argv.slice(2) : ['bavaria_330', 'bavaria_320_kombi', 'tanaka_piccolo', 'bavaria_335_coupe', 'veloce_stradale', 'kaiser_600', 'bavaria_30cs'];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 200)); });
  const EYE = 1.62, BZ = -2.7;
  const look = async (from, to, zoom) => { await p.evaluate(([from, to, EYE, zoom]) => { const pl = window.__gkPlayer; pl.work = null; pl.x = from[0]; pl.z = from[1]; const dx = to[0] - from[0], dz = to[2] - from[1]; pl.yaw = Math.atan2(-dx, -dz); pl.pitch = Math.atan2(to[1] - EYE, Math.hypot(dx, dz)); pl.zoom = !!zoom; }, [from, to, EYE, zoom]); await p.waitForTimeout(1500); };
  const shot = async (name) => { await p.screenshot({ path: `${S}/${TAG}-${name}.png` }); console.log('ok: Bild', name); };
  await p.goto(URL); await p.waitForTimeout(2500);
  await p.getByText('Neues Spiel').click(); await p.getByText("Los geht's").click(); await p.waitForTimeout(1500);
  await p.addStyleTag({ content: '.ui{opacity:0 !important}' });
  const cam = async (pos, tgt = [0, 0.65, 0]) => { await p.evaluate(([pos, tgt]) => { const c = window.__gkCamera; c.position.set(...pos); c.lookAt(...tgt); }, [pos, tgt]); await p.waitForTimeout(700); };
  const VIEWS = (process.env.GK_VIEWS || 'karosserie,motor').split(',');
  for (const model of MODELS) {
    const mk = `(() => { const car = window.__gkLib.createCar('${model}', [], Math.random, { year: 2010 }); for (const z of Object.values(car.zones)) { z.dirt = 0; z.rust = 0; if ('shine' in z) z.shine = 1; } return car; })()`;
    if (VIEWS.includes('karosserie')) {
      // Karosserie rundum auf dem Händlerhof (frei drehbare Kamera)
      await p.evaluate(`(() => { const g = window.__gk; const s = g.getState(); const l = [{ ...s.listings[0], car: ${mk} }]; g.setState({ screen: 'market', marketSource: 'market', listings: l, selected: 0, panel: null }); })()`);
      await p.waitForTimeout(3200);
      await cam([3.9, 1.35, 3.0]); await shot(`${model}-vorn`);
      await cam([0, 0.9, 5.4]); await shot(`${model}-seite`);
      await cam([-4.0, 1.45, 2.8]); await shot(`${model}-heck`);
      await cam([6.3, 1.0, 0.01]); await shot(`${model}-front`);
      await cam([-6.3, 1.1, 0.01]); await shot(`${model}-hinten`);
      await p.evaluate(() => window.__gk.setState({ screen: 'garage' })); await p.waitForTimeout(1500);
    }
    if (!VIEWS.includes('motor')) continue;
    await p.evaluate(`(() => { const g = window.__gk; const s = g.getState(); const cars = s.cars.map(() => null); cars[0] = ${mk}; g.setState({ screen: 'garage', cars, liftUp: [false, false], panel: null, tool: 'hand', engineBay: null, partPrompt: null }); })()`);
    await p.waitForTimeout(2500);
    await look([4.3, BZ + 2.6], [0.2, 0.7, BZ]); await shot(`${model}-halle`);
    await p.evaluate(() => { const b = [...document.querySelectorAll('button')]; });
    await p.evaluate(() => { const uid = window.__gk.getState().cars[0].uid; window.__gkDoors.setState({ [uid + ':1']: true }); });
    await p.waitForTimeout(1500);
    await look([-0.9, BZ + 2.5], [0.25, 0.75, BZ - 0.1]); await shot(`${model}-innen`);
    await look([-0.35, BZ + 1.7], [0.45, 0.8, BZ - 0.2], true); await shot(`${model}-cockpit`);
    await p.evaluate(() => { const uid = window.__gk.getState().cars[0].uid; window.__gkDoors.setState({ [uid + ':1']: false }); });
    await p.evaluate(() => { const g = window.__gk; const s = g.getState(); const cars = s.cars.slice(); cars[0] = { ...cars[0], hoodOpen: true }; g.setState({ cars }); });
    await p.waitForTimeout(1200);
    await look([2.95, BZ + 0.5], [1.4, 0.75, BZ], true); await shot(`${model}-motor`);
    await p.evaluate(() => { const g = window.__gk; const s = g.getState(); const cars = s.cars.slice(); const c = structuredClone(cars[0]); c.components.engine_cover.installed = false; cars[0] = c; g.setState({ cars }); });
    await look([2.95, BZ], [1.3, 0.8, BZ], true); await shot(`${model}-motor-offen`);
  }
  if (VIEWS.includes('halle')) {
    await p.evaluate(`(() => { const g = window.__gk; const s = g.getState(); const cars = s.cars.map(() => null); cars[0] = window.__gkLib.createCar('bavaria_330', [], Math.random, { year: 2010 }); cars[1] = window.__gkLib.createCar('veloce_stradale', [], Math.random, { year: 2015 }); cars[1].lifted = true; g.setState({ screen: 'garage', cars, liftUp: [false, true], panel: null }); })()`);
    await p.waitForTimeout(3000);
    await look([6.0, 4.6], [0, 1.1, -0.5]); await shot('halle-1');
    console.log('Halle mit zwei Autos:', JSON.stringify(await p.evaluate(() => { const i = window.__gkGL.info; return { aufrufe: i.render.calls, dreiecke: i.render.triangles, geometrien: i.memory.geometries, texturen: i.memory.textures }; })));
    await look([-4.2, -4.6], [2.5, 1.2, 1.5]); await shot('halle-2');
    await look([5.4, 0], [0, 1.3, -2.7]); await shot('halle-3');
    await look([3.4, 2.7], [0.5, 1.2, 2.7]); await shot('halle-buehne');
    await look([-3.0, 4.2], [-4.2, 0.9, 5.4]); await shot('halle-ecke');
  }
  console.log(errs.length ? errs.join('\n') : 'keine Seitenfehler');
  await b.close();
})();
