// Leistungsmessung (kein Test): je Grafikstufe in der Fahrwelt Zeichenaufrufe, Dreiecke und Bilder/s.
// Die Bildrate im Container (Software-Grafik) ist nur ein Vergleichswert zwischen den Stufen, nicht die des iPads.
//   node e2e/leistung.cjs [land eifel …]   (vite preview auf Port 4173)
const { chromium } = require('playwright');
const WORLDS = process.argv.slice(2).length ? process.argv.slice(2) : ['land', 'eifel'];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const level of ['low', 'medium', 'high']) {
    const p = await b.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true });
    await p.goto(`http://localhost:4173/?gfx=${level}`); await p.waitForTimeout(2500);
    await p.getByText('Neues Spiel').click(); await p.getByText("Los geht's").click(); await p.waitForTimeout(1500);
    for (const w of WORLDS) {
      await p.evaluate((w) => { const g = window.__gk; const s = g.getState(); const cars = [...s.cars]; const c = window.__gkLib.createCar('bavaria_330', [], Math.random, {}); c.fluids.oil.level = 4; cars[0] = c; g.setState({ cars, screen: 'garage', race: null }); if (w === 'land') g.getState().startDrive(0); else g.getState().enterCoopRace(0, 'm', w, Date.now() + 1500); }, w);
      for (let i = 0; i < 40 && !(await p.evaluate(() => !!window.__gkDrive && window.__gk.getState().screen === 'track')); i++) await p.waitForTimeout(250);
      await p.waitForTimeout(4000);
      const r = await p.evaluate(() => new Promise((res) => {
        let n = 0; let calls = 0; let tris = 0; const t0 = performance.now();
        const f = () => { const i = window.__gkGL.info.render; calls = Math.max(calls, i.calls); tris = Math.max(tris, i.triangles); n++; if (performance.now() - t0 < 4000) requestAnimationFrame(f); else res({ fps: Math.round((n / (performance.now() - t0)) * 10000) / 10, calls, tris }); };
        requestAnimationFrame(f);
      }));
      console.log(`${level.padEnd(6)} ${w.padEnd(8)} ${String(r.calls).padStart(4)} Zeichenaufrufe  ${String(Math.round(r.tris / 1000)).padStart(5)}k Dreiecke  ${r.fps} Bilder/s`);
      await p.evaluate(() => window.__gk.setState({ screen: 'garage', race: null })); await p.waitForTimeout(1000);
    }
    await p.close();
  }
  await b.close();
})();
