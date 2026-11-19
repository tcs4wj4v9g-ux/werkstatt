/**
 * Arbeitszeit (aktive Spielzeit). Gezählt wird nur, solange das Spiel sichtbar ist, nicht im Menü steht und es in den
 * letzten fünf Minuten eine Eingabe gab. Einzelspiel: lokal im Spielstand (alle 30 s übernommen, damit nicht jede
 * Sekunde gespeichert wird). Koop: der Server zählt je Mitglied (`gk_touch`), hier wird nur „untätig“ gemeldet.
 */
export const IDLE_MS = 5 * 60 * 1000;
let last = typeof performance !== 'undefined' ? performance.now() : 0;
if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => (last = performance.now()), true);
}
/** Spielt gerade jemand (sichtbar und nicht länger untätig)? */
export const isActive = () => typeof document !== 'undefined' && !document.hidden && performance.now() - last < IDLE_MS;

export interface PlayTime {
  total: number;
  /** Kalendertag (JJJJ-MM-TT, Ortszeit) und Sekunden an diesem Tag. */
  day: string;
  today: number;
}
export const emptyPlayTime = (): PlayTime => ({ total: 0, day: '', today: 0 });
export const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Sekunden zu einem Zeitkonto hinzufügen (neuer Kalendertag: „heute“ beginnt bei null). */
export function addPlay(p: PlayTime, sec: number, day = localDay()): PlayTime {
  return { total: p.total + sec, day, today: (p.day === day ? p.today : 0) + sec };
}

/** „3 h 12 min“, „45 min“, „unter 1 min“ */
export function duration(sec: number) {
  const m = Math.floor(sec / 60);
  if (m < 1) return 'unter 1 min';
  const h = Math.floor(m / 60);
  return h ? `${h} h ${m % 60} min` : `${m} min`;
}
/** Heute gespielte Zeit (0, wenn das Konto von einem anderen Tag stammt). */
export const todayOf = (p: PlayTime) => (p.day === localDay() ? p.today : 0);
