// Prüft das echte Supabase-Projekt mit zwei anonymen Spielern (wie zwei Geräte): Anmeldung, Werkstatt anlegen,
// beitreten, gemeinsame Änderung, gleichzeitiger Kauf, Werkzeugexemplare, Zugriffsschutz, Realtime-Kanal.
// Legt dabei eine Test-Werkstatt "Testlauf (automatisch)" an und schließt am Ende deren Einladung.
//   node supabase/test/live-check.mjs
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const cfg = readFileSync(new URL('../../src/net/config.ts', import.meta.url), 'utf8');
const URL_ = cfg.match(/PROJECT_URL = '([^']+)'/)[1];
const KEY = cfg.match(/ANON_KEY = '([^']+)'/)[1];
let fails = 0;
const ok = (c, msg) => { if (!c) fails++; console.log(c ? 'ok:' : 'FAIL:', msg); };
const mk = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const call = async (c, fn, args) => { const { data, error } = await c.rpc(fn, args); if (error) throw new Error(`${fn}: ${error.message}`); return data; };

const A = mk(), B = mk(), E = mk();
for (const [c, n] of [[A, 'A'], [B, 'B'], [E, 'Fremd']]) {
  const r = await c.auth.signInAnonymously();
  ok(!r.error, `Anonyme Anmeldung ${n}` + (r.error ? ' – ' + r.error.message : ''));
  if (r.error) process.exit(1);
}
const state = { money: 10000, cars: [{ uid: 'live-1', modelId: 'bavaria_318', hoodOpen: false, components: { coil1: { installed: true } } }, null, null], waiting: [], inventory: { 'spark_plug@R4': 6 }, day: 1 };
const made = await call(A, 'gk_create_workshop', { p_name: 'Testlauf (automatisch)', p_player: 'Test A', p_state: state });
ok(/^[A-Z2-9]{6}$/.test(made.code), 'Werkstatt angelegt, Code ' + made.code);
const ws = made.id;
ok((await call(B, 'gk_join_workshop', { p_code: made.code, p_player: 'Test B' })).ok, 'Zweiter Spieler tritt bei');

// Zugriffsschutz
const direct = await A.from('gk_workshops').select('*');
ok(!!direct.error || (direct.data ?? []).length === 0, 'Tabellen sind direkt nicht lesbar' + (direct.error ? ` (${direct.error.message})` : ''));
const foreign = await E.rpc('gk_get_state', { p_ws: ws });
ok(!!foreign.error && /kein_mitglied/.test(foreign.error.message), 'Fremder Spieler ohne Mitgliedschaft wird abgewiesen');
const anon = await mk().rpc('gk_my_workshops', {});
ok(!!anon.error, 'Ohne Anmeldung kein Zugriff');

// Gemeinsame Änderung und Abgleich
const P = (path, before, after) => ({ path, before, after });
const c1 = await call(A, 'gk_commit', { p_ws: ws, p_id: randomUUID(), p_since: 0, p_patches: [P(['cars', '0', 'hoodOpen'], false, true)], p_note: '', p_presence: null });
ok(c1.ok, 'Spieler A öffnet die Haube');
const s = await call(B, 'gk_sync', { p_ws: ws, p_since: 0, p_tools_rev: -1, p_presence: { x: 1, z: 2 } });
ok(s.changes.length === 1 && s.changes[0].patches[0].after === true, 'Spieler B bekommt die Änderung');

// Gleichzeitiger Kauf
const buy = (c, slot) => call(c, 'gk_commit', { p_ws: ws, p_id: randomUUID(), p_since: 1, p_patches: [P(['money'], 10000, 2000), P(['cars', String(slot)], null, { uid: 'live-' + slot })], p_note: 'Kauf', p_presence: null });
const both = await Promise.all([buy(A, 1), buy(B, 2)]);
ok(both.filter((r) => r.ok).length === 1, 'Gleichzeitiger Kauf: nur einer wird abgebucht');

// Werkzeuge
const tools = (await call(A, 'gk_get_state', { p_ws: ws })).tools;
const ratA = tools.find((t) => t.type === 'ratchet' && t.box === 'kiste_a');
const obd = tools.find((t) => t.type === 'obd');
ok(tools.length === 23 && !!obd, '23 Werkzeugexemplare (inkl. Schrottplatz-Regal), ein OBD-Gerät');
ok((await call(A, 'gk_take_tool', { p_ws: ws, p_tool: ratA.id })).ok, 'A nimmt Ratsche A');
ok((await call(B, 'gk_take_tool', { p_ws: ws, p_tool: ratA.id })).reason === 'vergeben', 'B bekommt Ratsche A nicht');
const grab = await Promise.all([A, B].map((c) => call(c, 'gk_take_tool', { p_ws: ws, p_tool: obd.id })));
ok(grab.filter((r) => r.ok).length === 1, 'OBD-Gerät gleichzeitig gegriffen: genau einer bekommt es');

// Realtime: Broadcast zwischen beiden Spielern
const got = await new Promise((resolve) => {
  const chB = B.channel(`gk:${ws}`, { config: { broadcast: { self: false } } });
  const chA = A.channel(`gk:${ws}`, { config: { broadcast: { self: false } } });
  const timer = setTimeout(() => resolve(null), 15000);
  chB.on('broadcast', { event: 'pos' }, ({ payload }) => { clearTimeout(timer); resolve(payload); }).subscribe((st) => {
    if (st !== 'SUBSCRIBED') return;
    chA.subscribe((sa) => { if (sa === 'SUBSCRIBED') setTimeout(() => chA.send({ type: 'broadcast', event: 'pos', payload: { x: 3.2 } }), 500); });
  });
});
ok(got && got.x === 3.2, 'Realtime: Position kommt beim Partner an' + (got ? '' : ' (kein Empfang in 15 s – der Abgleich läuft dann über die Abfrage weiter)'));

// Aufräumen: Werkzeuge zurück, Einladung schließen
for (const [c, t] of [[A, ratA]]) await call(c, 'gk_return_tool', { p_ws: ws, p_tool: t.id, p_box: 'kiste_a' });
await call(A, 'gk_set_invite', { p_ws: ws, p_open: false, p_renew: true });
console.log(fails ? `FEHLER: ${fails}` : 'ALLES OK');
process.exit(fails ? 1 : 0);
