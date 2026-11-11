import { create } from 'zustand';

// Zustand des Spielers in der begehbaren Werkstatt. Liegt bewusst außerhalb
// von React: Position und Blick ändern sich jeden Frame.

export const ROOM = { minX: -4.8, maxX: 6.4, minZ: -5.6, maxZ: 5.6, height: 4.4 };
export const BAY_Z = [-2.7, 2.7];
export const LIFT_HEIGHT = 1.7;
export const EYE = 1.62;
export const REACH = 4.2;
const RADIUS = 0.32;

export const player = { x: 4.3, z: 0, yaw: Math.PI / 2, pitch: -0.12, zoom: false };
/** Eingabe des virtuellen Joysticks: x = seitwärts, y = vorwärts (je -1..1). */
export const moveInput = { x: 0, y: 0 };

export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
const box = (x: number, z: number, sx: number, sz: number): Box => ({ minX: x - sx / 2, maxX: x + sx / 2, minZ: z - sz / 2, maxZ: z + sz / 2 });

/** Feste Hindernisse: Möbel und Hebebühnen-Säulen. */
export const STATIC_BOXES: Box[] = [
  box(6.05, 0, 0.7, 1.3), // Werkzeugschrank
  box(5.95, -2.95, 0.9, 2.6), // Werkbank
  box(6.05, 3.0, 0.7, 2.4), // Ersatzteilregal
  box(4.3, 5.2, 1.6, 0.8), // Schreibtisch
  box(-4.3, 0, 0.9, 0.9), // Reifenstapel
  box(-4.35, 5.05, 0.7, 0.7), // Ölfass
  box(-4.25, -5.0, 0.9, 0.8), // Kompressor
  box(3.2, -5.4, 2.6, 0.5), // Wandregal
  ...BAY_Z.flatMap((z) => [box(0, z - 1.5, 0.3, 0.36), box(0, z + 1.5, 0.3, 0.36)]),
];

/** Fahrzeuge blockieren nur, solange sie am Boden stehen. */
export const carBox = (bay: number): Box => box(0, BAY_Z[bay], 4.8, 2.0);

const hits = (x: number, z: number, b: Box) => x > b.minX - RADIUS && x < b.maxX + RADIUS && z > b.minZ - RADIUS && z < b.maxZ + RADIUS;

/** Bewegt den Spieler und lässt ihn an Wänden und Hindernissen entlanggleiten. */
export function movePlayer(dx: number, dz: number, dynamic: Box[]) {
  const boxes = [...STATIC_BOXES, ...dynamic];
  const free = (x: number, z: number) =>
    x > ROOM.minX + RADIUS && x < ROOM.maxX - RADIUS && z > ROOM.minZ + RADIUS && z < ROOM.maxZ - RADIUS && !boxes.some((b) => hits(x, z, b));
  // Steckt der Spieler (z. B. nach dem Ablassen der Bühne) in einem Hindernis, darf er heraus.
  const stuck = !free(player.x, player.z);
  if (stuck || free(player.x + dx, player.z)) player.x += dx;
  if (stuck || free(player.x, player.z + dz)) player.z += dz;
  player.x = Math.min(ROOM.maxX - RADIUS, Math.max(ROOM.minX + RADIUS, player.x));
  player.z = Math.min(ROOM.maxZ - RADIUS, Math.max(ROOM.minZ + RADIUS, player.z));
}

/** Schiebt den Spieler aus einem Fahrzeug heraus, das gerade abgelassen wird. */
export function pushOutOf(b: Box) {
  if (!hits(player.x, player.z, b)) return;
  const toMinZ = player.z - (b.minZ - RADIUS);
  const toMaxZ = b.maxZ + RADIUS - player.z;
  player.z = toMinZ < toMaxZ ? b.minZ - RADIUS - 0.01 : b.maxZ + RADIUS + 0.01;
}

interface Focus {
  /** Station im Blick (Werkzeugschrank, Computer, …). */
  id: string | null;
  label: string | null;
  /** Hebebühne in der Nähe des Spielers, sonst -1. */
  nearBay: number;
  set(p: Partial<Focus>): void;
}
export const useFocus = create<Focus>((set) => ({ id: null, label: null, nearBay: -1, set: (p) => set(p) }));

/** Aktionen der Stationen – für den „Benutzen“-Knopf im HUD. */
export const stationActions = new Map<string, () => void>();
