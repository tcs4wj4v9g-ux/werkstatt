import { create } from 'zustand';

// Eingaben und Telemetrie der Probefahrt. Bewusst getrennt vom Spielstand:
// Eingaben ändern sich pro Frame und werden nie gespeichert.
/** steer: +1 = voll links, −1 = voll rechts; throttle/brake 0..1; assist: ESP an (Standard) oder aus (Driften). */
export const driveInput = { steer: 0, throttle: 0, brake: 0, handbrake: false, assist: true, reverse: false };

/** Ab wann die Probefahrt als gefahren zählt (s Spielzeit). Beendet wird sie durch Anhalten auf dem Werkstatt-Vorplatz. */
export const DRIVE_MIN = 45;

export type DriveCamera = 'chase' | 'hood' | 'cockpit';
export const CAMERA_LABEL: Record<DriveCamera, string> = { chase: 'Außen', hood: 'Motorhaube', cockpit: 'Cockpit' };

interface DriveHud {
  speed: number;
  rpm: number;
  redline: number;
  /** -1 = R, 0 = N, 1… */
  gear: number;
  /** Gefahrene Zeit (s). */
  elapsed: number;
  /** Entfernung zur Werkstatt (m) und ob man schon weggefahren ist (dann beendet Anhalten auf dem Vorplatz die Fahrt). */
  home: number;
  away: boolean;
  /** Steht auf dem Vorplatz, aber noch keine 45 s gefahren. */
  tooShort: boolean;
  /** Driftwinkel (°), 0 wenn nicht gedriftet wird. */
  drift: number;
  /** Zeitrennen: Uhr (s, negativ = Countdown), erreichte Kontrollpunkte, ob ein Rennen läuft. */
  raceT: number;
  cp: number;
  cpTotal: number;
  /** Runden der Strecke (Rundkurse). */
  laps: number;
  racing: boolean;
  /** Rennen gegen Gegner: aktueller Platz und Teilnehmerzahl. */
  place: number;
  field: number;
  /** Lage für die Minikarte: Position (m) und Kurs (rad). */
  px: number;
  pz: number;
  ph: number;
  /** Zähler: „Zurück auf die Straße“ gedrückt. */
  respawn: number;
  offTrack: boolean;
  /** Antriebsräder drehen durch bzw. Reifen rutschen (für die Anzeige). */
  wheelspin: boolean;
  /** Gefahrene Strecke dieser Probefahrt (m). */
  distance: number;
  /** Driftwettbewerb: gutgeschriebene Punkte, laufende Kette, Kombo, zuletzt verlorene Kette (Anzeige). */
  driftPts: number;
  driftChain: number;
  driftCombo: number;
  driftLost: number;
  /** Stärkster Einschlag dieser Fahrt (m/s, 0 = kein Schaden) – für den Schadenshinweis. */
  damage: number;
  camera: DriveCamera;
  set(p: Partial<DriveHud>): void;
}

export const useDriveHud = create<DriveHud>((set) => ({
  speed: 0,
  rpm: 0,
  redline: 7000,
  gear: 1,
  home: 0,
  away: false,
  tooShort: false,
  elapsed: 0,
  drift: 0,
  respawn: 0,
  raceT: 0,
  cp: 0,
  cpTotal: 0,
  laps: 1,
  racing: false,
  place: 0,
  field: 0,
  px: 0,
  pz: 0,
  ph: 0,
  offTrack: false,
  wheelspin: false,
  distance: 0,
  driftPts: 0,
  driftChain: 0,
  driftCombo: 1,
  driftLost: 0,
  damage: 0,
  camera: 'chase',
  set: (p) => set(p),
}));
