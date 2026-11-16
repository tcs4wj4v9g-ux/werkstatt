// Gesamtcheck Erreichbarkeit: Für jedes Modell und jedes Bauteil (Motorraum und Unterboden) wird alles davor abgebaut und dann
// geprüft, ob Schrauben, Stecker und das Teil selbst von einem festen Standpunkt der Arbeitsansichten aus antippbar sind.
// „Antippbar“ heißt wie im Spiel: Der erste Treffer mit Tipp-Reaktion entlang des Strahls gehört zum Teil, Abstand höchstens 4,2 m.
// Aufruf: node e2e/erreichbar.cjs [Modell …]   (ohne Angabe: alle Modelle)
const { chromium } = require('playwright');
const URL = process.env.GK_URL || 'http://localhost:4173/?test';
const only = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1180, height: 820 } });
  p.setDefaultTimeout(60000);
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  await p.goto(URL); await p.waitForTimeout(1500);
  await p.getByText('Neues Spiel').click(); await p.getByText("Los geht's").click(); await p.waitForTimeout(600);
  const G = (fn, a) => p.evaluate(fn, a);
  const models = only.length ? only : await G(() => Object.keys(window.__gkLib.models));
  // Hilfsfunktionen im Spiel
  await G(() => {
    const g = window.__gk; const L = window.__gkLib;
    const kit = ['ratchet', 'socket10', 'socket13', 'socket16', 'socket17', 'wrench', 'screwdriver'];
    const use = (t) => g.setState({ tool: t, carried: kit });
    const cc = () => g.getState().cars[0];
    const setLift = (up) => { if (!!cc().lifted !== up) g.getState().tapLift(0); };
    const setHood = (open) => { if (!!cc().hoodOpen !== open) { if (cc().lifted) setLift(false); use('hand'); g.getState().tapHood(0); } };
    const prep = (d) => { if (d.access === 'lifted') setLift(true); else { setLift(false); setHood(true); } };
    // Bauteil samt allem davor ausbauen (über die Spielaktionen)
    const strip = (id) => {
      const c = cc(); const d = L.defOf(c, id); const s0 = c.components[id];
      if (!s0 || !s0.installed) return;
      for (const x of L.blockersOf(cc(), id)) strip(x);
      prep(d);
      cc().components[id].bolts.forEach((b, i) => { if (b === 2) { use(d.fastener.driver); g.getState().tapBolt(0, id, i); } use('hand'); g.getState().tapBolt(0, id, i); });
      if (d.connector && cc().components[id].connected) { use('hand'); g.getState().tapConnector(0, id); }
      use(d.removeWith ? d.removeWith.driver : 'hand'); g.getState().tapComponent(0, id);
    };
    // Nur die Schrauben und den Stecker eines Teils lösen (Teil bleibt drin)
    const loosen = (id) => {
      const d = L.defOf(cc(), id); prep(d);
      cc().components[id].bolts.forEach((b, i) => { if (b === 2) { use(d.fastener.driver); g.getState().tapBolt(0, id, i); } use('hand'); g.getState().tapBolt(0, id, i); });
      if (d.connector && cc().components[id].connected) { use('hand'); g.getState().tapConnector(0, id); }
    };
    // Standpunkte: die festen Arbeitsansichten wie im Spiel (Motor bzw. Unterboden und Räder)
    const views = (lifted) => {
      const c = cc(); const body = L.models[c.modelId].body; const spec = L.BODY_SPECS[body]; const rear = L.REAR_ENGINE.has(body);
      const list = lifted ? ['wheel_left', 'wheel_right', 'rear_left', 'rear_right', 'under'] : ['engine', 'engine_left', 'engine_right'];
      return list.map((v) => ({ v, pos: L.workPose(v, 0, spec.rearAxle, spec.hoodHinge === 'front' && !rear, rear ? spec.bayX ?? L.REAR_BAY.x : undefined).pos }));
    };
    // Erster Treffer mit Tipp-Reaktion entlang eines Strahls; Ergebnis: Beschriftung des Objekts, das den Tipp bekommt
    // Platzhalter („… einbauen“) lassen Teilen darunter den Vortritt (wie ghostTap im Spiel)
    const ghostOf = (label) => { if (!label || !label.endsWith(' einbauen')) return null; const name = label.slice(0, -' einbauen'.length).replace(/ – .*$/, ''); const d = L.defsOf(cc()).find((x) => x.name === name); return d ? d.id : null; };
    let target = null;
    // Wie im Spiel: nur Objekte mit Tipp-Reaktion (und deren Kinder) werden getroffen – wird je Prüfung einmal gesammelt
    let roots = null;
    const handledRoots = () => { if (roots) return roots; roots = []; const walk = (o) => { if (o.__r3f && o.__r3f.handlers && o.__r3f.handlers.onClick) { roots.push(o); return; } o.children.forEach(walk); }; walk(window.__gkScene); return roots; };
    const winner = (from, to) => {
      const R = window.__gkRay; const V = window.__gkCamera.position.constructor;
      const o = new V(...from); const dir = new V(to.x - o.x, to.y - o.y, to.z - o.z); const dist = dir.length(); dir.normalize();
      R.set(o, dir); R.far = dist + 0.05;
      for (const h of R.intersectObjects(handledRoots(), true)) {
        let x = h.object; let handled = false; let label = null;
        while (x) { if (!label && x.userData && x.userData.label) label = x.userData.label; if (x.__r3f && x.__r3f.handlers && x.__r3f.handlers.onClick) handled = true; x = x.parent; }
        if (handled) { const gid = ghostOf(label); if (gid && target && L.beneath(cc(), gid).includes(target)) continue; return { label, d: h.distance }; }
      }
      return null;
    };
    // Zielpunkte: Mitte jedes Netzes und Punkte zwischen Mitte und Ecken des Hüllquaders (man tippt im Spiel auf sichtbare Kanten)
    const centers = (o, many = false) => { const out = []; const V = window.__gkCamera.position.constructor; o.traverse((m) => { if (m.isMesh && m.geometry && !(m.material && m.material.visible === false)) { m.geometry.computeBoundingBox(); const bb = m.geometry.boundingBox; const c = new V(); bb.getCenter(c); out.push(m.localToWorld(c.clone())); if (many) for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) { const q = new V(sx > 0 ? bb.max.x : bb.min.x, sy > 0 ? bb.max.y : bb.min.y, sz > 0 ? bb.max.z : bb.min.z); q.lerp(c, 0.3); out.push(m.localToWorld(q)); } } }); return out; };
    const find = (pred) => { const out = []; window.__gkScene.traverse((o) => { if (o.userData && typeof o.userData.label === 'string' && pred(o.userData.label)) out.push(o); }); return out; };
    // Ist ein Ziel (Liste von Weltpunkten) von irgendeinem Standpunkt aus antippbar?
    const reach = (pts, ok, lifted) => {
      for (const { pos } of views(lifted)) for (const t of pts) { const w = winner(pos, t); if (w && w.d <= 4.2 && ok(w.label)) return true; }
      return false;
    };
    window.__audit = { strip, loosen, prep, views, reach, find, centers, cc, use, setTarget: (t) => { target = t; roots = null; } };
  });

  const bad = [];
  let checked = 0;
  for (const model of models) {
    const ids = await G((model) => { const L = window.__gkLib; const c = L.createCar(model, [], Math.random, {}); return L.defsOf(c).filter((d) => d.access !== 'stand').map((d) => d.id); }, model);
    for (const id of ids) {
      // frisches Auto, alles davor abbauen
      await G(([model, id]) => {
        const g = window.__gk; const L = window.__gkLib; const s = g.getState(); const c = L.createCar(model, [], Math.random, {}); c.fluids.oil.level = 0;
        g.setState({ cars: [c, ...s.cars.slice(1)], liftUp: [false, false], drainPan: s.drainPan.map(() => true), panel: null, upgrades: [...new Set([...s.upgrades, 'hoist'])], tool: 'hand' });
        Object.assign(window.__gkPlayer, { x: -3.5, z: 0, yaw: 0, pitch: 0, work: null });
        const A = window.__audit; for (const x of L.blockersOf(A.cc(), id)) A.strip(x); A.prep(L.defOf(A.cc(), id));
      }, [model, id]);
      await p.waitForTimeout(150);
      const res = await G((id) => {
        const A = window.__audit; const L = window.__gkLib; const c = A.cc(); const d = L.defOf(c, id); const lifted = !!c.lifted; const st = c.components[id]; A.setTarget(id);
        const out = [];
        if (!st.installed) return ['nicht eingebaut'];
        // Schrauben einzeln
        const bolts = A.find((l) => l.startsWith('Schraube – ' + d.name + ' ('));
        bolts.forEach((o, i) => { if (!A.reach(A.centers(o, true), (l) => !!l && l.startsWith('Schraube – ' + d.name + ' ('), lifted)) out.push(`Schraube ${i + 1}/${bolts.length}`); });
        if (d.bolts && bolts.length < d.bolts) out.push(`nur ${bolts.length} von ${d.bolts} Schrauben im Modell`);
        if (d.connector) { const cn = A.find((l) => l.startsWith('Stecker ' + d.name + ' (')); if (!cn.length || !A.reach(A.centers(cn[0], true), (l) => !!l && l.startsWith('Stecker ' + d.name), lifted)) out.push('Stecker'); }
        return out;
      }, id);
      // Teil selbst: Schrauben und Stecker lösen, dann prüfen
      await G((id) => window.__audit.loosen(id), id);
      await p.waitForTimeout(150);
      const part = await G((id) => {
        const A = window.__audit; const L = window.__gkLib; const c = A.cc(); const d = L.defOf(c, id); A.setTarget(id);
        const own = (l) => !!l && (l === d.name || l.startsWith(d.name + ' – '));
        const objs = A.find(own);
        if (!objs.length) return 'Teil nicht im Modell';
        const pts = objs.flatMap((o) => A.centers(o, true));
        return A.reach(pts, own, !!c.lifted) ? null : 'Teil';
      }, id);
      if (part) res.push(part);
      checked++;
      if (res.length && res[0] !== 'nicht eingebaut') bad.push(`${model} · ${id}: ${res.join(', ')}`);
    }
    console.log(`  ${model}: geprüft`);
  }
  for (const l of bad) console.log('FAIL: ' + l);
  if (!bad.length) console.log(`ok: ${checked} Bauteile in ${models.length} Modellen von den Arbeitsansichten aus erreichbar (Schrauben, Stecker, Teil)`);
  console.log('errors:', JSON.stringify(errs.slice(0, 5)));
  console.log(bad.length || errs.length ? `FEHLER: ${bad.length + errs.length}` : 'ALLES OK');
  await b.close();
})().catch((e) => { console.log('Error:', e.message); process.exit(1); });
