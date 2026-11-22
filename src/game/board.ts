/**
 * Bestenliste je Strecke: beste Zeit jedes Spielers (alle Rennarten auf Zeit, auch Koop-Rennen) und die meisten
 * Driftpunkte (Driftwettbewerb, Drift-Duell). Liegt im gemeinsamen Karriere-Stand (`career.board`) und wird im Koop
 * mit abgeglichen. Name des Spielers: im Koop sein Koop-Name, allein „Du“ (setzt `boardWho`).
 */
import type { Career } from './career';

export interface BoardEntry {
  /** Zeit (s) bzw. Punkte. */
  v: number;
  car: string;
  day: number;
}
/**
 * Flach: Schlüssel `Strecke|Name` (Zeit) bzw. `Strecke:drift|Name` (Punkte). So gleicht der Koop jeden Eintrag einzeln ab –
 * jeder Spieler schreibt nur seine eigenen Einträge, gleichzeitige Rennen zweier Spieler kommen sich nicht in die Quere.
 */
export type Board = Record<string, BoardEntry>;
const entryKey = (key: string, who: string) => `${key}|${who}`;
/** Einträge einer Strecke als [Name, Eintrag]. */
const rowOf = (board: Board | undefined, key: string) =>
  Object.entries(board ?? {})
    .filter(([k]) => k.startsWith(key + '|'))
    .map(([k, e]) => [k.slice(key.length + 1), e] as [string, BoardEntry]);

/** Wer gerade spielt (im Koop vom Koop-Modul gesetzt). */
export const boardWho = { name: 'Du' };

export const boardKey = (course: string, drift: boolean) => (drift ? `${course}:drift` : course);

/**
 * Wert eintragen, wenn er besser ist als der bisherige des Spielers. Liefert die neue Karriere (oder dieselbe) und,
 * falls dabei die Bestmarke eines anderen Spielers fiel, dessen Namen.
 */
export function recordBoard(career: Career, course: string, drift: boolean, v: number, car: string, day: number, who = boardWho.name): { career: Career; beat: string | null; improved: boolean } {
  if (!(v > 0) || !Number.isFinite(v)) return { career, beat: null, improved: false };
  const key = boardKey(course, drift);
  const board: Board = career.board ?? {};
  const row = Object.fromEntries(rowOf(board, key));
  const mine = row[who];
  const better = (a: number, b: number) => (drift ? a > b : a < b);
  if (mine && !better(v, mine.v)) return { career, beat: null, improved: false };
  // bisher Bester (außer mir) – wurde er jetzt überholt?
  const others = Object.entries(row).filter(([n]) => n !== who);
  const top = others.sort((a, b) => (drift ? b[1].v - a[1].v : a[1].v - b[1].v))[0];
  const beat = top && better(v, top[1].v) ? top[0] : null;
  const next = { ...board, [entryKey(key, who)]: { v: drift ? Math.round(v) : Math.round(v * 100) / 100, car, day } };
  return { career: { ...career, board: next }, beat, improved: true };
}

/** Sortierte Zeilen einer Strecke. */
export const boardRows = (board: Board | undefined, course: string, drift: boolean) =>
  rowOf(board, boardKey(course, drift))
    .map(([name, e]) => ({ name, ...e }))
    .sort((a, b) => (drift ? b.v - a.v : a.v - b.v));

/** Ansage, wenn eine Bestmarke eines Mitspielers fällt (im Koop als Chat-Nachricht, siehe CoopRaceUI). */
export const boardNews: { on: ((text: string) => void) | null } = { on: null };

/** Strecke (mit `:drift`) des jüngsten Eintrags – für die Startansicht. */
export function latestKey(board: Board | undefined) {
  let best: { k: string; day: number } | null = null;
  for (const [k, e] of Object.entries(board ?? {})) if (!best || e.day >= best.day) best = { k: k.split('|')[0], day: e.day };
  return best?.k ?? null;
}
/** Gibt es Einträge für diese Strecke? */
export const hasBoard = (board: Board | undefined, course: string, drift: boolean) => rowOf(board, boardKey(course, drift)).length > 0;
