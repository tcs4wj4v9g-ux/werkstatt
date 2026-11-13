// Prüft das Koop-Schema gegen eine echte PostgreSQL-Instanz (supabase/test/db.sh start).
// Jeder "Spieler" ist eine eigene Verbindung mit eigener Kennung – wie zwei Geräte.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import pg from 'pg';

const PORT = Number(process.env.GK_PG_PORT || 54329);
const conn = () => new pg.Client({ host: '127.0.0.1', port: PORT, user: 'postgres', database: 'postgres' });
const all = [];
async function player() {
  const c = conn();
  await c.connect();
  all.push(c);
  const id = randomUUID();
  await c.query(`select set_config('request.jwt.claim.sub', $1, false)`, [id]);
  await c.query('set role authenticated');
  const rpc = async (fn, ...args) => (await c.query(`select ${fn}(${args.map((_, i) => `$${i + 1}`).join(',')}) as r`, args.map((a) => (a !== null && typeof a === 'object' ? JSON.stringify(a) : a)))).rows[0].r;
  return { id, c, rpc };
}
let admin;
before(async () => {
  admin = conn();
  await admin.connect();
  all.push(admin);
});
after(() => Promise.all(all.map((c) => c.end())));

const car = (uid) => ({ uid, modelId: 'bavaria_318', hoodOpen: false, lifted: false, components: { coil1: { installed: true, bolts: [2] }, coil2: { installed: true, bolts: [2] }, wheel_fl: { installed: true, bolts: [2, 2, 2, 2, 2] } } });
const state = () => ({ money: 10000, cars: [car('auto-1'), null, null], waiting: [], inventory: { 'spark_plug@R4': 6 }, fluidStock: { oil_5w30: 5 }, upgrades: [], listings: [{ id: 'l1' }, { id: 'l2' }], day: 1 });
const P = (path, before, after) => ({ path: path.map(String), before, after });
async function workshop() {
  const a = await player();
  const b = await player();
  const made = await a.rpc('gk_create_workshop', 'Testwerkstatt', 'Anna', state());
  assert.match(made.code, /^[A-Z2-9]{6}$/);
  const joined = await b.rpc('gk_join_workshop', made.code.toLowerCase(), 'Ben');
  assert.equal(joined.ok, true);
  return { a, b, ws: made.id, code: made.code };
}
const commit = (p, ws, patches, note = '', presence = null, since = 0) => p.rpc('gk_commit', ws, randomUUID(), since, patches, note, presence);

test('Tabellen sind gesperrt, Zugriff nur für Mitglieder', async () => {
  const { a, ws, code } = await workshop();
  await assert.rejects(a.c.query('select * from gk_workshops'), /permission denied/);
  await assert.rejects(a.c.query('update gk_tools set holder = null'), /permission denied/);
  const stranger = await player();
  await assert.rejects(stranger.rpc('gk_get_state', ws), /kein_mitglied/);
  await assert.rejects(commit(stranger, ws, [P(['money'], 10000, 0)]), /kein_mitglied/);
  await assert.rejects(stranger.rpc('gk_take_tool', ws, randomUUID()), /kein_mitglied/);
  assert.equal((await stranger.rpc('gk_join_workshop', 'XXXXXX', 'Eve')).reason, 'code_unbekannt');
  // Einladung schließen: der Code reicht dann nicht mehr
  await a.rpc('gk_set_invite', ws, false, false);
  assert.equal((await stranger.rpc('gk_join_workshop', code, 'Eve')).reason, 'code_unbekannt');
  // Ohne Anmeldung geht gar nichts
  const anon = await player();
  await anon.c.query(`select set_config('request.jwt.claim.sub', '', false)`);
  await assert.rejects(anon.rpc('gk_my_workshops').then((r) => anon.rpc('gk_create_workshop', 'x', 'y', state())), /nicht_angemeldet/);
});

test('Höchstens vier Mitglieder; Beitritt ist wiederholbar', async () => {
  const { b, ws, code } = await workshop();
  assert.equal((await b.rpc('gk_join_workshop', code, 'Ben')).id, ws);
  for (const n of ['C', 'D']) assert.equal((await (await player()).rpc('gk_join_workshop', code, n)).ok, true);
  assert.equal((await (await player()).rpc('gk_join_workshop', code, 'E')).reason, 'voll');
  assert.deepEqual((await b.rpc('gk_my_workshops'))[0].members, ['Anna', 'Ben', 'C', 'D']);
});

test('Werkstatt besteht unabhängig vom Gründer weiter', async () => {
  const { a, b, ws } = await workshop();
  await commit(a, ws, [P(['cars', 0, 'hoodOpen'], false, true)]);
  await a.c.end(); // Gründer ist weg
  all.splice(all.indexOf(a.c), 1);
  const s = await b.rpc('gk_get_state', ws);
  assert.equal(s.state.cars[0].hoodOpen, true);
  assert.equal((await commit(b, ws, [P(['cars', 0, 'lifted'], false, true)])).ok, true);
  assert.equal((await b.rpc('gk_get_state', ws)).state.cars[0].lifted, true);
});

test('Gemeinsame Reparatur: verschiedene Bauteile parallel, dasselbe Bauteil nicht widersprüchlich', async () => {
  const { a, b, ws } = await workshop();
  const coil = { installed: true, bolts: [2] };
  const [r1, r2] = await Promise.all([
    commit(a, ws, [P(['cars', 0, 'components', 'coil1'], coil, { installed: false, bolts: [0] })]),
    commit(b, ws, [P(['cars', 0, 'components', 'wheel_fl'], { installed: true, bolts: [2, 2, 2, 2, 2] }, { installed: false, bolts: [0, 0, 0, 0, 0] })]),
  ]);
  assert.equal(r1.ok && r2.ok, true, 'Motor und Rad gleichzeitig');
  // Beide greifen gleichzeitig nach derselben Schraube: genau einer gewinnt
  const res = await Promise.all([a, b].map((p) => commit(p, ws, [P(['cars', 0, 'components', 'coil2'], coil, { installed: true, bolts: [1] })])));
  assert.deepEqual(res.map((r) => r.ok).sort(), [false, true]);
  assert.equal(res.find((r) => !r.ok).reason, 'konflikt');
  const s = (await a.rpc('gk_get_state', ws)).state.cars[0].components;
  assert.deepEqual([s.coil1.installed, s.wheel_fl.installed, s.coil2.bolts[0]], [false, false, 1]);
});

test('Gemeinsames Geld: gleichzeitige Käufe geben nichts doppelt aus', async () => {
  const { a, b, ws } = await workshop();
  const res = await Promise.all([
    commit(a, ws, [P(['money'], 10000, 2000), P(['cars', 1], null, car('auto-2'))], 'Anna kaufte einen Sechszylinder'),
    commit(b, ws, [P(['money'], 10000, 1500), P(['cars', 2], null, car('auto-3'))], 'Ben kaufte ein Coupé'),
  ]);
  assert.deepEqual(res.map((r) => r.ok).sort(), [false, true]);
  const s = (await a.rpc('gk_get_state', ws)).state;
  assert.equal(s.cars.filter(Boolean).length, 2, 'nur ein Auto gekauft');
  assert.ok(s.money === 2000 || s.money === 1500);
  // Überziehen wird abgelehnt, auch wenn "vorher" stimmt
  assert.equal((await commit(a, ws, [P(['money'], s.money, -500)])).reason, 'geld');
  const ledger = await b.rpc('gk_ledger_list', ws, 10);
  assert.equal(ledger.length, 2);
  assert.match(ledger[0].note, /kaufte/);
  assert.equal(ledger[0].amount + 10000, s.money);
});

test('Gemeinsames Lager: atomare Entnahme, nie negativ', async () => {
  const { a, b, ws } = await workshop();
  const res = await Promise.all([a, b].map((p) => commit(p, ws, [P(['inventory', 'spark_plug@R4'], 6, 3)])));
  assert.deepEqual(res.map((r) => r.ok).sort(), [false, true]);
  assert.equal((await commit(b, ws, [P(['inventory', 'spark_plug@R4'], 3, 0)])).ok, true);
  assert.equal((await commit(a, ws, [P(['inventory', 'spark_plug@R4'], 0, -1)])).reason, 'bestand');
  assert.equal((await commit(a, ws, [P(['inventory', 'brake_pads@mid'], null, 2)])).ok, true, 'neue Teilenummer anlegen');
  assert.equal((await a.rpc('gk_get_state', ws)).state.inventory['brake_pads@mid'], 2);
});

test('Fahrzeughandel: kein Doppelverkauf, kein doppeltes Auto, Verkauf gesperrt solange der Partner daran arbeitet', async () => {
  const { a, b, ws } = await workshop();
  const c1 = (await a.rpc('gk_get_state', ws)).state.cars[0];
  // Ben steht am Auto (Anwesenheit nennt das Auto) → Anna kann es nicht verkaufen
  await b.rpc('gk_sync', ws, 0, 0, { car: 'auto-1' });
  assert.equal((await commit(a, ws, [P(['cars', 0], c1, null), P(['money'], 10000, 15000)])).reason, 'gesperrt');
  await b.rpc('gk_sync', ws, 0, 0, { car: null });
  // Beide verkaufen gleichzeitig: genau ein Erlös
  const res = await Promise.all([a, b].map((p) => commit(p, ws, [P(['cars', 0], c1, null), P(['money'], 10000, 15000)], 'Verkauf')));
  assert.deepEqual(res.map((r) => r.ok).sort(), [false, true]);
  assert.equal((await a.rpc('gk_get_state', ws)).state.money, 15000);
  // Dasselbe Auto auf zwei Stellplätzen wird abgelehnt
  assert.equal((await commit(a, ws, [P(['cars', 0], null, car('x')), P(['cars', 1], null, car('x'))])).reason, 'doppelt');
  // Umparken (zwei Felder in einer Transaktion) geht
  assert.equal((await commit(a, ws, [P(['cars', 1], null, car('y'))])).ok, true);
  assert.equal((await commit(a, ws, [P(['cars', 1], car('y'), null), P(['cars', 2], null, car('y'))])).ok, true);
});

test('Große Listen über Versionsnummer; Wiederholung derselben Änderung zählt nur einmal', async () => {
  const { a, b, ws } = await workshop();
  const res = await Promise.all([a, b].map((p, i) => commit(p, ws, [{ path: ['listings'], ver: 0, after: [{ id: i ? 'l1' : 'l2' }] }])));
  assert.deepEqual(res.map((r) => r.ok).sort(), [false, true]);
  const id = randomUUID();
  const one = await a.rpc('gk_commit', ws, id, 0, [P(['money'], 10000, 9000)], 'Teile', null);
  const two = await a.rpc('gk_commit', ws, id, 0, [P(['money'], 10000, 9000)], 'Teile', null);
  assert.equal(one.ok && two.ok, true);
  assert.equal(two.own, one.rev);
  assert.equal((await a.rpc('gk_ledger_list', ws, 10)).filter((l) => l.note === 'Teile').length, 1);
  // Unbekannte Felder und kaputte Pfade werden abgewiesen
  await assert.rejects(commit(a, ws, [P(['admin'], null, true)]), /ungueltiges_feld/);
  await assert.rejects(commit(a, ws, [P(['cars', 1, 'components', 'coil1'], null, {})]), /pfad_nicht_vorhanden/);
});

test('Abgleich liefert die Schritte des Partners in Reihenfolge', async () => {
  const { a, b, ws } = await workshop();
  await commit(a, ws, [P(['cars', 0, 'hoodOpen'], false, true)]);
  await commit(a, ws, [P(['day'], 1, 2)]);
  const s = await b.rpc('gk_sync', ws, 0, 0, { x: 1, z: 2 });
  assert.deepEqual(s.changes.map((c) => c.rev), [1, 2]);
  assert.equal(s.changes[0].by, a.id);
  assert.equal(s.members.find((m) => m.id === b.id).presence.x, 1);
  assert.equal(s.members.every((m) => m.online), true);
  assert.equal((await b.rpc('gk_sync', ws, 2, s.toolsRev, null)).changes.length, 0);
  assert.equal((await b.rpc('gk_sync', ws, 2, s.toolsRev, null)).tools, null, 'Werkzeugliste nur bei Änderung');
});

test('Werkzeugexemplare: zwei Ratschen, ein Spezialwerkzeug, Leiste mit drei Plätzen', async () => {
  const { a, b, ws } = await workshop();
  const tools = (await a.rpc('gk_get_state', ws)).tools;
  const find = (type, box) => tools.find((t) => t.type === type && t.box === box).id;
  const ratA = find('ratchet', 'kiste_a');
  const ratB = find('ratchet', 'kiste_b');
  assert.notEqual(ratA, ratB);
  assert.equal(tools.filter((t) => t.type === 'obd').length, 1);
  // Test 3 des Auftrags: Ratsche A ist weg, Ratsche B bleibt verfügbar
  assert.equal((await a.rpc('gk_take_tool', ws, ratA)).ok, true);
  assert.equal((await b.rpc('gk_take_tool', ws, ratA)).reason, 'vergeben');
  assert.equal((await b.rpc('gk_take_tool', ws, ratB)).ok, true);
  // Test 4: das eine Diagnosegerät – gleichzeitig greifen, genau einer bekommt es
  const obd = find('obd', 'spezial');
  const grab = await Promise.all([a, b].map((p) => p.rpc('gk_take_tool', ws, obd)));
  assert.deepEqual(grab.map((r) => r.ok).sort(), [false, true]);
  const winner = grab[0].ok ? a : b;
  const loser = grab[0].ok ? b : a;
  assert.equal((await loser.rpc('gk_return_tool', ws, obd, 'spezial')).reason, 'nicht_dabei');
  assert.equal((await winner.rpc('gk_return_tool', ws, obd, 'schrank')).ok, true, 'Rückgabe an einer anderen Kiste');
  assert.equal((await loser.rpc('gk_take_tool', ws, obd)).ok, true);
  const now = (await a.rpc('gk_get_state', ws)).tools;
  assert.equal(now.find((t) => t.id === obd).holder, loser.id);
  assert.equal(now.find((t) => t.id === obd).home, 'spezial', 'Kennung und Herkunft bleiben');
  // Leiste: höchstens drei Exemplare je Spieler
  const c = await player();
  await c.rpc('gk_join_workshop', (await a.rpc('gk_get_state', ws)).code, 'Cem');
  const free = now.filter((t) => t.box === 'schrank').slice(0, 4);
  const taken = [];
  for (const t of free) taken.push((await c.rpc('gk_take_tool', ws, t.id)).ok);
  assert.deepEqual(taken, [true, true, true, false]);
  assert.equal(now.length, (await a.rpc('gk_get_state', ws)).tools.length, 'kein Exemplar dupliziert oder verloren');
});

test('Werkzeugkiste voll; weiteres Exemplar kaufen; Spezialwerkzeug nicht käuflich', async () => {
  const { a, b, ws } = await workshop();
  let tools = (await a.rpc('gk_get_state', ws)).tools;
  // Kiste A (6 Plätze, 4 belegt) mit zwei gekauften Ratschen füllen
  for (let i = 0; i < 2; i++) assert.equal((await a.rpc('gk_buy_tool', ws, 'ratchet', 'kiste_a')).ok, true);
  assert.equal((await a.rpc('gk_buy_tool', ws, 'ratchet', 'kiste_a')).reason, 'kiste_voll');
  assert.equal((await a.rpc('gk_buy_tool', ws, 'obd', 'schrank')).reason, 'nicht_kaeuflich');
  const s = await b.rpc('gk_get_state', ws);
  assert.equal(s.state.money, 10000 - 120);
  assert.equal(s.tools.filter((t) => t.type === 'ratchet').length, 5);
  assert.equal(new Set(s.tools.map((t) => t.id)).size, s.tools.length);
  // Ben holt den Schlüssel aus Kiste B und will ihn in die volle Kiste A legen
  const wrench = tools.find((t) => t.type === 'wrench' && t.box === 'kiste_b').id;
  await b.rpc('gk_take_tool', ws, wrench);
  assert.equal((await b.rpc('gk_return_tool', ws, wrench, 'kiste_a')).reason, 'kiste_voll');
  assert.equal((await b.rpc('gk_return_tool', ws, wrench, 'schrank')).ok, true);
  // Der Kauf erscheint beim Partner als Änderung am Geld
  assert.equal((await b.rpc('gk_sync', ws, 0, 0, null)).changes.length, 2);
});

test('Lange Abwesenheit: Werkzeug kehrt als dasselbe Exemplar zurück', async () => {
  const { a, b, ws } = await workshop();
  const tools = (await a.rpc('gk_get_state', ws)).tools;
  const rat = tools.find((t) => t.type === 'ratchet' && t.box === 'kiste_a').id;
  await a.rpc('gk_take_tool', ws, rat);
  // Kurze Abwesenheit: Werkzeug bleibt beim Spieler
  await admin.query(`update gk_members set last_seen = now() - interval '5 minutes' where user_id = $1`, [a.id]);
  assert.equal((await b.rpc('gk_sync', ws, 0, 0, null)).tools.find((t) => t.id === rat).holder, a.id);
  await admin.query(`update gk_members set last_seen = now() - interval '2 hours' where user_id = $1`, [a.id]);
  const back = (await b.rpc('gk_sync', ws, 0, 0, null)).tools;
  assert.equal(back.find((t) => t.id === rat).box, 'kiste_a');
  assert.equal(back.find((t) => t.id === rat).holder, null);
  assert.equal(back.length, tools.length);
  assert.equal((await b.rpc('gk_take_tool', ws, rat)).ok, true);
});
