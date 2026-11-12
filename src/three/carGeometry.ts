import * as THREE from 'three';
import type { BodyStyle } from '../game/types';

// Prozedural erzeugte Karosserie: Querschnitte werden entlang der Fahrzeug-
// längsachse (X) aufgespannt ("Lofting"). So entstehen runde Schultern,
// Radhäuser und eine eingezogene Front/Heckpartie ohne externes 3D-Modell.
// Fahrtrichtung = +X, Y = oben.

export const HOOD_X0 = 0.8;
export const HOOD_X1 = 2.02;
const CABIN_X1 = 0.82;
const BELT = 0.97;
const ROOF = 1.42;
const WHEEL_X = 1.38;
const ARCH_R = 0.41;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp01(t);

export function halfWidth(x: number) {
  if (x > 1.7) return 0.9 - 0.13 * ((x - 1.7) / 0.6) ** 2;
  if (x < -1.7) return 0.9 - 0.11 * ((-1.7 - x) / 0.6) ** 2;
  return 0.9;
}

export function topY(x: number) {
  if (x > 2.05) return 0.82 - ((x - 2.05) / 0.25) ** 3 * 0.12;
  if (x >= 0.78) return 0.99 - 0.134 * (x - 0.78);
  if (x >= -1.5) return 1.0;
  if (x >= -2.15) return lerp(1.0, 0.97, (-1.5 - x) / 0.65);
  return 0.97 - ((-2.15 - x) / 0.15) ** 2 * 0.12;
}

function baseY(x: number) {
  let b = 0.28;
  if (x > 2.1) b += ((x - 2.1) / 0.2) ** 2 * 0.08;
  if (x < -2.1) b += ((-2.1 - x) / 0.2) ** 2 * 0.1;
  return b;
}

/** Unterkante der Außenhaut – im Bereich der Räder zum Radhaus hochgezogen. */
function bottomY(x: number) {
  let b = baseY(x);
  for (const xc of [WHEEL_X, -WHEEL_X]) {
    const dx = Math.abs(x - xc);
    if (dx < ARCH_R) b = Math.max(b, 0.32 + Math.sqrt(ARCH_R * ARCH_R - dx * dx));
  }
  return b;
}

/** Halber Querschnitt des Unterbaus von der Dachmitte (z=0) außen herum bis zur Bodenmitte. */
function bodyProfile(x: number): [number, number][] {
  const w = halfWidth(x);
  const top = topY(x);
  const bot = bottomY(x);
  const k = Math.min(1, (top - bot) / 0.34);
  const sh = 0.13 * k; // Schulterhöhe
  const bc = 0.1 * k; // Schwellerrundung
  const pts: [number, number][] = [];
  for (let i = 0; i <= 4; i++) {
    const z = (i / 4) * 0.8 * w;
    pts.push([z, top - 0.018 * (z / w) ** 2]);
  }
  for (let i = 1; i <= 3; i++) {
    const a = (i / 3) * (Math.PI / 2);
    pts.push([0.8 * w + 0.2 * w * Math.sin(a), top - 0.0115 - sh * (1 - Math.cos(a))]);
  }
  pts.push([w * 1.005, lerp(top - sh, bot + bc, 0.5)]);
  pts.push([w, bot + bc]);
  for (let i = 1; i <= 2; i++) {
    const a = (i / 2) * (Math.PI / 2);
    pts.push([0.86 * w + 0.14 * w * Math.cos(a), bot + bc * (1 - Math.sin(a))]);
  }
  // Innen fällt der Boden wieder auf Normalhöhe: das ergibt die Radhaus-Innenwand.
  const base = baseY(x);
  const inner = Math.min(0.66, 0.8 * w);
  pts.push([inner, bot]);
  pts.push([inner - 0.02, base]);
  pts.push([0.3, base]);
  pts.push([0, base]);
  return pts;
}
const TOP_SEGS = 4; // die ersten vier Segmente bilden die Oberseite (Haube/Kabinenöffnung)

function range(a: number, b: number, step: number) {
  const n = Math.max(1, Math.round((b - a) / step));
  return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
}
const uniq = (xs: number[]) => [...new Set(xs.map((x) => Math.round(x * 1000) / 1000))].sort((a, b) => a - b);

interface Loft {
  positions: number[];
  ring: number;
  add(x: number, half: [number, number][]): void;
}

/** Spiegelt den halben Querschnitt zu einem vollen Ring (z und -z). */
function makeLoft(halfCount: number, closedBottom: boolean): Loft {
  const positions: number[] = [];
  const ring = closedBottom ? halfCount * 2 - 2 : halfCount * 2 - 1;
  return {
    positions,
    ring,
    add(x, half) {
      // Reihenfolge: -z unten … Mitte oben … +z unten
      const full: [number, number][] = [];
      for (let i = half.length - (closedBottom ? 2 : 1); i >= 1; i--) full.push([-half[i][0], half[i][1]]);
      for (let i = 0; i < half.length; i++) full.push(half[i]);
      full.length = ring;
      for (const [z, y] of full) positions.push(x, y, z);
    },
  };
}

function finish(positions: number[], groups: number[][]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const index: number[] = [];
  groups.forEach((idx, m) => {
    g.addGroup(index.length, idx.length, m);
    index.push(...idx);
  });
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

function buildShell(body: BodyStyle) {
  const cabinX0 = body === 'wagon' ? -2.2 : -1.55;
  const xs = uniq([...range(-2.3, 2.3, 0.05), HOOD_X0, HOOD_X1, cabinX0, CABIN_X1]);
  const half = bodyProfile(0).length;
  const loft = makeLoft(half, true);
  xs.forEach((x) => loft.add(x, bodyProfile(x)));
  const R = loft.ring;
  const idx: number[] = [];
  // Ringindex der Dachmitte (z = 0 oben)
  const mid = half - 2;
  for (let s = 0; s < xs.length - 1; s++) {
    const xa = xs[s];
    const xb = xs[s + 1];
    const inHood = xa >= HOOD_X0 - 1e-6 && xb <= HOOD_X1 + 1e-6;
    const inCabin = xa >= cabinX0 - 1e-6 && xb <= CABIN_X1 + 1e-6 && !inHood;
    for (let j = 0; j < R; j++) {
      const j2 = (j + 1) % R;
      const isTop = j >= mid - TOP_SEGS && j < mid + TOP_SEGS;
      if (isTop && (inHood || inCabin)) continue; // Öffnung für Motorraum bzw. Innenraum
      const a = s * R + j;
      const b = s * R + j2;
      const c = (s + 1) * R + j;
      const d = (s + 1) * R + j2;
      idx.push(a, b, c, b, d, c);
    }
  }
  // Front- und Heckabschluss
  for (const s of [0, xs.length - 1]) {
    const x = xs[s];
    const center = loft.positions.length / 3;
    loft.positions.push(x + (s ? 0.012 : -0.012), (topY(x) + baseY(x)) / 2, 0);
    for (let j = 0; j < R; j++) {
      const a = s * R + j;
      const b = s * R + ((j + 1) % R);
      if (s) idx.push(a, b, center);
      else idx.push(a, center, b);
    }
  }
  return finish(loft.positions, [idx]);
}

function buildHood() {
  const xs = range(HOOD_X0, HOOD_X1, 0.061);
  const pos: number[] = [];
  const idx: number[] = [];
  const N = 17;
  const y0 = topY(HOOD_X0);
  xs.forEach((x) => {
    const w = halfWidth(x);
    for (let i = 0; i < N; i++) {
      const z = (i / (N - 1) - 0.5) * 2 * 0.8 * w;
      // Leichter Powerdome: zwei Sicken, die zur Front hin zusammenlaufen.
      const half = 0.36 - 0.1 * ((x - HOOD_X0) / (HOOD_X1 - HOOD_X0));
      const dome = Math.abs(z) < half ? 0.014 * Math.cos(((z / half) * Math.PI) / 2) ** 0.6 : 0;
      pos.push(x - HOOD_X0, topY(x) - 0.018 * (z / w) ** 2 - y0 + 0.004 + dome, z);
    }
  });
  for (let s = 0; s < xs.length - 1; s++) {
    for (let i = 0; i < N - 1; i++) {
      const a = s * N + i;
      idx.push(a, a + 1, a + N, a + 1, a + N + 1, a + N);
    }
  }
  return finish(pos, [idx]);
}

/** Fahrgastzelle: Gruppe 0 = Lack (Dach, Säulen), Gruppe 1 = Glas. */
function buildCabin(body: BodyStyle) {
  const wagon = body === 'wagon';
  const x0 = wagon ? -2.2 : -1.55; // Unterkante Heckscheibe
  const x1 = wagon ? -1.98 : -0.95; // Dachkante hinten
  const x2 = 0.1; // Dachkante vorn
  const pillars = wagon ? [[-0.38, -0.28], [-1.42, -1.32]] : [[-0.38, -0.28]];
  const yb = BELT - 0.03;
  const height = (x: number) => {
    if (x < x1) return lerp(yb, ROOF - 0.02, (x - x0) / (x1 - x0));
    if (x <= x2) return ROOF - 0.02 + 0.02 * Math.sin(((x - x1) / (x2 - x1)) * Math.PI);
    return lerp(ROOF - 0.02, yb, (x - x2) / (CABIN_X1 - x2));
  };
  const profile = (x: number): [number, number][] => {
    const yt = Math.max(yb + 0.001, height(x));
    const wb = Math.min(0.8, halfWidth(x) * 0.89);
    const wr = wb - (wb - 0.6) * ((yt - yb) / (ROOF - yb));
    const k = Math.min(1, (yt - yb) / 0.2);
    const pts: [number, number][] = [];
    for (let i = 0; i <= 3; i++) {
      const z = (i / 3) * 0.78 * wr;
      pts.push([z, yt - 0.02 * k * (z / wr) ** 2]);
    }
    pts.push([0.94 * wr, yt - 0.035 * k]);
    pts.push([wr + 0.012, yt - 0.085 * k]);
    const ys = yt - 0.085 * k;
    for (const t of [0.12, 0.55, 1]) pts.push([lerp(wr + 0.012, wb, t), lerp(ys, yb, t)]);
    return pts;
  };
  const xs = uniq([
    ...range(x0, x1, wagon ? 0.11 : 0.12),
    ...range(x1, x2, 0.15),
    ...range(x2, CABIN_X1, 0.12),
    ...pillars.flat(),
  ]);
  const half = profile(0).length;
  const loft = makeLoft(half, false);
  xs.forEach((x) => loft.add(x, profile(x)));
  const R = loft.ring;
  const mid = half - 1;
  const paint: number[] = [];
  const glass: number[] = [];
  for (let s = 0; s < xs.length - 1; s++) {
    const xm = (xs[s] + xs[s + 1]) / 2;
    const roof = xm > x1 && xm < x2;
    const pillar = pillars.some(([a, b]) => xm > a && xm < b);
    for (let j = 0; j < R - 1; j++) {
      const d = j < mid ? mid - 1 - j : j - mid; // Segmentabstand von der Dachmitte
      let isPaint: boolean;
      if (d < 3) isPaint = roof; // Dachfläche bzw. Front-/Heckscheibe
      else if (d < 6) isPaint = true; // Dachkante, A-/C-Säule, Fensterrahmen
      else isPaint = pillar || (!roof && !wagon && xm < x1) || (!roof && xm > 0.52);
      const a = s * R + j;
      const b = a + 1;
      const c = a + R;
      (isPaint ? paint : glass).push(a, b, c, b, c + 1, c);
    }
  }
  return finish(loft.positions, [paint, glass]);
}

/** Reifenquerschnitt als Rotationskörper. */
function buildTire() {
  const p = [
    [0.232, -0.1], [0.285, -0.108], [0.314, -0.094], [0.327, -0.062], [0.33, 0], [0.327, 0.062], [0.314, 0.094], [0.285, 0.108], [0.232, 0.1],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(p, 36);
}

/** Abgerundetes Rechteck, in +z extrudiert – für Leuchten und Grill. */
export function roundedRect(w: number, h: number, r: number, depth: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 6 });
}

export interface CarGeometry {
  shell: THREE.BufferGeometry;
  cabin: THREE.BufferGeometry;
  hood: THREE.BufferGeometry;
  tire: THREE.BufferGeometry;
}

const cache = new Map<BodyStyle, CarGeometry>();
let tire: THREE.BufferGeometry | null = null;

export function carGeometry(body: BodyStyle): CarGeometry {
  let g = cache.get(body);
  if (!g) {
    tire ??= buildTire();
    g = { shell: buildShell(body), cabin: buildCabin(body), hood: buildHood(), tire };
    cache.set(body, g);
  }
  return g;
}
