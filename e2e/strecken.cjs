// Bilder der Fahrwelten in voller Grafik (kein Test): Land und alle Rundkurse, je Verfolger-Ansicht an mehreren Stellen.
//   GK_TAG=vorher node e2e/strecken.cjs [land eifel motodrom hafen ardennen]
//   GK_DAY=35 …  → Wetter dieses Spieltags (Jahreszeit, Regen, Schnee, Nebel)
const { chromium } = require('playwright');
const S = process.env.GK_OUT || __dirname + '/out'; const URL = (process.env.GK_URL || 'http://localhost:4173/?test').replace('?test', '?gfx=' + (process.env.GK_GFX || 'medium'));
const TAG = process.env.GK_TAG || 'strecke';
const WORLDS = process.argv.slice(2).length ? process.argv.slice(2) : ['land', 'eifel', 'motodrom', 'hafen', 'ardennen'];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 200)); });
  await p.goto(URL); await p.waitForTimeout(2500);
  await p.getByText('Neues Spiel').click(); await p.getByText("Los geht's").click(); await p.waitForTimeout(1500);
  const model = process.env.GK_CAR || 'bavaria_335_coupe';
  for (const w of WORLDS) {
    await p.evaluate(([w, model, day]) => {
      const g = window.__gk; const L = window.__gkLib; const s = g.getState(); const cars = [...s.cars];
      const c = L.createCar(model, [], Math.random, { year: 2010 }); for (const z of Object.values(c.zones)) { z.dirt = 0; z.rust = 0; if ('shine' in z) z.shine = 1; }
      c.fluids.oil.level = 4; cars[0] = c; g.setState({ cars, screen: 'garage', race: null, ...(day ? { day } : {}) });
      const st = g.getState();
      if (w === 'land') st.startDrive(0);
      else { st.enterCoopRace(0, 'bild', w, Date.now() + 2000); }
    }, [w, model, Number(process.env.GK_DAY || 0)]);
    await p.waitForTimeout(4500);
    await p.addStyleTag({ content: '.ui{opacity:0 !important}' }).catch(() => {});
    await p.screenshot({ path: `${S}/${TAG}-${w}-start.png` }); console.log('ok: Bild', w, 'start');
    await p.evaluate(() => { const d = window.__gkDrive; d.sim.autopilot = 22; d.sim.timeScale = 2; });
    for (const k of [1, 2, 3]) { await p.waitForTimeout(5000); await p.screenshot({ path: `${S}/${TAG}-${w}-${k}.png` }); console.log('ok: Bild', w, k); }
    await p.evaluate(() => window.__gk.setState({ screen: 'garage', race: null })); await p.waitForTimeout(1500);
  }
  console.log(errs.length ? errs.join('\n') : 'keine Seitenfehler');
  await b.close();
})();
