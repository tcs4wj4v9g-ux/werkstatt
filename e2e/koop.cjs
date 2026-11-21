// Koop mit zwei Spielern (zwei getrennte Browser-Profile) gegen das echte SQL-Schema – die acht Pflichtszenarien.
// Voraussetzung: lokale Datenbank und Server-Nachbau laufen (e2e/run.sh startet beides für diesen Durchlauf).
const { chromium } = require('playwright');
const S = process.env.GK_OUT || __dirname + '/out';
const COOP = process.env.GK_COOP_URL || 'http://localhost:4199';
const BASE = process.env.GK_URL || 'http://localhost:4173/?test';
const URL = `${BASE}${BASE.includes('?') ? '&' : '?'}koop=${COOP}|test`;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = []; let fails = 0;
  const expect = (c, msg) => { if (!c) { fails++; console.log('FAIL:', msg); } else console.log('ok:', msg); };
  const open = async (who) => {
    const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`PAGEERR ${who} ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errs.push(`CONSOLE ${who} ${m.text().slice(0, 200)}`); });
    await p.goto(URL); await p.waitForTimeout(1500);
    return p;
  };
  const G = (p, fn, arg) => p.evaluate(fn, arg);
  const coop = (p) => G(p, () => { const c = window.__gkCoop.useCoop.getState(); return { status: c.status, me: c.me, code: c.code, ws: c.ws, members: c.members.map((m) => ({ id: m.id, name: m.name, online: m.online })), tools: c.tools, error: c.error }; });
  const game = (p) => G(p, () => { const s = window.__gk.getState(); return { money: s.money, screen: s.screen, cars: s.cars, carried: s.carried, tool: s.tool, inventory: s.inventory, day: s.day, started: s.started, toast: s.toast && s.toast.text, listings: s.listings.length }; });
  /** Wartet, bis die Bedingung im Fenster erfüllt ist (der Abgleich braucht bis zu etwa einer Sekunde). */
  const until = async (p, fn, arg, ms = 12000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await p.evaluate(fn, arg)) return true; await p.waitForTimeout(150); } return false; };
  const settled = (p) => until(p, () => { const s = window.__gkCoop.state(); return !s.dirty && !s.inflight && !s.busy; });
  const both = async (...ps) => { for (const p of ps) await settled(p); await ps[0].waitForTimeout(1300); for (const p of ps) await settled(p); };
  const comp = (p, id) => G(p, (id) => window.__gk.getState().cars[0] && window.__gk.getState().cars[0].components[id], id);
  const save = (p) => G(p, () => localStorage.getItem('garage-kings-save-v1'));
  /** Vergleich ohne Rücksicht auf die Reihenfolge der Schlüssel (die Datenbank sortiert sie um). */
  const norm = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().filter((y) => x[y] !== null).map((y) => [y, x[y]])) : x));
  const reject = (p) => G(p, () => JSON.stringify(window.__gkCoop.state().lastReject));
  /** Felder des Einzelspielstands, die sich gegenüber dem Stand vor dem Koop geändert haben (Auktionen laufen in Echtzeit weiter, die Arbeitszeit zählt im Menü nach – beide zählen nicht). */
  let saveBefore = null;
  const unchanged = (now) => { const s1 = JSON.parse(saveBefore).state, s2 = JSON.parse(now).state; return Object.keys(s1).filter((k) => k !== 'auctions' && k !== 'playTime' && norm(s1[k]) !== norm(s2[k])); };
  const sees = (p, name, car) => until(p, ([name, car]) => { const m = window.__gkCoop.useCoop.getState().members.find((x) => x.name === name); return m && (m.presence.car || null) === car; }, [name, car]);
  const p2shot = async (pl, name) => { await G(pl, () => Object.assign(window.__gkPlayer, { x: 4.6, z: -0.6, yaw: Math.atan2(4.6, -2.1), pitch: -0.12, zoom: false, work: null })); await pl.waitForTimeout(1200); await pl.screenshot({ path: `${S}/${name}.png` }); };
  const toolOf = (c, type, box) => c.tools.find((t) => t.type === type && t.box === box);

  // ---------- Vorbereitung: Spieler 1 hat einen Einzelspielstand ----------
  const A = await open('A');
  await A.getByText('Neues Spiel').click(); await A.getByText("Los geht's").click(); await A.waitForTimeout(600);
  await G(A, () => window.__gk.setState({ money: 12345 })); await A.waitForTimeout(400);
  await G(A, () => window.__gk.getState().goto('menu')); await A.waitForTimeout(400);
  saveBefore = await save(A);
  expect(JSON.parse(saveBefore).state.money === 12345, 'Einzelspieler: Spielstand mit 12.345 € liegt im Gerätespeicher');
  expect(await A.getByText('Einzelspieler fortsetzen').isVisible(), 'Menü: „Einzelspieler fortsetzen“ vorhanden');
  expect(await A.getByText('Koop-Werkstatt erstellen').isVisible() && await A.getByText('Koop-Werkstatt beitreten').isVisible() && await A.getByText('Bestehende Koop-Werkstatt öffnen').isVisible(), 'Menü: Koop erstellen, beitreten, öffnen');
  await A.screenshot({ path: `${S}/koop-menue.png` });

  // ---------- Test 1: Unabhängiger Zugang ----------
  await A.getByText('Koop-Werkstatt erstellen').click();
  await A.getByTestId('coop-name').fill('Anna');
  await A.getByText('Erstellen', { exact: true }).click();
  expect(await until(A, () => window.__gkCoop.useCoop.getState().status === 'online' && window.__gk.getState().screen === 'garage'), 'Spieler 1 erstellt die Werkstatt und steht in der Halle');
  let ca = await coop(A);
  expect(/^[A-Z2-9]{6}$/.test(ca.code), 'Einladungscode erzeugt: ' + ca.code);
  expect((await game(A)).money !== 12345 && unchanged(await save(A)).length === 0, 'Koop startet mit eigenem Spielstand; der Einzelspielstand im Gerätespeicher ist unverändert');

  const B = await open('B');
  await B.getByText('Koop-Werkstatt beitreten').click();
  await B.getByTestId('coop-name').fill('Ben');
  await B.getByTestId('coop-code').fill('XXXXXX');
  await B.getByText('Beitreten', { exact: true }).click();
  expect(await until(B, () => !!window.__gkCoop.useCoop.getState().error), 'Falscher Code wird abgelehnt: ' + (await coop(B)).error);
  await B.getByTestId('coop-code').fill(ca.code.toLowerCase());
  await B.getByText('Beitreten', { exact: true }).click();
  expect(await until(B, () => window.__gkCoop.useCoop.getState().status === 'online' && window.__gk.getState().screen === 'garage'), 'Spieler 2 tritt mit dem Code bei');
  await both(A, B);
  ca = await coop(A); let cb = await coop(B);
  expect(ca.members.length === 2 && cb.members.length === 2 && ca.me !== cb.me && cb.members.every((m) => m.online), 'Beide sehen zwei Mitglieder, beide online: ' + cb.members.map((m) => m.name).join(' & '));
  expect((await game(A)).money === (await game(B)).money && (await game(A)).listings === (await game(B)).listings, 'Gleicher Kontostand und gleicher Markt bei beiden');
  const sb = JSON.parse(await save(B)).state;
  expect(!sb.started && !sb.cars.some(Boolean), 'Spieler 2: Der Koop schreibt nichts in seinen (leeren) Einzelspielstand');

  // Spieler 1 verlässt das Spiel, Spieler 2 spielt allein weiter
  await G(A, () => window.__gkCoop.leave()); await A.waitForTimeout(500);
  expect((await coop(A)).status === 'off' && (await game(A)).money === 12345 && (await game(A)).screen === 'menu', 'Spieler 1 verlässt den Koop und hat seinen Einzelspielstand (12.345 €) wieder');
  await G(B, () => { const g = window.__gk; const s = g.getState(); const car = window.__gkLib.createCar('bavaria_318', ['coil'], Math.random, { year: 2008 }); car.hoodOpen = true; car.purchasePrice = 3000; const cars = [...s.cars]; cars[0] = car; g.setState({ cars, money: 20000 }); });
  await settled(B);
  expect(await until(B, () => !window.__gkCoop.useCoop.getState().members.find((m) => m.name === 'Anna').online, null, 25000), 'Spieler 2 sieht Spieler 1 als offline und arbeitet allein weiter');
  // Spieler 1 kommt zurück (über „Bestehende Koop-Werkstatt öffnen“) und findet den Stand von Spieler 2 vor
  await A.getByText('Bestehende Koop-Werkstatt öffnen').click();
  expect(await until(A, () => window.__gkCoop.useCoop.getState().status === 'online' && !!window.__gk.getState().cars[0]), 'Spieler 1 öffnet die Werkstatt wieder und sieht das Auto, das Spieler 2 inzwischen auf Bühne 1 gestellt hat');
  expect((await game(A)).money === 20000 && (await game(A)).cars[0].uid === (await game(B)).cars[0].uid, 'Fahrzeug-ID und Kontostand stimmen überein');

  // ---------- Bewegung und Figuren ----------
  await G(A, () => Object.assign(window.__gkPlayer, { x: 3.2, z: 1.1, yaw: 1.0 }));
  expect(await until(B, (id) => { const r = window.__gkCoop.remotePlayers.get(id); return r && Math.abs(r.x - 3.2) < 0.05 && Math.abs(r.z - 1.1) < 0.05 && r.name === 'Anna'; }, ca.me), 'Spieler 2 sieht Position und Namen von Spieler 1');
  await G(B, () => Object.assign(window.__gkPlayer, { x: 5.2, z: 3.4, yaw: 1.9, pitch: -0.1, zoom: false, work: null })); await B.waitForTimeout(1800);
  await B.screenshot({ path: `${S}/koop-figur.png` });

  // ---------- Chat: Nachricht als Einblendung, Zähler und Sprechblase über der Figur (mind. 5 s) ----------
  await A.getByTestId('chat').click();
  await A.getByTestId('chat-input').fill('Hallo Ben, schau dir mal den Motor an!');
  await A.getByTestId('chat-send').click();
  expect(await until(A, () => window.__gkCoop.useChat.getState().log.some((m) => m.mine && m.text.startsWith('Hallo Ben'))), 'Chat: eigene Nachricht im Verlauf');
  expect(await until(B, () => { const f = document.querySelector('[data-testid=chat-feed]'); return !!f && f.textContent.includes('Hallo Ben'); }), 'Chat: Spieler 2 sieht die Nachricht eingeblendet');
  const bub = await G(B, (id) => { const c = window.__gkCoop.useChat.getState(); const b = c.bubbles[id]; return { text: b && b.text, left: b ? b.until - performance.now() : 0, unread: c.unread, badge: (document.querySelector('[data-testid=chat] .badge') || {}).textContent }; }, ca.me);
  expect(bub.text && bub.text.startsWith('Hallo Ben') && bub.left > 3500 && bub.unread === 1 && bub.badge === '1', 'Chat: Sprechblase über Spieler 1 (mindestens 5 s) und ein ungelesener Hinweis am Knopf: ' + JSON.stringify(bub));
  await G(B, () => Object.assign(window.__gkPlayer, { x: 6.2, z: 2.6, yaw: Math.atan2(6.2 - 3.2, 2.6 - 1.1), pitch: -0.05, zoom: false, work: null })); await B.waitForTimeout(1500);
  await B.screenshot({ path: `${S}/koop-chat.png` });
  await B.getByTestId('chat').click();
  expect(await until(B, () => window.__gkCoop.useChat.getState().unread === 0 && !!document.querySelector('[data-testid=chat-panel]')), 'Chat: Öffnen setzt den Zähler zurück, Verlauf sichtbar');
  await B.getByTestId('chat-close').click(); await A.getByTestId('chat-close').click();

  // ---------- Test 2: Gemeinsame Reparatur ----------
  const EYE = 1.62, BZ = -2.7;
  await G(A, ([EYE, BZ]) => { const pl = window.__gkPlayer; const from = [2.95, BZ], to = [1.2, 0.875, 0.1 + BZ]; pl.work = null; pl.x = from[0]; pl.z = from[1]; const dx = to[0] - from[0], dz = to[2] - from[1]; pl.yaw = Math.atan2(-dx, -dz); pl.pitch = Math.atan2(to[1] - EYE, Math.hypot(dx, dz)); pl.zoom = true; window.__gk.setState({ tool: 'hand' }); }, [EYE, BZ]);
  await A.waitForTimeout(700); await A.mouse.click(590, 410);
  expect(await until(A, () => !window.__gk.getState().cars[0].components.engine_cover.installed), 'Spieler 1 nimmt die Motorabdeckung mit einem echten Tipp ab');
  expect(await until(B, () => !window.__gk.getState().cars[0].components.engine_cover.installed), 'Spieler 2 sieht die entfernte Abdeckung');
  // Spieler 2 holt Ratsche und 10er Nuss aus Kiste B bzw. dem Schrank und baut Zündspule 1 aus
  cb = await coop(B);
  await G(B, () => window.__gkCoop.openBox('kiste_b')); await B.waitForTimeout(300);
  await B.getByTestId('coop-box').locator('[data-tool="ratchet"] button.primary').click();
  expect(await until(B, () => window.__gk.getState().carried.includes('ratchet')), 'Spieler 2 nimmt die Ratsche aus Kiste B (über das Kistenfenster)');
  await B.screenshot({ path: `${S}/koop-kiste.png` });
  await G(B, () => window.__gk.getState().setPanel(null));
  await G(B, (t) => window.__gkCoop.takeTool(t), toolOf(cb, 'socket10', 'schrank'));
  await until(B, () => window.__gk.getState().carried.includes('socket10'));
  await G(B, () => { const s = window.__gk.getState(); s.setTool('ratchet'); s.tapBolt(0, 'coil1', 0); s.setTool('hand'); window.__gk.getState().tapBolt(0, 'coil1', 0); window.__gk.getState().tapConnector(0, 'coil1'); window.__gk.getState().tapComponent(0, 'coil1'); });
  expect(!(await comp(B, 'coil1')).installed, 'Spieler 2 baut Zündspule 1 aus – ' + (await game(B)).toast);
  expect(await until(A, () => !window.__gk.getState().cars[0].components.coil1.installed), 'Spieler 1 sieht den Ausbau');
  // Gleichzeitig an verschiedenen Bauteilen desselben Autos
  await Promise.all([
    G(A, () => { const s = window.__gk.getState(); s.setTool('hand'); s.tapConnector(0, 'coil2'); }),
    G(B, () => { const s = window.__gk.getState(); s.setTool('ratchet'); s.tapBolt(0, 'coil3', 0); }),
  ]);
  await both(A, B);
  const [a2, a3, b2, b3] = [await comp(A, 'coil2'), await comp(A, 'coil3'), await comp(B, 'coil2'), await comp(B, 'coil3')];
  expect(!a2.connected && !b2.connected && a3.bolts[0] === 1 && b3.bolts[0] === 1, 'Beide arbeiten gleichzeitig am selben Auto (Stecker Spule 2 / Schraube Spule 3) – bei beiden derselbe Stand');
  // Haube, Tür und Hebebühne
  await G(A, () => { const s = window.__gk.getState(); s.toggleDoor(0, 1); s.tapHood(0); });
  expect(await until(B, () => { const c = window.__gk.getState().cars[0]; return c.doors && c.doors[1] === true && c.hoodOpen === false; }), 'Geöffnete Tür und geschlossene Haube erscheinen beim Partner');
  await G(B, () => window.__gk.getState().tapLift(0));
  expect(await until(A, () => window.__gk.getState().cars[0].lifted === true && window.__gk.getState().liftUp[0] === true), 'Hebebühne 1 fährt bei beiden hoch');
  await G(A, () => window.__gk.getState().tapLift(1)); await both(A, B);
  expect((await G(B, () => window.__gk.getState().liftUp.slice(0, 2).join())) === 'true,true' && (await game(B)).cars[0].lifted, 'Leere Bühne 2 unabhängig von Bühne 1 gesteuert');
  // Dieselbe Schraube gleichzeitig: keine widersprüchlichen Zustände
  await G(A, () => window.__gk.getState().tapLift(0)); await both(A, B);
  await G(A, () => window.__gk.getState().tapHood(0)); await both(A, B);
  await Promise.all([A, B].map((p) => G(p, () => { const s = window.__gk.getState(); s.setTool('hand'); s.tapBolt(0, 'coil3', 0); })));
  await both(A, B);
  expect(norm(await comp(A, 'coil3')) === norm(await comp(B, 'coil3')) && (await comp(A, 'coil3')).bolts[0] === 0, 'Dieselbe Schraube von beiden gleichzeitig herausgedreht: ein gemeinsamer, gültiger Stand ' + norm(await comp(A, 'coil3')) + norm(await comp(B, 'coil3')) + (await game(A)).toast);

  // ---------- Test 3: Zwei Ratschen ----------
  ca = await coop(A);
  const ratA = toolOf(ca, 'ratchet', 'kiste_a');
  await G(A, () => window.__gkCoop.openBox('kiste_a')); await A.waitForTimeout(300);
  await A.getByTestId('coop-box').locator('[data-tool="ratchet"] button.primary').click();
  expect(await until(A, () => window.__gk.getState().carried.join() === 'ratchet'), 'Spieler 1 nimmt Ratsche A – sie erscheint nur in seiner Leiste');
  await G(A, () => window.__gk.getState().setPanel(null));
  await G(B, () => window.__gkCoop.openBox('kiste_a'));
  expect(await until(B, () => !window.__gkCoop.useCoop.getState().tools.some((t) => t.type === 'ratchet' && t.box === 'kiste_a')) && (await B.getByTestId('coop-box').locator('[data-tool="ratchet"]').count()) === 0, 'Ratsche A ist für Spieler 2 aus Kiste A verschwunden');
  await G(B, (t) => window.__gkCoop.takeTool(t), ratA); await B.waitForTimeout(600);
  cb = await coop(B);
  expect(cb.tools.find((t) => t.id === ratA.id).holder === ca.me && /Partner/.test((await game(B)).toast), 'Spieler 2 bekommt Ratsche A nicht – ' + (await game(B)).toast);
  expect(cb.tools.find((t) => t.type === 'ratchet' && t.holder === cb.me).home === 'kiste_b' && (await game(B)).carried.join() === 'ratchet,socket10', 'Spieler 2 hat die andere Ratsche (aus Kiste B); Leisten sind getrennt: ' + (await game(A)).carried + ' / ' + (await game(B)).carried);
  await G(B, () => window.__gk.getState().setPanel(null));

  // ---------- Test 4: Ein Spezialwerkzeug ----------
  const obd = cb.tools.find((t) => t.type === 'obd');
  expect(cb.tools.filter((t) => t.type === 'obd').length === 1 && obd.box === 'spezial', 'Es gibt genau ein OBD-Diagnosegerät (Spezialwerkzeugschrank)');
  await G(A, (t) => window.__gkCoop.takeTool(t), obd);
  expect(await until(A, () => window.__gk.getState().carried.includes('obd')), 'Spieler 1 nimmt das Diagnosegerät');
  await G(B, (t) => window.__gkCoop.takeTool(t), obd); await B.waitForTimeout(600);
  expect(!(await game(B)).carried.includes('obd'), 'Spieler 2 kann es nicht gleichzeitig entnehmen – ' + (await game(B)).toast);
  await G(A, (t) => window.__gkCoop.returnTool(t, 'spezial'), obd);
  await until(A, () => !window.__gk.getState().carried.includes('obd'));
  await G(B, (t) => window.__gkCoop.takeTool(t), obd);
  expect(await until(B, () => window.__gk.getState().carried.includes('obd')), 'Nach der Rückgabe kann Spieler 2 es verwenden');
  // Leiste: höchstens drei Exemplare
  cb = await coop(B);
  await G(B, (t) => window.__gkCoop.takeTool(t), toolOf(cb, 'wrench', 'kiste_b')); await B.waitForTimeout(600);
  expect((await game(B)).carried.length === 3 && /voll/.test((await game(B)).toast), 'Vierte Entnahme scheitert an der Leiste mit drei Plätzen – ' + (await game(B)).toast);
  // Weiteres Exemplar kaufen
  const m0 = (await game(A)).money; const r0 = (await coop(A)).tools.filter((t) => t.type === 'ratchet').length;
  await G(A, () => window.__gkCoop.buyTool('ratchet', 'kiste_a'));
  expect(await until(B, ([m, r]) => window.__gk.getState().money === m - 60 && window.__gkCoop.useCoop.getState().tools.filter((t) => t.type === 'ratchet').length === r + 1, [m0, r0]), 'Vierte Ratsche gekauft: eigenes Exemplar, 60 € vom gemeinsamen Konto, bei beiden sichtbar');

  // Überzähliges Werkzeug verkaufen (Knopf in der Kiste): halber Preis zurück, bei beiden weg
  await until(A, (m) => window.__gk.getState().money === m - 60, m0); await settled(A);
  await G(A, () => window.__gkCoop.openBox('kiste_a')); await A.waitForTimeout(300);
  await A.locator('[data-testid="sell-ratchet"]').first().click();
  expect(await until(B, ([m, r]) => window.__gk.getState().money === m - 30 && window.__gkCoop.useCoop.getState().tools.filter((t) => t.type === 'ratchet').length === r, [m0, r0]), 'Überzählige Ratsche verkauft: 30 € zurück, bei beiden aus der Kiste verschwunden');
  await G(A, () => window.__gk.getState().setPanel(null));

  // ---------- Gemeinsames Lager ----------
  await until(A, (m) => window.__gk.getState().money === m - 30, m0); await settled(A);
  await G(A, () => window.__gk.getState().buyPart('spark_plug', 0)); await both(A, B);
  const inv = (await game(B)).inventory; const key = Object.keys(inv).find((k) => k.startsWith('spark_plug'));
  expect(inv[key] > 0 && (await game(A)).money === (await game(B)).money, `Teilekauf von Spieler 1 liegt im gemeinsamen Lager: ${inv[key]}× ${key}`);
  await Promise.all([A, B].map((p) => G(p, (key) => { const g = window.__gk; const s = g.getState(); g.setState({ inventory: { ...s.inventory, [key]: 0 } }); }, key)));
  await both(A, B);
  await G(A, (key) => { const g = window.__gk; const s = g.getState(); g.setState({ inventory: { ...s.inventory, [key]: (s.inventory[key] || 0) - 1 } }); }, key); await both(A, B);
  expect((await game(A)).inventory[key] === 0 && (await game(B)).inventory[key] === 0, 'Lager kann nicht unter null fallen (Entnahme aus leerem Bestand wird zurückgenommen)');

  // ---------- Test 5: Gemeinsames Geld ----------
  await G(A, () => window.__gk.setState({ money: 9000 })); await both(A, B);
  await Promise.all([A, B].map((p, i) => G(p, (i) => { const g = window.__gk; const s = g.getState(); const cars = [...s.cars]; cars[2 + i] = window.__gkLib.createCar(i ? 'bavaria_320' : 'bavaria_325', [], Math.random, {}); g.setState({ cars, money: s.money - 8000 }); g.getState().say(i ? 'Ben kaufte eine Limousine für 8.000 €' : 'Anna kaufte einen Sechszylinder für 8.000 €'); }, i)));
  await both(A, B);
  const ga = await game(A), gb = await game(B);
  expect(ga.money === 1000 && gb.money === 1000, 'Beide kaufen gleichzeitig für 8.000 € bei 9.000 € Guthaben: nur einmal abgebucht (Konto 1.000 €)');
  expect(ga.cars.slice(0, 15).filter(Boolean).length === 2 && norm(ga.cars.map((c) => c && c.uid)) === norm(gb.cars.map((c) => c && c.uid)), 'Genau eines der beiden Autos wurde gekauft; beide sehen denselben Fuhrpark');
  await A.getByTestId('coop-chip').click(); await A.waitForTimeout(900);
  const ledger = await A.getByTestId('coop-ledger').innerText();
  expect(/kaufte .* für 8\.000 €/.test(ledger) && /Werkzeug gekauft/.test(ledger) && /Bestellt/.test(ledger), 'Kontobuch nennt, wer was gekauft hat');
  await A.screenshot({ path: `${S}/koop-konto.png` });
  await G(A, () => window.__gk.getState().setPanel(null));

  // ---------- Verkauf: gesperrt, solange der Partner am Auto steht; kein Doppelverkauf ----------
  const slot = ga.cars.findIndex((c, i) => c && i >= 2);
  await G(B, (BZ) => Object.assign(window.__gkPlayer, { x: 2.9, z: BZ, work: null }), BZ); // Spieler 2 steht an Bühne 1
  expect(await sees(A, 'Ben', ga.cars[0].uid), 'Spieler 1 sieht, dass Spieler 2 am Auto auf Bühne 1 steht');
  await G(A, () => { const g = window.__gk; const s = g.getState(); const cars = [...s.cars]; cars[0] = null; g.setState({ cars, money: s.money + 5000 }); });
  await both(A, B);
  expect(!!(await game(A)).cars[0] && (await game(A)).money === 1000, 'Verkauf des Autos, an dem der Partner steht, wird vom Server abgelehnt');
  await G(B, () => Object.assign(window.__gkPlayer, { x: 5.5, z: 4.5 })); await sees(A, 'Ben', null);
  await Promise.all([A, B].map((p) => G(p, (slot) => { const g = window.__gk; const s = g.getState(); const cars = [...s.cars]; cars[slot] = null; g.setState({ cars, money: s.money + 7000 }); }, slot)));
  await both(A, B);
  expect((await game(A)).money === 8000 && (await game(B)).money === 8000 && !(await game(B)).cars[slot], `Beide verkaufen gleichzeitig dasselbe Auto: Erlös nur einmal gutgeschrieben (${(await game(A)).money} / ${(await game(B)).money}, ${await reject(A)} ${await reject(B)})`);

  // ---------- Gemeinsame Tiefgarage: einparken, beide sehen es, kein Auto doppelt ----------
  await G(A, () => { const g = window.__gk; g.setState({ upgrades: [...g.getState().upgrades, 'tg_klein'] }); });
  await both(A, B);
  const tgUid = (await game(A)).cars[0].uid;
  await G(A, () => { const g = window.__gk; const cars = [...g.getState().cars]; cars[22] = cars[0]; cars[0] = null; g.setState({ cars }); });
  await both(A, B);
  const tgB = (await game(B)).cars;
  expect(tgB[22] && tgB[22].uid === tgUid && !tgB[0] && (await G(B, () => window.__gk.getState().upgrades.includes('tg_klein'))), 'Spieler 1 parkt in die gemeinsame Tiefgarage – Spieler 2 sieht Garage und Auto auf Platz 1');
  await Promise.all([[A, 23], [B, 24]].map(([p, to]) => G(p, (to) => { const g = window.__gk; const cars = [...g.getState().cars]; if (!cars[22]) return; cars[to] = cars[22]; cars[22] = null; g.setState({ cars }); }, to)));
  await both(A, B);
  const tgA = (await game(A)).cars.map((c) => c && c.uid);
  expect(tgA.filter((u) => u === tgUid).length === 1 && norm(tgA) === norm((await game(B)).cars.map((c) => c && c.uid)), `Beide parken gleichzeitig dasselbe Auto um: es steht danach genau einmal da (Platz ${tgA.indexOf(tgUid) - 21})`);
  await G(A, (u) => { const g = window.__gk; const cars = [...g.getState().cars]; const i = cars.findIndex((c) => c && c.uid === u); cars[0] = cars[i]; cars[i] = null; g.setState({ cars }); }, tgUid);
  await both(A, B);
  expect((await game(B)).cars[0] && (await game(B)).cars[0].uid === tgUid, 'Auto wieder aus der Tiefgarage auf Bühne 1 geholt');

  // ---------- Test 6: Verbindungsabbruch ----------
  ca = await coop(A);
  const block = (on) => fetch(`${COOP}/__test/block`, { method: 'POST', body: JSON.stringify({ user: ca.me, on }) });
  await block(true);
  await G(A, () => { const s = window.__gk.getState(); s.setTool('hand'); s.tapConnector(0, 'coil4'); });
  expect(await until(A, () => window.__gkCoop.useCoop.getState().status === 'offline', null, 15000), 'Spieler 1 verliert mitten in der Reparatur die Verbindung (Anzeige „Offline“)');
  expect(!(await comp(A, 'coil4')).connected && (await comp(B, 'coil4')).connected, 'Sein Schritt ist lokal gemacht, beim Partner noch nicht angekommen');
  await G(B, () => window.__gk.getState().buyPart('ignition_coil', 0)); await settled(B);
  expect((await game(B)).money < 8000, 'Spieler 2 spielt währenddessen weiter (Teil gekauft)');
  await block(false);
  expect(await until(A, () => window.__gkCoop.useCoop.getState().status === 'online', null, 15000), 'Spieler 1 verbindet sich von selbst wieder');
  await both(A, B);
  expect(!(await comp(B, 'coil4')).connected && (await game(A)).money === (await game(B)).money, 'Nach der Wiederverbindung: sein Schritt ist beim Partner, der Kauf des Partners bei ihm – ein gemeinsamer Stand');
  // Sperre und Anwesenheit verfallen von selbst
  await G(A, (BZ) => Object.assign(window.__gkPlayer, { x: 2.9, z: BZ }), BZ); await A.waitForTimeout(1500);
  await block(true);
  await B.waitForTimeout(17000);
  await G(B, () => { const g = window.__gk; const s = g.getState(); const cars = [...s.cars]; const c = cars[0]; cars[0] = null; cars[5] = c; g.setState({ cars }); });
  await settled(B); await B.waitForTimeout(800);
  const moved = (await game(B)).cars;
  expect(!moved[0] && !!moved[5], 'Nach 15 s ohne Lebenszeichen ist die Sperre von Spieler 1 frei; Umparken geht ' + (await reject(B)));
  await G(B, () => { const g = window.__gk; const s = g.getState(); const cars = [...s.cars]; cars[0] = cars[5]; cars[5] = null; g.setState({ cars }); }); await settled(B);
  await block(false);
  await until(A, () => window.__gkCoop.useCoop.getState().status === 'online', null, 15000); await both(A, B);

  // ---------- Mega-Update: zwei Spieler am selben Motor, gemeinsames Tuning ----------
  const helper = () => {
    const kit = ['ratchet', 'socket10', 'socket13', 'socket16', 'socket17', 'wrench', 'screwdriver'];
    const g = window.__gk; const L = window.__gkLib;
    const use = (t) => g.setState({ tool: t, carried: g.getState().carried.length ? g.getState().carried : [] });
    window.__t = {
      strip(slot, id) {
        const c = g.getState().cars[slot]; const d = L.defOf(c, id); const s0 = c.components[id];
        if (!s0 || !s0.installed) return;
        for (const x of L.blockersOf(g.getState().cars[slot], id)) this.strip(slot, x);
        const cc = () => g.getState().cars[slot];
        if (cc().bare && cc().lifted !== !!(d.access === 'lifted' || d.under)) g.getState().flipEngine();
        cc().components[id].bolts.forEach((b, i) => { if (b === 0) return; if (b === 2) { use(d.fastener.driver); g.getState().tapBolt(slot, id, i); } use('hand'); g.getState().tapBolt(slot, id, i); });
        if (d.connector && cc().components[id].connected) { use('hand'); g.getState().tapConnector(slot, id); }
        use(d.removeWith ? d.removeWith.driver : 'hand'); g.getState().tapComponent(slot, id);
      },
    };
  };
  await G(A, helper); await G(B, helper);
  // Werkzeug für beide: die Leiste kommt aus den Kisten – für diesen Teil reicht die Testabkürzung über den Spielzustand nicht,
  // weil die Leiste vom Server kommt. Beide holen Ratsche, 10er und 13er Nuss.
  for (const [pl, box] of [[A, 'schrank'], [B, 'kiste_a']]) {
    for (const type of ['ratchet', 'socket10', 'socket13']) {
      await G(pl, ([type, box]) => { const c = window.__gkCoop.useCoop.getState(); const me = c.me; if (c.tools.some((t) => t.holder === me && t.type === type)) return; const t = c.tools.find((x) => x.type === type && x.box === box) || c.tools.find((x) => x.type === type && x.box); if (t) window.__gkCoop.takeTool(t); }, [type, box]);
      await pl.waitForTimeout(700);
    }
  }
  expect((await game(A)).carried.length === 3 && (await game(B)).carried.length >= 2, `Beide holen ihr Werkzeug selbst: A ${(await game(A)).carried} / B ${(await game(B)).carried}`);
  await G(A, () => { const g = window.__gk; const L = window.__gkLib; const s = g.getState(); const c = L.createCar('bavaria_330', [], Math.random, {}); const u = L.motor.extractEngine(c); const cars = [...s.cars]; cars[15] = L.motor.asStand(u, 'bavaria_330'); g.setState({ cars }); });
  expect(await until(B, () => !!window.__gk.getState().cars[15]), 'Motor auf dem Ständer erscheint beim Partner');
  // Gleichzeitig: A baut den Ansaugkrümmer ab, B die Motorabdeckung und den Ventildeckel
  await Promise.all([
    G(A, () => window.__t.strip(15, 'intake_manifold')),
    G(B, () => { window.__t.strip(15, 'engine_cover'); }),
  ]);
  await both(A, B);
  await G(B, () => { const c = window.__gk.getState().cars[15]; for (const k of Object.keys(c.components)) if (/^coil\d$/.test(k)) window.__t.strip(15, k); });
  await both(A, B);
  await G(B, () => window.__t.strip(15, 'valve_cover'));
  await both(A, B);
  const engA = await G(A, () => window.__gk.getState().cars[15].components);
  const engB = await G(B, () => window.__gk.getState().cars[15].components);
  expect(!engA.intake_manifold.installed && !engA.valve_cover.installed && !engB.intake_manifold.installed && !engB.valve_cover.installed && norm(engA) === norm(engB), 'Beide arbeiten am selben Motor: Ansaugkrümmer (A) und Ventildeckel (B) sind bei beiden ab');
  // Tuning: A montiert Felgen und Spoiler, B sieht es
  await G(A, () => { const g = window.__gk; const s = g.getState(); if (!s.cars[0]) return; g.setState({ money: Math.max(s.money, 20000) }); g.getState().buyVisual('rim:five'); g.getState().buyVisual('spoiler:3'); g.getState().mountVisual(0, 'rim:five'); g.getState().mountVisual(0, 'spoiler:3'); });
  expect(await until(B, () => { const c = window.__gk.getState().cars[0]; return c && c.visual && c.visual.rim === 'five' && c.visual.spoiler === 3; }), 'Tuningteile von Spieler 1 sind bei Spieler 2 am selben Auto montiert');
  await p2shot(B, 'koop-tuning');

  // Probefahrt: solange Spieler 2 fährt, steht das Auto bei Spieler 1 nicht in der Werkstatt
  const uid0 = (await game(B)).cars[0].uid;
  await G(B, () => window.__gk.setState({ screen: 'track', driveBay: 0, panel: null }));
  expect(await until(A, (u) => window.__gkCoop.useAway.getState().uids.includes(u), uid0, 20000), 'Spieler 2 fährt Probe: bei Spieler 1 ist das Auto aus der Werkstatt verschwunden');
  await G(B, () => window.__gk.setState({ screen: 'garage' }));
  expect(await until(A, (u) => !window.__gkCoop.useAway.getState().uids.includes(u), uid0, 20000), 'Nach der Probefahrt steht es wieder da');

  // ---------- Koop-Rennen gegeneinander: ausschreiben, mitfahren, gemeinsamer Start, Ergebnis bei beiden ----------
  // Gemeinsame Uhr: Spieler 2 hat eine um 5 s vorgehende Geräteuhr – nach dem Abgleich mit dem Server stimmen beide überein
  await G(B, () => { const real = Date.now.bind(Date); Date.now = () => real() + 5000; });
  await G(A, () => window.__gkCoop.syncClock()); await G(B, () => window.__gkCoop.syncClock());
  const skew = await G(B, () => window.__gkCoop.syncedNow()) - (await G(A, () => window.__gkCoop.syncedNow()));
  expect(Math.abs(skew) < 600, 'Verstellte Geräteuhr wird über die Server-Uhr ausgeglichen (Rest ' + Math.round(skew) + ' ms)');
  await G(A, () => { const g = window.__gk; const L = window.__gkLib; const cars = [...g.getState().cars]; for (const i of [2, 3]) { const c = L.createCar('renard_twingle', [], Math.random); c.fluids.oil.level = 4; cars[i] = c; } g.setState({ cars }); });
  await both(A, B);
  await G(A, () => window.__gk.getState().setPanel('computer', -77)); await A.waitForTimeout(500);
  await A.getByTestId('coop-race-course').selectOption('ost');
  await A.getByTestId('coop-race-host-2').click();
  await G(B, () => window.__gk.getState().setPanel('computer', -77));
  expect(await until(B, () => !!document.querySelector('[data-testid="coop-race-join-3"]'), null, 15000), 'Spieler 2 sieht die Ausschreibung von Spieler 1');
  await B.getByTestId('coop-race-join-3').click();
  expect(await until(A, () => { const b = document.querySelector('[data-testid="coop-race-start"]'); return !!b && !b.disabled; }, null, 15000), 'Spieler 1 sieht den Mitfahrer – Start möglich: ' + (await G(A, () => (document.querySelector('[data-testid="coop-lobby-members"]') || {}).textContent)));
  await A.getByTestId('coop-race-start').click();
  expect(await until(A, () => window.__gk.getState().screen === 'track', null, 12000) && await until(B, () => window.__gk.getState().screen === 'track', null, 12000), 'Beide stehen in der Startaufstellung');
  expect(await until(A, () => document.querySelector('[data-testid="race-place"]') && /\/2/.test(document.querySelector('[data-testid="race-place"]').textContent), null, 12000), 'Platzanzeige unter zwei Fahrern');
  await until(A, () => window.__gkDrive.sim.raceT > 0, null, 15000);
  for (const P of [A, B]) await G(P, () => { const d = window.__gkDrive; d.sim.autopilot = 22; d.sim.timeScale = 3; });
  const sawRival = await until(B, () => { const d = window.__gkDrive; return d && d.sim.raceT > 2; }, null, 15000);
  expect(sawRival, 'Rennen läuft auf beiden Geräten');
  expect(await until(A, () => window.__gk.getState().panel === 'raceResult', null, 120000) && await until(B, () => window.__gk.getState().panel === 'raceResult', null, 120000), 'Beide sind im Ziel');
  const rows = async (P) => until(P, () => { const t = document.querySelector('[data-testid="coop-race-results"]'); return !!t && t.querySelectorAll('.race-row').length === 2 && !/fährt noch/.test(t.textContent); }, null, 15000);
  expect(await rows(A) && await rows(B), 'Gemeinsamer Endstand mit beiden Zeiten: ' + (await G(A, () => document.querySelector('[data-testid="coop-race-results"]').textContent)));
  for (const P of [A, B]) await G(P, () => window.__gk.getState().setPanel(null));
  // ---------- Drift-Duell im Koop: Punkte statt Zeit, live und im Endstand nach Punkten ----------
  for (const P of [A, B]) await G(P, () => { window.__gkCoopRace && window.__gkCoopRace.leave && window.__gkCoopRace.leave(); });
  await G(A, () => window.__gk.getState().setPanel('computer', -77)); await A.waitForTimeout(500);
  await A.getByTestId('coop-mode-drift').click();
  await A.getByTestId('coop-race-course').selectOption('motodrom');
  await A.getByTestId('coop-race-host-2').click();
  await G(B, () => window.__gk.getState().setPanel('computer', -77));
  expect(await until(B, () => { const l = document.querySelector('[data-testid="coop-lobby"]'); return !!l && /Drift-Duell/.test(l.textContent) && !!document.querySelector('[data-testid="coop-race-join-3"]'); }, null, 15000), 'Spieler 2 sieht die Einladung zum Drift-Duell');
  await B.getByTestId('coop-race-join-3').click();
  expect(await until(A, () => { const b = document.querySelector('[data-testid="coop-race-start"]'); return !!b && !b.disabled; }, null, 15000), 'Drift-Duell: Start möglich');
  await A.getByTestId('coop-race-start').click();
  expect(await until(A, () => window.__gk.getState().screen === 'track', null, 12000) && await until(B, () => window.__gk.getState().screen === 'track', null, 12000), 'Beide stehen im Drift-Duell am Start');
  expect(await until(A, () => !!document.querySelector('[data-testid="coop-drift-live"]') && /ESP aus/.test(document.querySelector('[data-testid="esp"]').textContent), null, 12000), 'Live-Punktetabelle sichtbar, ESP aus');
  await until(A, () => window.__gkDrive.sim.raceT > 0, null, 15000);
  await G(A, () => { window.__gkDrive.sim.drift.banked += 3000; }); await G(B, () => { window.__gkDrive.sim.drift.banked += 1200; });
  expect(await until(B, () => { const t = document.querySelector('[data-testid="coop-drift-live"]'); return !!t && /1\. Anna – 3\.000/.test(t.textContent); }, null, 15000), 'Spieler 2 sieht live: Spieler 1 führt mit 3.000 Punkten');
  for (const P of [A, B]) await G(P, () => { const d = window.__gkDrive; d.sim.autopilot = 24; d.sim.timeScale = 3; });
  expect(await until(A, () => window.__gk.getState().panel === 'raceResult', null, 150000) && await until(B, () => window.__gk.getState().panel === 'raceResult', null, 150000), 'Beide im Ziel des Drift-Duells');
  const dres = await G(B, () => { const r = window.__gk.getState().raceResult; return { pts: r.points, txt: (document.querySelector('[data-testid="coop-race-results"]') || {}).textContent }; });
  expect(dres.pts >= 1200 && /Anna.*3\.0\d\d Punkte.*Du.*1\.\d{3} Punkte/.test(dres.txt), 'Endstand nach Punkten: ' + dres.txt);
  for (const P of [A, B]) await G(P, () => window.__gk.getState().setPanel(null));

  // ---------- Test 7: Wiederbeitritt ----------
  const before = { car: norm((await game(B)).cars[0].components), money: (await game(B)).money, tools: norm((await coop(B)).tools), stand: norm(await G(B, () => window.__gk.getState().cars[15])) };
  await G(A, () => window.__gkCoop.leave()); await G(B, () => window.__gkCoop.leave()); await B.waitForTimeout(600);
  expect((await coop(A)).status === 'off' && (await coop(B)).status === 'off', 'Beide verlassen das Spiel');
  await B.reload(); await B.waitForTimeout(1500);
  await B.getByText('Bestehende Koop-Werkstatt öffnen').click();
  expect(await until(B, () => window.__gkCoop.useCoop.getState().status === 'online' && window.__gk.getState().screen === 'garage'), 'Spieler 2 öffnet die Werkstatt später allein (nach Neuladen der Seite, ohne Code)');
  expect(await until(B, () => { const m = document.querySelector('[data-testid="member-Anna"]'); return !!m && m.className === 'mem-off' && !/zuletzt/.test(m.textContent); }, null, 20000), 'In der Leiste steht Spieler 1 nur als offline (ohne Zeit)');
  await B.getByTestId('coop-chip').click(); await B.waitForTimeout(400);
  const lines = await B.getByTestId('coop-member').allTextContents();
  expect(lines.some((t) => /Anna – zuletzt (gerade eben|vor \d+ min)/.test(t)), 'Nach Antippen: wann Spieler 1 zuletzt online war – ' + lines.join(' | '));
  expect(lines.filter((t) => /⏱ Arbeitszeit (unter 1 min|\d+ min|\d+ h \d+ min) \(heute /.test(t)).length === 2, 'Arbeitszeit je Spieler (vom Server gezählt): ' + lines.join(' | '));
  await G(B, () => window.__gk.getState().setPanel(null));
  const after = { car: norm((await game(B)).cars[0].components), money: (await game(B)).money, tools: norm((await coop(B)).tools) };
  expect(after.car === before.car && after.money === before.money, 'Reparaturfortschritt und Geld sind erhalten');
  expect(norm(await G(B, () => window.__gk.getState().cars[15])) === before.stand, 'Der halb zerlegte Motor auf dem Ständer ist erhalten');
  expect(after.tools === before.tools && (await game(B)).carried.length === 3, 'Alle Werkzeugexemplare liegen, wo sie waren; die Leiste von Spieler 2 ist erhalten: ' + (await game(B)).carried);
  expect(JSON.parse(before.tools).find((t) => t.id === ratA.id).holder === ca.me, 'Ratsche A ist weiterhin Spieler 1 zugeordnet (nicht dupliziert, nicht verschwunden)');

  // ---------- Test 8: Einzelspieler ----------
  const changed = unchanged(await save(A));
  expect(changed.length === 0, 'Einzelspielstand von Spieler 1 ist inhaltlich unverändert' + (changed.length ? ' – abweichend: ' + changed : ''));
  expect((await game(A)).money === 12345 && (await game(A)).started, 'Im Menü steht wieder der Einzelspielstand');
  expect(/Arbeitszeit .* heute /.test(await A.getByTestId('playtime').textContent()), 'Arbeitszeit des Einzelspiels im Menü: ' + (await A.getByTestId('playtime').textContent()));
  await A.getByText('Einzelspieler fortsetzen').click(); await A.waitForTimeout(600);
  await G(A, () => window.__gk.setState({ money: 12000 })); await A.waitForTimeout(500);
  expect(JSON.parse(await save(A)).state.money === 12000 && (await game(A)).screen === 'garage', 'Einzelspieler läuft weiter und speichert wieder lokal');
  await A.reload(); await A.waitForTimeout(1500);
  expect((await game(A)).money === 12000, 'Nach Neuladen: Einzelspielstand vorhanden');

  console.log('errors:', JSON.stringify(errs));
  console.log(fails || errs.length ? `FEHLER: ${fails + errs.length}` : 'ALLES OK');
  await b.close();
})().catch((e) => { console.log('Error:', e.message); process.exit(1); });
