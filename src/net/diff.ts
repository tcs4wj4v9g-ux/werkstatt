// Feldweiser Vergleich des gemeinsamen Spielstands. Aus "vorher" und "nachher" entstehen kleine Schritte
// (Pfad, alter Wert, neuer Wert), die der Server nur übernimmt, wenn der alte Wert noch stimmt.
// Reine Funktionen ohne Browser- oder Netzwerkbezug – in den Logiktests geprüft.

/** Felder, die allen Mitgliedern der Werkstatt gemeinsam gehören (muss zu gk_shared_key im SQL passen). */
export const SHARED_KEYS = [
  'money', 'cars', 'upgrades', 'fluidStock', 'drainPan', 'auctions', 'waiting', 'events', 'liftUp', 'inventory',
  'listings', 'jobs', 'day', 'marketIndex', 'carsSold', 'totalProfit', 'jobsDone', 'career', 'achieved', 'contest', 'meet', 'jobEarnings',
] as const;
export type SharedKey = (typeof SHARED_KEYS)[number];
export type Shared = Record<SharedKey, any>;

/** Große Listen: statt des alten Werts wird nur die erwartete Versionsnummer des Feldes mitgeschickt. */
const BY_VERSION = new Set<string>(['listings', 'auctions', 'jobs', 'events', 'waiting']);
/** Felder, deren Einträge einzeln abgeglichen werden. */
const PER_ENTRY = new Set<string>(['inventory', 'fluidStock', 'drainPan', 'liftUp']);
/** Felder eines Autos, deren Einträge einzeln abgeglichen werden (Bauteile, Karosseriebereiche, Flüssigkeiten). */
const CAR_PER_ENTRY = new Set<string>(['components', 'zones', 'fluids']);

export interface Patch {
  path: string[];
  before?: unknown;
  after: unknown;
  ver?: number;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const nil = (v: unknown) => v === undefined || v === null;

/** Gleichheit wie in der Datenbank: Schlüsselreihenfolge egal, fehlend = null. */
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (nil(a) || nil(b)) return nil(a) && nil(b);
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false;
    return true;
  }
  if (isObj(a)) {
    if (!isObj(b)) return false;
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (!same(a[k], b[k])) return false;
    return true;
  }
  return false;
}

// Werte gehen ohne null-Einträge in Objekten zum Server: dort gilt {a: null} ≠ {} – im Spiel ist beides dasselbe.
const val = (v: unknown) => (v === undefined || v === null ? null : clean(v));

function entries(path: string[], a: any, b: any, out: Patch[]) {
  const keys = Array.isArray(a) && Array.isArray(b) ? Array.from({ length: Math.max(a.length, b.length) }, (_, i) => String(i)) : [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])];
  for (const k of keys) if (!same(a?.[k], b?.[k])) out.push({ path: [...path, k], before: val(a?.[k]), after: val(b?.[k]) });
}

/** Schritte, die `prev` in `next` überführen. `vers` = bekannte Versionsnummern der Felder. */
export function diff(prev: Shared, next: Shared, vers: Record<string, number> = {}): Patch[] {
  const out: Patch[] = [];
  for (const key of SHARED_KEYS) {
    const a = prev[key];
    const b = next[key];
    if (same(a, b)) continue;
    if (BY_VERSION.has(key)) out.push({ path: [key], ver: vers[key] ?? 0, after: val(b) });
    else if (PER_ENTRY.has(key) && !nil(a) && !nil(b)) entries([key], a, b, out);
    else if (key === 'cars' && Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
      for (let i = 0; i < a.length; i++) {
        const ca = a[i];
        const cb = b[i];
        if (same(ca, cb)) continue;
        // Dasselbe Auto: nur die geänderten Felder bzw. Bauteile. Anderes Auto oder leerer Platz: ganzer Stellplatz.
        if (isObj(ca) && isObj(cb) && ca.uid === cb.uid) {
          for (const f of new Set([...Object.keys(ca), ...Object.keys(cb)])) {
            if (same(ca[f], cb[f])) continue;
            if (CAR_PER_ENTRY.has(f) && isObj(ca[f]) && isObj(cb[f])) entries(['cars', String(i), f], ca[f], cb[f], out);
            else out.push({ path: ['cars', String(i), f], before: val(ca[f]), after: val(cb[f]) });
          }
        } else out.push({ path: ['cars', String(i)], before: val(ca), after: val(cb) });
      }
    } else out.push({ path: [key], before: val(a), after: val(b) });
  }
  return out;
}

function setIn(node: any, path: string[], value: unknown, depth: number): any {
  const k = path[depth];
  const last = depth === path.length - 1;
  if (Array.isArray(node)) {
    const copy = [...node];
    copy[Number(k)] = last ? value : setIn(copy[Number(k)], path, value, depth + 1);
    return copy;
  }
  const copy: Record<string, unknown> = { ...(node ?? {}) };
  // Innerhalb von Objekten bedeutet null "nicht vorhanden" (leere Stellplätze in Listen bleiben null).
  if (last && value === null) delete copy[k];
  else copy[k] = last ? value : setIn(copy[k], path, value, depth + 1);
  return copy;
}

/** Wendet Schritte an, ohne das Ausgangsobjekt zu verändern. Pfade aus `skip` werden ausgelassen. */
export function apply<T extends Record<string, any>>(state: T, patches: Patch[], skip?: Set<string>): T {
  let s: any = state;
  for (const p of patches) {
    if (skip?.has(p.path.join('/'))) continue;
    s = p.path.length === 1 ? { ...s, [p.path[0]]: p.after } : setIn(s, p.path, p.after, 0);
  }
  return s;
}

/** Entfernt null-Einträge aus Objekten (die Datenbank kennt kein "undefined"); Listen behalten ihre Lücken. */
export function clean<T>(v: T): T {
  if (Array.isArray(v)) return v.map((x) => clean(x)) as unknown as T;
  if (isObj(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (x !== null && x !== undefined) out[k] = clean(x);
    return out as T;
  }
  return v;
}

/** Felder, die auf oberster Ebene null sein dürfen und deshalb beim Säubern erhalten bleiben. */
export function cleanShared(state: Record<string, any>): Shared {
  const out: Record<string, any> = {};
  for (const k of SHARED_KEYS) out[k] = state[k] === null || state[k] === undefined ? null : clean(state[k]);
  return out as Shared;
}

export const pickShared = (state: Record<string, any>): Shared => Object.fromEntries(SHARED_KEYS.map((k) => [k, state[k]])) as Shared;
