import { create } from 'zustand';

// Eingaben und Telemetrie der Probefahrt. Bewusst getrennt vom Spielstand:
// Eingaben ändern sich pro Frame und werden nie gespeichert.
/** steer: +1 = voll links, −1 = voll rechts; throttle/brake 0..1; assist: ESP an (Standard) oder aus (Driften). */
export const driveInput = { steer: 0, throttle: 0, brake: 0, handbrake: false, assist: true };

/** Dauer der Probefahrt (s, Spielzeit) und ab wann sie als gefahren zählt. */
export const DRIVE_TIME = 150;
export const DRIVE_MIN = 45;

export type DriveCamera = 'chase' | 'hood' | 'cockpit';
export const CAMERA_LABEL: Record<DriveCamera, string> = { chase: 'Außen', hood: 'Motorhaube', cockpit: 'Cockpit' };

interface DriveHud {
  speed: number;
  rpm: number;
  redline: number;
  /** -1 = R, 0 = N, 1… */
  gear: number;
  /** Restzeit und gefahrene Zeit (s). */
  left: number;
  elapsed: number;
  /** Driftwinkel (°), 0 wenn nicht gedriftet wird. */
  drift: number;
  /** Zähler: „Zurück auf die Straße“ gedrückt. */
  respawn: number;
  offTrack: boolean;
  /** Antriebsräder drehen durch bzw. Reifen rutschen (für die Anzeige). */
  wheelspin: boolean;
  /** Gefahrene Strecke dieser Probefahrt (m). */
  distance: number;
  camera: DriveCamera;
  set(p: Partial<DriveHud>): void;
}

export const useDriveHud = create<DriveHud>((set) => ({
  speed: 0,
  rpm: 0,
  redline: 7000,
  gear: 1,
  left: 150,
  elapsed: 0,
  drift: 0,
  respawn: 0,
  offTrack: false,
  wheelspin: false,
  distance: 0,
  camera: 'chase',
  set: (p) => set(p),
}));
