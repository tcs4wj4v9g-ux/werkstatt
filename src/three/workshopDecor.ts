import * as THREE from 'three';
import { Mesher, type V3 } from './mesher';
import { ROOM } from './player';

// Zusätzliche Ausstattung der Werkstatt als verschmolzene Netze (ein Zeichenaufruf je Materialgruppe).

export const DECO = { steelDark: 0, galv: 1, yellow: 2, red: 3, blue: 4, black: 5, wood: 6, white: 7, green: 8, chrome: 9 } as const;
let mats: THREE.Material[] | null = null;
export function decoMaterials() {
  if (!mats) {
    const m = (color: string, metalness: number, roughness: number) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
    mats = [];
    mats[DECO.steelDark] = m('#3a4048', 0.6, 0.5);
    mats[DECO.galv] = m('#b3b8be', 0.85, 0.38);
    mats[DECO.yellow] = m('#e3a81c', 0.35, 0.5);
    mats[DECO.red] = m('#b3261e', 0.4, 0.45);
    mats[DECO.blue] = m('#1f5f9c', 0.4, 0.5);
    mats[DECO.black] = m('#141517', 0.1, 0.9);
    mats[DECO.wood] = m('#a9825a', 0, 0.9);
    mats[DECO.white] = m('#eceae2', 0, 0.6);
    mats[DECO.green] = m('#2f6b3a', 0.3, 0.55);
    mats[DECO.chrome] = m('#dfe3e8', 1, 0.2);
  }
  return mats;
}

const X90: V3 = [Math.PI / 2, 0, 0];
const Z90: V3 = [0, 0, Math.PI / 2];
const cache = new Map<string, THREE.BufferGeometry>();

/** Ölfass mit Sicken und Deckel. */
function drum(m: Mesher, slot: number, x: number, z: number) {
  m.cyl(slot, 0.29, 0.29, 0.88, [x, 0.44, z], undefined, 18);
  for (const y of [0.02, 0.3, 0.6, 0.87]) m.torus(slot, 0.29, 0.012, [x, y, z], X90, 18);
  m.cyl(DECO.steelDark, 0.28, 0.28, 0.02, [x, 0.885, z], undefined, 18);
  m.cyl(DECO.galv, 0.03, 0.03, 0.03, [x + 0.15, 0.905, z], undefined, 8);
}

/** Unterstellbock. */
function jackStand(m: Mesher, x: number, z: number) {
  for (let i = 0; i < 3; i++) m.box(DECO.red, [0.03, 0.34, 0.03], [x + Math.cos(i * 2.094) * 0.1, 0.16, z + Math.sin(i * 2.094) * 0.1], [Math.sin(i * 2.094) * 0.32, 0, -Math.cos(i * 2.094) * 0.32]);
  m.cyl(DECO.galv, 0.022, 0.022, 0.3, [x, 0.36, z], undefined, 8);
  m.box(DECO.galv, [0.1, 0.03, 0.05], [x, 0.52, z]);
  m.torus(DECO.red, 0.14, 0.012, [x, 0.02, z], X90, 12);
}

/** Abgasabsaugung über einer Bühne: Trommel an der Decke mit Schlauch. */
function exhaustReel(m: Mesher, x: number, z: number) {
  const H = ROOM.height;
  m.cyl(DECO.steelDark, 0.26, 0.26, 0.22, [x, H - 0.42, z], Z90, 16);
  m.cyl(DECO.yellow, 0.3, 0.3, 0.02, [x - 0.12, H - 0.42, z], Z90, 16);
  m.cyl(DECO.yellow, 0.3, 0.3, 0.02, [x + 0.12, H - 0.42, z], Z90, 16);
  m.box(DECO.steelDark, [0.06, 0.2, 0.06], [x, H - 0.1, z]);
  m.tube(DECO.black, [[x, H - 0.66, z + 0.1], [x, H - 0.95, z + 0.16], [x + 0.03, H - 1.12, z + 0.12]], 0.05, 7);
  m.cyl(DECO.galv, 0.062, 0.05, 0.1, [x + 0.035, H - 1.17, z + 0.11], undefined, 10);
}

/**
 * Ausstattung der Stammhalle. `tier` 0…3 = Ausbaustufe des Standorts: größere Betriebe
 * sind aufgeräumter und besser ausgestattet. `north`/`south` = Seitenwand ist geschlossen.
 */
export function hallDecor(tier: number, north: boolean, south: boolean, rich: boolean) {
  const key = `hall${tier}${+north}${+south}${+rich}`;
  let g = cache.get(key);
  if (g) return g;
  const m = new Mesher(10);
  const { minX, maxX, minZ, maxZ, height: H } = ROOM;
  const W = maxX - minX;
  const CX = (maxX + minX) / 2;

  // ---- Decke: Kabelpritschen, Lüftungsrohr, Abgasabsaugung ----
  for (const z of [-4.95, 4.95]) {
    m.box(DECO.galv, [W - 0.6, 0.02, 0.26], [CX, H - 0.52, z]);
    for (const s of [-1, 1]) m.box(DECO.galv, [W - 0.6, 0.06, 0.012], [CX, H - 0.5, z + s * 0.13]);
    for (let x = minX + 1; x < maxX; x += 2.4) m.box(DECO.steelDark, [0.02, 0.5, 0.02], [x, H - 0.27, z]);
    if (rich) for (const dz of [-0.07, 0, 0.07]) m.cyl(DECO.black, 0.014, 0.014, W - 0.8, [CX, H - 0.5, z + dz], Z90, 5);
  }
  m.cyl(DECO.galv, 0.2, 0.2, 9.6, [4.9, H - 0.36, 0], X90, 14);
  for (let z = -4.2; z <= 4.3; z += 1.4) m.torus(DECO.galv, 0.2, 0.014, [4.9, H - 0.36, z], undefined, 14);
  for (const z of [-3, 0, 3]) m.box(DECO.white, [0.34, 0.05, 0.34], [4.9, H - 0.6, z]);
  for (const z of [-2.7, 2.7]) exhaustReel(m, -2.9, z);

  // ---- Ostwand: Sicherungskasten, Verbandkasten, Leitungen ----
  m.rbox(DECO.galv, [0.12, 0.72, 0.5], 0.01, [maxX - 0.07, 1.65, 1.22]);
  m.box(DECO.steelDark, [0.01, 0.66, 0.44], [maxX - 0.135, 1.65, 1.22]);
  m.rbox(DECO.red, [0.03, 0.07, 0.05], 0.008, [maxX - 0.15, 1.75, 1.36]);
  m.cyl(DECO.galv, 0.016, 0.016, H - 2.02, [maxX - 0.05, (H + 2.02) / 2, 1.22], undefined, 6);
  m.cyl(DECO.galv, 0.016, 0.016, 10.4, [maxX - 0.05, H - 0.7, 0], X90, 6);
  m.rbox(DECO.green, [0.1, 0.26, 0.34], 0.012, [maxX - 0.06, 1.9, -0.98]);
  m.box(DECO.white, [0.012, 0.14, 0.04], [maxX - 0.115, 1.9, -0.98]);
  m.box(DECO.white, [0.012, 0.04, 0.14], [maxX - 0.115, 1.9, -0.98]);

  // ---- Druckluftleitung von Kompressor, Schlauchaufroller ----
  if (north) {
    m.cyl(DECO.blue, 0.018, 0.018, 9.6, [CX + 0.3, 2.62, minZ + 0.06], Z90, 6);
    m.cyl(DECO.blue, 0.018, 0.018, 1.75, [-4.25, 1.75, minZ + 0.06], undefined, 6);
    for (const x of [-1.9, 1.75]) {
      m.cyl(DECO.blue, 0.016, 0.016, 0.5, [x, 2.37, minZ + 0.06], undefined, 6);
      m.cyl(DECO.steelDark, 0.2, 0.2, 0.09, [x, 1.98, minZ + 0.12], X90, 16);
      m.cyl(DECO.red, 0.215, 0.215, 0.014, [x, 1.98, minZ + 0.172], X90, 16);
      m.cyl(DECO.red, 0.215, 0.215, 0.014, [x, 1.98, minZ + 0.07], X90, 16);
      m.tube(DECO.yellow, [[x + 0.17, 1.9, minZ + 0.12], [x + 0.2, 1.6, minZ + 0.13], [x + 0.19, 1.38, minZ + 0.12]], 0.012, 5);
      m.cyl(DECO.chrome, 0.014, 0.014, 0.07, [x + 0.19, 1.33, minZ + 0.12], undefined, 6);
    }
    // Reifenregal an der Wand
    for (const y of [2.05, 3.0]) {
      for (const dz of [0.12, 0.44]) m.cyl(DECO.steelDark, 0.02, 0.02, 1.5, [-3.8, y - 0.26, minZ + dz], Z90, 6);
      for (let i = 0; i < 5; i++) m.torus(DECO.black, 0.2, 0.105, [-4.38 + i * 0.29, y, minZ + 0.3], [0, Math.PI / 2, 0.06 * (i % 2 ? 1 : -1)], 16);
    }
    for (const x of [-4.52, -3.08]) m.box(DECO.steelDark, [0.04, 1.6, 0.04], [x, 2.5, minZ + 0.04]);
    // Unterstellböcke darunter
    jackStand(m, -3.55, minZ + 0.38);
    jackStand(m, -3.2, minZ + 0.36);
  }
  // Rangierwagenheber in der Ecke neben der Werkbank
  {
    const x = 5.35;
    const z = minZ + 0.45;
    m.rbox(DECO.red, [0.72, 0.1, 0.26], 0.02, [x, 0.12, z]);
    m.rbox(DECO.red, [0.3, 0.07, 0.2], 0.02, [x + 0.12, 0.2, z], [0, 0, 0.25]);
    m.cyl(DECO.steelDark, 0.06, 0.06, 0.03, [x + 0.26, 0.265, z], undefined, 12);
    for (const s of [-1, 1]) {
      m.cyl(DECO.black, 0.045, 0.045, 0.03, [x + 0.3, 0.045, z + s * 0.14], X90, 10);
      m.cyl(DECO.black, 0.03, 0.03, 0.03, [x - 0.32, 0.03, z + s * 0.12], X90, 8);
    }
    m.cyl(DECO.steelDark, 0.016, 0.016, 0.95, [x - 0.62, 0.52, z], [0, 0, 0.5], 6);
    m.cyl(DECO.black, 0.022, 0.022, 0.16, [x - 0.83, 0.9, z], [0, 0, 0.5], 6);
  }
  // ---- Altöl-Ecke: zweites Fass mit Trichter, Kanister, Ölbindemittel ----
  if (south) {
    drum(m, DECO.green, -3.65, maxZ - 0.5);
    m.cyl(DECO.yellow, 0.16, 0.03, 0.14, [-3.65, 0.98, maxZ - 0.5], undefined, 12, true);
    m.rbox(DECO.yellow, [0.16, 0.3, 0.24], 0.03, [-3.14, 0.15, maxZ - 0.3]);
    m.rbox(DECO.blue, [0.16, 0.3, 0.24], 0.03, [-2.96, 0.15, maxZ - 0.32], [0, 0.2, 0]);
    m.rbox(DECO.wood, [0.36, 0.14, 0.26], 0.03, [-3.06, 0.07, maxZ - 0.66], [0, -0.3, 0]);
  }
  // ---- Auf der Werkbank und am Schreibtisch ----
  m.cyl(DECO.galv, 0.13, 0.13, 0.025, [5.85, 0.95, -3.9], undefined, 20);
  m.cyl(DECO.steelDark, 0.07, 0.07, 0.05, [5.85, 0.965, -3.9], undefined, 14);
  for (const [dx, dz, slot] of [[0, 0, DECO.red], [0.09, 0.05, DECO.blue], [0.02, 0.11, DECO.black]] as const) m.cyl(slot, 0.03, 0.03, 0.17, [6.15 + dx - 0.1, 1.02, -2.2 + dz], undefined, 8);
  m.rbox(DECO.steelDark, [0.24, 0.16, 0.2], 0.02, [6.1, 1.015, -1.9]);
  m.box(DECO.yellow, [0.01, 0.07, 0.12], [5.977, 1.03, -1.9]);
  m.rbox(DECO.white, [0.2, 0.012, 0.28], 0.004, [5.75, 0.945, -2.6], [0, 0.3, 0]);
  // Kartons unter dem Wandregal und neben dem Schreibtisch
  m.rbox(DECO.wood, [0.5, 0.36, 0.38], 0.01, [2.5, 0.18, minZ + 0.32]);
  m.rbox(DECO.wood, [0.42, 0.3, 0.34], 0.01, [3.15, 0.15, minZ + 0.3], [0, 0.15, 0]);
  m.rbox(DECO.wood, [0.36, 0.26, 0.3], 0.01, [2.55, 0.49, minZ + 0.3], [0, -0.2, 0]);

  // ---- Größere Standorte ----
  if (tier >= 1) {
    // Werkstattwagen und Werkzeugwand
    m.rbox(DECO.blue, [0.5, 0.75, 0.42], 0.02, [5.9, 0.5, 1.3]);
    for (const y of [0.3, 0.48, 0.66]) m.box(DECO.chrome, [0.01, 0.02, 0.3], [5.645, y, 1.3]);
    m.rbox(DECO.steelDark, [0.54, 0.03, 0.46], 0.01, [5.9, 0.89, 1.3]);
    for (const s of [-1, 1]) for (const t of [-1, 1]) m.cyl(DECO.black, 0.045, 0.045, 0.03, [5.9 + s * 0.2, 0.05, 1.3 + t * 0.16], X90, 8);
  }
  if (tier >= 2) {
    // Schlauchtrommeln für Öl und Wasser an der Decke über dem Gang
    for (const z of [-1.2, 1.2]) {
      m.cyl(DECO.steelDark, 0.16, 0.16, 0.12, [3.3, H - 0.5, z], X90, 14);
      m.cyl(z < 0 ? DECO.blue : DECO.green, 0.18, 0.18, 0.015, [3.3, H - 0.5, z + 0.07], X90, 14);
      m.cyl(DECO.black, 0.012, 0.012, 0.7, [3.42, H - 0.95, z], undefined, 5);
      m.cyl(DECO.chrome, 0.02, 0.012, 0.1, [3.42, H - 1.34, z], undefined, 6);
    }
  }
  g = m.build();
  cache.set(key, g);
  return g;
}

/** Zwei-Säulen-Hebebühne: feststehender Teil (Säulen, Fußplatten, Quertraverse, Aggregat). `inner` = Seite des Bedienkastens. */
export function liftFrame(inner: number) {
  const key = `lift${inner}`;
  let g = cache.get(key);
  if (g) return g;
  const m = new Mesher(10);
  for (const o of [-1.5, 1.5]) {
    const s = Math.sign(o);
    // Säule als U-Profil: Rückwand und zwei Flansche, innen die Führungsschiene
    m.box(DECO.yellow, [0.26, 3.9, 0.05], [0, 1.95, o + s * 0.14]);
    for (const k of [-1, 1]) m.box(DECO.yellow, [0.05, 3.9, 0.3], [k * 0.105, 1.95, o]);
    m.box(DECO.steelDark, [0.14, 3.7, 0.03], [0, 1.95, o + s * 0.1]);
    m.box(DECO.chrome, [0.04, 3.5, 0.02], [0, 1.95, o - s * 0.02]);
    // Fußplatte mit Ankerbolzen
    m.rbox(DECO.steelDark, [0.62, 0.035, 0.52], 0.008, [0, 0.018, o]);
    for (const dx of [-0.25, 0.25]) for (const dz of [-0.2, 0.2]) m.cyl(DECO.galv, 0.018, 0.018, 0.03, [dx, 0.045, o + dz], undefined, 6);
    // Versteifungsbleche
    for (const k of [-1, 1]) m.box(DECO.yellow, [0.16, 0.22, 0.012], [k * 0.2, 0.14, o + s * 0.1], [0, 0, k * 0.5]);
    // Warnmarkierung am Säulenfuß
    for (let i = 0; i < 4; i++) m.box(DECO.black, [0.262, 0.06, 0.004], [0, 0.3 + i * 0.13, o - s * 0.152]);
    // Sicherheitsklinke und Seilrolle oben
    m.rbox(DECO.red, [0.05, 0.14, 0.05], 0.01, [0.16, 1.5, o - s * 0.05]);
    m.cyl(DECO.galv, 0.07, 0.07, 0.03, [0, 3.78, o - s * 0.06], Z90, 12);
    // Stahlseil
    m.cyl(DECO.galv, 0.006, 0.006, 3.5, [0.03, 2.0, o - s * 0.06], undefined, 4);
  }
  // Quertraverse mit Abschaltbügel
  m.box(DECO.yellow, [0.18, 0.12, 3.34], [0, 3.86, 0]);
  m.box(DECO.steelDark, [0.1, 0.03, 3.0], [0, 3.78, 0]);
  m.cyl(DECO.red, 0.014, 0.014, 2.6, [0.12, 3.74, 0], [Math.PI / 2, 0, 0], 5);
  // Hydraulikaggregat an der Säule mit dem Bedienkasten
  const zi = inner * 1.5;
  m.rbox(DECO.steelDark, [0.2, 0.34, 0.22], 0.02, [0.02, 2.05, zi - inner * 0.27]);
  m.cyl(DECO.blue, 0.085, 0.085, 0.26, [0.02, 2.37, zi - inner * 0.27], undefined, 12);
  m.cyl(DECO.steelDark, 0.09, 0.09, 0.03, [0.02, 2.5, zi - inner * 0.27], undefined, 12);
  m.tube(DECO.black, [[0.02, 1.9, zi - inner * 0.27], [0.08, 1.4, zi - inner * 0.22], [0.06, 0.5, zi - inner * 0.18]], 0.012, 5);
  g = m.build();
  cache.set(key, g);
  return g;
}

/** Beweglicher Teil der Hebebühne: Schlitten und vier Tragarme mit Gummitellern (Ursprung = Boden). */
export function liftCarriage() {
  const key = 'carriage';
  let g = cache.get(key);
  if (g) return g;
  const m = new Mesher(10);
  for (const o of [-1.5, 1.5]) {
    const s = Math.sign(o);
    m.rbox(DECO.steelDark, [0.3, 0.34, 0.2], 0.02, [0, 0.22, o - s * 0.1]);
    for (const k of [-1, 1]) {
      const a = k * s * 0.5;
      const c: V3 = [k * 0.55, 0.14, o - s * 0.42];
      // Zweiteiliger Teleskoparm
      m.rbox(DECO.yellow, [1.0, 0.075, 0.13], 0.012, [c[0] - k * 0.12 * Math.cos(a), c[1], c[2] + k * 0.12 * Math.sin(a)], [0, a, 0]);
      m.rbox(DECO.steelDark, [0.5, 0.055, 0.1], 0.01, [c[0] + k * 0.36 * Math.cos(a), c[1], c[2] - k * 0.36 * Math.sin(a)], [0, a, 0]);
      const tip: V3 = [c[0] + k * 0.56 * Math.cos(a), 0, c[2] - k * 0.56 * Math.sin(a)];
      m.cyl(DECO.galv, 0.03, 0.03, 0.06, [tip[0], 0.19, tip[2]], undefined, 8);
      m.cyl(DECO.black, 0.07, 0.075, 0.035, [tip[0], 0.238, tip[2]], undefined, 14);
      // Gelenkbolzen am Schlitten
      m.cyl(DECO.galv, 0.03, 0.03, 0.12, [k * 0.1, 0.14, o - s * 0.2], undefined, 8);
    }
  }
  g = m.build();
  cache.set(key, g);
  return g;
}
