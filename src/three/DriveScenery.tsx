import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { driveWorld, forestAt, PAD, RAIL_OFFSET, ROAD_WIDTH, TRACK_WIDTH, type DriveWorld } from './driveWorld';
import { textTexture } from './textures';

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
function groundColor(x: number, z: number, h: number, out: THREE.Color) {
  const forest = forestAt(x, z);
  const field = Math.sin(x * 0.013 + 0.4) * Math.sin(z * 0.017 - 1.1);
  // Im Ort Rasen statt Feld
  if (Math.hypot(x, z) < 175) return out.setRGB(0.38, 0.55, 0.27);
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

function terrainTile(heights: Float32Array, fine: number, cx: number, cz: number, seg: number) {
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
    const h = heights[iz * k * (fine + 1) + ix * k];
    pos.setY(i, h);
    groundColor(pos.getX(i) + cx, pos.getZ(i) + cz, h, c).toArray(colors, i * 3);
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
  let v = 0;
  for (let i = 0; i < n; i++) {
    if (!keep(i)) continue;
    const p = s[i];
    const q = s[(i + 1) % n];
    for (const r of [p, q]) pos.push(r.x + r.nx * a, r.y + lift, r.z + r.nz * a, r.x + r.nx * b, r.y + lift, r.z + r.nz * b);
    idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    v += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
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
            const x = r.x + r.nx * side * RAIL_OFFSET;
            const z = r.z + r.nz * side * RAIL_OFFSET;
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
    for (let i = 0; i < n; i += 2) if (on(i)) posts.push(new THREE.Matrix4().makeTranslation(s[i].x + s[i].nx * side * (RAIL_OFFSET + 0.08), s[i].y + 0.35, s[i].z + s[i].nz * side * (RAIL_OFFSET + 0.08)));
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

let built: ReturnType<typeof build> | null = null;
function build() {
  const w = driveWorld();
  // Gelände-Kacheln mit Detailstufen
  const tiles: THREE.LOD[] = [];
  const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  for (let cx = -w.extent + TILE / 2; cx < w.extent; cx += TILE)
    for (let cz = -w.extent + TILE / 2; cz < w.extent; cz += TILE) {
      const lod = new THREE.LOD();
      const heights = tileHeights(w, cx, cz, LEVELS[0][0]);
      for (const [seg, dist] of LEVELS) {
        const m = new THREE.Mesh(terrainTile(heights, LEVELS[0][0], cx, cz, seg), groundMat);
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
  const lines = mergeGeometries([band(w, ROAD_WIDTH / 2 - 0.35, ROAD_WIDTH / 2 - 0.2, 0.035, notCross), band(w, -ROAD_WIDTH / 2 + 0.2, -ROAD_WIDTH / 2 + 0.35, 0.035, notCross), band(w, -0.07, 0.07, 0.035, dashed)]);
  const rail = rails(w);
  // Bäume: Nadelbaum (Kegel) und Laubbaum (Kugel), Stamm gemeinsam
  const cone = new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0);
  const crown = new THREE.IcosahedronGeometry(1, 0);
  const trunk = new THREE.CylinderGeometry(0.16, 0.22, 1, 4, 1, true).translate(0, 0.5, 0);
  // Bäume in Blöcken von ~410 m: Blöcke außerhalb des Blickfelds werden gar nicht gezeichnet
  const CHUNK = 410;
  const chunks = new Map<string, { conif: THREE.Matrix4[]; leafy: THREE.Matrix4[]; trunks: THREE.Matrix4[]; leafColors: THREE.Color[] }>();
  const q = new THREE.Quaternion();
  for (const t of w.trees) {
    const ck = Math.floor(t.x / CHUNK) + ',' + Math.floor(t.z / CHUNK);
    if (!chunks.has(ck)) chunks.set(ck, { conif: [], leafy: [], trunks: [], leafColors: [] });
    const { conif, leafy, trunks, leafColors } = chunks.get(ck)!;
    const y = w.ground(t.x, t.z);
    const rot = q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (t.x * 13 + t.z * 7) % 6.28);
    trunks.push(new THREE.Matrix4().compose(new THREE.Vector3(t.x, y - 0.2, t.z), rot, new THREE.Vector3(1, t.kind ? t.h * 0.45 : t.h * 0.3, 1)));
    if (t.kind === 0) conif.push(new THREE.Matrix4().compose(new THREE.Vector3(t.x, y + t.h * 0.18, t.z), rot, new THREE.Vector3(t.h * 0.24, t.h * 0.86, t.h * 0.24)));
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
  const gravel = mergeGeometries(
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
  return { w, tiles, road, shoulder, lines, rail, cone, crown, trunk, chunks: [...chunks.values()], box, roof, walls, roofs, wallColors, roofColors, winRows, pole, lampHead, poles, heads, groundMat, pad, marks, cones, coneGeo, gravel, baleGeo, baleMats };
}

export function DriveScenery() {
  const b = useMemo(() => (built ??= build()), []);
  const mats = useMemo(
    () => ({
      road: new THREE.MeshLambertMaterial({ color: '#4a4d52', side: THREE.DoubleSide }),
      shoulder: new THREE.MeshLambertMaterial({ color: '#7b7466', side: THREE.DoubleSide }),
      line: new THREE.MeshBasicMaterial({ color: '#e9e9e4', side: THREE.DoubleSide }),
      rail: new THREE.MeshLambertMaterial({ color: '#c6ccd2', side: THREE.DoubleSide }),
      post: new THREE.MeshLambertMaterial({ color: '#8d949b' }),
      conif: new THREE.MeshLambertMaterial({ color: '#2c4a2a' }),
      leafy: new THREE.MeshLambertMaterial({ color: '#ffffff' }),
      trunk: new THREE.MeshLambertMaterial({ color: '#5a4430' }),
      wall: new THREE.MeshLambertMaterial({ color: '#ffffff' }),
      roof: new THREE.MeshLambertMaterial({ color: '#ffffff' }),
      win: new THREE.MeshLambertMaterial({ color: '#3a4656' }),
      pole: new THREE.MeshLambertMaterial({ color: '#5d636a' }),
      lamp: new THREE.MeshBasicMaterial({ color: '#fff4d0' }),
      pad: new THREE.MeshLambertMaterial({ color: '#55585d' }),
      gravel: new THREE.MeshLambertMaterial({ color: '#a39784', side: THREE.DoubleSide }),
      cone: new THREE.MeshLambertMaterial({ color: '#ff7a1a' }),
      bale: new THREE.MeshLambertMaterial({ color: '#d9bd6a' }),
    }),
    [],
  );
  const postGeo = useMemo(() => new THREE.BoxGeometry(0.12, 0.7, 0.12), []);
  return (
    <>
      {b.tiles.map((t, i) => (
        <primitive key={i} object={t} />
      ))}
      <mesh geometry={b.shoulder} material={mats.shoulder} raycast={() => null} />
      <mesh geometry={b.road} material={mats.road} raycast={() => null} />
      <mesh geometry={b.lines} material={mats.line} raycast={() => null} />
      <mesh geometry={b.rail.band} material={mats.rail} raycast={() => null} />
      <mesh geometry={b.pad} material={mats.pad} raycast={() => null} />
      <mesh geometry={b.marks} material={mats.line} raycast={() => null} />
      <Instances geometry={b.coneGeo} material={mats.cone} matrices={b.cones} />
      <mesh geometry={b.gravel} material={mats.gravel} raycast={() => null} />
      <Instances geometry={b.baleGeo} material={mats.bale} matrices={b.baleMats} />
      <Sign x={PAD.minX + 6} y={b.w.padY} z={PAD.minZ + 2} rot={0} kind="pad" />
      <Instances geometry={postGeo} material={mats.post} matrices={b.rail.posts} />
      {b.chunks.map((c, i) => (
        <group key={i}>
          <Instances geometry={b.trunk} material={mats.trunk} matrices={c.trunks} cull />
          {c.conif.length > 0 && <Instances geometry={b.cone} material={mats.conif} matrices={c.conif} cull />}
          {c.leafy.length > 0 && <Instances geometry={b.crown} material={mats.leafy} matrices={c.leafy} colors={c.leafColors} cull />}
        </group>
      ))}
      <Instances geometry={b.box} material={mats.wall} matrices={b.walls} colors={b.wallColors} />
      <Instances geometry={b.roof} material={mats.roof} matrices={b.roofs} colors={b.roofColors} />
      <Instances geometry={b.box} material={mats.win} matrices={b.winRows} />
      <Instances geometry={b.pole} material={mats.pole} matrices={b.poles} />
      <Instances geometry={b.lampHead} material={mats.lamp} matrices={b.heads} />
      {b.w.signs.map((s, i) => (
        <Sign key={i} {...s} y={b.w.ground(s.x, s.z)} />
      ))}
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
