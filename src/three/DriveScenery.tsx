import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { Season } from '../game/grip';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { forestAt, LAKE, PAD, TRACK_WIDTH, WORKSHOP, type DriveWorld } from './driveWorld';
import { adBoardTexture, doorTexture, grassDetailTexture, mountainTexture, roadTexture, rubberTexture, textTexture, tyreWallTexture } from './textures';

/**
 * Darstellung der Probefahrt-Landschaft. Rechenaufwand fürs iPad klein gehalten:
 * Gelände in Kacheln mit drei Detailstufen (THREE.LOD), Straße/Markierungen/Leitplanken als wenige zusammengefasste Netze,
 * Bäume, Häuser und Laternen als Instanzen (je Art ein Zeichenaufruf), keine Schatten in der Landschaft.
 */

const TILE = 205;
const LEVELS: [number, number][] = [
  [40, 0],
  [10, 260],
  [5, 560],
];

/** Wiese, Feld, Waldboden: Farbe je Stelle (als Vertexfarbe). */
function groundColor(x: number, z: number, h: number, out: THREE.Color, w: DriveWorld) {
  // Rennstrecke: gepflegter Rasen, Kiesbetten in den Kurven, Wasser im Hafen dunkel
  // Rallyepiste: Waldboden mit Moos und Gras, fleckig
  if (w.roadKind) return out.setRGB(0.2 + Math.sin(x * 0.07) * 0.03, 0.3 + Math.sin(z * 0.05 + x * 0.02) * 0.05, 0.15);
  if (w.id !== 'land') return w.surface(x, z).kind === 'gravel' ? out.setRGB(0.72, 0.66, 0.5) : out.setRGB(0.34 + Math.sin(x * 0.05) * 0.02, 0.54 + Math.sin(z * 0.04) * 0.03, 0.26);
  const forest = forestAt(x, z);
  const field = Math.sin(x * 0.013 + 0.4) * Math.sin(z * 0.017 - 1.1);
  // Ufer am See: heller Sand bzw. Kies
  const lk = Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
  if (lk < 1.12) return out.setRGB(0.66, 0.6, 0.45);
  // Im Ort Rasen statt Feld
  if (Math.hypot(x, z) < 175) return out.setRGB(0.4, 0.58, 0.28);
  if (forest > 0.12) out.setRGB(0.2, 0.3, 0.16);
  else if (field > 0.55) out.setRGB(0.72, 0.64, 0.3); // reifes Feld
  else if (field < -0.6) out.setRGB(0.44, 0.38, 0.24); // Acker
  else out.setRGB(0.36 + h * 0.003, 0.52 + Math.sin(x * 0.05) * 0.03, 0.25);
  return out;
}

/** Höhen einer Kachel einmal fein berechnen (seg × seg Felder); gröbere Detailstufen lesen jeden k-ten Punkt daraus. */
function tileHeights(w: DriveWorld, cx: number, cz: number, seg: number) {
  const h = new Float32Array((seg + 1) * (seg + 1));
  for (let j = 0; j <= seg; j++)
    for (let i = 0; i <= seg; i++) h[j * (seg + 1) + i] = w.ground(cx - TILE / 2 + (TILE * i) / seg, cz - TILE / 2 + (TILE * j) / seg);
  return h;
}

function terrainTile(w: DriveWorld, heights: Float32Array, fine: number, cx: number, cz: number, seg: number) {
  const k = fine / seg;
  const g = new THREE.PlaneGeometry(TILE, TILE, seg, seg);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    // PlaneGeometry: Zeilen von -z nach +z nach dem Drehen? Lage aus den Koordinaten selbst bestimmen
    const ix = Math.round(((pos.getX(i) + TILE / 2) / TILE) * seg);
    const iz = Math.round(((pos.getZ(i) + TILE / 2) / TILE) * seg);
    // Grobe Detailstufen (weiter weg) etwas tiefer: ihr weites Gitter würde sonst über eingeschnittene Straßen ragen
    const h = heights[iz * k * (fine + 1) + ix * k] - (k >= 8 ? 1.4 : k >= 4 ? 0.7 : 0);
    pos.setY(i, h);
    groundColor(pos.getX(i) + cx, pos.getZ(i) + cz, h, c, w).toArray(colors, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

/** Band entlang der Straße (Fahrbahn, Linien, Bankett) zwischen den seitlichen Abständen a und b. */
function band(w: DriveWorld, a: number, b: number, lift: number, keep: (i: number) => boolean) {
  const pos: number[] = [];
  const idx: number[] = [];
  const s = w.samples;
  const n = s.length;
  const uv: number[] = [];
  let v = 0;
  for (let i = 0; i < n; i++) {
    if (!keep(i)) continue;
    const p = s[i];
    const q = s[(i + 1) % n];
    for (const r of [p, q]) pos.push(r.x + r.nx * a, r.y + lift, r.z + r.nz * a, r.x + r.nx * b, r.y + lift, r.z + r.nz * b);
    // Asphaltstruktur: 6 m je Kachel längs, quer über die ganze Breite
    const v0 = p.s / 6;
    const v1 = v0 + 2 / 6;
    uv.push(0, v0, (b - a) / 6, v0, 0, v1, (b - a) / 6, v1);
    idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    v += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}


/** Seitliche Lage der Ideallinie je Streckenpunkt: in Kurven zur Innenseite (Scheitelpunkt), geglättet. */
function racingLine(w: DriveWorld) {
  const s = w.samples;
  const n = s.length;
  const raw = s.map((p, i) => {
    const a = s[(i - 12 + n) % n];
    const b = s[(i + 12) % n];
    // Pfeilhöhe der Sehne: positiv zur Innenseite der Kurve (in Richtung der Normale)
    return ((a.x + b.x) / 2 - p.x) * p.nx + ((a.z + b.z) / 2 - p.z) * p.nz;
  });
  const lim = w.roadWidth / 2 - 1.6;
  return raw.map((_, i) => {
    let sum = 0;
    for (let k = -8; k <= 8; k++) sum += raw[(i + k + n) % n];
    return Math.max(-lim, Math.min(lim, (sum / 17) * 0.55));
  });
}

/** Flaches Band mit veränderlicher Mitte (Ideallinie, Gummiabrieb). u quer 0…1, v längs. */
function ribbon(w: DriveWorld, mid: (i: number) => number, half: number, lift: number) {
  const pos: number[] = [];
  const uv: number[] = [];
  const s = w.samples;
  const n = s.length;
  for (let i = 0; i <= n; i++) {
    const p = s[i % n];
    const c = mid(i % n);
    pos.push(p.x + p.nx * (c - half), p.y + lift, p.z + p.nz * (c - half), p.x + p.nx * (c + half), p.y + lift, p.z + p.nz * (c + half));
    uv.push(0, i / 8, 1, i / 8);
  }
  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Senkrechte Wand entlang der Strecke (Reifenstapel, Werbebanden) im Abstand `off` (Vorzeichen = Seite). u läuft mit der Strecke (Meter / uLen). */
function wallBand(w: DriveWorld, off: (i: number) => number, y0: number, y1: number, keep: (i: number) => boolean, uLen: number) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const s = w.samples;
  const n = s.length;
  let v = 0;
  for (let i = 0; i < n; i++) {
    if (!keep(i) || !keep((i + 1) % n)) continue;
    const o = off(i);
    // Rückseite einer Wand links herum zeigen: Reihenfolge so, dass die Schrift von der Fahrbahn aus lesbar ist
    const flip = o < 0;
    for (const [r, k] of [[s[i], i], [s[(i + 1) % n], i + 1]] as const) {
      const x = r.x + r.nx * o;
      const z = r.z + r.nz * o;
      pos.push(x, r.y + y0, z, x, r.y + y1, z);
      const u = (flip ? -1 : 1) * (k * 2) / uLen;
      uv.push(u, 0, u, 1);
    }
    idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    v += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Leitplanke: Pfosten alle 4 m (Instanzen) und das Profilband. */
function rails(w: DriveWorld) {
  const s = w.samples;
  const n = s.length;
  const bands: THREE.BufferGeometry[] = [];
  const posts: THREE.Matrix4[] = [];
  for (const side of [1, -1] as const) {
    const on = (i: number) => (side > 0 ? s[i].railL : s[i].railR);
    bands.push(
      (() => {
        const pos: number[] = [];
        const idx: number[] = [];
        let v = 0;
        for (let i = 0; i < n; i++) {
          if (!on(i) || !on((i + 1) % n)) continue;
          const p = s[i];
          const q = s[(i + 1) % n];
          for (const r of [p, q]) {
            const x = r.x + r.nx * side * w.railOffset;
            const z = r.z + r.nz * side * w.railOffset;
            pos.push(x, r.y + 0.48, z, x, r.y + 0.78, z);
          }
          idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
          v += 4;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        return g;
      })(),
    );
    for (let i = 0; i < n; i += 2) if (on(i)) posts.push(new THREE.Matrix4().makeTranslation(s[i].x + s[i].nx * side * (w.railOffset + 0.08), s[i].y + 0.35, s[i].z + s[i].nz * side * (w.railOffset + 0.08)));
  }
  return { band: mergeGeometries(bands), posts };
}

const SIGN_TEXT: Record<string, { text: string; bg: string; fg: string; sub?: string }> = {
  town: { text: 'Grünbach', bg: '#f2c200', fg: '#111', sub: 'Landkreis Werkstatt' },
  speed50: { text: '50', bg: '#ffffff', fg: '#111' },
  speed100: { text: '100', bg: '#ffffff', fg: '#111' },
  curveL: { text: '↰', bg: '#ffffff', fg: '#c01818' },
  curveR: { text: '↱', bg: '#ffffff', fg: '#c01818' },
  cross: { text: '✕', bg: '#ffffff', fg: '#c01818', sub: 'Kreuzung' },
  pad: { text: 'Testgelände', bg: '#1d3f8f', fg: '#ffffff', sub: 'Freies Fahren · Driften' },
};

/** Viele gleiche Objekte in einem Zeichenaufruf; `cull`: Block wird bei Blick weg gar nicht gezeichnet. */
function Instances({ geometry, material, matrices, colors, cull = false }: { geometry: THREE.BufferGeometry; material: THREE.Material; matrices: THREE.Matrix4[]; colors?: THREE.Color[]; cull?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    matrices.forEach((x, i) => m.setMatrixAt(i, x));
    if (colors) colors.forEach((c, i) => m.setColorAt(i, c));
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [matrices, colors]);
  return <instancedMesh ref={ref} args={[geometry, material, matrices.length]} frustumCulled={cull} raycast={() => null} />;
}

const built = new Map<string, ReturnType<typeof build>>();
function build(w: DriveWorld) {
  const ROAD_WIDTH = w.roadWidth;
  const land = w.id === 'land';
  const rally = !!w.roadKind;
  // Gelände-Kacheln mit Detailstufen
  const tiles: THREE.LOD[] = [];
  const grass = grassDetailTexture().clone();
  grass.repeat.set(TILE / 4, TILE / 4);
  grass.needsUpdate = true;
  const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: grass, color: '#d6e3c4' });
  for (let cx = -w.extent + TILE / 2; cx < w.extent; cx += TILE)
    for (let cz = -w.extent + TILE / 2; cz < w.extent; cz += TILE) {
      const lod = new THREE.LOD();
      const heights = tileHeights(w, cx, cz, LEVELS[0][0]);
      for (const [seg, dist] of LEVELS) {
        const m = new THREE.Mesh(terrainTile(w, heights, LEVELS[0][0], cx, cz, seg), groundMat);
        m.raycast = () => null;
        lod.addLevel(m, dist);
      }
      lod.position.set(cx, 0, cz);
      // Gitterpunkte liegen in Weltkoordinaten relativ zur Kachelmitte: Kachel selbst verschieben
      lod.children.forEach((c) => c.position.set(0, 0, 0));
      tiles.push(lod);
    }
  const notCross = (i: number) => !w.samples[i].crossing;
  const dashed = (i: number) => !w.samples[i].crossing && Math.floor(w.samples[i].s / 6) % 2 === 0;
  const road = band(w, -ROAD_WIDTH / 2, ROAD_WIDTH / 2, 0.02, () => true);
  const shoulder = mergeGeometries([band(w, ROAD_WIDTH / 2, ROAD_WIDTH / 2 + 0.9, 0.0, () => true), band(w, -ROAD_WIDTH / 2 - 0.9, -ROAD_WIDTH / 2, 0.0, () => true)]);
  // Rallyepiste: keine Fahrbahnmarkierung
  const lines = rally ? new THREE.BufferGeometry() : mergeGeometries([band(w, ROAD_WIDTH / 2 - 0.35, ROAD_WIDTH / 2 - 0.2, 0.035, notCross), band(w, -ROAD_WIDTH / 2 + 0.2, -ROAD_WIDTH / 2 + 0.35, 0.035, notCross), ...(land ? [band(w, -0.07, 0.07, 0.035, dashed)] : [])]);
  // Rennstrecke: rot-weiße Randsteine (Kerbs) in den Kurven, auf beiden Seiten
  const curvy = (i: number) => {
    for (let k = -6; k <= 6; k += 2) if (Math.abs(w.samples[(i + k + w.samples.length) % w.samples.length].curv) > 1 / 140) return true;
    return false;
  };
  const kerbRed = land || rally ? null : mergeGeometries([1, -1].map((sd) => band(w, sd > 0 ? ROAD_WIDTH / 2 : -ROAD_WIDTH / 2 - 1.1, sd > 0 ? ROAD_WIDTH / 2 + 1.1 : -ROAD_WIDTH / 2, 0.03, (i) => curvy(i) && i % 2 === 0)));
  const kerbWhite = land || rally ? null : mergeGeometries([1, -1].map((sd) => band(w, sd > 0 ? ROAD_WIDTH / 2 : -ROAD_WIDTH / 2 - 1.1, sd > 0 ? ROAD_WIDTH / 2 + 1.1 : -ROAD_WIDTH / 2, 0.03, (i) => curvy(i) && i % 2 === 1)));
  // Rennstrecke: Gummiabrieb auf der Ideallinie, Reifenstapel außen in den Kurven, Werbebanden an den Geraden
  let rubber: THREE.BufferGeometry | null = null;
  let tyres: THREE.BufferGeometry | null = null;
  let ads: THREE.BufferGeometry | null = null;
  let leitpfosten: THREE.Matrix4[] = [];
  if (!land && !rally) {
    const line = racingLine(w);
    rubber = ribbon(w, (i) => line[i], 1.25, 0.028);
    const n = w.samples.length;
    // Kurvenaußenseite: der Ideallinie entgegengesetzt; Reifenstapel kurz vor der Planke
    const bend = (i: number) => Math.abs(line[i]) > 1.2;
    const near = (i: number, f: (j: number) => boolean) => {
      for (let k = -10; k <= 10; k += 2) if (f((i + k + n) % n)) return true;
      return false;
    };
    const tyreOff = w.railOffset - 0.55;
    tyres = mergeGeometries([1, -1].map((sd) => wallBand(w, () => sd * tyreOff, 0, 0.82, (i) => near(i, (j) => bend(j) && Math.sign(line[j]) === -sd), 2)));
    const straight = (i: number) => !near(i, bend) && Math.floor(w.samples[i].s / 120) % 2 === 0;
    ads = mergeGeometries([1, -1].map((sd) => wallBand(w, () => sd * (w.railOffset + 0.9), 0.15, 1.15, straight, 32)));
  } else if (land) {
    // Landstraße: Leitpfosten alle 50 m beidseits (weiß mit schwarzem Band)
    leitpfosten = w.samples.flatMap((p, i) => {
      if (p.town || p.crossing || i % 25 !== 0) return [];
      return [1, -1].map((sd) => {
        const d = ROAD_WIDTH / 2 + 1.1;
        return new THREE.Matrix4().compose(new THREE.Vector3(p.x + p.nx * sd * d, p.y, p.z + p.nz * sd * d), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-p.tz, p.tx)), new THREE.Vector3(1, 1, 1));
      });
    });
  }
  const rail = rails(w);
  // Bäume: Nadelbaum (Kegel) und Laubbaum (Kugel), Stamm gemeinsam
  // Nadelbaum aus drei gestaffelten Kegeln (wirkt wie Astetagen), Laubbaum als grob facettierte Kugel
  const cone = mergeGeometries([new THREE.ConeGeometry(1, 0.55, 7).translate(0, 0.275, 0), new THREE.ConeGeometry(0.78, 0.5, 7).translate(0, 0.52, 0), new THREE.ConeGeometry(0.52, 0.45, 7).translate(0, 0.775, 0)]);
  const crown = new THREE.IcosahedronGeometry(1, 1);
  const trunk = new THREE.CylinderGeometry(0.16, 0.22, 1, 4, 1, true).translate(0, 0.5, 0);
  // Bäume in Blöcken von ~410 m: Blöcke außerhalb des Blickfelds werden gar nicht gezeichnet
  const CHUNK = 410;
  const chunks = new Map<string, { conif: THREE.Matrix4[]; leafy: THREE.Matrix4[]; trunks: THREE.Matrix4[]; leafColors: THREE.Color[]; conifColors: THREE.Color[] }>();
  const q = new THREE.Quaternion();
  for (const t of w.trees) {
    const ck = Math.floor(t.x / CHUNK) + ',' + Math.floor(t.z / CHUNK);
    if (!chunks.has(ck)) chunks.set(ck, { conif: [], leafy: [], trunks: [], leafColors: [], conifColors: [] });
    const { conif, leafy, trunks, leafColors, conifColors } = chunks.get(ck)!;
    const y = w.ground(t.x, t.z);
    const rot = q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (t.x * 13 + t.z * 7) % 6.28);
    trunks.push(new THREE.Matrix4().compose(new THREE.Vector3(t.x, y - 0.2, t.z), rot, new THREE.Vector3(1, t.kind ? t.h * 0.45 : t.h * 0.3, 1)));
    if (t.kind === 0) {
      conif.push(new THREE.Matrix4().compose(new THREE.Vector3(t.x, y + t.h * 0.18, t.z), rot, new THREE.Vector3(t.h * 0.26, t.h * 0.86, t.h * 0.26)));
      conifColors.push(new THREE.Color().setHSL(0.3 + ((t.x * 0.29) % 0.04), 0.38, 0.17 + ((t.z * 0.11) % 0.06)));
    }
    else {
      leafy.push(new THREE.Matrix4().compose(new THREE.Vector3(t.x, y + t.h * 0.62, t.z), rot, new THREE.Vector3(t.h * 0.34, t.h * 0.3, t.h * 0.34)));
      leafColors.push(new THREE.Color().setHSL(0.24 + ((t.x * 0.37) % 0.06), 0.45, 0.28 + ((t.z * 0.13) % 0.08)));
    }
  }
  // Häuser: Kasten und Satteldach als Instanzen mit Farbe je Haus
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const roofShape = new THREE.Shape([new THREE.Vector2(-0.55, 0), new THREE.Vector2(0.55, 0), new THREE.Vector2(0, 0.55)]);
  const roof = new THREE.ExtrudeGeometry(roofShape, { depth: 1.08, bevelEnabled: false }).translate(0, 0, -0.54);
  const walls: THREE.Matrix4[] = [];
  const roofs: THREE.Matrix4[] = [];
  const wallColors: THREE.Color[] = [];
  const roofColors: THREE.Color[] = [];
  const winRows: THREE.Matrix4[] = [];
  for (const h of w.houses) {
    const y = w.ground(h.x, h.z) - 0.3;
    const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), h.rot);
    walls.push(new THREE.Matrix4().compose(new THREE.Vector3(h.x, y, h.z), rot, new THREE.Vector3(h.w, h.h, h.d)));
    roofs.push(new THREE.Matrix4().compose(new THREE.Vector3(h.x, y + h.h, h.z), rot.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)), new THREE.Vector3(h.d * 1.05, h.d * 0.75, h.w)));
    wallColors.push(new THREE.Color(h.color));
    roofColors.push(new THREE.Color(h.x > 0 ? '#8a3a2a' : '#5b4a44'));
    // Fensterbänder auf beiden Längsseiten
    // Fensterbänder: dunkler Streifen, der auf beiden Längsseiten knapp aus der Wand tritt
    for (const fl of [0.3, 0.68]) winRows.push(new THREE.Matrix4().compose(new THREE.Vector3(h.x, y + h.h * fl, h.z), rot, new THREE.Vector3(h.w * 0.8, 0.9, h.d + 0.06)));
  }
  // Laternen
  const pole = new THREE.CylinderGeometry(0.07, 0.09, 6, 6).translate(0, 3, 0);
  const lampHead = new THREE.BoxGeometry(0.9, 0.16, 0.32).translate(0.45, 6, 0);
  const poles = w.lamps.map((l) => new THREE.Matrix4().compose(new THREE.Vector3(l.x, w.ground(l.x, l.z), l.z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
  const heads = w.lamps.map((l) => {
    // Kopf zur Straße hin: Richtung zur nächsten Straßenmitte
    const near = w.nearest(l.x, l.z, 0);
    const s = w.samples[near.i];
    const ang = Math.atan2(-(s.z - l.z), s.x - l.x);
    return new THREE.Matrix4().compose(new THREE.Vector3(l.x, w.ground(l.x, l.z), l.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang), new THREE.Vector3(1, 1, 1));
  });
  // Testgelände: Asphaltfläche mit Driftkreisen, Slalomlinie und Pylonen (nur Deko, man darf sie umfahren)
  const pw = PAD.maxX - PAD.minX;
  const pd = PAD.maxZ - PAD.minZ;
  const pad = new THREE.PlaneGeometry(pw, pd).rotateX(-Math.PI / 2).translate((PAD.minX + PAD.maxX) / 2, w.padY + 0.03, (PAD.minZ + PAD.maxZ) / 2);
  const circles = [
    { x: PAD.minX + 42, z: PAD.minZ + 62, r: 24 },
    { x: PAD.maxX - 42, z: PAD.minZ + 62, r: 16 },
  ];
  const marks = mergeGeometries([
    ...circles.map((c) => new THREE.RingGeometry(c.r - 0.15, c.r + 0.15, 64).rotateX(-Math.PI / 2).translate(c.x, w.padY + 0.045, c.z)),
    // Randlinie und Slalomgasse in der Mitte
    ...[PAD.minZ + 1, PAD.maxZ - 1].map((z) => new THREE.PlaneGeometry(pw - 2, 0.2).rotateX(-Math.PI / 2).translate((PAD.minX + PAD.maxX) / 2, w.padY + 0.045, z)),
    ...[PAD.minX + 1, PAD.maxX - 1].map((x) => new THREE.PlaneGeometry(0.2, pd - 2).rotateX(-Math.PI / 2).translate(x, w.padY + 0.045, (PAD.minZ + PAD.maxZ) / 2)),
    ...Array.from({ length: 12 }, (_, i) => new THREE.PlaneGeometry(3, 0.2).rotateX(-Math.PI / 2).translate(PAD.minX + 20 + i * 10, w.padY + 0.045, PAD.maxZ - 18)),
  ]);
  const cones = [
    ...Array.from({ length: 10 }, (_, i) => [PAD.minX + 25 + i * 11, PAD.maxZ - 18 + (i % 2 ? 0 : 0)] as const),
    ...circles.flatMap((c) => Array.from({ length: 8 }, (_, i) => [c.x + Math.cos((i / 8) * Math.PI * 2) * 2.5, c.z + Math.sin((i / 8) * Math.PI * 2) * 2.5] as const)),
  ].map(([x, z]) => new THREE.Matrix4().makeTranslation(x, w.padY + 0.03, z));
  const coneGeo = new THREE.ConeGeometry(0.22, 0.7, 8).translate(0, 0.35, 0);
  // Heuballen: liegende Rundballen (Achse quer)
  const baleGeo = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 12).rotateZ(Math.PI / 2).translate(0, 0.72, 0);
  const baleMats = w.bales.map((b) => new THREE.Matrix4().compose(new THREE.Vector3(b.x, w.ground(b.x, b.z), b.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.rot), new THREE.Vector3(1, 1, 1)));
  // Feldwege: Schotterband, das dem Gelände folgt (etwas angehoben, damit es nicht im Boden versinkt)
  const gravel = !w.tracks.length ? new THREE.BufferGeometry() : mergeGeometries(
    w.tracks.map((t) => {
      const pos: number[] = [];
      const idx: number[] = [];
      for (let i = 0; i < t.length; i++) {
        const a = t[Math.max(0, i - 1)];
        const b2 = t[Math.min(t.length - 1, i + 1)];
        const l = Math.hypot(b2.x - a.x, b2.z - a.z) || 1;
        const nx = (b2.z - a.z) / l;
        const nz = -(b2.x - a.x) / l;
        for (const side of [-1, 1]) {
          const x = t[i].x + nx * side * (TRACK_WIDTH / 2);
          const z = t[i].z + nz * side * (TRACK_WIDTH / 2);
          pos.push(x, w.ground(x, z) + 0.14, z);
        }
        if (i > 0) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    }),
  );
  // See: Wasserfläche (Ellipse)
  const lake = new THREE.CircleGeometry(1, 72).rotateX(-Math.PI / 2).scale(LAKE.rx, 1, LAKE.rz).translate(LAKE.x, w.lakeY, LAKE.z);
  // Zaun: Pfosten und zwei Querlatten je Feld (zwischen benachbarten Pfosten, nicht über die Einfahrt)
  const fencePosts = w.fence.map((p) => new THREE.Matrix4().makeTranslation(p.x, w.ground(p.x, p.z) + 0.6, p.z));
  const fenceRails: THREE.BufferGeometry[] = [];
  for (let i = 0; i < w.fence.length; i++)
    for (let j = i + 1; j < Math.min(w.fence.length, i + 4); j++) {
      const a = w.fence[i];
      const c = w.fence[j];
      const d = Math.hypot(c.x - a.x, c.z - a.z);
      if (d > 2.6 || d < 2.4) continue;
      for (const hgt of [0.55, 1.05]) {
        const g = new THREE.BoxGeometry(d, 0.08, 0.04).rotateY(-Math.atan2(c.z - a.z, c.x - a.x));
        g.translate((a.x + c.x) / 2, (w.ground(a.x, a.z) + w.ground(c.x, c.z)) / 2 + hgt, (a.z + c.z) / 2);
        fenceRails.push(g);
      }
    }
  const fence = fenceRails.length ? mergeGeometries(fenceRails) : new THREE.BufferGeometry();
  // Tribünen: Unterbau, ansteigende Sitzreihen (bunt), Dach auf Stützen
  const standParts: { geo: THREE.BufferGeometry; color: string }[] = [];
  for (const st of w.stands) {
    const y = w.ground(st.x, st.z);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), st.rot);
    const m = (geo: THREE.BufferGeometry, dx: number, dy: number, dz: number) => geo.applyQuaternion(q).translate(st.x + dx * Math.cos(st.rot) + dz * Math.sin(st.rot), y + dy, st.z - dx * Math.sin(st.rot) + dz * Math.cos(st.rot));
    // lokal −z zeigt von der Strecke weg: die Reihen steigen nach hinten an, Blick auf die Fahrbahn
    for (let r = 0; r < 6; r++) standParts.push({ geo: m(new THREE.BoxGeometry(st.len, 0.9 + r * 0.9, 1.6), 0, (0.9 + r * 0.9) / 2, -(0.8 + r * 1.6)), color: r % 2 ? '#2f5fa8' : '#d0d4d8' });
    standParts.push({ geo: m(new THREE.BoxGeometry(st.len + 2, 0.25, 11), 0, 8.4, -4.8), color: '#e8ecef' });
    for (const dx of [-st.len / 2, 0, st.len / 2]) standParts.push({ geo: m(new THREE.BoxGeometry(0.3, 8.4, 0.3), dx, 4.2, -9.8), color: '#8d949b' });
  }
  const standGeo = standParts.length ? new Map(['#2f5fa8', '#d0d4d8', '#e8ecef', '#8d949b'].map((c) => [c, mergeGeometries(standParts.filter((p) => p.color === c).map((p) => p.geo))])) : new Map();
  const water = w.water ? new THREE.PlaneGeometry(w.water.w, w.water.d).rotateX(-Math.PI / 2).translate(w.water.x, w.water.y, w.water.z) : null;
  return { rubber, tyres, ads, leitpfosten, land, kerbRed, kerbWhite, standGeo, water, w, tiles, road, shoulder, lines, rail, cone, crown, trunk, chunks: [...chunks.values()], box, roof, walls, roofs, wallColors, roofColors, winRows, pole, lampHead, poles, heads, groundMat, pad, marks, cones, coneGeo, gravel, baleGeo, baleMats, lake, fencePosts, fence };
}

export function DriveScenery({ world, snowy = false, wet = false, season = 'summer' }: { world: DriveWorld; snowy?: boolean; wet?: boolean; season?: Season }) {
  const b = useMemo(() => {
    let x = built.get(world.id);
    if (!x) built.set(world.id, (x = build(world)));
    return x;
  }, [world]);
  const mats = useMemo(
    () => ({
      road: new THREE.MeshLambertMaterial({ color: '#4f5257', map: roadTexture(), side: THREE.DoubleSide }),
      shoulder: new THREE.MeshLambertMaterial({ color: '#7b7466', side: THREE.DoubleSide }),
      line: new THREE.MeshBasicMaterial({ color: '#e9e9e4', side: THREE.DoubleSide }),
      rail: new THREE.MeshLambertMaterial({ color: '#c6ccd2', side: THREE.DoubleSide }),
      post: new THREE.MeshLambertMaterial({ color: '#8d949b' }),
      conif: new THREE.MeshLambertMaterial({ color: '#ffffff' }),
      leafy: new THREE.MeshLambertMaterial({ color: '#ffffff' }),
      trunk: new THREE.MeshLambertMaterial({ color: '#5a4430' }),
      wall: new THREE.MeshLambertMaterial({ color: '#ffffff' }),
      roof: new THREE.MeshLambertMaterial({ color: '#ffffff' }),
      win: new THREE.MeshLambertMaterial({ color: '#3a4656' }),
      pole: new THREE.MeshLambertMaterial({ color: '#5d636a' }),
      lamp: new THREE.MeshBasicMaterial({ color: '#fff4d0' }),
      pad: new THREE.MeshLambertMaterial({ color: '#55585d', map: (() => {
        const t = roadTexture().clone();
        t.repeat.set((PAD.maxX - PAD.minX) / 6, (PAD.maxZ - PAD.minZ) / 6);
        t.needsUpdate = true;
        return t;
      })() }),
      water: new THREE.MeshPhongMaterial({ color: '#3f7192', specular: '#cfe6ff', shininess: 80, transparent: true, opacity: 0.88 }),
      wood: new THREE.MeshLambertMaterial({ color: '#8a6a48' }),
      gravel: new THREE.MeshLambertMaterial({ color: '#a39784', side: THREE.DoubleSide }),
      cone: new THREE.MeshLambertMaterial({ color: '#ff7a1a' }),
      bale: new THREE.MeshLambertMaterial({ color: '#d9bd6a' }),
      kerbRed: new THREE.MeshLambertMaterial({ color: '#c8231e', side: THREE.DoubleSide }),
      rubber: new THREE.MeshBasicMaterial({ color: '#0a0a0b', alphaMap: rubberTexture(), transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
      tyres: new THREE.MeshLambertMaterial({ map: (() => { const t = tyreWallTexture(); return t; })(), side: THREE.DoubleSide }),
      ads: new THREE.MeshLambertMaterial({ map: adBoardTexture(), side: THREE.DoubleSide, emissive: '#ffffff', emissiveIntensity: 0.15, emissiveMap: adBoardTexture() }),
      leit: new THREE.MeshLambertMaterial({ color: '#f2f2ee' }),
      leitBand: new THREE.MeshBasicMaterial({ color: '#141414' }),
      kerbWhite: new THREE.MeshLambertMaterial({ color: '#f2f2f2', side: THREE.DoubleSide }),
    }),
    [],
  );
  const postGeo = useMemo(() => new THREE.BoxGeometry(0.12, 0.7, 0.12), []);
  // Witterung und Jahreszeit: Schnee auf Wiesen und Bäumen, nasse (dunklere) Straße, Herbstlaub, kahler Winter
  const snowMat = useMemo(() => {
    const t = grassDetailTexture().clone();
    t.repeat.set(TILE / 6, TILE / 6);
    t.needsUpdate = true;
    return new THREE.MeshLambertMaterial({ map: t, color: '#f3f6fa' });
  }, []);
  useEffect(() => {
    for (const t of b.tiles) for (const l of t.levels) (l.object as THREE.Mesh).material = snowy ? snowMat : b.groundMat;
    const own = world.roadKind;
    mats.road.color.set(own === 'gravel' ? '#b39c7c' : own === 'mud' ? '#6e5a44' : own === 'snow' ? '#e9edf2' : snowy ? '#8d939a' : wet ? '#35383d' : '#4f5257');
    mats.shoulder.color.set(snowy ? '#e4e8ee' : own === 'mud' ? '#5a4a38' : '#7b7466');
    mats.leafy.color.set(snowy ? '#e6ece8' : season === 'autumn' ? '#ffb46a' : season === 'winter' ? '#a8987e' : season === 'spring' ? '#d8ffc8' : '#ffffff');
    mats.conif.color.set(snowy ? '#cfdcd4' : '#ffffff');
    mats.trunk.color.set(snowy ? '#6a5640' : '#5a4430');
  }, [b, snowy, wet, season, world, mats, snowMat]);
  const leitGeo = useMemo(() => ({ post: new THREE.BoxGeometry(0.12, 1.0, 0.1).translate(0, 0.5, 0), band: new THREE.BoxGeometry(0.125, 0.22, 0.105).translate(0, 0.78, 0) }), []);
  return (
    <>
      {b.tiles.map((t, i) => (
        <primitive key={i} object={t} />
      ))}
      <mesh geometry={b.shoulder} material={mats.shoulder} raycast={() => null} />
      <mesh geometry={b.road} material={mats.road} raycast={() => null} />
      <mesh geometry={b.lines} material={mats.line} raycast={() => null} />
      <mesh geometry={b.rail.band} material={mats.rail} raycast={() => null} />
      {b.land && (
        <>
          <mesh geometry={b.pad} material={mats.pad} raycast={() => null} />
          <mesh geometry={b.marks} material={mats.line} raycast={() => null} />
          <Instances geometry={b.coneGeo} material={mats.cone} matrices={b.cones} />
          <mesh geometry={b.gravel} material={mats.gravel} raycast={() => null} />
          <Instances geometry={b.baleGeo} material={mats.bale} matrices={b.baleMats} />
          <mesh geometry={b.lake} material={mats.water} raycast={() => null} />
          <Instances geometry={postGeo} material={mats.wood} matrices={b.fencePosts} />
          <mesh geometry={b.fence} material={mats.wood} raycast={() => null} />
          <Workshop y={b.w.apronY} />
          <Sign x={PAD.minX + 6} y={b.w.padY} z={PAD.minZ + 2} rot={0} kind="pad" />
        </>
      )}
      {b.rubber && <mesh geometry={b.rubber} material={mats.rubber} renderOrder={1} raycast={() => null} />}
      {b.tyres && <mesh geometry={b.tyres} material={mats.tyres} raycast={() => null} />}
      {b.ads && <mesh geometry={b.ads} material={mats.ads} raycast={() => null} />}
      {b.leitpfosten.length > 0 && (
        <>
          <Instances geometry={leitGeo.post} material={mats.leit} matrices={b.leitpfosten} />
          <Instances geometry={leitGeo.band} material={mats.leitBand} matrices={b.leitpfosten} />
        </>
      )}
      {!b.land && b.baleMats.length > 0 && <Instances geometry={b.baleGeo} material={mats.bale} matrices={b.baleMats} />}
      {b.kerbRed && <mesh geometry={b.kerbRed} material={mats.kerbRed} raycast={() => null} />}
      {b.kerbWhite && <mesh geometry={b.kerbWhite} material={mats.kerbWhite} raycast={() => null} />}
      {[...b.standGeo.entries()].map(([c, g]) => (
        <mesh key={c} geometry={g} raycast={() => null}>
          <meshLambertMaterial color={c} />
        </mesh>
      ))}
      {b.water && <mesh geometry={b.water} material={mats.water} raycast={() => null} />}
      <Mountains />
      <Instances geometry={postGeo} material={mats.post} matrices={b.rail.posts} />
      {b.chunks.map((c, i) => (
        <group key={i}>
          <Instances geometry={b.trunk} material={mats.trunk} matrices={c.trunks} cull />
          {c.conif.length > 0 && <Instances geometry={b.cone} material={mats.conif} matrices={c.conif} colors={c.conifColors} cull />}
          {c.leafy.length > 0 && <Instances geometry={b.crown} material={mats.leafy} matrices={c.leafy} colors={c.leafColors} cull />}
        </group>
      ))}
      <Instances geometry={b.box} material={mats.wall} matrices={b.walls} colors={b.wallColors} />
      <Instances geometry={b.roof} material={mats.roof} matrices={b.roofs} colors={b.roofColors} />
      <Instances geometry={b.box} material={mats.win} matrices={b.winRows} />
      <Instances geometry={b.pole} material={mats.pole} matrices={b.poles} />
      <Instances geometry={b.lampHead} material={mats.lamp} matrices={b.heads} />
      {b.w.signs.map((s, i) =>
        s.kind === 'dir' ? <Pointer key={i} {...s} text={s.text ?? ''} y={b.w.ground(s.x, s.z)} /> : <Sign key={i} {...s} y={b.w.ground(s.x, s.z)} />,
      )}
    </>
  );
}

const signTex = new Map<string, THREE.Texture>();
const wide0 = (kind: string) => kind === 'town' || kind === 'pad';
function Sign({ x, y, z, rot, kind }: { x: number; y: number; z: number; rot: number; kind: string }) {
  const t = SIGN_TEXT[kind];
  const tex = useMemo(() => {
    let tx = signTex.get(kind);
    if (!tx) signTex.set(kind, (tx = textTexture(t.text, { bg: t.bg, fg: t.fg, w: 256, h: wide0(kind) ? 128 : 256, font: wide0(kind) ? 52 : 140, sub: t.sub })));
    return tx;
  }, [kind]);
  const round = kind === 'speed50' || kind === 'speed100';
  const wide = kind === 'town' || kind === 'pad';
  // Schild blickt dem ankommenden Verkehr entgegen (Vorderseite gegen die Fahrtrichtung)
  return (
    <group position={[x, y, z]} rotation={[0, rot - Math.PI / 2, 0]}>
      <mesh position={[0, 1.1, 0]} raycast={() => null}>
        <cylinderGeometry args={[0.04, 0.04, 2.2, 5]} />
        <meshLambertMaterial color="#8d949b" />
      </mesh>
      <mesh position={[0, 2.25, 0.03]} raycast={() => null}>
        {round ? <circleGeometry args={[0.42, 20]} /> : <planeGeometry args={wide ? [1.5, 0.75] : [0.8, 0.8]} />}
        <meshBasicMaterial map={tex} />
      </mesh>
      {round && (
        <mesh position={[0, 2.25, 0.025]} raycast={() => null}>
          <ringGeometry args={[0.36, 0.44, 24]} />
          <meshBasicMaterial color="#c01818" />
        </mesh>
      )}
    </group>
  );
}

/** Wegweiser (gelb mit schwarzer Schrift) an Einmündungen: Höfe, See, Testgelände. */
function Pointer({ x, y, z, rot, text }: { x: number; y: number; z: number; rot: number; text: string }) {
  const tex = useMemo(() => textTexture(text, { bg: '#f2c200', fg: '#111111', w: 512, h: 96, font: 46 }), [text]);
  return (
    <group position={[x, y, z]} rotation={[0, rot - Math.PI / 2, 0]}>
      <mesh position={[0, 1.2, 0]} raycast={() => null}>
        <cylinderGeometry args={[0.05, 0.05, 2.4, 5]} />
        <meshLambertMaterial color="#8d949b" />
      </mesh>
      {/* zwei Seiten, beide lesbar */}
      {[0, Math.PI].map((r) => (
        <mesh key={r} position={[0, 2.3, 0]} rotation={[0, r, 0]} raycast={() => null}>
          <planeGeometry args={[2.4, 0.45]} />
          <meshBasicMaterial map={tex} />
        </mesh>
      ))}
    </group>
  );
}

/** Eigene Werkstatt am Ortsrand: Halle mit drei Rolltoren zur Straße, Schriftzug, Vorplatz. */
function Workshop({ y }: { y: number }) {
  const W = WORKSHOP;
  const sign = useMemo(() => textTexture('GARAGE KINGS', { bg: '#16181d', fg: '#ff7a1a', w: 1024, h: 160, font: 110 }), []);
  const door = useMemo(() => doorTexture(), []);
  const stop = useMemo(() => textTexture('HIER ANHALTEN · ENDE PROBEFAHRT', { bg: 'rgba(0,0,0,0)', fg: '#f4f4f0', w: 1024, h: 292, font: 70 }), []);
  const front = W.z + W.d / 2;
  return (
    <group position={[0, y, 0]}>
      <mesh position={[W.x, W.h / 2, W.z]} raycast={() => null}>
        <boxGeometry args={[W.w, W.h, W.d]} />
        <meshLambertMaterial color="#d9d6cc" />
      </mesh>
      <mesh position={[W.x, W.h + 0.15, W.z]} raycast={() => null}>
        <boxGeometry args={[W.w + 0.6, 0.3, W.d + 0.6]} />
        <meshLambertMaterial color="#3f4650" />
      </mesh>
      {/* Sockel und oranges Band wie in der Halle */}
      <mesh position={[W.x, 0.5, front + 0.02]} raycast={() => null}>
        <planeGeometry args={[W.w, 1]} />
        <meshLambertMaterial color="#3f4a57" />
      </mesh>
      {[-7.5, 0, 7.5].map((dx) => (
        <mesh key={dx} position={[W.x + dx, 1.9, front + 0.03]} raycast={() => null}>
          <planeGeometry args={[5.2, 3.8]} />
          <meshLambertMaterial map={door} color="#c9ccd1" />
        </mesh>
      ))}
      <mesh position={[W.x, W.h - 0.9, front + 0.04]} raycast={() => null}>
        <planeGeometry args={[11, 1.7]} />
        <meshBasicMaterial map={sign} />
      </mesh>
      <mesh position={[W.x, 4.1, front + 0.035]} raycast={() => null}>
        <planeGeometry args={[W.w, 0.18]} />
        <meshBasicMaterial color="#ff7a1a" />
      </mesh>
      {/* Halteplatz für das Ende der Probefahrt */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[W.x, 0.035, -8.5]} raycast={() => null}>
        <planeGeometry args={[14, 4]} />
        <meshBasicMaterial map={stop} transparent />
      </mesh>
      {/* Vorplatz */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(47 + 77) / 2, 0.025, (-15 + -2) / 2]} raycast={() => null}>
        <planeGeometry args={[30, 13]} />
        <meshLambertMaterial color="#5b5e63" />
      </mesh>
    </group>
  );
}

/** Berge am Horizont: ein Band rund um die Kamera, ohne Nebel – hinter dem Dunst der fernen Wiesen. */
function Mountains() {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => {
    const t = mountainTexture().clone();
    t.repeat.set(2, 1);
    t.needsUpdate = true;
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, fog: false, depthWrite: false, side: THREE.BackSide });
  }, []);
  useFrame(({ camera }) => {
    if (ref.current) ref.current.position.set(camera.position.x, camera.position.y - 18, camera.position.z);
  });
  return (
    <mesh ref={ref} material={mat} renderOrder={-1} raycast={() => null} frustumCulled={false}>
      <cylinderGeometry args={[680, 680, 150, 64, 1, true]} />
    </mesh>
  );
}
