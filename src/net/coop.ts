import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { create } from 'zustand';
import { TOOL_MAP } from '../game/data/tools';
import { saveGate } from '../game/saveGate';
import { useGame } from '../game/store';
import type { ToolId } from '../game/types';
import { player, useFocus } from '../three/player';
import { COOP_CONFIGURED, REALTIME, SUPABASE_KEY, SUPABASE_URL } from './config';
import { apply, cleanShared, diff, pickShared, SHARED_KEYS, type Patch, type Shared } from './diff';

// Koop-Werkstatt: hält den Spielstand im Gerät mit dem gemeinsamen Stand auf dem Server gleich.
//
//  * Jede lokale Aktion läuft sofort (keine Wartezeit beim Schrauben). Danach wird der Unterschied zum
//    letzten abgeglichenen Stand als kleine Schritte übertragen (`gk_commit`).
//  * Lehnt der Server ab, weil der Partner dasselbe Feld schon geändert hat, wird der Serverstand geladen.
//  * Was der Partner tut, kommt über die regelmäßige Abfrage (`gk_sync`); Realtime beschleunigt nur.
//  * Alle Netzaufrufe laufen nacheinander, nie zwei gleichzeitig – so bleibt die Reihenfolge eindeutig.

export interface ToolItem {
  id: string;
  type: ToolId;
  home: string;
  box: string | null;
  holder: string | null;
}
export interface Presence {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  tool: ToolId;
  scene: string;
  car: string | null;
}
export interface Member {
  id: string;
  name: string;
  online: boolean;
  seen: number;
  presence: Partial<Presence>;
}
export interface LedgerRow {
  at: number;
  by: string;
  amount: number;
  balance: number;
  note: string;
}
export const BOXES: Record<string, { name: string; cap: number }> = {
  kiste_a: { name: 'Werkzeugkiste A – Hebebühne 1', cap: 6 },
  kiste_b: { name: 'Werkzeugkiste B – Hebebühne 2', cap: 6 },
  schrank: { name: 'Werkzeugschrank', cap: 14 },
  spezial: { name: 'Spezialwerkzeugschrank', cap: 4 },
};
/** Preise für ein weiteres Exemplar (muss zu gk_tool_price im SQL passen); Spezialwerkzeug ist nicht käuflich. */
export const TOOL_PRICE: Partial<Record<ToolId, number>> = { ratchet: 60, screwdriver: 15, wrench: 25, socket10: 8, socket13: 8, socket16: 12, socket17: 10 };

type Status = 'off' | 'connecting' | 'online' | 'offline';
interface CoopState {
  status: Status;
  ws: string | null;
  name: string;
  code: string;
  inviteOpen: boolean;
  me: string | null;
  members: Member[];
  tools: ToolItem[];
  /** Gerade geöffnete Werkzeugkiste. */
  box: string;
  ledger: LedgerRow[];
  list: { id: string; name: string; code: string; money: number; day: number; members: string[] }[];
  error: string | null;
  /** Läuft gerade ein Anlegen/Beitreten/Öffnen? */
  working: boolean;
}

export const useCoop = create<CoopState>(() => ({ status: 'off', ws: null, name: '', code: '', inviteOpen: true, me: null, members: [], tools: [], box: 'schrank', ledger: [], list: [], error: null, working: false }));
export const coopActive = () => useCoop.getState().status !== 'off';

/** Letzte bekannte Lage der Mitspieler (für die Figuren in der Halle). */
export const remotePlayers = new Map<string, Presence & { name: string; at: number }>();

const SESSION_KEY = 'garage-kings-koop';
const TEXT: Record<string, string> = {
  konflikt: 'Dein Partner war schneller – der Stand wurde abgeglichen.',
  geld: 'Dafür reicht das gemeinsame Konto nicht mehr.',
  bestand: 'Das Teil ist nicht mehr im gemeinsamen Lager.',
  doppelt: 'Das Auto steht schon woanders.',
  gesperrt: 'Dein Partner arbeitet gerade an diesem Auto.',
  vergeben: 'Dieses Werkzeug hat gerade dein Partner.',
  leiste_voll: 'Deine Werkzeugleiste ist voll (3 Plätze).',
  kiste_voll: 'Diese Kiste ist voll – leg das Werkzeug in eine andere.',
  nicht_dabei: 'Dieses Werkzeug trägst du nicht.',
  nicht_kaeuflich: 'Dieses Spezialwerkzeug gibt es nur einmal je Werkstatt.',
  code_unbekannt: 'Diesen Einladungscode gibt es nicht (oder die Einladung ist geschlossen).',
  voll: 'Diese Werkstatt hat schon vier Mitglieder.',
  zu_viele_werkstaetten: 'Du bist schon in fünf Werkstätten.',
  kein_mitglied: 'Du bist kein Mitglied dieser Werkstatt.',
  anonym_aus: 'Der Server lässt noch keine Anmeldung zu: Im Supabase-Projekt muss „Allow anonymous sign-ins“ eingeschaltet sein.',
};
const text = (reason: string) => TEXT[reason] ?? `Server: ${reason}`;

class NetError extends Error {}
let client: SupabaseClient | null = null;
function db() {
  if (!COOP_CONFIGURED) throw new Error('Koop ist noch nicht eingerichtet.');
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'garage-kings-koop-auth' } });
  return client;
}
async function signIn() {
  const c = db();
  const { data } = await c.auth.getSession();
  if (data.session) return;
  const r = await c.auth.signInAnonymously();
  if (r.error) {
    // Eine Absage des Servers (z. B. anonyme Anmeldung im Supabase-Projekt ausgeschaltet) ist kein Verbindungsproblem.
    if ((r.error as any).status && (r.error as any).status < 500) throw new Error(/anonymous/i.test(r.error.message) ? 'anonym_aus' : r.error.message);
    throw new NetError(r.error.message);
  }
}
async function rpc<T = any>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) {
    // Fehler mit Datenbank-Code sind Absagen des Servers; alles andere ist ein Verbindungsproblem.
    if (error.code && /^[0-9A-Z]{5}$/.test(error.code)) throw new Error(error.message);
    throw new NetError(error.message);
  }
  return data as T;
}

// ---------------------------------------------------------------- Abgleich

let shadow: Shared | null = null; // Stand, auf dem die lokalen Aktionen aufbauen (zuletzt abgeglichen bzw. übertragen)
let vers: Record<string, number> = {};
let rev = 0;
let toolsRev = -1;
let dirty = false;
let busy = false;
let timer: ReturnType<typeof setInterval> | null = null;
let lastSync = 0;
let failures = 0;
let inflight: { id: string; patches: Patch[]; note: string; next: Shared } | null = null;
const mine = new Set<string>();
let note = { text: '', at: 0 };
let lastInput = 0;
let channel: RealtimeChannel | null = null;
let lastPos = '';
let lastPosAt = 0;
let stuck = { key: '', n: 0 };
/** Letzte Absage des Servers (für Fehlersuche und Tests). */
let lastReject: unknown = null;

const overlap = (a: string[], b: string[]) => a.every((x, i) => i >= b.length || b[i] === x);
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16)));

function presence(): Presence {
  const g = useGame.getState();
  const near = useFocus.getState().nearBay;
  const car = g.screen === 'track' ? g.cars[g.driveBay]?.uid : g.screen === 'garage' && near >= 0 ? g.cars[near]?.uid : null;
  const r = (v: number) => Math.round(v * 100) / 100;
  return { x: r(player.x), z: r(player.z), yaw: r(player.yaw), pitch: r(player.pitch), tool: g.tool, scene: g.screen, car: car ?? null };
}

function setMembers(members: Member[]) {
  const me = useCoop.getState().me;
  const now = performance.now();
  for (const m of members) {
    if (m.id === me) continue;
    const known = remotePlayers.get(m.id);
    // Frischere Lagedaten aus Realtime nicht mit dem langsameren Abgleich überschreiben
    if (!m.online) remotePlayers.delete(m.id);
    else if (typeof m.presence.x === 'number' && (!known || now - known.at > 900)) remotePlayers.set(m.id, { ...(m.presence as Presence), name: m.name, at: now });
  }
  useCoop.setState({ members });
}

function setTools(tools: ToolItem[] | null | undefined, r?: number) {
  if (!tools) return;
  if (typeof r === 'number') toolsRev = r;
  const me = useCoop.getState().me;
  useCoop.setState({ tools });
  // Die eigene Werkzeugleiste ergibt sich aus den Exemplaren, die der Server diesem Spieler zuordnet.
  const carried = [...new Set(tools.filter((t) => t.holder === me).map((t) => t.type))];
  const g = useGame.getState();
  const carriedKind = ['driver', 'socket', 'device'].includes(TOOL_MAP[g.tool]?.kind);
  if (carried.join() !== g.carried.join() || (carriedKind && !carried.includes(g.tool))) {
    useGame.setState({ carried, tool: carriedKind && !carried.includes(g.tool) ? 'hand' : g.tool });
  }
}

/** Übernimmt Schritte des Partners. Felder mit eigener, noch nicht bestätigter Änderung bleiben unberührt. */
function applyRemote(changes: { rev: number; by: string; commit: string | null; patches: Patch[] }[]) {
  const foreign = changes.filter((c) => !(c.commit && mine.has(c.commit))).flatMap((c) => c.patches);
  if (!foreign.length || !shadow) return;
  const local = pickShared(useGame.getState() as any);
  const pending = [...diff(shadow, local, vers), ...(inflight?.patches ?? [])].map((p) => p.path);
  const usable = foreign.filter((p) => !pending.some((q) => overlap(p.path, q)));
  if (!usable.length) return;
  shadow = apply(shadow, usable);
  if (inflight) inflight.next = apply(inflight.next, usable);
  saveGate.remote = true;
  try {
    useGame.setState(apply(local, usable) as any);
  } finally {
    saveGate.remote = false;
  }
}

function loadState(s: any, entering: boolean) {
  shadow = cleanShared(s.state);
  vers = s.vers ?? {};
  rev = s.rev;
  inflight = null;
  dirty = false;
  useCoop.setState({ me: s.me, name: s.name, code: s.code, inviteOpen: s.open });
  saveGate.remote = true;
  try {
    useGame.setState({ ...(shadow as any), ...(entering ? { started: true, selected: 0, tool: 'hand', carried: [], panel: null, partPrompt: null, lastSale: null, driveReport: null, unlocked: [], contestResult: null } : {}) });
  } finally {
    saveGate.remote = false;
  }
  setMembers(s.members ?? []);
  setTools(s.tools, s.toolsRev);
}

async function resync(reason?: string) {
  const ws = useCoop.getState().ws;
  if (!ws) return;
  const s = await rpc('gk_get_state', { p_ws: ws });
  loadState(s, false);
  // Nur melden, wenn der Spieler gerade selbst etwas getan hat – stille Abgleiche stören sonst.
  if (reason && performance.now() - lastInput < 2500) useGame.getState().say(text(reason), true);
}

async function step() {
  const c = useCoop.getState();
  if (busy || c.status === 'off' || !c.ws || !shadow) return;
  const now = performance.now();
  if (!inflight && dirty) {
    dirty = false;
    const next = pickShared(useGame.getState() as any);
    const patches = diff(shadow, next, vers);
    if (patches.length) {
      // Schutz vor Endlosschleifen, falls ein Wert die Reise zum Server nicht unverändert übersteht.
      const key = JSON.stringify(patches.map((p) => [p.path, p.after]));
      stuck = stuck.key === key ? { key, n: stuck.n + 1 } : { key, n: 0 };
      if (stuck.n < 3) {
        const id = uuid();
        mine.add(id);
        inflight = { id, patches, note: now - note.at < 2000 ? note.text : '', next };
        shadow = next;
      } else shadow = next;
    }
  }
  if (!inflight && now - lastSync < (document.hidden ? 4000 : failures ? Math.min(4000, 800 * failures) : 800)) return;
  busy = true;
  try {
    if (inflight) {
      const sent = inflight;
      const r = await rpc('gk_commit', { p_ws: c.ws, p_id: sent.id, p_since: rev, p_patches: sent.patches, p_note: sent.note, p_presence: presence() });
      if (r.ok) {
        inflight = null;
        applyRemote(r.changes ?? []);
        rev = r.rev;
        vers = r.vers ?? vers;
        poke();
      } else {
        lastReject = { reason: r.reason, path: r.path ?? null };
        await resync(r.reason);
      }
    } else {
      const r = await rpc('gk_sync', { p_ws: c.ws, p_since: rev, p_tools_rev: toolsRev, p_presence: presence() });
      if (r.reset) await resync();
      else {
        applyRemote(r.changes ?? []);
        rev = r.rev;
        vers = r.vers ?? vers;
        setMembers(r.members ?? []);
        setTools(r.tools, r.toolsRev);
      }
    }
    lastSync = performance.now();
    failures = 0;
    if (useCoop.getState().status === 'offline') {
      useCoop.setState({ status: 'online' });
      useGame.getState().say('Verbindung wiederhergestellt.');
    }
  } catch (e) {
    lastSync = performance.now();
    if (e instanceof NetError) {
      failures++;
      if (failures === 3 && useCoop.getState().status === 'online') {
        useCoop.setState({ status: 'offline' });
        useGame.getState().say('Verbindung unterbrochen – du kannst weiterarbeiten, der Abgleich folgt automatisch.', true);
      }
    } else {
      // Absage des Servers (z. B. nicht mehr Mitglied): Stand neu laden; gelingt das nicht, Werkstatt verlassen.
      inflight = null;
      try {
        await resync('konflikt');
      } catch {
        await leave(String((e as Error).message));
      }
    }
  } finally {
    busy = false;
  }
}

// ---------------------------------------------------------------- Realtime (nur Beschleuniger)

function poke() {
  try {
    channel?.send({ type: 'broadcast', event: 'poke', payload: {} });
  } catch {
    /* ohne Realtime läuft der Abgleich über die Abfrage */
  }
}
function sendPosition() {
  const c = useCoop.getState();
  if (!channel || c.status !== 'online') return;
  const p = presence();
  const key = JSON.stringify(p);
  const now = performance.now();
  if (key === lastPos || now - lastPosAt < 110) return;
  lastPos = key;
  lastPosAt = now;
  try {
    channel.send({ type: 'broadcast', event: 'pos', payload: { id: c.me, ...p } });
  } catch {
    /* s. o. */
  }
}
function openChannel(ws: string) {
  if (!REALTIME) return;
  try {
    channel = db().channel(`gk:${ws}`, { config: { broadcast: { self: false } } });
    channel
      .on('broadcast', { event: 'pos' }, ({ payload }) => {
        const m = useCoop.getState().members.find((x) => x.id === payload.id);
        if (m) remotePlayers.set(payload.id, { ...(payload as Presence), name: m.name, at: performance.now() });
      })
      .on('broadcast', { event: 'poke' }, () => {
        lastSync = 0;
      })
      .subscribe();
  } catch {
    channel = null;
  }
}

// ---------------------------------------------------------------- Betreten und Verlassen

let unsub: (() => void) | null = null;
function start(ws: string) {
  localStorage.setItem(SESSION_KEY, ws);
  useCoop.setState({ status: 'online', ws, error: null });
  lastSync = performance.now();
  failures = 0;
  unsub = useGame.subscribe((s, prev) => {
    if (useCoop.getState().status === 'off') return;
    if (s.screen === 'menu') return void leave();
    if (saveGate.remote) return;
    if (s.toast && s.toast !== prev.toast) note = { text: s.toast.text, at: performance.now() };
    if (s.lastSale && s.lastSale !== prev.lastSale) note = { text: `Verkauf: ${s.lastSale.title}`, at: performance.now() };
    if (SHARED_KEYS.some((k) => (s as any)[k] !== (prev as any)[k])) dirty = true;
  });
  timer = setInterval(() => {
    void step();
    sendPosition();
  }, 100);
  openChannel(ws);
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => (lastInput = performance.now()), true);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) lastSync = 0;
  });
}

async function enter(ws: string) {
  const s = await rpc('gk_get_state', { p_ws: ws });
  saveGate.blocked = true;
  useGame.getState().goto('garage');
  loadState(s, true);
  start(ws);
}

async function run(fn: () => Promise<void>) {
  if (useCoop.getState().working) return;
  useCoop.setState({ working: true, error: null });
  try {
    await signIn();
    await fn();
  } catch (e) {
    const msg = e instanceof NetError ? 'Keine Verbindung zum Server.' : text(String((e as Error).message));
    if (useCoop.getState().status === 'off') await restoreSingle();
    useCoop.setState({ error: msg });
  } finally {
    useCoop.setState({ working: false });
  }
}

/** Neue gemeinsame Werkstatt. `copy` = mit dem eigenen Einzelspielstand als Startpunkt (er selbst bleibt unverändert). */
export const createWorkshop = (name: string, playerName: string, copy: boolean) =>
  run(async () => {
    saveGate.blocked = true;
    if (!copy) useGame.getState().newGame();
    const state = cleanShared(JSON.parse(JSON.stringify(pickShared(useGame.getState() as any))));
    const r = await rpc('gk_create_workshop', { p_name: name, p_player: playerName, p_state: state });
    await enter(r.id);
  });

export const joinWorkshop = (code: string, playerName: string) =>
  run(async () => {
    const r = await rpc('gk_join_workshop', { p_code: code, p_player: playerName });
    if (!r.ok) throw new Error(r.reason);
    await enter(r.id);
  });

export const openWorkshop = (ws: string) => run(() => enter(ws));

export const listWorkshops = () =>
  run(async () => {
    useCoop.setState({ list: await rpc('gk_my_workshops', {}) });
  });
export const lastWorkshop = () => (typeof localStorage !== 'undefined' ? localStorage.getItem(SESSION_KEY) : null);

/** Lädt den unveränderten Einzelspielstand zurück ins Spiel. */
async function restoreSingle() {
  const had = !!localStorage.getItem('garage-kings-save-v1');
  if (had) await useGame.persist.rehydrate();
  else useGame.setState(useGame.getInitialState(), true);
  saveGate.blocked = false;
  useGame.setState({ screen: 'menu', panel: null, partPrompt: null, engineBay: -1, lastSale: null, driveReport: null, unlocked: [], contestResult: null });
}

export async function leave(error?: string) {
  if (useCoop.getState().status === 'off') return;
  if (timer) clearInterval(timer);
  timer = null;
  unsub?.();
  unsub = null;
  try {
    if (channel) await db().removeChannel(channel);
  } catch {
    /* egal */
  }
  channel = null;
  remotePlayers.clear();
  shadow = null;
  inflight = null;
  useCoop.setState({ status: 'off', ws: null, members: [], tools: [], ledger: [], error: error ? text(error) : null });
  await restoreSingle();
}

// ---------------------------------------------------------------- Werkzeuge, Konto, Einladung

async function toolCall(fn: string, args: Record<string, unknown>, done?: (r: any) => void) {
  const ws = useCoop.getState().ws;
  if (!ws) return;
  try {
    const r = await rpc(fn, { p_ws: ws, ...args });
    setTools(r.tools, r.toolsRev);
    if (!r.ok) useGame.getState().say(text(r.reason), true);
    else done?.(r);
    // Sofort abgleichen: ein Werkzeugkauf ändert das gemeinsame Konto auf dem Server.
    lastSync = 0;
    await step();
  } catch (e) {
    useGame.getState().say(e instanceof NetError ? 'Keine Verbindung – Werkzeuge lassen sich gerade nicht holen oder zurücklegen.' : text(String((e as Error).message)), true);
  }
}
export const takeTool = (tool: ToolItem) =>
  toolCall('gk_take_tool', { p_tool: tool.id }, () => {
    if (TOOL_MAP[tool.type].kind !== 'socket') useGame.setState({ tool: tool.type });
  });
export const returnTool = (tool: ToolItem, box: string) => toolCall('gk_return_tool', { p_tool: tool.id, p_box: box });
export const buyTool = (type: ToolId, box: string) => toolCall('gk_buy_tool', { p_type: type, p_box: box }, () => useGame.getState().say(`${TOOL_MAP[type].name} gekauft – liegt in ${BOXES[box].name}.`));

export async function loadLedger() {
  const ws = useCoop.getState().ws;
  if (!ws) return;
  try {
    useCoop.setState({ ledger: await rpc('gk_ledger_list', { p_ws: ws, p_limit: 40 }) });
  } catch {
    /* Anzeige bleibt beim letzten Stand */
  }
}
export async function setInvite(open: boolean, renew: boolean) {
  const ws = useCoop.getState().ws;
  if (!ws) return;
  try {
    const r = await rpc('gk_set_invite', { p_ws: ws, p_open: open, p_renew: renew });
    useCoop.setState({ code: r.code, inviteOpen: r.open });
  } catch {
    useGame.getState().say('Einladung ließ sich gerade nicht ändern.', true);
  }
}

/** Zeitgesteuerte Abläufe (Auktionsuhr) rechnet im Koop nur ein Gerät: das online-Mitglied mit der kleinsten Kennung. */
export function isLeader() {
  const c = useCoop.getState();
  if (c.status === 'off') return true;
  const online = c.members.filter((m) => m.online || m.id === c.me).map((m) => m.id);
  return !online.length || online.sort()[0] === c.me;
}

export const openBox = (box: string) => {
  useCoop.setState({ box });
  useGame.getState().setPanel('cabinet');
};

if (typeof window !== 'undefined') (window as any).__gkCoop = { useCoop, remotePlayers, takeTool, returnTool, buyTool, openBox, leave, state: () => ({ rev, dirty, busy, inflight: !!inflight, lastReject }) };
