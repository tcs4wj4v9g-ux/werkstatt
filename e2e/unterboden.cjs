// Unterboden aller Modelle: Endtopf, Kraftstoffpumpe und Hosenrohr werden im Bild angetippt – Schrauben lösen und herausdrehen,
// Stecker ab, Teil heraus. Fängt Teile ab, die im Blech stecken oder von anderen Teilen bzw. Schrauben verdeckt sind.
// Für jedes Modell: in der Unterboden-Ansicht die Teile wirklich im Bild antippen (Schrauben lösen, herausdrehen, Stecker, Teil heraus).
const { chromium } = require('playwright');
const URL = process.env.GK_URL || 'http://localhost:4173/?test';
const only = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1180, height: 820 } });
  p.setDefaultTimeout(30000);
  await p.goto(URL); await p.waitForTimeout(1500);
  await p.getByText('Neues Spiel').click(); await p.getByText("Los geht's").click(); await p.waitForTimeout(600);
  const models = only.length ? only : await p.evaluate(() => Object.keys(window.__gkLib.models));
  const G = (fn, a) => p.evaluate(fn, a);
  // Bildschirmpunkt eines beschrifteten Objekts (Mitte des ersten sichtbaren Netzes)
  const spot = (label, nth = 0) => G(([label, nth]) => {
    const cam = window.__gkCamera; const v = new cam.position.constructor(); const out = [];
    window.__gkScene.traverse((o) => { if (o.userData && o.userData.label === label) { let m = null; o.traverse((x) => { if (!m && x.isMesh) m = x; }); if (m) { m.getWorldPosition(v); const w = v.clone(); v.project(cam); out.push({ x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }); } } });
    const r = out[nth]; return r && r.x > 0 && r.x < innerWidth && r.y > 60 && r.y < innerHeight ? r : null;
  }, [label, nth]);
  const tap = async (pt) => {
    await G(() => window.__gk.setState({ toast: null }));
    await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(140);
  };
  const bad = [];
  for (const model of models) {
    const ids = await G((model) => { const g = window.__gk; const s = g.getState(); const c = window.__gkLib.createCar(model, [], Math.random, {}); c.lifted = true; g.setState({ cars: [c, ...s.cars.slice(1)], liftUp: [true, false], panel: null, tool: 'hand', carried: ['ratchet', 'socket10', 'socket13', 'socket16', 'socket17'] }); Object.assign(window.__gkPlayer, { x: 2.9, z: -2.7, yaw: Math.PI / 2, work: null }); return ['muffler', 'fuel_pump', 'downpipe'].filter((id) => c.components[id]); }, model);
    await p.waitForTimeout(500);
    await p.locator('.car-actions button', { hasText: 'Unterboden' }).click(); await p.waitForTimeout(600);
    for (const id of ids) {
      const info = await G((id) => { const c = window.__gk.getState().cars[0]; const d = window.__gkLib.defOf(c, id); return { name: d.name, n: d.bolts, conn: !!d.connector, drv: d.fastener && d.fastener.driver }; }, id);
      const boltLabel = await G((name) => { let l = null; window.__gkScene.traverse((o) => { if (!l && o.userData && typeof o.userData.label === 'string' && o.userData.label.startsWith('Schraube – ' + name)) l = o.userData.label; }); return l; }, info.name);
      // Blick unter dem Auto auf das Teil richten (wie Wischen im Spiel)
      await G((name) => { const v = new window.__gkCamera.position.constructor(); let w = null; window.__gkScene.traverse((o) => { if (!w && o.userData && o.userData.label === name) { o.traverse((m) => { if (!w && m.isMesh) { m.getWorldPosition(v); w = v.clone(); } }); } }); if (!w) return; const pos = [w.x + 0.9, 1.15, w.z + 0.15]; const dx = w.x - pos[0], dz = w.z - pos[2]; window.__gkPlayer.work = { id: 'under:0', pos, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(w.y - pos[1], Math.hypot(dx, dz)) }; }, info.name);
      // warten, bis die Kamera angekommen ist
      for (let k = 0; k < 40; k++) { const d = await G(() => { const w = window.__gkPlayer.work; const c = window.__gkCamera.position; return w ? Math.hypot(c.x - w.pos[0], c.y - w.pos[1], c.z - w.pos[2]) : 0; }); if (d < 0.003) break; await p.waitForTimeout(150); }
      // Jede Schraube einzeln: Bildpunkt aller Schrauben dieses Teils (Weltposition), Zustand aus dem Spiel
      const bpts = async () => G((name) => { const cam = window.__gkCamera; const v = new cam.position.constructor(); const out = []; window.__gkScene.traverse((o) => { if (o.userData && typeof o.userData.label === 'string' && o.userData.label.startsWith('Schraube – ' + name)) { let m = null; o.traverse((x) => { if (!m && x.isMesh) m = x; }); (m || o).getWorldPosition(v); v.project(cam); out.push({ x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }); } }); return out.filter((r) => r.x > 0 && r.x < innerWidth && r.y > 60 && r.y < innerHeight); }, info.name);
      const pts0 = await bpts();
      for (const tool of ['ratchet', 'hand']) {
        await G((t) => window.__gk.setState({ tool: t }), tool);
        for (const pt of pts0) await tap(pt);
      }
      if (info.conn) { await G(() => window.__gk.setState({ tool: 'hand' })); const lbls = await G((name) => { const s = new Set(); window.__gkScene.traverse((o) => { if (o.userData && typeof o.userData.label === 'string' && o.userData.label.startsWith('Stecker') && o.userData.label.includes(name)) s.add(o.userData.label); }); return [...s]; }, info.name); for (const l of lbls) { const pt = await spot(l); if (pt) await tap(pt); } }
      const st = await G((id) => window.__gk.getState().cars[0].components[id], id);
      await G(() => window.__gk.setState({ tool: 'hand' }));
      const pt = await spot(info.name);
      if (pt) await tap(pt);
      const after = await G((id) => window.__gk.getState().cars[0].components[id], id);
      if (after.installed) bad.push(`${model} ${id}: Schrauben ${JSON.stringify(st.bolts)} Stecker ${st.connected} Teil ${pt ? 'angetippt' : 'nicht im Bild'}`);
    }
    await p.locator('[data-testid=leave]').click(); await p.waitForTimeout(250);
  }
  for (const l of bad) console.log('FAIL: ' + l);
  if (!bad.length) console.log(`ok: alle ${models.length} Modelle: Endtopf, Kraftstoffpumpe und Hosenrohr im Unterboden-Bild ausgebaut (Schrauben, Stecker, Teil)`);
  console.log(bad.length ? `FEHLER: ${bad.length}` : 'ALLES OK');
  await b.close();
})();
