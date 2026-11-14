import { create } from 'zustand';
import { SLOTS } from '../game/data/workshop';

// Zustand des Spielers in der begehbaren Werkstatt. Liegt bewusst außerhalb
// von React: Position und Blick ändern sich jeden Frame.

export const ROOM = { minX: -4.8, maxX: 6.4, minZ: -5.6, maxZ: 5.6, height: 4.4 };
/** Hof vor der Halle – durch die offenen Tore erreichbar. */
export const YARD = { minX: -23, maxX: -4.8, minZ: -9, maxZ: 9 };
export const DOOR_HALF = 1.6;
/** Durchgang in den Seitenwänden der Stammhalle zu Halle 2 bzw. zum Showroom. */
export const PASSAGE = { minX: -2.9, maxX: 1.4, height: 2.5 };
/** Halle 2: mit dem Performance-Center um eine Bühne verlängert. */
export const hall2 = (center: boolean) => ({ minX: ROOM.minX, maxX: ROOM.maxX, minZ: center ? -16.4 : -11.0, maxZ: ROOM.minZ });
export const SHOWROOM = { minX: ROOM.minX, maxX: ROOM.maxX, minZ: ROOM.maxZ, maxZ: 14.6 };
/** Schrottplatz: eigener Ort, mit dem Lieferwagen erreichbar. */
export const JUNK = { minX: -78, maxX: -51, minZ: -12, maxZ: 12 };
export type Place = 'werkstatt' | 'schrott';
/** Wo sich der Spieler gerade befindet (Werkstatt mit Hof oder Schrottplatz). */
export const place = { at: 'werkstatt' as Place };
export const usePlace = create<{ at: Place }>(() => ({ at: 'werkstatt' }));
/** Hindernisse auf dem Schrottplatz (Büro, Regale, Container, Kran). */
export const JUNK_BOXES: Box[] = [];
export function travel(to: Place) {
  place.at = to;
  usePlace.setState({ at: to });
  player.work = null;
  if (to === 'schrott') Object.assign(player, { x: -53.2, z: 0, yaw: Math.PI / 2, pitch: -0.1 });
  else Object.assign(player, { x: -19.5, z: 2.2, yaw: -Math.PI / 2, pitch: -0.1 });
}
/** Welche Gebäudeteile es gibt – wird aus den gekauften Standorten gesetzt. */
export const site = { pro: false, center: false, hq: false, hoist: false };
export function setSite(upgrades: string[]) {
  site.pro = upgrades.includes('loc_pro');
  site.center = upgrades.includes('loc_center');
  site.hq = upgrades.includes('loc_hq');
  site.hoist = upgrades.includes('hoist');
}
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

export type WorkView = 'engine' | 'engine_left' | 'engine_right' | 'wheel_left' | 'wheel_right' | 'rear_left' | 'rear_right' | 'under';
export const WORK_LABELS: Record<WorkView, string> = {
  engine: 'Motor von vorn',
  engine_left: 'Motor links',
  engine_right: 'Motor rechts',
  wheel_left: 'Rad vorne links',
  wheel_right: 'Rad vorne rechts',
  rear_left: 'Rad hinten links',
  rear_right: 'Rad hinten rechts',
  under: 'Unterboden',
};

/** Feste Arbeitsansicht nah am Bauteil. Der Spieler steht dabei still und kann sich nur umsehen. */
/**
 * Heckmotor: der Motorraum wird um die Hochachse gedreht hinter die Hinterachse gesetzt (x' = REAR_BAY.x − x, z' = −z)
 * und um REAR_BAY.y abgesenkt.
 */
export const REAR_BAY = { x: 0.19, y: -0.1 };

/** `rearX`: Lage der Hinterachse des Autos (je Karosserie verschieden). */
export function workPose(view: WorkView, bay: number, rearX = -1.38, hoodFront = false, rearEngine = false): WorkPose {
  const z0 = SLOTS[bay].z;
  const h = LIFT_HEIGHT;
  const table: Record<WorkView, [[number, number, number], [number, number, number]]> = {
    // Vorn angeschlagene Haube steht vor dem Auto: dann von der Scheibe her von oben in den Motorraum
    engine: hoodFront ? [[0.5, 1.75, z0], [1.42, 0.7, z0]] : [[2.3, 1.5, z0], [1.32, 0.72, z0]],
    engine_left: [[1.42, 1.4, z0 - 1.15], [1.42, 0.62, z0 - 0.28]],
    engine_right: [[1.42, 1.4, z0 + 1.15], [1.42, 0.62, z0 + 0.28]],
    wheel_left: [[1.38, h + 0.42, z0 - 1.85], [1.38, h + 0.36, z0 - 0.8]],
    wheel_right: [[1.38, h + 0.42, z0 + 1.85], [1.38, h + 0.36, z0 + 0.8]],
    rear_left: [[rearX, h + 0.42, z0 - 1.85], [rearX, h + 0.36, z0 - 0.8]],
    rear_right: [[rearX, h + 0.42, z0 + 1.85], [rearX, h + 0.36, z0 + 0.8]],
    under: [[2.25, 1.2, z0], [1.3, h + 0.22, z0]],
  };
  let [pos, to] = table[view];
  // Heckmotor: Motoransichten gespiegelt nach hinten (Blick von hinten bzw. von den Seiten auf den Motor), Unterboden ebenso
  if (rearEngine && (view.startsWith('engine') || view === 'under')) {
    const m = (p: [number, number, number]): [number, number, number] => [REAR_BAY.x - p[0], p[1] + (view === 'under' ? 0 : REAR_BAY.y), z0 - (p[2] - z0)];
    [pos, to] = [m(pos), m(to)];
    if (view === 'engine') [pos, to] = [[REAR_BAY.x - 2.45, 1.45, z0], [REAR_BAY.x - 1.3, 0.62, z0]];
  }
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
  box(-3.65, 5.1, 0.7, 0.7), // zweites Ölfass
  box(-3.0, 5.2, 0.6, 0.7), // Kanister
  box(5.2, -5.15, 1.5, 0.6), // Rangierwagenheber
  box(3.1, -0.55, 1.3, 0.9), // Motorständer
  ...BAY_Z.flatMap((z) => [box(0, z - 1.5, 0.3, 0.36), box(0, z + 1.5, 0.3, 0.36)]),
];

/** Hindernisse der zugekauften Gebäudeteile: Säulen der Bühnen 3 und 4, Einrichtung. */
function siteBoxes(): Box[] {
  const out: Box[] = [];
  for (const s of SLOTS) {
    if (s.kind !== 'lift' || s.id < 10 || !(s.needs === 'loc_pro' ? site.pro : site.center)) continue;
    out.push(box(0, s.z - 1.5, 0.3, 0.36), box(0, s.z + 1.5, 0.3, 0.36));
  }
  if (site.pro) out.push(box(5.7, -8.1, 0.7, 1.1), box(5.9, 1.3, 0.6, 0.5));
  else out.push(box(-3.4, -5.2, 0.8, 0.6)); // Unterstellböcke vor der geschlossenen Seitenwand
  if (site.center) out.push(box(5.8, -13.6, 0.6, 0.8));
  if (site.hq) out.push(box(5.6, 6.6, 1.0, 1.6));
  if (site.hoist) out.push(box(5.75, 4.95, 1.1, 0.9));
  return out;
}

/** Fahrzeuge blockieren nur, solange sie am Boden stehen. Quer geparkte Autos sind entsprechend gedreht. */
export const carBox = (slot: number): Box => {
  const s = SLOTS[slot];
  if (s.kind === 'stand') return box(s.x, s.z, 1.3, 0.9);
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
  if (place.at === 'schrott') return x > JUNK.minX + RADIUS && x < JUNK.maxX - RADIUS && z > JUNK.minZ + RADIUS && z < JUNK.maxZ - RADIUS;
  const inRoom = x > ROOM.minX + RADIUS && x < ROOM.maxX - RADIUS && z > ROOM.minZ + RADIUS && z < ROOM.maxZ - RADIUS;
  const inYard = x > YARD.minX + RADIUS && x < YARD.maxX - RADIUS && z > YARD.minZ + RADIUS && z < YARD.maxZ - RADIUS;
  const inDoor = x >= YARD.maxX - RADIUS - 0.02 && x <= ROOM.minX + RADIUS + 0.02 && BAY_Z.some((d) => Math.abs(z - d) < DOOR_HALF - RADIUS);
  if (inRoom || inYard || inDoor) return true;
  const inPassage = x > PASSAGE.minX + RADIUS && x < PASSAGE.maxX - RADIUS;
  const inX = x > ROOM.minX + RADIUS && x < ROOM.maxX - RADIUS;
  if (site.pro) {
    const h = hall2(site.center);
    if (inX && z > h.minZ + RADIUS && z < h.maxZ - RADIUS) return true;
    if (inPassage && Math.abs(z - ROOM.minZ) <= RADIUS + 0.02) return true;
  }
  if (site.hq) {
    if (inX && z > SHOWROOM.minZ + RADIUS && z < SHOWROOM.maxZ - RADIUS) return true;
    if (inPassage && Math.abs(z - ROOM.maxZ) <= RADIUS + 0.02) return true;
  }
  return false;
}

/** Bewegt den Spieler und lässt ihn an Wänden und Hindernissen entlanggleiten. */
export function movePlayer(dx: number, dz: number, dynamic: Box[]) {
  const boxes = place.at === 'schrott' ? [...JUNK_BOXES, ...dynamic] : [...STATIC_BOXES, ...siteBoxes(), ...dynamic];
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
