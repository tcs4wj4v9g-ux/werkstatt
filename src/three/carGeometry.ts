import * as THREE from 'three';
import type { BodyStyle } from '../game/types';
import type { Mesher } from './mesher';

// Prozedural erzeugte Karosserie: Querschnitte werden entlang der Fahrzeug-
// längsachse (X) aufgespannt ("Lofting"). Bug und Heck laufen als Superellipse
// zusammen, die Flanke trägt eine Charakterlinie und ausgestellte Radläufe,
// das Dach folgt einer weich gerundeten Linie. Kein externes 3D-Modell.
// Fahrtrichtung = +X, Y = oben.

export const HOOD_X0 = 0.8;
export const HOOD_X1 = 2.02;
const CABIN_X1 = 0.82;
export const WHEEL_X = 1.38;
export const WHEEL_Y = 0.33;
export const ARCH_R = 0.39;
/** Glasvorderkante der Vordertür (davor sitzt der Fuß der A-Säule). */
const A_BASE = 0.5;

/** Karosserieform. Der Vorderwagen (ab Windschutzscheibe) ist in der Höhe bei allen gleich – dort sitzt der Motorraum. */
export interface BodySpec {
  /** Hinteres und vorderes Fahrzeugende (x). */
  tail: number;
  nose: number;
  /** Größte halbe Breite. */
  width: number;
  /** Hinterachse (x) und Zusatzspur vorn/hinten gegenüber 0,8 m. */
  rearAxle: number;
  trackF: number;
  trackR: number;
  /** Dachhöhe. */
  roof: number;
  /** Unterkante Heckscheibe, Dachkante hinten, Dachkante vorn. */
  x0: number;
  x1: number;
  x2: number;
  /** Höhe des Hecks (Kofferraumdeckel bzw. Gürtellinie hinten). */
  deck: number;
  /** Höhe der vordersten/hintersten Karosseriespitze und Rundung (größer = kantiger). */
  noseMid: number;
  noseP: number;
  tailMid: number;
  tailP: number;
  tailLen: number;
  /** Rundung der Ecken in der Draufsicht (größer = eckiger). */
  planP: number;
  /** Bodenfreiheit der Schweller. */
  ground: number;
  /** Einzug der Seitenscheiben nach oben und Wölbung von Front-/Heckscheibe in der Draufsicht. */
  tumble: number;
  bowF: number;
  bowR: number;
  /** Ausstellung der Radläufe, Höhe und Tiefe der Charakterlinie. */
  flare: number;
  crease: number;
  creaseDepth: number;
  /** Lackierte bzw. schwarze Säulen zwischen den Seitenfenstern (x-Bereiche). */
  pillars: [number, number][];
  blackPillars: boolean;
  /** Hinteres Ende der Seitenverglasung. */
  glassRear: number;
  /** Türfugen und Türgriffe (x-Positionen); die Vordertür reicht von seams[1] bis seams[0]. */
  seams: number[];
  handles: number[];
  /** Rücksitzlehne sichtbar (bei flachen Coupés ragte sie durch die Heckscheibe). */
  rearSeat: boolean;
}

const FOUR_DOOR = { seams: [0.74, -0.32, -1.24], handles: [-0.14, -1.06] };
const TWO_DOOR = { seams: [0.74, -0.56], handles: [-0.38] };
const BASE: Omit<BodySpec, 'roof' | 'x0' | 'x1' | 'x2' | 'pillars' | 'glassRear' | 'seams' | 'handles' | 'rearSeat'> = {
  tail: -2.3, nose: 2.3, width: 0.9, rearAxle: -1.38, trackF: 0, trackR: 0, deck: 1.02, noseMid: 0.54, noseP: 2.6, tailMid: 0.64, tailP: 3.8, tailLen: 0.28,
  planP: 3.6, ground: 0.27, tumble: 0.2, bowF: 0.15, bowR: 0.12, flare: 0.022, crease: 0.78, creaseDepth: 0.014, blackPillars: true,
};
export const BODY_SPECS: Record<BodyStyle, BodySpec> = {
  // Sportliche Mittelklasse-Limousine: kurzer Kofferraum, ansteigende Gürtellinie, kurzer Überhang hinten.
  sedan: { ...BASE, roof: 1.42, x0: -1.62, x1: -0.92, x2: 0.12, pillars: [[-0.38, -0.27]], glassRear: -1.2, rearSeat: true, ...FOUR_DOOR },
  // Kombi: Dach bis ans Heck, steile Heckklappe, drittes Seitenfenster.
  wagon: { ...BASE, roof: 1.44, x0: -2.26, x1: -2.0, x2: 0.12, deck: 1.03, tailMid: 0.66, tailP: 4.5, tailLen: 0.2, bowR: 0.05, pillars: [[-0.38, -0.27], [-1.36, -1.26]], glassRear: -2.02, rearSeat: true, ...FOUR_DOOR },
  // Kompakter Kleinwagen: kürzer, höher, kurzer Radstand, rundliche Front.
  hatch: { ...BASE, tail: -1.84, rearAxle: -1.16, roof: 1.47, x0: -1.8, x1: -1.5, x2: 0.16, deck: 1.04, noseP: 2.2, planP: 3, tailMid: 0.68, tailP: 3.6, tailLen: 0.2, bowR: 0.06, flare: 0.016, creaseDepth: 0.008, pillars: [[-0.6, -0.49]], glassRear: -1.5, rearSeat: true, ...TWO_DOOR },
  // Coupé: flaches Dach, lange fließende Heckscheibe, rahmenlose Seitenlinie ohne B-Säule.
  coupe: { ...BASE, roof: 1.36, x0: -1.78, x1: -0.66, x2: 0.02, deck: 1.0, tailMid: 0.64, tumble: 0.24, flare: 0.028, pillars: [], glassRear: -1.18, rearSeat: false, ...TWO_DOOR },
  // Sportwagen: flach, breit, lange Haube, kurzes Heck, kräftige Radhäuser.
  sport: { ...BASE, tail: -2.16, nose: 2.34, width: 0.96, rearAxle: -1.28, trackF: 0.05, trackR: 0.07, roof: 1.25, x0: -1.86, x1: -0.62, x2: -0.12, deck: 0.98, noseMid: 0.47, noseP: 2.1, tailMid: 0.66, tailP: 3.4, tailLen: 0.26, planP: 3, ground: 0.23, tumble: 0.3, bowF: 0.2, flare: 0.04, crease: 0.7, creaseDepth: 0.02, pillars: [], glassRear: -0.92, rearSeat: false, ...TWO_DOOR },
  // Oberklasse: lang, breit, langer Radstand, hohe Schulter, stattliches Heck.
  luxury: { ...BASE, tail: -2.52, width: 0.94, rearAxle: -1.58, trackF: 0.03, trackR: 0.04, roof: 1.47, x0: -1.84, x1: -1.14, x2: 0.12, deck: 1.04, noseMid: 0.57, noseP: 3.2, tailMid: 0.66, tailP: 3.4, planP: 4.2, creaseDepth: 0.01, pillars: [[-0.4, -0.28]], glassRear: -1.42, rearSeat: true, seams: [0.74, -0.34, -1.42], handles: [-0.16, -1.22] },
  // Klassiker: schlanke Säulen, niedrige Gürtellinie, kantiger Bug mit Chromstoßstangen.
  classic: { ...BASE, tail: -2.26, rearAxle: -1.3, roof: 1.33, x0: -1.56, x1: -0.84, x2: 0.06, deck: 0.96, noseMid: 0.6, noseP: 4.2, tailMid: 0.64, tailP: 4, planP: 4.6, tumble: 0.17, bowF: 0.1, bowR: 0.1, flare: 0.012, crease: 0.82, creaseDepth: 0.02, blackPillars: false, pillars: [], glassRear: -1.24, rearSeat: false, ...TWO_DOOR },
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp01(t);
const smooth = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};
/** Superellipsen-Viertel: 1 bei t=0, fällt weich auf 0 bei t=1. */
const sup = (t: number, p: number) => Math.pow(1 - Math.pow(clamp01(t), p), 1 / p);

const NT = 6; // Segmente der Oberseite (Haube / Kabinenöffnung)
const SIDE0 = 8; // erstes Segment, das zur Tür gehört (untere Schulter)
const SIDE1 = 16; // letztes Türsegment (Schwellerrundung)

/** Geometrische Beschreibung einer Karosserie – liefert Querschnitte und Oberflächenpunkte für Anbauteile. */
export class Shape {
  constructor(readonly B: BodySpec) {}

  width(x: number) {
    const B = this.B;
    const L = 0.78;
    if (x > B.nose - L) return B.width * sup((x - (B.nose - L)) / L, B.planP);
    if (x < B.tail + L) return B.width * sup((B.tail + L - x) / L, B.planP + 0.4);
    return B.width;
  }

  /** Oberkante auf der Mittellinie (Haube, Schulter unter der Kabine, Heckdeckel). */
  crown(x: number) {
    const B = this.B;
    const edge = 0.99 - 0.134 * (HOOD_X1 - 0.78);
    if (x > HOOD_X1) return B.noseMid + (edge - B.noseMid) * sup((x - HOOD_X1) / (B.nose - HOOD_X1), B.noseP);
    if (x >= 0.78) return 0.99 - 0.134 * (x - 0.78);
    const t0 = B.tail + B.tailLen;
    if (x >= t0) return lerp(0.99, B.deck, smooth((0.78 - x) / (0.78 - t0)) * 0.6 + ((0.78 - x) / (0.78 - t0)) * 0.4);
    return B.tailMid + (B.deck - B.tailMid) * sup((t0 - x) / B.tailLen, B.tailP);
  }

  base(x: number) {
    const B = this.B;
    const lf = 0.3;
    const lr = Math.min(0.3, B.tailLen + 0.06);
    if (x > B.nose - lf) return B.noseMid - (B.noseMid - B.ground - 0.02) * sup((x - (B.nose - lf)) / lf, 2.4);
    if (x < B.tail + lr) return B.tailMid - (B.tailMid - B.ground - 0.05) * sup((B.tail + lr - x) / lr, 2.2);
    return B.ground;
  }

  /** Unterkante der Außenhaut – im Bereich der Räder zum Radhaus hochgezogen. */
  bottom(x: number) {
    let b = this.base(x);
    for (const xc of [WHEEL_X, this.B.rearAxle]) {
      const dx = Math.abs(x - xc);
      if (dx < ARCH_R) b = Math.max(b, WHEEL_Y - 0.01 + Math.sqrt(ARCH_R * ARCH_R - dx * dx));
    }
    return b;
  }

  topSurf(x: number, z: number) {
    const w = Math.max(0.05, this.width(x));
    return this.crown(x) - 0.03 * (z / w) ** 2;
  }

  private flare(x: number, y: number) {
    let f = 0;
    for (const xc of [WHEEL_X, this.B.rearAxle]) {
      const d = Math.hypot(x - xc, y - WHEEL_Y);
      f += this.B.flare * Math.exp(-(((d - ARCH_R - 0.035) / 0.085) ** 2));
    }
    return f;
  }

  /** Halber Querschnitt von der Mitte oben (z=0) außen herum bis zur Bodenmitte. */
  section(x: number): [number, number][] {
    const B = this.B;
    const w = Math.max(0.004, this.width(x));
    const top = this.crown(x);
    const base = Math.min(this.base(x), top - 0.004);
    const bot = Math.min(Math.max(base, this.bottom(x)), top - 0.003);
    const k = clamp01((top - bot) / 0.34);
    const sh = 0.13 * k;
    const bc = 0.09 * k;
    const pts: [number, number][] = [];
    for (let i = 0; i <= NT; i++) {
      const z = (i / NT) * 0.8 * w;
      pts.push([z, top - 0.03 * (z / w) ** 2]);
    }
    const y08 = top - 0.03 * 0.64;
    for (let i = 1; i <= 4; i++) {
      const a = (i / 4) * (Math.PI / 2);
      const y = y08 - sh * (1 - Math.cos(a));
      pts.push([0.8 * w + 0.185 * w * Math.sin(a) + this.flare(x, y) * (i / 4) ** 2, y]);
    }
    const ys = y08 - sh;
    const yr = bot + bc;
    // Charakterlinie: darüber leicht nach außen laufend, darunter ein kleiner Rücksprung.
    const yc = B.crease + 0.012 * (0.8 - x);
    const fc = Math.min(0.8, Math.max(0.2, (ys - yc) / Math.max(0.02, ys - yr)));
    const dep = (B.creaseDepth * smooth((yc - yr - 0.03) / 0.1) * smooth((ys - yc - 0.01) / 0.06) * k) / B.width;
    const fa = fc - 0.035;
    const fb = fc + 0.035;
    for (const f of [fa * 0.5, fa, fb, fb + (1 - fb) * 0.38, fb + (1 - fb) * 0.72, 1]) {
      const y = lerp(ys, yr, f);
      const rel = f <= fa ? 0.985 + 0.015 * (f / fa) : lerp(1 - dep, 0.968, Math.pow((f - fb) / (1 - fb), 1.4));
      pts.push([w * rel + this.flare(x, y), y]);
    }
    for (let i = 1; i <= 2; i++) {
      const a = (i / 2) * (Math.PI / 2);
      const y = yr - bc * Math.sin(a);
      pts.push([w * (0.968 - 0.1 * (1 - Math.cos(a))) + this.flare(x, y) * (1 - i / 2), y]);
    }
    // Innen fällt der Boden wieder auf Normalhöhe: das ergibt die Radhaus-Innenwand.
    const inner = Math.min(0.66, 0.8 * w);
    pts.push([inner, bot]);
    pts.push([Math.max(0, inner - 0.02), base]);
    pts.push([Math.min(0.3, 0.4 * w), base]);
    pts.push([0, base]);
    return pts;
  }

  /** z der Außenhaut an der Flanke in Höhe y. */
  sideZ(x: number, y: number) {
    const s = this.section(x);
    let best = 0;
    for (let i = NT; i < s.length - 4; i++) {
      const [z0, y0] = s[i];
      const [z1, y1] = s[i + 1];
      if ((y0 - y) * (y1 - y) <= 0 && y0 !== y1) best = Math.max(best, z0 + ((z1 - z0) * (y0 - y)) / (y0 - y1));
    }
    return best || s[NT + 4][0];
  }

  private inside(x: number, y: number, z: number) {
    const s = this.section(x);
    const az = Math.abs(z);
    let c = false;
    // Halbes Profil, über die Mittelachse geschlossen
    for (let i = 0, j = s.length - 1; i < s.length; j = i++) {
      const [zi, yi] = s[i];
      const [zj, yj] = s[j];
      if (yi > y !== yj > y && az < ((zj - zi) * (y - yi)) / (yj - yi) + zi) c = !c;
    }
    return c;
  }

  /** x der Außenhaut an Bug (`dir` = 1) bzw. Heck (-1) für den Punkt (y, z). */
  endX(dir: 1 | -1, y: number, z: number) {
    const B = this.B;
    let lo = dir > 0 ? B.nose - 1.0 : B.tail + 1.0;
    let hi = dir > 0 ? B.nose : B.tail;
    if (!this.inside(lo, y, z)) return lo;
    for (let i = 0; i < 14; i++) {
      const m = (lo + hi) / 2;
      if (this.inside(m, y, z)) lo = m;
      else hi = m;
    }
    return lo;
  }

  /** Punkt [x, z] der Außenhaut rund um Bug (`dir` 1) bzw. Heck (-1): Winkel `a` (0 = geradeaus, positiv = +z) in Höhe y. */
  wrap(dir: 1 | -1, y: number, a: number): [number, number] {
    const cx = dir > 0 ? this.B.nose - 1 : this.B.tail + 1;
    const ux = dir * Math.cos(a);
    const uz = Math.sin(a);
    let lo = 0;
    let hi = 2.4;
    for (let i = 0; i < 15; i++) {
      const m = (lo + hi) / 2;
      if (this.inside(cx + ux * m, y, uz * m)) lo = m;
      else hi = m;
    }
    return [cx + ux * lo, uz * lo];
  }

  /** Unterkante der Verglasung. */
  beltY(x: number) {
    const B = this.B;
    return this.crown(Math.min(0.78, Math.max(B.tail + B.tailLen, x))) - 0.06;
  }

  roofY(x: number) {
    const B = this.B;
    const yb = this.beltY(x);
    const yb0 = this.beltY(B.x0);
    const ybF = this.beltY(CABIN_X1);
    const rear = yb0 + ((x - B.x0) * (B.roof - yb0)) / (B.x1 - B.x0);
    const front = ybF + ((CABIN_X1 - x) * (B.roof - ybF)) / (CABIN_X1 - B.x2);
    const flat = B.roof + 0.018 * Math.sin(clamp01((x - B.x1) / (B.x2 - B.x1)) * Math.PI);
    const k = 0.022;
    const y = -k * Math.log(Math.exp(-rear / k) + Math.exp(-front / k) + Math.exp(-flat / k));
    return Math.max(yb + 0.001, y);
  }

  cabinBase(x: number) {
    return Math.max(0.05, Math.min(0.86, this.width(Math.max(x, this.B.tail + 0.5)) * 0.89));
  }

  cabinDX(x: number, z: number) {
    const B = this.B;
    const q = (z / this.cabinBase(x)) ** 2;
    return -B.bowF * q * smooth((x - B.x2) / (CABIN_X1 - B.x2)) + B.bowR * q * smooth((B.x1 - x) / (B.x1 - B.x0));
  }

  /** Halber Querschnitt der Fahrgastzelle: Dachmitte bis Fensterunterkante. */
  cabinProfile(x: number): [number, number][] {
    const B = this.B;
    const yt = this.roofY(x);
    const yb = this.beltY(x);
    const wb = this.cabinBase(x);
    const rise = clamp01((yt - yb) / (B.roof - yb));
    const wr = wb - B.tumble * rise;
    const k = clamp01((yt - yb) / 0.2);
    const pts: [number, number][] = [];
    for (let i = 0; i <= 4; i++) {
      const z = (i / 4) * 0.88 * wr;
      pts.push([z, yt - 0.028 * k * (z / wr) ** 2]);
    }
    pts.push([0.965 * wr, yt - 0.04 * k]);
    pts.push([wr + 0.008, yt - 0.085 * k]);
    const ys = yt - 0.085 * k;
    for (const t of [0.14, 0.45, 0.75, 1]) pts.push([lerp(wr + 0.008, wb, t) + 0.014 * Math.sin(Math.PI * t) * k, lerp(ys, yb, t)]);
    return pts;
  }
}

function range(a: number, b: number, step: number) {
  const n = Math.max(1, Math.round((b - a) / step));
  return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
}
const uniq = (xs: number[]) => {
  const sorted = [...xs].sort((a, b) => a - b);
  const out: number[] = [];
  for (const x of sorted) if (!out.length || x - out[out.length - 1] > 0.004) out.push(x);
  return out;
};

interface Loft {
  positions: number[];
  ring: number;
  add(x: number, half: [number, number][], dx?: (z: number) => number): void;
}

/** Spiegelt den halben Querschnitt zu einem vollen Ring (z und -z). */
function makeLoft(halfCount: number, closedBottom: boolean): Loft {
  const positions: number[] = [];
  const ring = closedBottom ? halfCount * 2 - 2 : halfCount * 2 - 1;
  return {
    positions,
    ring,
    add(x, half, dx) {
      // Reihenfolge: -z unten … Mitte oben … +z unten
      const full: [number, number][] = [];
      for (let i = half.length - (closedBottom ? 2 : 1); i >= 1; i--) full.push([-half[i][0], half[i][1]]);
      for (let i = 0; i < half.length; i++) full.push(half[i]);
      full.length = ring;
      for (const [z, y] of full) positions.push(x + (dx ? dx(z) : 0), y, z);
    },
  };
}

/** Baut aus einem Punktvorrat und Indexgruppen eine kompakte Geometrie (nur benutzte Punkte). */
function finish(positions: number[], groups: number[][], offset: [number, number, number] = [0, 0, 0]) {
  const map = new Map<number, number>();
  const pos: number[] = [];
  const index: number[] = [];
  const g = new THREE.BufferGeometry();
  groups.forEach((idx, m) => {
    if (idx.length) g.addGroup(index.length, idx.length, m);
    for (const i of idx) {
      let n = map.get(i);
      if (n === undefined) {
        n = pos.length / 3;
        map.set(i, n);
        pos.push(positions[i * 3] - offset[0], positions[i * 3 + 1] - offset[1], positions[i * 3 + 2] - offset[2]);
      }
      index.push(n);
    }
  });
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Stützstellen entlang x: an Bug, Heck und Radläufen verdichtet. */
function stations(S: Shape, step: number, arch: number) {
  const B = S.B;
  const inArch = (x: number) => [WHEEL_X, B.rearAxle].some((xc) => Math.abs(x - xc) < ARCH_R + 0.02);
  const xs = [...range(B.tail + 0.02, B.nose - 0.02, step).filter((x) => !inArch(x) && x < HOOD_X1 + 0.02 && x > B.tail + B.tailLen - 0.02), HOOD_X0, HOOD_X1, B.x0 + B.bowR, CABIN_X1, ...B.seams];
  const n = Math.round(arch * 0.7);
  for (let k = 0; k <= n; k++) {
    const f = 1 - k / n;
    const add = (start: number, end: number, p: number) => xs.push(start + (end - start) * Math.pow(1 - Math.pow(Math.max(f, 0.03), p), 1 / p));
    add(HOOD_X1, B.nose, B.noseP);
    add(B.nose - 0.78, B.nose, B.planP);
    add(B.tail + B.tailLen, B.tail, B.tailP);
    add(B.tail + 0.78, B.tail, B.planP + 0.4);
  }
  for (const xc of [WHEEL_X, B.rearAxle]) {
    // Gleichmäßig im Bogenmaß, an den steilen Enden zusätzlich verdichtet
    for (let k = 0; k <= arch; k++) xs.push(xc + ARCH_R * Math.cos((k / arch) * Math.PI));
    xs.push(xc - ARCH_R - 0.03, xc + ARCH_R + 0.03);
  }
  return uniq(xs.filter((x) => x > B.tail && x < B.nose));
}

function cabinStations(S: Shape, step: number) {
  const B = S.B;
  return uniq([...range(B.x0, CABIN_X1, step), B.x1, B.x2, B.glassRear, A_BASE, B.seams[1], ...B.pillars.flat()].filter((x) => x >= B.x0 && x <= CABIN_X1));
}

const halfSeg = (j: number, mid: number) => (j >= mid ? j - mid : mid - j - 1);

interface Built {
  shell: THREE.BufferGeometry;
  cabin: THREE.BufferGeometry;
  hood: THREE.BufferGeometry;
  /** Vordertüren links (z<0) und rechts, relativ zum Scharnier. */
  doors: [THREE.BufferGeometry, THREE.BufferGeometry];
}

function buildBody(S: Shape, detail: number): Built {
  const B = S.B;
  const d0 = B.seams[0];
  const d1 = B.seams[1];
  const hinge = doorHinge(S);
  const doorIdx: [number[][], number[][]] = [[[], [], []], [[], [], []]];

  // ---- Unterbau ----
  const xs = stations(S, detail ? 0.055 : 0.085, detail ? 18 : 10);
  const half = S.section(0).length;
  const loft = makeLoft(half, true);
  xs.forEach((x) => loft.add(x, S.section(x)));
  const R = loft.ring;
  const mid = half - 2;
  const idx: number[] = [];
  const open0 = B.x0 + B.bowR;
  for (let s = 0; s < xs.length - 1; s++) {
    const xa = xs[s];
    const xb = xs[s + 1];
    const inHood = xa >= HOOD_X0 - 1e-6 && xb <= HOOD_X1 + 1e-6;
    const inCabin = xa >= open0 - 1e-6 && xb <= CABIN_X1 + 1e-6 && !inHood;
    const inDoor = xa >= d1 - 1e-6 && xb <= d0 + 1e-6;
    for (let j = 0; j < R; j++) {
      const hs = halfSeg(j, mid);
      if (hs < NT && (inHood || inCabin)) continue; // Öffnung für Motorraum bzw. Innenraum
      const a = s * R + j;
      const b = s * R + ((j + 1) % R);
      const c = (s + 1) * R + j;
      const d = (s + 1) * R + ((j + 1) % R);
      if (inDoor && hs >= SIDE0 && hs <= SIDE1) doorIdx[j >= mid ? 1 : 0][0].push(a, b, c, b, d, c);
      else idx.push(a, b, c, b, d, c);
    }
  }
  // Bug- und Heckspitze
  for (const s of [0, xs.length - 1]) {
    const center = loft.positions.length / 3;
    const end = s ? B.nose : B.tail;
    loft.positions.push(end, s ? B.noseMid : B.tailMid, 0);
    for (let j = 0; j < R; j++) {
      const a = s * R + j;
      const b = s * R + ((j + 1) % R);
      if (s) idx.push(a, b, center);
      else idx.push(a, center, b);
    }
  }
  const shell = finish(loft.positions, [idx]);

  // ---- Fahrgastzelle: Gruppe 0 = Lack, 1 = Glas, 2 = schwarze Blenden ----
  const cx = cabinStations(S, detail ? 0.075 : 0.12);
  const chalf = S.cabinProfile(0).length;
  const cab = makeLoft(chalf, false);
  cx.forEach((x) => cab.add(x, S.cabinProfile(x), (z) => S.cabinDX(x, z)));
  const CR = cab.ring;
  const cmid = chalf - 1;
  const groups: number[][] = [[], [], []];
  const base = loft.positions.length / 3;
  for (let s = 0; s < cx.length - 1; s++) {
    const xm = (cx[s] + cx[s + 1]) / 2;
    const roof = xm > B.x1 && xm < B.x2;
    const pillar = B.pillars.some(([a, b]) => xm > a && xm < b);
    const inDoor = xm > d1 && xm < A_BASE;
    for (let j = 0; j < CR - 1; j++) {
      const hs = halfSeg(j, cmid);
      let m: number;
      if (hs < 4) m = roof ? 0 : 1; // Dachfläche bzw. Front-/Heckscheibe
      else if (hs < 6) m = 0; // Dachholm, A-/C-Säule
      else if (xm < B.glassRear || xm > A_BASE) m = 0; // C-Säule bzw. Fuß der A-Säule
      else if (pillar) m = B.blackPillars ? 2 : 0;
      else if (hs === 6) m = B.blackPillars ? 2 : 0; // oberer Fensterrahmen
      else m = 1;
      const a = s * CR + j;
      const b = a + 1;
      const c = a + CR;
      if (inDoor && hs >= 6) doorIdx[j >= cmid ? 1 : 0][m].push(base + a, base + b, base + c, base + b, base + c + 1, base + c);
      else groups[m].push(a, b, c, b, c + 1, c);
    }
  }
  const cabin = finish(cab.positions, groups);

  // ---- Türen: Flanke des Unterbaus + Fensterrahmen mit Scheibe ----
  const all = loft.positions.concat(cab.positions);
  const doors = [0, 1].map((k) => finish(all, doorIdx[k], [hinge[0], 0, (k ? 1 : -1) * hinge[1]])) as [THREE.BufferGeometry, THREE.BufferGeometry];

  // ---- Motorhaube: Außenhaut (Gruppe 0) und dunkle Innenseite (Gruppe 1) ----
  const hx = range(HOOD_X0 + 0.006, HOOD_X1 - 0.006, detail ? 0.06 : 0.1);
  const N = detail ? 19 : 11;
  const pos: number[] = [];
  const outer: number[] = [];
  const innerIdx: number[] = [];
  const y0 = S.crown(HOOD_X0);
  for (const layer of [0, 1]) {
    hx.forEach((x) => {
      const w = S.width(x);
      for (let i = 0; i < N; i++) {
        const z = (i / (N - 1) - 0.5) * 2 * (0.8 * w - 0.006);
        // Powerdome: zwei Sicken, die zur Front hin zusammenlaufen.
        const hw = 0.36 - 0.1 * ((x - HOOD_X0) / (HOOD_X1 - HOOD_X0));
        const dome = Math.abs(z) < hw ? 0.014 * Math.cos(((z / hw) * Math.PI) / 2) ** 0.6 : 0;
        const edge = Math.min(1, (0.8 * w - Math.abs(z)) / 0.06, (x - HOOD_X0) / 0.05, (HOOD_X1 - x) / 0.05);
        pos.push(x - HOOD_X0, S.topSurf(x, z) - y0 + 0.003 + dome - (layer ? 0.004 + 0.022 * smooth(edge) : 0), z);
      }
    });
  }
  const layerSize = hx.length * N;
  for (let s = 0; s < hx.length - 1; s++) {
    for (let i = 0; i < N - 1; i++) {
      const a = s * N + i;
      outer.push(a, a + 1, a + N, a + 1, a + N + 1, a + N);
      const b = a + layerSize;
      innerIdx.push(b, b + N, b + 1, b + 1, b + N, b + N + 1);
    }
  }
  const hood = finish(pos, [outer, innerIdx]);
  return { shell, cabin, hood, doors };
}

/** Scharnierlinie der Vordertür: [x, z]. */
export function doorHinge(S: Shape): [number, number] {
  return [S.B.seams[0], S.width(S.B.seams[0]) - 0.02];
}

/** Abgerundetes Rechteck, in +z extrudiert. */
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
  s.quadraticCurveTo(x, y, x, y + r);
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 6 });
}

/**
 * Aufliegende Fläche, die der Karosserie folgt (Leuchte, Grill, Kennzeichen, Fuge …).
 * `at(u, v)` liefert zu Gitterkoordinaten (-1…1) einen Punkt auf der Oberfläche.
 * `round` 0 = Rechteck, 1 = Ellipse.
 */
function patch(m: Mesher, slot: number, at: (u: number, v: number) => [number, number, number], facing: [number, number, number], round: number, nu: number, nv: number) {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = (i / nu) * 2 - 1;
      const v = (j / nv) * 2 - 1;
      // Quadrat → abgerundetes Quadrat
      const p = at(u * Math.sqrt(1 - 0.5 * round * v * v), v * Math.sqrt(1 - 0.5 * round * u * u));
      pos.push(p[0], p[1], p[2]);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i;
      idx.push(a, a + 1, a + nu + 1, a + 1, a + nu + 2, a + nu + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Ausrichtung prüfen und bei Bedarf umdrehen
  const n = g.getAttribute('normal');
  const c = Math.floor(n.count / 2);
  if (n.getX(c) * facing[0] + n.getY(c) * facing[1] + n.getZ(c) * facing[2] < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  m.add(slot, g);
}

/** Fläche an Bug (`dir` 1) oder Heck (-1): Mitte (zc, yc), Breite w (in z), Höhe h. */
export function endPatch(m: Mesher, slot: number, S: Shape, dir: 1 | -1, zc: number, yc: number, w: number, h: number, round = 0.5, lift = 0.004, nu = 8, nv = 4) {
  patch(m, slot, (u, v) => {
    const z = zc + (u * w) / 2;
    const y = yc + (v * h) / 2;
    return [S.endX(dir, y, z) + dir * lift, y, z];
  }, [dir, 0, 0], round, nu, nv);
}

/** Fläche, die um Bug/Heck herumläuft: Winkelmitte `ac`, Winkelbreite `aw` (Bogenmaß), Höhe h um yc. */
export function wrapPatch(m: Mesher, slot: number, S: Shape, dir: 1 | -1, ac: number, aw: number, yc: number, h: number, round = 0.4, lift = 0.004, nu = 10, nv = 4) {
  patch(m, slot, (u, v) => {
    const a = ac + (u * aw) / 2;
    const y = yc + (v * h) / 2;
    const [x, z] = S.wrap(dir, y, a);
    return [x + dir * Math.cos(a) * lift, y, z + Math.sin(a) * lift];
  }, [dir * Math.cos(ac), 0, Math.sin(ac)], round, nu, nv);
}

/** Fläche an der Flanke (`side` 1 = +z): Mitte (xc, yc), Länge w (in x), Höhe h. */
export function sidePatch(m: Mesher, slot: number, S: Shape, side: 1 | -1, xc: number, yc: number, w: number, h: number, round = 0, lift = 0.003, nu = 2, nv = 6) {
  patch(m, slot, (u, v) => {
    const x = xc + (u * w) / 2;
    const y = yc + (v * h) / 2;
    return [x, y, side * (S.sideZ(x, y) + lift)];
  }, [0, 0, side], round, nu, nv);
}

/** Fläche auf Haube/Heckdeckel: Mitte (xc, zc), Länge w (in x), Breite d (in z). */
export function topPatch(m: Mesher, slot: number, S: Shape, xc: number, zc: number, w: number, d: number, round = 0, lift = 0.003, nu = 4, nv = 4) {
  patch(m, slot, (u, v) => {
    const x = xc + (u * w) / 2;
    const z = zc + (v * d) / 2;
    return [x, S.topSurf(x, z) + lift, z];
  }, [0, 1, 0], round, nu, nv);
}

export interface CarGeometry extends Built {
  shape: Shape;
}

const cache = new Map<string, CarGeometry>();
const shapes = new Map<string, Shape>();

/** Form einer Karosserie; mit Kotflügelverbreiterungen breiter, mit stärker ausgestellten Radläufen und mehr Spur. */
export function bodyShape(body: BodyStyle, flares = false) {
  const key = body + (flares ? '+f' : '');
  let s = shapes.get(key);
  if (!s) {
    const B = BODY_SPECS[body];
    shapes.set(key, (s = new Shape(flares ? { ...B, width: B.width + 0.03, flare: B.flare + 0.035, trackF: B.trackF + 0.035, trackR: B.trackR + 0.045 } : B)));
  }
  return s;
}

/** `detail` 0 = grobes Netz (niedrige Grafikstufe), 1 = feines Netz. */
export function carGeometry(body: BodyStyle, detail = 1, flares = false): CarGeometry {
  const key = body + detail + (flares ? '+f' : '');
  let g = cache.get(key);
  if (!g) {
    const shape = bodyShape(body, flares);
    g = { shape, ...buildBody(shape, detail) };
    cache.set(key, g);
  }
  return g;
}

/** Oberkante der Karosserie auf der Mittellinie (für das Haubenscharnier). */
export function topY(x: number, B: BodySpec = BODY_SPECS.sedan) {
  return new Shape(B).crown(x);
}
