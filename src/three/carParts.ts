import * as THREE from 'three';
import type { CarModelDef } from '../game/data/cars';
import type { EngineDef } from '../game/data/engines';
import type { BodyStyle, VisualTune } from '../game/types';
import { ARCH_R, bodyShape, doorHinge, endPatch, sidePatch, WHEEL_X, wrapPatch, type Shape } from './carGeometry';
import { mat, Mesher, type V3 } from './mesher';

// Anbauteile, Räder und Innenraum – jeweils zu einer Geometrie mit Materialgruppen verschmolzen.

/** Materialgruppen der Anbauteile und des Innenraums. */
export const SLOT = { dark: 0, gloss: 1, chrome: 2, lens: 3, glow: 4, tail: 5, tailBar: 6, amber: 7, plate: 8, solid: 9, seat: 10, seat2: 11 } as const;
const SLOTS = 12;

export type RimStyle = 'steel' | 'double5' | 'multi' | 'turbine' | 'classic' | 'five';
export interface CarLook {
  rim: RimStyle;
  grille: 'twin' | 'wide' | 'tall' | 'slot' | 'classic';
  lamps: 'twin' | 'block' | 'slim' | 'round';
  chromeBumper: boolean;
  blackBumper: boolean;
  chromeTrim: boolean;
  spoiler: boolean;
  pipes: number;
  /** Sitzfarbe und Akzent. */
  seat: string;
  seat2: string;
  /** Optisches Tuning */
  front: number;
  rear: number;
  skirts: boolean;
  /** 0 = keiner, 1 = Lippe, 2 = Entenbürzel, 3 = Flügel. */
  wing: number;
  flares: boolean;
  tips: 'stock' | 'dual' | 'quad' | 'oval';
  rimSize: number;
  sportSeats: boolean;
  sportWheel: boolean;
}

export function lookOf(model: CarModelDef | undefined, body: BodyStyle, engine: EngineDef, visual?: VisualTune): CarLook {
  const cls = model?.cls ?? 'budget';
  const brand = model?.brand ?? 'Bavaria';
  const classic = body === 'classic';
  const sport = body === 'sport';
  const lux = cls === 'luxury' || body === 'luxury';
  return {
    rim: classic ? 'classic' : cls === 'budget' && brand !== 'Bavaria' ? 'steel' : sport ? 'five' : cls === 'sport' || body === 'coupe' ? 'multi' : lux ? 'turbine' : 'double5',
    // Bavaria: zweigeteilter Grill; andere Marken: breiter Grill; Oberklasse: hoher Grill; Sportwagen: flacher Lufteinlass.
    grille: sport ? 'slot' : classic ? 'classic' : brand === 'Bavaria' ? 'twin' : lux ? 'tall' : 'wide',
    lamps: classic ? 'round' : sport ? 'slim' : brand === 'Bavaria' ? 'twin' : 'block',
    chromeBumper: classic,
    blackBumper: cls === 'budget' && brand !== 'Bavaria',
    chromeTrim: classic || lux,
    spoiler: sport || model?.id === 'bavaria_340_ms',
    pipes: engine.cylinders >= 8 ? 4 : engine.cylinders >= 6 ? 2 : 1,
    seat: lux ? '#b9a384' : sport ? '#7a1f1a' : classic ? '#6b4a2f' : cls === 'budget' ? '#4a4d52' : '#2f3033',
    seat2: lux ? '#8f7a60' : sport ? '#1b1c1f' : classic ? '#4f3521' : '#2c2e32',
    front: visual?.front ?? 0,
    rear: visual?.rear ?? 0,
    skirts: !!visual?.skirts,
    wing: visual?.spoiler ?? (sport || model?.id === 'bavaria_340_ms' ? 3 : 0),
    flares: !!visual?.flares,
    tips: visual?.tips ?? 'stock',
    rimSize: visual?.rimSize ?? 0,
    sportSeats: visual?.seats === 'sport',
    sportWheel: visual?.wheel === 'sport',
    ...(visual?.rim ? { rim: visual.rim as RimStyle } : {}),
    ...(visual?.seats === 'sport' ? { seat: '#16171a', seat2: '#b3261e' } : {}),
  };
}
export const lookKey = (l: CarLook) => [l.rim, l.grille, l.lamps, +l.chromeBumper, +l.blackBumper, +l.chromeTrim, l.pipes, l.front, l.rear, +l.skirts, l.wing, +l.flares, l.tips].join();

// ---------------------------------------------------------------- Räder

/** Materialgruppen eines Rads: Reifen, Felge (Farbe/Schmutz), dunkel, Felgenbett. */
export const WHEEL_SLOT = { tire: 0, rim: 1, dark: 2, barrel: 3 } as const;
export const RIM_R: Record<RimStyle, number> = { steel: 0.215, double5: 0.232, multi: 0.242, turbine: 0.24, classic: 0.215, five: 0.25 };
export const RIM_COLOR: Record<RimStyle, string> = { steel: '#aab0b7', double5: '#cdd2d8', multi: '#2a2c30', turbine: '#e4e7eb', classic: '#dfe3e8', five: '#3a3d42' };

/** Speiche als verjüngter, leicht gewölbter Balken von der Nabe (z = r0) zum Felgenrand (z = r1). */
function spoke(m: Mesher, slot: number, angle: number, r0: number, r1: number, w0: number, w1: number, y0: number, y1: number, thick: number, splay = 0) {
  const g = new THREE.BoxGeometry(1, 1, 1, 1, 1, 4);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const t = p.getZ(i) + 0.5;
    const x = p.getX(i) * (w0 + (w1 - w0) * t) + splay * (1 - t) * r1;
    const y = y0 + (y1 - y0) * Math.pow(t, 1.6) + p.getY(i) * thick * (1.25 - 0.5 * t);
    p.setXYZ(i, x, y, r0 + (r1 - r0) * t);
  }
  g.computeVertexNormals();
  m.add(slot, g, mat([0, 0, 0], [0, angle, 0]));
}

const wheels = new Map<string, THREE.BufferGeometry>();
/** Rad mit Achse entlang +Y (Außenseite = +Y). `lugs` = Radschrauben als Zierde (an den nicht demontierbaren Rädern). */
export function wheelGeometry(style: RimStyle, detail: number, lugs: boolean, size = 0) {
  const key = `${style}${detail}${+lugs}${size}`;
  let g = wheels.get(key);
  if (g) return g;
  const m = new Mesher(4);
  // Größere Felge, gleicher Außendurchmesser: der Reifen wird flacher.
  const R = RIM_R[style] + 0.025 * size;
  const W = WHEEL_SLOT;
  const seg = detail ? 36 : 20;
  // Reifen: Flanke mit Wulst, Lauffläche mit zwei Längsrillen
  const prof: [number, number][] = [[R, -0.098], [R + 0.022, -0.108], [0.292, -0.113], [0.318, -0.1], [0.329, -0.076], [0.331, -0.044]];
  if (detail) prof.push([0.331, -0.038], [0.323, -0.035], [0.323, -0.027], [0.331, -0.024], [0.331, 0.024], [0.323, 0.027], [0.323, 0.035], [0.331, 0.038]);
  prof.push([0.331, 0.044], [0.329, 0.076], [0.318, 0.1], [0.292, 0.113], [R + 0.022, 0.108], [R, 0.098]);
  // Drehkörper: Profil (Radius, Höhe) um die Y-Achse
  m.add(W.tire, new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg));
  // Felgenbett und Felgenhorn
  m.add(W.barrel, new THREE.LatheGeometry([[R - 0.004, 0.096], [R - 0.016, 0.07], [R - 0.022, 0.0], [R - 0.016, -0.094], [R, -0.098]].map(([r, y]) => new THREE.Vector2(r, y)), seg));
  m.torus(W.rim, R - 0.003, 0.011, [0, 0.094, 0], [Math.PI / 2, 0, 0], seg);
  const rOut = R - 0.012;
  const two = Math.PI * 2;
  if (style === 'steel') {
    // Radkappe: gewölbte Scheibe mit Lüftungsschlitzen
    m.add(W.rim, new THREE.LatheGeometry([[0, 0.094], [0.05, 0.094], [0.075, 0.086], [0.15, 0.084], [rOut, 0.07]].map(([r, y]) => new THREE.Vector2(r, y)), seg));
    for (let i = 0; i < 9; i++) m.box(W.dark, [0.018, 0.006, 0.05], [Math.sin((i / 9) * two) * 0.165, 0.083, Math.cos((i / 9) * two) * 0.165], [0, (i / 9) * two, 0]);
  } else {
    const n = style === 'double5' ? 5 : style === 'multi' ? 10 : style === 'turbine' ? 7 : style === 'five' ? 5 : 18;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * two + 0.31;
      if (style === 'double5') for (const k of [-1, 1]) spoke(m, W.rim, a + k * 0.115, 0.05, rOut, 0.02, 0.017, 0.07, 0.088, 0.018, k * -0.05);
      else if (style === 'multi') spoke(m, W.rim, a, 0.05, rOut, 0.022, 0.015, 0.062, 0.09, 0.018);
      else if (style === 'turbine') spoke(m, W.rim, a, 0.05, rOut, 0.05, 0.03, 0.07, 0.088, 0.016, 0.08);
      else if (style === 'five') spoke(m, W.rim, a, 0.05, rOut, 0.07, 0.04, 0.058, 0.09, 0.02);
      else spoke(m, W.rim, a, 0.06, rOut, 0.007, 0.007, 0.075 - (i % 2) * 0.03, 0.085, 0.006, (i % 2 ? 1 : -1) * 0.12);
    }
    // Nabe und Nabendeckel
    m.cyl(W.rim, style === 'classic' ? 0.062 : 0.058, 0.07, 0.03, [0, 0.076, 0], undefined, 20);
    if (style === 'classic') m.sphere(W.barrel, 0.06, [0, 0.086, 0], [1, 0.35, 1], 14);
    else m.cyl(W.dark, 0.027, 0.027, 0.006, [0, 0.093, 0], undefined, 14);
    if (lugs && style !== 'classic') for (let i = 0; i < 5; i++) m.cyl(W.barrel, 0.011, 0.011, 0.014, [Math.cos((i / 5) * two) * 0.045, 0.094, Math.sin((i / 5) * two) * 0.045], undefined, 6);
  }
  // Rückwand, damit man nicht durch die Felge in den Radkasten sieht
  m.cyl(W.dark, 0.1, 0.1, 0.02, [0, -0.02, 0], undefined, 14);
  g = m.build();
  wheels.set(key, g);
  return g;
}

// ---------------------------------------------------------------- Anbauteile außen

const trims = new Map<string, THREE.BufferGeometry>();
const doorTrims = new Map<string, [THREE.BufferGeometry, THREE.BufferGeometry]>();
const A_BASE = 0.5;
const ang = (z: number) => Math.atan2(z, 0.96);

function beltStrip(m: Mesher, S: Shape, slot: number, side: number, xa: number, xb: number) {
  const n = Math.max(2, Math.round((xb - xa) / 0.12));
  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const x = xa + ((xb - xa) * i) / n;
    pts.push([x, S.beltY(x) + 0.028, side * (S.cabinBase(x) + 0.004)]);
  }
  m.tube(slot, pts, 0.008, 5);
}

function handle(m: Mesher, S: Shape, slot: number, side: number, x: number) {
  const y = S.beltY(x) - 0.085;
  const z = S.sideZ(x, y);
  m.rbox(SLOT.dark, [0.17, 0.045, 0.012], 0.006, [x, y, side * (z + 0.001)]);
  m.rbox(slot, [0.15, 0.024, 0.026], 0.01, [x, y + 0.004, side * (z + 0.012)]);
}

/** Feste Anbauteile der Karosserie (alles außer den Vordertüren). */
export function trimGeometry(body: BodyStyle, look: CarLook, detail: number) {
  const key = body + lookKey(look) + detail;
  let g = trims.get(key);
  if (g) return g;
  const S = bodyShape(body, look.flares);
  const B = S.B;
  const m = new Mesher(SLOTS);
  const k = B.width / 0.9;
  const fine = detail ? 1 : 0.5;
  const N = (n: number) => Math.max(2, Math.round(n * fine));
  const disc = (dir: 1 | -1, slot: number, a: number, y: number, r: number, lift: number) => wrapPatch(m, slot, S, dir, a, (r * 2) / 0.96, y, r * 2, 1, lift, N(8), N(8));

  // ---- Front ----
  const yLamp = 0.7;
  for (const s of [-1, 1] as const) {
    if (look.lamps === 'twin') {
      wrapPatch(m, SLOT.gloss, S, 1, s * 0.62 * k, 0.5, yLamp, 0.125, 0.55, 0.003, N(12), N(5));
      wrapPatch(m, SLOT.lens, S, 1, s * 0.62 * k, 0.46, yLamp, 0.1, 0.55, 0.006, N(12), N(5));
      for (const a of [0.5, 0.69]) {
        disc(1, SLOT.glow, s * a * k, yLamp, 0.04, 0.009);
        disc(1, SLOT.gloss, s * a * k, yLamp, 0.031, 0.012);
      }
      wrapPatch(m, SLOT.amber, S, 1, s * 0.82 * k, 0.05, yLamp, 0.06, 0.5, 0.009, 3, 3);
    } else if (look.lamps === 'block') {
      wrapPatch(m, SLOT.gloss, S, 1, s * 0.62 * k, 0.5, yLamp - 0.005, 0.15, 0.4, 0.003, N(12), N(5));
      wrapPatch(m, SLOT.lens, S, 1, s * 0.62 * k, 0.46, yLamp - 0.005, 0.125, 0.4, 0.006, N(12), N(5));
      disc(1, SLOT.gloss, s * 0.56 * k, yLamp + 0.01, 0.042, 0.009);
      disc(1, SLOT.glow, s * 0.56 * k, yLamp + 0.01, 0.03, 0.012);
      wrapPatch(m, SLOT.glow, S, 1, s * 0.63 * k, 0.4, yLamp - 0.058, 0.014, 0.3, 0.009, N(10), 2);
      wrapPatch(m, SLOT.amber, S, 1, s * 0.78 * k, 0.1, yLamp + 0.012, 0.05, 0.5, 0.009, 3, 3);
    } else if (look.lamps === 'slim') {
      wrapPatch(m, SLOT.gloss, S, 1, s * 0.6 * k, 0.52, yLamp + 0.02, 0.085, 0.8, 0.003, N(12), N(4));
      wrapPatch(m, SLOT.lens, S, 1, s * 0.6 * k, 0.47, yLamp + 0.02, 0.062, 0.8, 0.006, N(12), N(4));
      wrapPatch(m, SLOT.glow, S, 1, s * 0.6 * k, 0.4, yLamp + 0.036, 0.012, 0.6, 0.009, N(10), 2);
      for (const a of [0.5, 0.62]) disc(1, SLOT.gloss, s * a * k, yLamp + 0.012, 0.02, 0.01);
    } else {
      for (const a of [0.43, 0.68]) {
        disc(1, SLOT.chrome, s * a * k, yLamp + 0.01, 0.088, 0.004);
        disc(1, SLOT.lens, s * a * k, yLamp + 0.01, 0.072, 0.012);
        disc(1, SLOT.glow, s * a * k, yLamp + 0.01, 0.022, 0.018);
      }
      wrapPatch(m, SLOT.amber, S, 1, s * 0.74 * k, 0.12, 0.555, 0.035, 0.5, 0.006, 4, 2);
    }
    // Äußere Lufteinlässe mit Nebelscheinwerfer
    if (look.grille !== 'classic') {
      wrapPatch(m, SLOT.dark, S, 1, s * 0.6 * k, 0.3, 0.41, look.grille === 'slot' ? 0.12 : 0.09, 0.6, 0.004, N(8), N(3));
      if (!look.blackBumper) disc(1, SLOT.glow, s * 0.64 * k, 0.41, 0.026, 0.009);
    }
  }
  if (look.grille === 'twin') {
    for (const s of [-1, 1]) {
      endPatch(m, SLOT.chrome, S, 1, s * 0.132, 0.668, 0.235, 0.128, 0.65, 0.004, N(8), N(5));
      endPatch(m, SLOT.gloss, S, 1, s * 0.132, 0.668, 0.2, 0.097, 0.65, 0.008, N(8), N(5));
      for (const o of [-0.06, -0.03, 0, 0.03, 0.06]) endPatch(m, SLOT.chrome, S, 1, s * 0.132 + o, 0.668, 0.007, 0.084 - Math.abs(o) * 0.25, 0, 0.011, 1, 3);
    }
  } else if (look.grille === 'wide' || look.grille === 'tall') {
    const tall = look.grille === 'tall';
    const w = tall ? 0.52 : 0.66;
    const h = tall ? 0.19 : 0.14;
    const y = tall ? 0.655 : 0.668;
    endPatch(m, SLOT.chrome, S, 1, 0, y, w, h, 0.35, 0.004, N(12), N(5));
    endPatch(m, SLOT.gloss, S, 1, 0, y, w - 0.04, h - 0.035, 0.35, 0.008, N(12), N(5));
    if (tall) for (let i = -4; i <= 4; i++) endPatch(m, SLOT.chrome, S, 1, i * 0.05, y, 0.008, h - 0.05, 0, 0.011, 1, 4);
    else for (const o of [-0.03, 0, 0.03]) endPatch(m, SLOT.chrome, S, 1, 0, y + o, w - 0.07, 0.008, 0, 0.011, N(10), 1);
  } else if (look.grille === 'slot') {
    endPatch(m, SLOT.gloss, S, 1, 0, 0.635, 0.62, 0.05, 0.8, 0.005, N(12), 3);
  } else {
    for (const s of [-1, 1]) {
      endPatch(m, SLOT.chrome, S, 1, s * 0.062, 0.69, 0.105, 0.2, 0.5, 0.005, 4, N(6));
      endPatch(m, SLOT.gloss, S, 1, s * 0.062, 0.69, 0.078, 0.17, 0.5, 0.009, 4, N(6));
      endPatch(m, SLOT.gloss, S, 1, s * 0.25, 0.7, 0.22, 0.1, 0.3, 0.005, N(6), 3);
      for (const o of [-0.025, 0, 0.025]) endPatch(m, SLOT.chrome, S, 1, s * 0.25, 0.7 + o, 0.2, 0.006, 0, 0.008, N(5), 1);
    }
    endPatch(m, SLOT.dark, S, 1, 0, 0.41, 0.7, 0.07, 0.6, 0.004, N(10), 3);
  }
  // Unterer Lufteinlass mit Lamellen, Kennzeichen, Spoilerlippe
  if (look.grille !== 'classic') {
    const big = look.grille === 'slot';
    endPatch(m, SLOT.dark, S, 1, 0, big ? 0.42 : 0.405, big ? 0.72 : 0.62, big ? 0.14 : 0.1, 0.5, 0.004, N(12), N(4));
    for (const o of [-0.022, 0.022]) endPatch(m, SLOT.gloss, S, 1, 0, 0.405 + o, 0.56, 0.008, 0, 0.007, N(8), 1);
  }
  const yPlate = look.grille === 'slot' ? 0.535 : 0.53;
  endPatch(m, SLOT.dark, S, 1, 0, yPlate, 0.47, 0.115, 0.2, 0.006, N(8), 3);
  endPatch(m, SLOT.plate, S, 1, 0, yPlate, 0.43, 0.09, 0.1, 0.009, N(8), 3);
  wrapPatch(m, SLOT.dark, S, 1, 0, 1.1, B.ground + 0.085, 0.04, 0.5, 0.006, N(16), 2);
  if (look.blackBumper) for (const d of [1, -1] as const) wrapPatch(m, SLOT.dark, S, d, 0, 1.9, 0.52, 0.06, 0.4, 0.006, N(26), 2);
  if (look.chromeBumper) {
    for (const d of [1, -1] as const) {
      const pts: V3[] = [];
      for (let i = -12; i <= 12; i++) {
        const a = (i / 12) * 1.32;
        const [x, z] = S.wrap(d, 0.5, a);
        pts.push([x + d * Math.cos(a) * 0.035, 0.5, z + Math.sin(a) * 0.035]);
      }
      m.tube(SLOT.chrome, pts, 0.034, 8);
      // Stoßstangenhörner
      for (const s of [-1, 1]) m.rbox(SLOT.chrome, [0.05, 0.13, 0.05], 0.02, [S.endX(d, 0.5, s * 0.36) + d * 0.06, 0.52, s * 0.36]);
    }
  }

  // ---- Heck ----
  const yT = B.tailMid + (B.deck - B.tailMid) * 0.56;
  for (const s of [-1, 1] as const) {
    if (look.lamps === 'round') {
      for (const a of [0.5, 0.72]) {
        disc(-1, SLOT.chrome, s * a * k, yT - 0.02, 0.07, 0.004);
        disc(-1, a < 0.6 ? SLOT.tail : SLOT.tailBar, s * a * k, yT - 0.02, 0.056, 0.01);
      }
    } else if (look.lamps === 'slim') {
      wrapPatch(m, SLOT.tail, S, -1, s * 0.56 * k, 0.6, yT, 0.075, 0.7, 0.004, N(12), N(3));
      wrapPatch(m, SLOT.tailBar, S, -1, s * 0.56 * k, 0.52, yT + 0.008, 0.02, 0.6, 0.008, N(10), 2);
    } else {
      wrapPatch(m, SLOT.tail, S, -1, s * 0.62 * k, 0.52, yT, 0.13, 0.4, 0.004, N(12), N(5));
      wrapPatch(m, SLOT.tailBar, S, -1, s * 0.63 * k, 0.44, yT + 0.03, 0.024, 0.4, 0.008, N(10), 2);
      wrapPatch(m, SLOT.tailBar, S, -1, s * 0.66 * k, 0.36, yT - 0.012, 0.02, 0.4, 0.008, N(8), 2);
      wrapPatch(m, SLOT.plate, S, -1, s * 0.47 * k, 0.1, yT - 0.04, 0.03, 0.4, 0.008, 4, 2);
      wrapPatch(m, SLOT.amber, S, -1, s * 0.73 * k, 0.16, yT - 0.042, 0.028, 0.4, 0.008, 4, 2);
    }
    wrapPatch(m, SLOT.tail, S, -1, s * 0.66 * k, 0.14, 0.455, 0.022, 0.4, 0.005, 4, 2);
  }
  if (look.lamps === 'slim') {
    endPatch(m, SLOT.tail, S, -1, 0, yT, 0.62, 0.03, 0.3, 0.004, N(10), 2);
    endPatch(m, SLOT.tailBar, S, -1, 0, yT + 0.004, 0.6, 0.01, 0.3, 0.008, N(10), 1);
  }
  const yRP = B.tailMid + 0.085;
  endPatch(m, SLOT.dark, S, -1, 0, yRP, 0.5, 0.13, 0.25, 0.005, N(8), 3);
  endPatch(m, SLOT.plate, S, -1, 0, yRP, 0.44, 0.095, 0.1, 0.008, N(8), 3);
  if (look.lamps !== 'slim') endPatch(m, SLOT.chrome, S, -1, 0, yRP + 0.09, 0.56, 0.018, 0.5, 0.008, N(8), 1);
  // Diffusor und Auspuffblenden: ein Rohr beim Vierzylinder, Doppelrohr beim Sechszylinder, vier Rohre beim V8
  wrapPatch(m, SLOT.dark, S, -1, 0, 1.25, B.ground + 0.15, 0.085, 0.5, 0.005, N(16), 2);
  const zp = 0.5 * k;
  const pipes = look.tips === 'quad' ? 4 : look.tips === 'dual' ? 2 : look.tips === 'oval' ? 2 : look.pipes;
  const oval = look.tips === 'oval';
  const zs = pipes === 4 ? [-zp - 0.05, -zp + 0.05, zp - 0.05, zp + 0.05] : pipes === 2 ? (look.tips === 'stock' ? [-zp - 0.05, -zp + 0.05] : [-zp, zp]) : [-zp];
  for (const zz of zs) {
    const x = S.endX(-1, B.ground + 0.1, zz);
    const r = look.tips === 'stock' ? 0.036 : 0.042;
    m.add(SLOT.chrome, new THREE.CylinderGeometry(r, r * 0.95, 0.14, 16, 1, true), mat([x + 0.02, B.ground + 0.1, zz], [0, 0, Math.PI / 2], oval ? [1, 1, 1.7] : 1));
    m.add(SLOT.dark, new THREE.CylinderGeometry(r * 0.85, r * 0.85, 0.01, 12), mat([x + 0.07, B.ground + 0.1, zz], [0, 0, Math.PI / 2], oval ? [1, 1, 1.7] : 1));
  }

  // ---- Flanken ----
  const ARCH = ARCH_R + 0.06;
  for (const s of [-1, 1] as const) {
    for (const x of B.seams) {
      const lo = Math.max(B.ground + 0.08, S.bottom(x) + 0.03);
      const hi = S.beltY(x) + 0.03;
      sidePatch(m, SLOT.dark, S, s, x, (lo + hi) / 2, 0.007, hi - lo, 0, 0.004, 1, N(16));
    }
    const xa = B.rearAxle + ARCH;
    const xb = WHEEL_X - ARCH;
    sidePatch(m, SLOT.dark, S, s, (xa + xb) / 2, B.ground + 0.045, xb - xa, 0.07, 0, 0.004, N(14), 2);
    sidePatch(m, SLOT.amber, S, s, 1.9, 0.79, 0.075, 0.022, 0.7, 0.004, 3, 2);
    for (const x of B.handles.slice(1)) handle(m, S, look.chromeTrim ? SLOT.chrome : SLOT.solid, s, x);
    beltStrip(m, S, look.chromeTrim ? SLOT.chrome : SLOT.gloss, s, B.glassRear + 0.02, B.seams[1] - 0.004);
    // Tankklappe hinten rechts
    if (s > 0) sidePatch(m, SLOT.dark, S, s, B.rearAxle + 0.02, 0.86, 0.16, 0.006, 0, 0.002, 2, 1);
    // Dachreling beim Kombi
    if (body === 'wagon') {
      const pts: V3[] = [];
      for (let i = 0; i <= 8; i++) {
        const x = B.x1 + 0.12 + ((B.x2 - 0.2 - B.x1) * i) / 8;
        pts.push([x, S.roofY(x) + (i === 0 || i === 8 ? -0.012 : 0.03), s * 0.56]);
      }
      m.tube(look.chromeTrim ? SLOT.chrome : SLOT.dark, pts, 0.012, 5);
    }
  }
  // Dachantenne, Heckspoiler, Scheibenwischer
  if (body !== 'sport' && body !== 'classic') {
    const x = Math.max(B.x1 + 0.16, -1.05);
    m.sphere(SLOT.solid, 1, [x, S.roofY(x) + 0.012, 0], [0.1, 0.035, 0.022], 10);
  }
  if (look.wing === 3) {
    const x = B.tail + 0.24;
    const y = S.crown(x);
    m.rbox(SLOT.solid, [0.2, 0.02, B.width * 1.62], 0.008, [x, y + 0.115, 0], [0, 0, 0.1]);
    for (const z of [-0.48, 0.48]) m.rbox(SLOT.gloss, [0.08, 0.12, 0.02], 0.006, [x + 0.01, y + 0.05, z]);
    for (const s of [-1, 1]) m.rbox(SLOT.gloss, [0.22, 0.07, 0.012], 0.004, [x, y + 0.12, s * B.width * 0.81]);
  } else if (look.wing === 2) {
    // Entenbürzel: hochgezogene Abrisskante am Heckdeckel
    const x = B.tail + B.tailLen + 0.06;
    const y = S.crown(x);
    m.rbox(SLOT.solid, [0.16, 0.05, B.width * 1.35], 0.02, [x, y + 0.03, 0], [0, 0, 0.35]);
  } else if (look.wing === 1) {
    const x = B.tail + B.tailLen + 0.02;
    const y = S.crown(x);
    m.rbox(SLOT.gloss, [0.05, 0.018, B.width * 1.3], 0.006, [x, y + 0.008, 0], [0, 0, 0.3]);
  }
  // Frontstoßstange Sport/Rennsport: Splitter und größere Einlässe
  if (look.front > 0) {
    const yl = B.ground + 0.07;
    const x = S.endX(1, yl, 0);
    m.rbox(SLOT.gloss, [0.06 + look.front * 0.03, 0.016, B.width * (look.front === 2 ? 1.5 : 1.3)], 0.006, [x + look.front * 0.012, yl - 0.02, 0]);
    for (const s of [-1, 1]) {
      wrapPatch(m, SLOT.dark, S, 1, s * 0.62 * k, 0.4, 0.4, 0.15, 0.4, 0.007, N(8), N(3));
      if (look.front === 2) m.rbox(SLOT.gloss, [0.1, 0.012, 0.16], 0.004, [S.endX(1, 0.45, s * 0.72) + 0.03, 0.45, s * 0.74], [0, s * 0.4, s * 0.25]);
    }
    endPatch(m, SLOT.dark, S, 1, 0, 0.42, 0.7, 0.13, 0.4, 0.008, N(12), N(4));
  }
  // Heckschürze mit Diffusor
  if (look.rear > 0) {
    const yd = B.ground + 0.12;
    wrapPatch(m, SLOT.gloss, S, -1, 0, 1.05, yd, 0.14, 0.3, 0.008, N(16), 3);
    for (let i = -3; i <= 3; i++) m.rbox(SLOT.gloss, [0.18, 0.11, 0.012], 0.004, [S.endX(-1, yd, i * 0.12) + 0.06, yd - 0.01, i * 0.12]);
  }
  // Seitenschweller
  if (look.skirts) {
    for (const s of [-1, 1]) {
      const xa = B.rearAxle + ARCH_R + 0.04;
      const xb = WHEEL_X - ARCH_R - 0.04;
      m.rbox(SLOT.solid, [xb - xa, 0.07, 0.045], 0.015, [(xa + xb) / 2, B.ground + 0.035, s * (S.sideZ((xa + xb) / 2, B.ground + 0.1) + 0.012)]);
    }
  }
  for (const z of [-0.28, 0.22]) {
    m.tube(SLOT.dark, [[0.86, 0.985, z - 0.02], [0.8, 0.995, z + 0.18], [0.76, 1.005, z + 0.4]], 0.006, 4);
  }
  // Schwarze Windlaufabdeckung zwischen Haube und Scheibe
  m.box(SLOT.dark, [0.3, 0.012, B.width * 1.56], [0.68, 0.972, 0]);
  g = m.build();
  trims.set(key, g);
  return g;
}

/** Anbauteile der Vordertüren (Griff, Spiegel, Zierleiste, Türverkleidung), relativ zum Scharnier. */
export function doorTrimGeometry(body: BodyStyle, look: CarLook) {
  const key = body + +look.chromeTrim + +look.flares;
  let g = doorTrims.get(key);
  if (g) return g;
  const S = bodyShape(body, look.flares);
  const B = S.B;
  const [hx, hz] = doorHinge(S);
  g = [-1, 1].map((s) => {
    const m = new Mesher(SLOTS);
    m.base.makeTranslation(-hx, 0, -s * hz);
    const d1 = B.seams[1];
    const L = hx - d1;
    const xm = (hx + d1) / 2;
    const yb = S.beltY(xm);
    handle(m, S, look.chromeTrim ? SLOT.chrome : SLOT.solid, s, B.handles[0]);
    beltStrip(m, S, look.chromeTrim ? SLOT.chrome : SLOT.gloss, s, d1 + 0.004, A_BASE);
    // Außenspiegel: Fuß, Gehäuse, Spiegelglas
    const mx = A_BASE + 0.05;
    const mz = S.cabinBase(mx) + 0.02;
    const my = S.beltY(mx) + 0.085;
    m.rbox(SLOT.dark, [0.05, 0.03, 0.09], 0.01, [mx, my - 0.03, s * (mz + 0.03)]);
    m.rbox(SLOT.solid, [0.085, 0.095, 0.17], 0.035, [mx - 0.005, my + 0.012, s * (mz + 0.13)], [0, s * 0.12, 0], 3);
    m.rbox(SLOT.chrome, [0.006, 0.07, 0.135], 0.002, [mx - 0.048, my + 0.012, s * (mz + 0.125)], [0, s * 0.12, 0]);
    // Türverkleidung innen: Tafel, Armlehne, Lautsprecher, Zuziehgriff
    const zi = S.width(xm) - 0.075;
    m.rbox(SLOT.seat2, [L - 0.07, yb - 0.42, 0.03], 0.012, [xm, (yb + 0.4) / 2, s * zi]);
    m.rbox(SLOT.dark, [L - 0.09, 0.05, 0.045], 0.015, [xm, yb - 0.012, s * (zi - 0.012)]);
    m.rbox(SLOT.seat, [L * 0.55, 0.06, 0.09], 0.02, [xm - 0.08, yb - 0.24, s * (zi - 0.05)]);
    m.cyl(SLOT.dark, 0.075, 0.075, 0.012, [hx - 0.22, 0.52, s * (zi - 0.02)], [Math.PI / 2, 0, 0], 16);
    m.rbox(SLOT.chrome, [0.1, 0.018, 0.02], 0.006, [xm + 0.12, yb - 0.14, s * (zi - 0.03)]);
    // Stirnseite der Tür (Schloss)
    m.box(SLOT.dark, [0.012, yb - 0.5, 0.05], [d1 + 0.012, (yb + 0.48) / 2, s * (zi + 0.005)]);
    return m.build();
  }) as [THREE.BufferGeometry, THREE.BufferGeometry];
  doorTrims.set(key, g);
  return g;
}

// ---------------------------------------------------------------- Innenraum

const interiors = new Map<string, THREE.BufferGeometry>();

function seat(m: Mesher, x: number, z: number, sporty: boolean) {
  // Sitzfläche mit Seitenwangen
  m.rbox(SLOT.seat, [0.5, 0.11, 0.44], 0.045, [x, 0.5, z], [0, 0, 0.06], 3);
  for (const s of [-1, 1]) m.rbox(SLOT.seat2, [0.46, 0.1, 0.07], 0.03, [x, 0.535, z + s * 0.215], [0, 0, 0.06]);
  // Lehne mit Mittelbahn, Wangen und Kopfstütze
  m.rbox(SLOT.seat, [0.11, 0.62, 0.42], 0.045, [x - 0.31, 0.83, z], [0, 0, 0.17], 3);
  m.rbox(SLOT.seat2, [0.05, 0.5, 0.26], 0.02, [x - 0.265, 0.82, z], [0, 0, 0.17]);
  for (const s of [-1, 1]) m.rbox(SLOT.seat2, [0.12, 0.5, 0.075], 0.03, [x - 0.275, 0.8, z + s * (sporty ? 0.2 : 0.21)], [0, 0, 0.17]);
  if (sporty) m.rbox(SLOT.seat, [0.1, 0.2, 0.24], 0.04, [x - 0.4, 1.19, z], [0, 0, 0.17]);
  else {
    for (const s of [-1, 1]) m.cyl(SLOT.chrome, 0.006, 0.006, 0.1, [x - 0.385, 1.14, z + s * 0.06], [0, 0, 0.17], 6);
    m.rbox(SLOT.seat, [0.1, 0.15, 0.24], 0.04, [x - 0.4, 1.22, z], [0, 0, 0.1], 3);
  }
  // Sitzschienen
  for (const s of [-1, 1]) m.box(SLOT.dark, [0.5, 0.03, 0.03], [x, 0.42, z + s * 0.17]);
}

export function interiorGeometry(body: BodyStyle, detail: number, sportSeats = false, sportWheel = false) {
  const key = body + detail + +sportSeats + +sportWheel;
  let g = interiors.get(key);
  if (g) return g;
  const S = bodyShape(body);
  const B = S.B;
  const m = new Mesher(SLOTS);
  const W = B.width;
  const sporty = sportSeats || body === 'sport' || body === 'coupe';
  /** In flachen Autos sitzt man tiefer. */
  const k = (B.roof - 0.5) / 0.92;
  // Bodenwanne, Mitteltunnel, Schweller innen
  m.box(SLOT.dark, [1.9, 0.03, 1.3], [-0.25, 0.4, 0]);
  m.rbox(SLOT.dark, [1.5, 0.16, 0.2], 0.04, [-0.2, 0.47, 0]);
  for (const s of [-1, 1]) m.box(SLOT.dark, [B.seams[0] - B.seams[1], 0.1, 0.16], [(B.seams[0] + B.seams[1]) / 2, 0.42, s * (W - 0.14)]);
  // Sitze (in der Höhe an die Dachlinie angepasst)
  m.base.makeScale(1, k, 1).setPosition(0, 0.43 * (1 - k), 0);
  for (const z of [-0.36, 0.36]) seat(m, -0.02, z, sporty);
  const rx = Math.max(B.x0 + 0.45, -1.06);
  if (B.rearSeat) {
    m.rbox(SLOT.seat, [0.5, 0.13, 1.24], 0.05, [rx, 0.5, 0], [0, 0, 0.05], 3);
    m.rbox(SLOT.seat, [0.12, 0.56, 1.24], 0.05, [rx - 0.29, 0.8, 0], [0, 0, 0.22], 3);
    m.rbox(SLOT.seat2, [0.05, 0.44, 0.3], 0.02, [rx - 0.245, 0.8, 0], [0, 0, 0.22]);
    for (const z of [-0.4, 0.4]) m.rbox(SLOT.seat, [0.09, 0.13, 0.22], 0.035, [rx - 0.37, 1.12, z], [0, 0, 0.15]);
  } else {
    // Notsitze bzw. Ablage
    m.rbox(SLOT.seat2, [0.36, 0.1, 1.2], 0.04, [rx + 0.05, 0.52, 0]);
  }
  m.base.identity();
  // Mittelkonsole mit Armlehne, Schalthebel und Handbremse
  m.rbox(SLOT.dark, [0.62, 0.12, 0.2], 0.03, [0.08, 0.56, 0]);
  m.rbox(SLOT.seat2, [0.3, 0.06, 0.18], 0.025, [-0.22, 0.63 * k + 0.43 * (1 - k) + 0.04, 0]);
  m.cyl(SLOT.chrome, 0.008, 0.008, 0.1, [0.16, 0.66, 0], [0, 0, -0.2], 6);
  m.sphere(SLOT.dark, 0.028, [0.17, 0.72, 0], [1, 1.2, 1], 10);
  m.rbox(SLOT.gloss, [0.12, 0.012, 0.1], 0.004, [0.17, 0.623, 0]);
  m.rbox(SLOT.dark, [0.18, 0.03, 0.035], 0.012, [-0.02, 0.65, 0.07], [0, 0, 0.25]);
  // Armaturenbrett: Träger, Polster, Instrumentenhutze, Mittelbildschirm, Luftdüsen, Handschuhfach
  m.rbox(SLOT.dark, [0.34, 0.2, W * 1.68], 0.07, [0.62, 0.86, 0], undefined, 3);
  m.rbox(SLOT.seat2, [0.1, 0.06, W * 1.62], 0.025, [0.455, 0.84, 0]);
  m.rbox(SLOT.dark, [0.22, 0.3, 0.26], 0.04, [0.5, 0.68, 0]);
  m.rbox(SLOT.dark, [0.16, 0.1, 0.36], 0.04, [0.52, 0.985, -0.36], [0, 0, -0.12], 3);
  for (const z of [-0.43, -0.29]) {
    m.cyl(SLOT.gloss, 0.058, 0.058, 0.01, [0.455, 0.975, z], [0, 0, Math.PI / 2 - 0.2], 18);
    m.cyl(SLOT.glow, 0.048, 0.048, 0.012, [0.452, 0.975, z], [0, 0, Math.PI / 2 - 0.2], 18);
    m.box(SLOT.tailBar, [0.004, 0.04, 0.004], [0.444, 0.985, z + 0.012], [0.5, 0, -0.2]);
  }
  m.rbox(SLOT.gloss, [0.02, 0.12, 0.24], 0.008, [0.445, 0.93, 0.02], [0, 0, -0.15]);
  m.box(SLOT.lens, [0.004, 0.095, 0.21], [0.434, 0.93, 0.02], [0, 0, -0.15]);
  m.box(SLOT.glow, [0.005, 0.012, 0.19], [0.4335, 0.965, 0.02], [0, 0, -0.15]);
  for (const z of [-0.68, 0.24, 0.68]) m.rbox(SLOT.gloss, [0.02, 0.05, 0.12], 0.008, [0.447, 0.88, z * (W / 0.9)]);
  m.rbox(SLOT.gloss, [0.015, 0.1, 0.2], 0.006, [0.39, 0.74, 0]);
  for (const z of [-0.05, 0.05]) m.cyl(SLOT.chrome, 0.018, 0.018, 0.02, [0.38, 0.71, z], [0, 0, Math.PI / 2], 10);
  m.box(SLOT.gloss, [0.004, 0.11, 0.34], [0.448, 0.76, 0.4]);
  // Lenkrad mit Speichen, Nabe und Lenksäule; dahinter Lenkstockhebel
  const sw: V3 = [0.33, 0.95, -0.36];
  const tilt = 0.36;
  m.base.copy(mat(sw, [0, 0, -tilt]));
  m.torus(SLOT.dark, 0.165, 0.019, [0, 0, 0], [0, Math.PI / 2, 0], detail ? 28 : 16);
  m.rbox(SLOT.dark, [0.05, 0.1, 0.12], 0.025, [0.01, 0, 0]);
  m.rbox(SLOT.chrome, [0.008, 0.03, 0.03], 0.004, [-0.018, 0, 0]);
  for (const a of [0, Math.PI, Math.PI / 2 + Math.PI]) m.rbox(SLOT.gloss, [0.022, 0.035, 0.12], 0.008, [0.005, Math.sin(a) * 0.1, Math.cos(a) * 0.1], [a + Math.PI, 0, 0]);
  m.cyl(SLOT.dark, 0.03, 0.035, 0.26, [0.14, 0, 0], [0, 0, Math.PI / 2], 10);
  for (const s of [-1, 1]) m.rbox(SLOT.dark, [0.015, 0.015, 0.13], 0.005, [0.07, 0.01, s * 0.11], [s * 0.2, 0, 0]);
  m.base.identity();
  // Pedale
  for (const [z, w, y] of [[-0.47, 0.05, 0.47], [-0.36, 0.06, 0.48], [-0.25, 0.045, 0.45]] as const) {
    m.rbox(SLOT.chrome, [0.02, 0.08, w], 0.006, [0.72, y, z], [0, 0, -0.5]);
    m.box(SLOT.dark, [0.012, 0.16, 0.012], [0.75, y + 0.09, z], [0, 0, -0.3]);
  }
  // Seitenverkleidung hinten, Hutablage bzw. Laderaumboden, Dachhimmel
  const d1 = B.seams[1];
  const back = Math.max(B.x0 + 0.1, B.tail + 0.8);
  if (d1 - back > 0.2) for (const s of [-1, 1]) m.rbox(SLOT.seat2, [d1 - back, 0.18, 0.03], 0.012, [(d1 + back) / 2, S.beltY(d1) - 0.09, s * (S.width(back) - 0.1)]);
  if (body === 'wagon' || body === 'hatch') {
    const xa = B.tail + 0.5;
    const xb = rx - 0.4;
    m.box(SLOT.dark, [Math.max(0.1, xb - xa), 0.03, 1.24], [(xa + xb) / 2, 0.72, 0]);
  } else {
    const xa = B.x0 + B.bowR - 0.02;
    const xb = rx - 0.36;
    m.box(SLOT.dark, [Math.max(0.1, xb - xa), 0.02, S.cabinBase(xa) * 1.9], [(xa + xb) / 2, S.beltY(xa) - 0.01, 0]);
  }
  // Innenspiegel
  m.rbox(SLOT.dark, [0.02, 0.05, 0.2], 0.01, [B.x2 + 0.16, B.roof - 0.1, 0]);
  g = m.build();
  interiors.set(key, g);
  return g;
}
