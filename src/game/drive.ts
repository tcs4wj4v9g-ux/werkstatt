import { create } from 'zustand';

// Eingaben und Telemetrie der Probefahrt. Bewusst getrennt vom Spielstand:
// Eingaben ändern sich pro Frame und werden nie gespeichert.
/** steer: +1 = voll links, −1 = voll rechts; throttle/brake 0..1; assist: ESP an (Standard) oder aus (Driften). */
export const driveInput = { steer: 0, throttle: 0, brake: 0, assist: true };

export type DriveCamera = 'chase' | 'hood' | 'cockpit';
export const CAMERA_LABEL: Record<DriveCamera, string> = { chase: 'Außen', hood: 'Motorhaube', cockpit: 'Cockpit' };

interface DriveHud {
  speed: number;
  rpm: number;
  redline: number;
  /** -1 = R, 0 = N, 1… */
  gear: number;
  checkpoint: number;
  total: number;
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
  checkpoint: 0,
  total: 8,
  offTrack: false,
  wheelspin: false,
  distance: 0,
  camera: 'chase',
  set: (p) => set(p),
}));
