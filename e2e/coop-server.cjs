// Nachbau der Supabase-Schnittstelle für Tests: anonyme Anmeldung und Funktionsaufrufe (/rest/v1/rpc/…),
// dahinter die lokale PostgreSQL-Instanz mit dem echten Schema (supabase/test/db.sh start).
// So spielen zwei Browserfenster gegen dasselbe SQL wie später gegen Supabase. Realtime gibt es hier nicht –
// der Abgleich läuft dann vollständig über die regelmäßige Abfrage.
//   node e2e/coop-server.cjs [Port]
const http = require('http');
const { randomUUID } = require('crypto');
const { Pool } = require('pg');

const PORT = Number(process.argv[2] || process.env.GK_COOP_PORT || 4199);
const pool = new Pool({ host: '127.0.0.1', port: Number(process.env.GK_PG_PORT || 54329), user: 'postgres', database: 'postgres', max: 8 });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (sub) => `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.test`;
const subOf = (req) => {
  try {
    return JSON.parse(Buffer.from((req.headers.authorization || '').split('.')[1], 'base64url').toString()).sub || null;
  } catch {
    return null;
  }
};
const user = (id) => ({ id, aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
const session = (id) => ({ access_token: token(id), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: id, user: user(id) });
/** Zum Testen von Verbindungsabbrüchen: Anfragen dieser Spieler werden abgewiesen. */
const blocked = new Set();

const server = http.createServer(async (req, res) => {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  const send = (code, body) => {
    res.writeHead(code, { ...cors, 'content-type': 'application/json' });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  if (req.method === 'OPTIONS') return send(204);
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/__test/block') {
      if (body.on) blocked.add(body.user);
      else blocked.delete(body.user);
      return send(200, { blocked: [...blocked] });
    }
    const sub = subOf(req);
    if (sub && blocked.has(sub)) return req.socket.destroy();
    if (url.pathname === '/auth/v1/signup') return send(200, session(randomUUID()));
    if (url.pathname === '/auth/v1/token') return send(200, session(body.refresh_token));
    if (url.pathname === '/auth/v1/user') return sub ? send(200, user(sub)) : send(401, { message: 'no session' });
    if (url.pathname === '/auth/v1/logout') return send(204);
    const m = url.pathname.match(/^\/rest\/v1\/rpc\/(gk_[a-z_]+)$/);
    if (m) {
      const keys = Object.keys(body);
      const c = await pool.connect();
      try {
        await c.query('begin');
        await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [sub || '']);
        await c.query(`set local role ${sub ? 'authenticated' : 'anon'}`);
        const r = await c.query(`select ${m[1]}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map((k) => (body[k] !== null && typeof body[k] === 'object' ? JSON.stringify(body[k]) : body[k])));
        await c.query('commit');
        return send(200, r.rows[0].r);
      } catch (e) {
        await c.query('rollback').catch(() => {});
        return send(400, { message: e.message, code: e.code || 'P0001' });
      } finally {
        c.release();
      }
    }
    send(404, { message: 'not found' });
  } catch (e) {
    send(500, { message: String(e.message || e) });
  }
});
server.listen(PORT, () => console.log(`Koop-Testserver auf Port ${PORT}`));
