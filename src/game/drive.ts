import { create } from 'zustand';

// Eingaben und Telemetrie der Probefahrt. Bewusst getrennt vom Spielstand:
// Eingaben ändern sich pro Frame und werden nie gespeichert.
export const driveInput = { steer: 0, throttle: 0, brake: 0 };

interface DriveHud {
  speed: number;
  checkpoint: number;
  total: number;
  offTrack: boolean;
  set(p: Partial<DriveHud>): void;
}

export const useDriveHud = create<DriveHud>((set) => ({
  speed: 0,
  checkpoint: 0,
  total: 8,
  offTrack: false,
  set: (p) => set(p),
}));
