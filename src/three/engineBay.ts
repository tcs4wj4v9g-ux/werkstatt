import * as THREE from 'three';
import { cylinderSlots, isV, type EngineDef } from '../game/data/engines';
import { mat, Mesher, type V3 } from './mesher';

// Feste, nicht ausbaubare Teile des Motorraums – je Motorbauart ein verschmolzenes Netz.
// Alles, was man aus- und einbauen kann, bleibt als Einzelteil im Automodell.

/** Neigung der Zylinderbänke eines V-Motors gegenüber der Senkrechten (Bogenmaß) und Drehpunkt (Höhe). */
export const V_TILT = 0.2;
export const V_PIVOT = 0.62;

export const BAY = { alu: 0, plastic: 1, steel: 2, rubber: 3, iron: 4, painted: 5, core: 6, yellow: 7 } as const;

let mats: THREE.Material[] | null = null;
export function bayMaterials() {
  if (!mats) {
    mats = [];
    mats[BAY.alu] = new THREE.MeshStandardMaterial({ color: '#8d939a', metalness: 0.75, roughness: 0.48 });
    mats[BAY.plastic] = new THREE.MeshStandardMaterial({ color: '#17181b', roughness: 0.62 });
    mats[BAY.steel] = new THREE.MeshStandardMaterial({ color: '#cfd3d8', metalness: 0.95, roughness: 0.24 });
    mats[BAY.rubber] = new THREE.MeshStandardMaterial({ color: '#0d0d0f', roughness: 0.92 });
    mats[BAY.iron] = new THREE.MeshStandardMaterial({ color: '#5f4c40', metalness: 0.55, roughness: 0.78 });
    mats[BAY.painted] = new THREE.MeshStandardMaterial({ color: '#26282c', metalness: 0.5, roughness: 0.55 });
    mats[BAY.core] = new THREE.MeshStandardMaterial({ color: '#1c1e21', metalness: 0.85, roughness: 0.42 });
    mats[BAY.yellow] = new THREE.MeshStandardMaterial({ color: '#e3b21c', roughness: 0.5 });
  }
  return mats;
}

const cache = new Map<string, THREE.BufferGeometry>();
const Z90: V3 = [0, 0, Math.PI / 2];

export function engineDecor(e: EngineDef, detail: number) {
  const key = `${e.layout}${e.fuel}${+!!e.turbo}${detail}`;
  let g = cache.get(key);
  if (g) return g;
  const m = new Mesher(8);
  const vee = isV(e);
  const diesel = e.fuel === 'diesel';
  const wide = vee ? 0.05 : 0;
  const slots = cylinderSlots(e);
  const xs = [...new Set(slots.map((s) => s.x))];
  const seg = detail ? 14 : 8;

  // ---- Vorderwagen: Längsträger, Federbeindome, Spritzwand, Schlossträger ----
  for (const s of [-1, 1]) {
    m.rbox(BAY.painted, [1.12, 0.05, 0.07], 0.015, [1.4, 0.84, s * 0.745]);
    m.sphere(BAY.painted, 0.092, [1.38, 0.772, s * 0.655], [1, 0.82, 1], detail ? 14 : 8);
    m.cyl(BAY.steel, 0.05, 0.055, 0.012, [1.38, 0.85, s * 0.655], undefined, seg);
    for (let i = 0; i < 3; i++) m.cyl(BAY.steel, 0.009, 0.009, 0.014, [1.38 + Math.cos(i * 2.1) * 0.038, 0.858, s * 0.655 + Math.sin(i * 2.1) * 0.038], undefined, 6);
    m.cyl(BAY.rubber, 0.022, 0.022, 0.016, [1.38, 0.86, s * 0.655], undefined, 8);
  }
  m.rbox(BAY.plastic, [0.02, 0.3, 1.16], 0.008, [0.815, 0.68, 0]);
  m.tube(BAY.rubber, [[0.835, 0.8, -0.52], [0.845, 0.815, -0.2], [0.845, 0.81, 0.2], [0.86, 0.75, 0.4]], 0.012, 5);
  m.rbox(BAY.plastic, [0.1, 0.07, 0.2], 0.012, [0.875, 0.735, 0.12]);
  m.box(BAY.painted, [0.085, 0.004, 0.17], [0.875, 0.772, 0.12]);
  // Bremskraftverstärker und Hauptbremszylinder unter dem Bremsflüssigkeitsbehälter
  m.cyl(BAY.painted, 0.115, 0.115, 0.07, [0.848, 0.655, -0.46], Z90, detail ? 20 : 12);
  m.cyl(BAY.alu, 0.03, 0.03, 0.13, [0.94, 0.655, -0.46], Z90, 10);
  for (const dz of [-0.015, 0.015]) m.tube(BAY.steel, [[0.99, 0.645, -0.46 + dz], [1.04, 0.56, -0.56 + dz], [1.2, 0.47, -0.62 + dz]], 0.005, 4);
  // Kühlerpaket: Netz, Wasserkästen, Lüfterzarge mit Lüfter, Schlossträger mit Haubenschloss
  m.box(BAY.core, [0.035, 0.36, 1.0], [1.957, 0.59, 0]);
  for (const s of [-1, 1]) m.rbox(BAY.plastic, [0.05, 0.37, 0.06], 0.015, [1.957, 0.59, s * 0.53]);
  m.rbox(BAY.plastic, [0.025, 0.34, 0.66], 0.01, [1.92, 0.59, 0]);
  m.torus(BAY.plastic, 0.15, 0.012, [1.905, 0.59, 0], [0, Math.PI / 2, 0], detail ? 20 : 12);
  m.cyl(BAY.painted, 0.04, 0.04, 0.03, [1.9, 0.59, 0], Z90, 10);
  for (let i = 0; i < 7; i++) m.box(BAY.rubber, [0.006, 0.105, 0.045], [1.9, 0.59 + Math.cos((i / 7) * 6.283) * 0.092, Math.sin((i / 7) * 6.283) * 0.092], [-(i / 7) * 6.283, 0.3, 0]);
  m.rbox(BAY.painted, [0.075, 0.035, 1.3], 0.01, [1.975, 0.805, 0]);
  m.rbox(BAY.steel, [0.05, 0.03, 0.06], 0.006, [1.975, 0.828, 0]);
  m.cyl(BAY.steel, 0.026, 0.03, 0.02, [1.957, 0.782, -0.4], undefined, 10);
  // Kühlerschläuche (der obere schließt an den ausbaubaren Schlauch an)
  m.tube(BAY.rubber, [[1.79, 0.69, -0.45], [1.87, 0.715, -0.45], [1.935, 0.735, -0.43]], 0.03, 7);
  m.tube(BAY.rubber, [[1.63, 0.5, -0.36], [1.76, 0.45, -0.42], [1.935, 0.45, -0.43]], 0.027, 7);
  // Heizungsschläuche zur Spritzwand
  for (const dz of [0, 0.05]) m.tube(BAY.rubber, [[0.96, 0.6, -0.12 - dz - wide], [0.9, 0.66, -0.2 - dz], [0.83, 0.7, -0.22 - dz]], 0.014, 5);

  // ---- Luftfilterkasten mit Ansaugschnorchel ----
  m.rbox(BAY.plastic, [0.3, 0.085, 0.2], 0.02, [1.28, 0.563, 0.44]);
  m.rbox(BAY.plastic, [0.31, 0.075, 0.21], 0.025, [1.28, 0.645, 0.44]);
  for (const dx of [-0.09, -0.03, 0.03, 0.09]) m.rbox(BAY.plastic, [0.025, 0.012, 0.17], 0.005, [1.28 + dx, 0.686, 0.44]);
  for (const dx of [-0.11, 0.11]) m.box(BAY.steel, [0.02, 0.035, 0.008], [1.28 + dx, 0.61, 0.545]);
  m.tube(BAY.plastic, [[1.43, 0.6, 0.47], [1.58, 0.585, 0.6], [1.76, 0.57, 0.66], [1.93, 0.56, 0.62]], 0.034, 7);

  // ---- Motorblock ----
  const blockColor = BAY.alu;
  if (vee) {
    // V-förmiger Block: Kurbelgehäuse unten, zwei geneigte Zylinderbänke
    const sh = new THREE.Shape();
    const pts: [number, number][] = [[-0.15, 0.43], [0.15, 0.43], [0.245, 0.545], [0.235, 0.585], [0.035, 0.625], [0, 0.6], [-0.035, 0.625], [-0.235, 0.585], [-0.245, 0.545]];
    pts.forEach(([z, y], i) => (i ? sh.lineTo(z, y) : sh.moveTo(z, y)));
    m.add(blockColor, new THREE.ExtrudeGeometry(sh, { depth: 0.7, bevelEnabled: false }), mat([0.95, 0, 0], [0, Math.PI / 2, 0]));
    // Ansaugbrücke im V mit Saugrohren zu beiden Bänken
    m.rbox(diesel ? BAY.alu : BAY.plastic, [0.6, 0.075, 0.085], 0.03, [1.3, 0.685, 0], undefined, 3);
    for (const x of xs) for (const s of [-1, 1]) m.tube(diesel ? BAY.alu : BAY.plastic, [[x, 0.705, s * 0.02], [x, 0.71, s * 0.055], [x, 0.685, s * 0.08]], 0.02, 5);
    m.cyl(BAY.alu, 0.036, 0.036, 0.05, [1.625, 0.69, 0], Z90, 10);
    // Abgaskrümmer an beiden Bänken
    for (const s of [-1, 1]) {
      for (const x of xs) m.tube(BAY.iron, [[x, 0.545, s * 0.24], [x - 0.02, 0.5, s * 0.285], [x - 0.06, 0.47, s * 0.3]], 0.019, 5);
      m.tube(BAY.iron, [[xs[xs.length - 1] - 0.04, 0.47, s * 0.3], [xs[0] - 0.06, 0.46, s * 0.3], [0.9, 0.36, s * 0.26], [0.78, 0.27, s * 0.22]], 0.03, 6);
    }
  } else {
    m.rbox(blockColor, [0.7, 0.17, 0.36], 0.015, [1.3, 0.535, 0]);
    // Verstärkungsrippen und Froststopfen
    for (const s of [-1, 1]) {
      for (const x of [1.05, 1.22, 1.39, 1.56]) m.box(blockColor, [0.015, 0.13, 0.012], [x, 0.53, s * 0.184]);
      m.box(blockColor, [0.66, 0.014, 0.012], [1.3, 0.5, s * 0.184]);
    }
    // Saugrohr auf der Ansaugseite: Sammler mit einem Rohr je Zylinder
    const plast = diesel ? BAY.alu : BAY.plastic;
    m.rbox(plast, [Math.min(0.5, xs.length * 0.11 + 0.06), 0.07, 0.075], 0.03, [1.215, 0.548, 0.262], undefined, 3);
    for (const x of xs) {
      const xr = 0.98 + ((x - xs[0]) / (xs[xs.length - 1] - xs[0])) * 0.47;
      m.tube(plast, [[x, 0.63, 0.182], [(x + xr) / 2, 0.615, 0.235], [xr, 0.575, 0.262]], 0.021, 5);
    }
    // Abgaskrümmer auf der Gegenseite, darunter das Hosenrohr
    for (const x of xs) m.tube(BAY.iron, [[x, 0.505, -0.18], [x - 0.015, 0.47, -0.235], [x - 0.05, 0.43, -0.26]], 0.02, 5);
    m.tube(BAY.iron, [[xs[xs.length - 1] - 0.04, 0.43, -0.26], [xs[0] - 0.05, 0.425, -0.26], [0.9, 0.34, -0.24], [0.78, 0.27, -0.2]], 0.032, 6);
  }
  // Kurbelgehäuse-Unterteil, Steuergehäusedeckel, Schwingungsdämpfer, Motorlager
  m.rbox(BAY.painted, [0.66, 0.09, 0.32], 0.012, [1.3, 0.405, 0]);
  m.rbox(BAY.alu, [0.03, 0.25, 0.3 + wide * 2], 0.012, [1.662, 0.55, 0]);
  m.cyl(BAY.painted, 0.07, 0.07, 0.028, [1.69, 0.5, 0], Z90, detail ? 20 : 12);
  m.cyl(BAY.steel, 0.03, 0.03, 0.036, [1.692, 0.5, 0], Z90, 10);
  m.cyl(BAY.steel, 0.012, 0.012, 0.044, [1.694, 0.5, 0], Z90, 6);
  for (const s of [-1, 1]) {
    m.rbox(BAY.painted, [0.11, 0.04, 0.13], 0.01, [1.3, 0.47, s * (0.235 + wide)]);
    m.cyl(BAY.rubber, 0.04, 0.045, 0.05, [1.3, 0.43, s * (0.28 + wide)], undefined, 10);
  }
  // Klimakompressor mit Leitungen
  m.cyl(BAY.alu, 0.052, 0.052, 0.14, [1.58, 0.435, 0.25 + wide], Z90, seg);
  m.cyl(BAY.painted, 0.05, 0.05, 0.022, [1.69, 0.435, 0.25 + wide], Z90, seg);
  m.tube(BAY.steel, [[1.5, 0.46, 0.3 + wide], [1.2, 0.47, 0.62], [0.98, 0.7, 0.67], [0.84, 0.76, 0.62]], 0.008, 4);
  // Diesel: Hochdruckleitung (Common Rail) neben den Einspritzdüsen
  if (diesel) {
    if (vee) for (const s of [-1, 1]) m.cyl(BAY.steel, 0.009, 0.009, xs[xs.length - 1] - xs[0] + 0.08, [(xs[0] + xs[xs.length - 1]) / 2, 0.745, s * 0.045], Z90, 6);
    else m.cyl(BAY.steel, 0.01, 0.01, xs[xs.length - 1] - xs[0] + 0.08, [(xs[0] + xs[xs.length - 1]) / 2, 0.815, -0.125], Z90, 6);
  }
  g = m.build();
  cache.set(key, g);
  return g;
}

let beltGeo: THREE.BufferGeometry | null = null;
/** Keilrippenriemen als geschlossene Schleife um Kurbelwelle, Lichtmaschine und Wasserpumpe (liegt in der Ebene x = 0). */
export function beltGeometry() {
  if (!beltGeo) {
    const pts: [number, number][] = [[0.075, 0.47], [0.3, 0.535], [0.318, 0.585], [0.285, 0.625], [0, 0.632], [-0.31, 0.632], [-0.352, 0.585], [-0.33, 0.535], [-0.075, 0.47], [0, 0.428]];
    const curve = new THREE.CatmullRomCurve3(pts.map(([z, y]) => new THREE.Vector3(0, y, z)), true, 'centripetal');
    beltGeo = new THREE.TubeGeometry(curve, 48, 0.007, 4, true);
    beltGeo.scale(2.2, 1, 1);
  }
  return beltGeo;
}
