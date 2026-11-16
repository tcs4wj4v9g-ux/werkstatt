// Gesamtcheck Motorständer: Für jede Motorbauart wird jedes Bauteil des ausgebauten Motors freigelegt (alles davor ab, Motor passend
// gedreht) und geprüft, ob Schrauben und Teil von Standpunkten rund um den Ständer (Augenhöhe, Reichweite 4,2 m) antippbar sind.
// „Antippbar“ heißt wie im Spiel: Der erste Treffer mit Tipp-Reaktion entlang des Strahls gehört zum Teil, Abstand höchstens 4,2 m.
// Aufruf: node e2e/staender.cjs [Modell …]   (ohne Angabe: je Motor ein Modell)
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
  const models = only.length ? only : await G(() => { const seen = new Set(); return Object.values(window.__gkLib.models).filter((m) => !seen.has(m.engineId) && seen.add(m.engineId)).map((m) => m.id); });
  // Hilfsfunktionen im Spiel
  await G(() => {
    const g = window.__gk; const L = window.__gkLib;
    const kit = ['ratchet', 'socket10', 'socket13', 'socket16', 'socket17', 'wrench', 'screwdriver'];
    const use = (t) => g.setState({ tool: t, carried: kit });
    const cc = () => g.getState().cars[15];
    // Am Ständer heißt „angehoben“: Motor gedreht (Unterseite oben)
    const prep = (d) => { const under = !!(d.access === 'lifted' || d.under); if (!!cc().lifted !== under) g.getState().flipEngine(); };
    // Bauteil samt allem davor ausbauen (über die Spielaktionen)
    const strip = (id) => {
      const c = cc(); const d = L.defOf(c, id); const s0 = c.components[id];
      if (!s0 || !s0.installed) return;
      for (const x of L.blockersOf(cc(), id)) strip(x);
      prep(d);
      cc().components[id].bolts.forEach((b, i) => { if (b === 2) { use(d.fastener.driver); g.getState().tapBolt(15, id, i); } use('hand'); g.getState().tapBolt(15, id, i); });
      if (d.connector && cc().components[id].connected) { use('hand'); g.getState().tapConnector(15, id); }
      use(d.removeWith ? d.removeWith.driver : 'hand'); g.getState().tapComponent(15, id);
    };
    // Nur die Schrauben und den Stecker eines Teils lösen (Teil bleibt drin)
    const loosen = (id) => {
      const d = L.defOf(cc(), id); prep(d);
      cc().components[id].bolts.forEach((b, i) => { if (b === 2) { use(d.fastener.driver); g.getState().tapBolt(15, id, i); } use('hand'); g.getState().tapBolt(15, id, i); });
      if (d.connector && cc().components[id].connected) { use('hand'); g.getState().tapConnector(15, id); }
    };
    // Standpunkte: die festen Arbeitsansichten wie im Spiel (Motor bzw. Unterboden und Räder)
    // Standpunkte rund um den Ständer (x 3,1, z −0,55) in Augenhöhe
    const views = () => [[4.3, -0.55], [3.9, 0.45], [3.9, -1.55], [2.3, 0.45], [2.3, -1.55], [3.1, 0.7], [3.1, -1.8]].map(([x, z]) => ({ v: `${x}/${z}`, pos: [x, 1.62, z] }));
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
        if (handled && !label) { const w = h.point; label = `? bei ${w.x.toFixed(1)}/${w.y.toFixed(1)}/${w.z.toFixed(1)}`; }
        if (handled) { const gid = ghostOf(label); if (gid && target && L.beneath(cc(), gid).includes(target)) continue; return { label, d: h.distance }; }
      }
      return null;
    };
    // Zielpunkte: Mitte jedes Netzes, Punkte zwischen Mitte und Ecken des Hüllquaders (man tippt im Spiel auf sichtbare Kanten)
    // und Eckpunkte der Oberfläche (zusammengefügte Netze wie die Lagerdeckel haben in der Quadermitte nichts)
    const centers = (o, many = false) => { const out = []; const V = window.__gkCamera.position.constructor; o.traverse((m) => { if (m.isMesh && m.geometry && !(m.material && m.material.visible === false)) { m.geometry.computeBoundingBox(); const bb = m.geometry.boundingBox; const c = new V(); bb.getCenter(c); out.push(m.localToWorld(c.clone())); if (many) for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) { const q = new V(sx > 0 ? bb.max.x : bb.min.x, sy > 0 ? bb.max.y : bb.min.y, sz > 0 ? bb.max.z : bb.min.z); q.lerp(c, 0.3); out.push(m.localToWorld(q)); } if (many) { const pa = m.geometry.attributes.position; const step = Math.max(1, Math.floor(pa.count / 16)); for (let i = 0; i < pa.count; i += step) out.push(m.localToWorld(new V(pa.getX(i), pa.getY(i), pa.getZ(i)))); } } }); return out; };
    const find = (pred) => { const out = []; window.__gkScene.traverse((o) => { if (o.userData && typeof o.userData.label === 'string' && pred(o.userData.label)) out.push(o); }); return out; };
    // Ist ein Ziel (Liste von Weltpunkten) von irgendeinem Standpunkt aus antippbar?
    // Bei Misserfolg merkt sich why, was am häufigsten im Weg war (für die Ausgabe)
    let why = '';
    const reach = (pts, ok, lifted) => {
      const seen = {};
      for (const { pos } of views(lifted)) for (const t of pts) { const w = winner(pos, t); if (w && w.d <= 4.2 && ok(w.label)) return true; const k = w ? (w.d > 4.2 ? 'zu weit' : w.label || '?') : 'nichts'; seen[k] = (seen[k] || 0) + 1; }
      why = Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} ×${n}`).join(' | ');
      return false;
    };
    window.__audit = { why: () => why, strip, loosen, prep, views, reach, find, centers, cc, use, setTarget: (t) => { target = t; roots = null; } };
  });

  const bad = [];
  let checked = 0;
  for (const model of models) {
    const ids = await G((model) => { const L = window.__gkLib; const st = L.motor.asStand(L.motor.extractEngine(L.createCar(model, [], Math.random, {})), model); return L.defsOf(st).map((d) => d.id); }, model);
    // GK_IDS=a,b prüft nur diese Bauteile (zur Fehlersuche)
    const pick = process.env.GK_IDS ? process.env.GK_IDS.split(',') : null;
    for (const id of ids) {
      if (pick && !pick.includes(id)) continue;
      // frisches Auto, alles davor abbauen
      await G(([model, id]) => {
        const g = window.__gk; const L = window.__gkLib; const s = g.getState(); const st = L.motor.asStand(L.motor.extractEngine(L.createCar(model, [], Math.random, {})), model); st.fluids.oil.level = 0;
        const cars = [...s.cars]; cars[15] = st; cars[0] = null; g.setState({ cars, panel: null, upgrades: [...new Set([...s.upgrades, 'hoist'])], tool: 'hand' });
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
        bolts.forEach((o, i) => { if (!A.reach(A.centers(o, true), (l) => !!l && l.startsWith('Schraube – ' + d.name + ' ('), lifted)) out.push(`Schraube ${i + 1}/${bolts.length} [${A.why()}]`); });
        if (d.bolts && bolts.length < d.bolts) out.push(`nur ${bolts.length} von ${d.bolts} Schrauben im Modell`);
        if (d.connector) { const cn = A.find((l) => l.startsWith('Stecker ' + d.name + ' (')); if (!cn.length || !A.reach(A.centers(cn[0], true), (l) => !!l && l.startsWith('Stecker ' + d.name), lifted)) out.push(`Stecker [${A.why()}]`); }
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
        return A.reach(pts, own, !!c.lifted) ? null : `Teil [${A.why()}]`;
      }, id);
      if (part) res.push(part);
      checked++;
      if (res.length && res[0] !== 'nicht eingebaut') bad.push(`${model} · ${id}: ${res.join(', ')}`);
    }
    console.log(`  ${model}: geprüft`);
  }
  for (const l of bad) console.log('FAIL: ' + l);
  if (!bad.length) console.log(`ok: ${checked} Motorteile in ${models.length} Motorbauarten am Ständer erreichbar (Schrauben, Stecker, Teil)`);
  console.log('errors:', JSON.stringify(errs.slice(0, 5)));
  console.log(bad.length || errs.length ? `FEHLER: ${bad.length + errs.length}` : 'ALLES OK');
  await b.close();
})().catch((e) => { console.log('Error:', e.message); process.exit(1); });
