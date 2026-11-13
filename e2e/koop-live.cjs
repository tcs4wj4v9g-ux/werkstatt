// Zwei Spieler im Spiel gegen das ECHTE Supabase-Projekt aus src/net/config.ts (mit Realtime).
// Legt eine Werkstatt "Live-Test (automatisch)" an und schließt am Ende deren Einladung.
// Verbindungsabbruch wird mit dem Offline-Schalter des Browsers nachgestellt.
const { chromium } = require('playwright');
const S = process.env.GK_OUT || __dirname + '/out';
const URL = (process.env.GK_URL || 'http://localhost:4173/?test');
function proxy() {
  const raw = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!raw) return undefined;
  const u = new globalThis.URL(raw);
  return { server: `${u.protocol}//${u.host}`, username: decodeURIComponent(u.username) || undefined, password: decodeURIComponent(u.password) || undefined, bypass: 'localhost,127.0.0.1' };
}
(async () => {
  const b = await chromium.launch({ proxy: proxy(), args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; let fails = 0;
  const expect = (c, msg) => { if (!c) { fails++; console.log('FAIL:', msg); } else console.log('ok:', msg); };
  const open = async (who) => {
    const ctx = await b.newContext({ viewport: { width: 1180, height: 820 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`PAGEERR ${who} ${e.message}`));
    await p.goto(URL); await p.waitForTimeout(1500);
    return { p, ctx };
  };
  const G = (p, fn, arg) => p.evaluate(fn, arg);
  const until = async (p, fn, arg, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await p.evaluate(fn, arg)) return true; await p.waitForTimeout(200); } return false; };
  const comp = (p, id) => G(p, (id) => window.__gk.getState().cars[0] && window.__gk.getState().cars[0].components[id], id);

  const { p: A } = await open('A');
  await A.getByText('Koop-Werkstatt erstellen').click();
  await A.getByTestId('coop-name').fill('Live A');
  await A.getByRole('textbox').nth(1).fill('Live-Test (automatisch)');
  const t0 = Date.now();
  await A.getByText('Erstellen', { exact: true }).click();
  expect(await until(A, () => window.__gkCoop.useCoop.getState().status === 'online'), `Werkstatt im Spiel angelegt (${Date.now() - t0} ms)` + ((await G(A, () => window.__gkCoop.useCoop.getState().error)) || ''));
  const code = await G(A, () => window.__gkCoop.useCoop.getState().code);
  const { p: B, ctx: ctxB } = await open('B');
  await B.getByText('Koop-Werkstatt beitreten').click();
  await B.getByTestId('coop-name').fill('Live B');
  await B.getByTestId('coop-code').fill(code);
  await B.getByText('Beitreten', { exact: true }).click();
  expect(await until(B, () => window.__gkCoop.useCoop.getState().status === 'online'), 'Zweiter Spieler tritt im Spiel bei');
  expect(await until(A, () => window.__gkCoop.useCoop.getState().members.length === 2 && window.__gkCoop.useCoop.getState().members.every((m) => m.online)), 'Beide sehen sich als online');

  // Bewegung über Realtime: Zeit bis zur Ankunft messen
  const me = await G(A, () => window.__gkCoop.useCoop.getState().me);
  // Laufzeit im Spiel messen (unabhängig davon, wie träge das Testwerkzeug selbst reagiert)
  const lat = [];
  for (let i = 0; i < 5; i++) {
    const x = 2 + i * 0.37;
    await G(B, ([id, x]) => { window.__arr = 0; const h = setInterval(() => { const r = window.__gkCoop.remotePlayers.get(id); if (r && Math.abs(r.x - x) < 0.02) { window.__arr = Date.now(); clearInterval(h); } }, 5); }, [me, x]);
    const sent = await G(A, (x) => { Object.assign(window.__gkPlayer, { x, z: 1.13 }); return Date.now(); }, x);
    await until(B, () => window.__arr > 0, null, 8000);
    lat.push((await G(B, () => window.__arr)) - sent);
    await A.waitForTimeout(400);
  }
  lat.sort((a, b) => a - b);
  expect(lat[2] < 1500, `Position kommt beim Partner an – Laufzeit im Spiel ${lat.join(', ')} ms (Mittelwert der Messungen ${lat[2]} ms)`);

  // Auto und gemeinsame Reparatur
  await G(A, () => { const g = window.__gk; const s = g.getState(); const cars = [...s.cars]; cars[0] = window.__gkLib.createCar('bavaria_330', ['coil'], Math.random, { year: 2009 }); cars[0].hoodOpen = true; g.setState({ cars }); });
  const t2 = Date.now();
  expect(await until(B, () => !!window.__gk.getState().cars[0]), `Auto erscheint beim Partner (${Date.now() - t2} ms)`);
  await G(A, () => { window.__gk.getState().setTool('hand'); window.__gk.getState().tapComponent(0, 'engine_cover'); });
  const t3 = Date.now();
  expect(await until(B, () => !window.__gk.getState().cars[0].components.engine_cover.installed), `Motorabdeckung: Ausbau beim Partner sichtbar (${Date.now() - t3} ms)`);

  // Werkzeug
  console.log('Realtime-Kanal A/B:', await G(A, () => window.__gkCoop.state().realtime), await G(B, () => window.__gkCoop.state().realtime));
  await G(A, () => { const t = window.__gkCoop.useCoop.getState().tools.find((t) => t.type === 'ratchet' && t.box === 'kiste_a'); window.__gkCoop.takeTool(t); });
  expect(await until(A, () => window.__gk.getState().carried.includes('ratchet')), 'Spieler A nimmt Ratsche A');
  expect(await until(B, () => !window.__gkCoop.useCoop.getState().tools.some((t) => t.type === 'ratchet' && t.box === 'kiste_a')), 'Bei Spieler B fehlt Ratsche A in der Kiste');

  // Verbindungsabbruch: B geht offline, arbeitet weiter, kommt zurück
  await ctxB.setOffline(true);
  await G(B, () => { window.__gk.getState().setTool('hand'); window.__gk.getState().tapConnector(0, 'coil2'); });
  expect(await until(B, () => window.__gkCoop.useCoop.getState().status === 'offline', null, 20000), 'Spieler B: Anzeige „Offline“ bei Verbindungsverlust');
  await G(A, () => { window.__gk.getState().setTool('hand'); window.__gk.getState().tapHood(0); });
  await A.waitForTimeout(1500);
  await ctxB.setOffline(false);
  expect(await until(B, () => window.__gkCoop.useCoop.getState().status === 'online', null, 25000), 'Spieler B verbindet sich von selbst wieder');
  expect(await until(A, () => window.__gk.getState().cars[0].components.coil2.connected === false, null, 10000), 'Offline gemachter Schritt von B kommt bei A an');
  expect(await until(B, () => window.__gk.getState().cars[0].hoodOpen === false, null, 10000), 'Änderung von A während der Unterbrechung kommt bei B an');

  // Wiederbeitritt nach Neuladen
  await B.reload(); await B.waitForTimeout(1500);
  await B.getByText('Bestehende Koop-Werkstatt öffnen').click();
  expect(await until(B, () => window.__gkCoop.useCoop.getState().status === 'online' && !!window.__gk.getState().cars[0] && !window.__gk.getState().cars[0].components.engine_cover.installed), 'Nach Neuladen: Werkstatt mit Reparaturstand wieder offen (ohne Code)');
  await B.waitForTimeout(1500);
  await B.screenshot({ path: `${S}/koop-live.png` });

  await G(A, (t) => window.__gkCoop.returnTool(t, 'kiste_a'), await G(A, () => window.__gkCoop.useCoop.getState().tools.find((t) => t.type === 'ratchet' && t.home === 'kiste_a')));
  await A.getByTestId('coop-chip').click(); await A.waitForTimeout(600);
  await A.getByText('Einladung schließen').click(); await A.waitForTimeout(800);
  console.log('errors:', JSON.stringify(errs));
  console.log(fails || errs.length ? `FEHLER: ${fails + errs.length}` : 'ALLES OK');
  await b.close();
})().catch((e) => { console.log('Error:', e.message); process.exit(1); });
