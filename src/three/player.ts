import { create } from 'zustand';
import { SLOTS } from '../game/data/workshop';

// Zustand des Spielers in der begehbaren Werkstatt. Liegt bewusst außerhalb
// von React: Position und Blick ändern sich jeden Frame.

export const ROOM = { minX: -4.8, maxX: 6.4, minZ: -5.6, maxZ: 5.6, height: 4.4 };
/** Hof vor der Halle – durch die offenen Tore erreichbar. */
export const YARD = { minX: -23, maxX: -4.8, minZ: -9, maxZ: 9 };
export const DOOR_HALF = 1.6;
export const BAY_Z = [-2.7, 2.7];
export const LIFT_HEIGHT = 1.7;
export const EYE = 1.62;
export const REACH = 4.2;
const RADIUS = 0.32;

export interface WorkPose {
  id: string;
  pos: [number, number, number];
  yaw: number;
  pitch: number;
}

export const player = { x: 4.3, z: 0, yaw: Math.PI / 2, pitch: -0.12, zoom: false, work: null as WorkPose | null };

export type WorkView = 'engine' | 'engine_left' | 'engine_right' | 'wheel_left' | 'wheel_right' | 'under';
export const WORK_LABELS: Record<WorkView, string> = {
  engine: 'Motor von vorn',
  engine_left: 'Motor links',
  engine_right: 'Motor rechts',
  wheel_left: 'Rad links',
  wheel_right: 'Rad rechts',
  under: 'Unterboden',
};

/** Feste Arbeitsansicht nah am Bauteil. Der Spieler steht dabei still und kann sich nur umsehen. */
export function workPose(view: WorkView, bay: number): WorkPose {
  const z0 = BAY_Z[bay];
  const h = LIFT_HEIGHT;
  const table: Record<WorkView, [[number, number, number], [number, number, number]]> = {
    engine: [[2.3, 1.5, z0], [1.32, 0.72, z0]],
    engine_left: [[1.42, 1.4, z0 - 1.15], [1.42, 0.62, z0 - 0.28]],
    engine_right: [[1.42, 1.4, z0 + 1.15], [1.42, 0.62, z0 + 0.28]],
    wheel_left: [[1.38, h + 0.42, z0 - 1.85], [1.38, h + 0.36, z0 - 0.8]],
    wheel_right: [[1.38, h + 0.42, z0 + 1.85], [1.38, h + 0.36, z0 + 0.8]],
    under: [[2.25, 1.2, z0], [1.3, h + 0.22, z0]],
  };
  const [pos, to] = table[view];
  const dx = to[0] - pos[0];
  const dz = to[2] - pos[2];
  return { id: `${view}:${bay}`, pos, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(to[1] - pos[1], Math.hypot(dx, dz)) };
}
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

/** Fahrzeuge blockieren nur, solange sie am Boden stehen. Quer geparkte Autos sind entsprechend gedreht. */
export const carBox = (slot: number): Box => {
  const s = SLOTS[slot];
  return Math.abs(s.rot) < 0.1 ? box(s.x, s.z, 4.8, 2.0) : box(s.x, s.z, 2.0, 4.8);
};

/** Stellplatz in Reichweite des Spielers (der nächste), sonst -1. */
export function nearestSlot(x: number, z: number, usable: (slot: number) => boolean): number {
  let best = -1;
  let bestDist = Infinity;
  for (const s of SLOTS) {
    if (!usable(s.id)) continue;
    const b = carBox(s.id);
    const d = Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ));
    if (d < (s.kind === 'lift' ? 2.3 : 1.9) && d < bestDist) {
      bestDist = d;
      best = s.id;
    }
  }
  return best;
}

const hits = (x: number, z: number, b: Box) => x > b.minX - RADIUS && x < b.maxX + RADIUS && z > b.minZ - RADIUS && z < b.maxZ + RADIUS;

/** Darf man hier stehen? Halle, Hof oder eines der beiden offenen Tore. */
function inBounds(x: number, z: number) {
  const inRoom = x > ROOM.minX + RADIUS && x < ROOM.maxX - RADIUS && z > ROOM.minZ + RADIUS && z < ROOM.maxZ - RADIUS;
  const inYard = x > YARD.minX + RADIUS && x < YARD.maxX - RADIUS && z > YARD.minZ + RADIUS && z < YARD.maxZ - RADIUS;
  const inDoor = x >= YARD.maxX - RADIUS - 0.02 && x <= ROOM.minX + RADIUS + 0.02 && BAY_Z.some((d) => Math.abs(z - d) < DOOR_HALF - RADIUS);
  return inRoom || inYard || inDoor;
}

/** Bewegt den Spieler und lässt ihn an Wänden und Hindernissen entlanggleiten. */
export function movePlayer(dx: number, dz: number, dynamic: Box[]) {
  const boxes = [...STATIC_BOXES, ...dynamic];
  const free = (x: number, z: number) => inBounds(x, z) && !boxes.some((b) => hits(x, z, b));
  // Steckt der Spieler (z. B. nach dem Ablassen der Bühne) in einem Hindernis, darf er heraus.
  const stuck = inBounds(player.x, player.z) && boxes.some((b) => hits(player.x, player.z, b));
  if ((stuck && inBounds(player.x + dx, player.z)) || free(player.x + dx, player.z)) player.x += dx;
  if ((stuck && inBounds(player.x, player.z + dz)) || free(player.x, player.z + dz)) player.z += dz;
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
  /** Stellplatz in der Nähe des Spielers (Hebebühne, Hof, Waschplatz …), sonst -1. */
  nearBay: number;
  set(p: Partial<Focus>): void;
}
export const useFocus = create<Focus>((set) => ({ id: null, label: null, nearBay: -1, set: (p) => set(p) }));

/** Aktionen der Stationen – für den „Benutzen“-Knopf im HUD. */
export const stationActions = new Map<string, () => void>();
