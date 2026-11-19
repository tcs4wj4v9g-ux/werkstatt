/**
 * Rennstrecken (Rundkurse) als eigene Welten mit derselben Schnittstelle wie die Probefahrt-Landschaft (`DriveWorld`):
 * Fahrphysik, Computerfahrer, Minikarte und Darstellung funktionieren damit überall gleich.
 *
 * Die Kurse sind frei erfunden, aber nach bekannten Vorbildern gestaltet:
 *  - Eifelring: lang, kurvig, viel Auf und Ab, eine Steilkurve (wie die Nordschleife)
 *  - Motodrom Kurpfalz: lange Geraden, Haarnadel, Stadionteil mit Tribünen (wie das alte Hockenheim)
 *  - Hafenkurs Monte Azzurro: eng, Leitplanken direkt am Rand, Haarnadel, am Hafenbecken (wie Monaco)
 *  - Ardennenring: schnell, steiler Anstieg nach der Senke, lange Gerade, schnelle Bögen (wie Spa)
 */
import * as THREE from 'three';
import { driveWorld, mulberry, type DriveWorld, type Obstacle, type RoadSample } from './driveWorld';

export type CircuitId = 'eifel' | 'motodrom' | 'hafen' | 'ardennen';
export type WorldId = 'land' | CircuitId;

interface CircuitDef {
  name: string;
  /** Vorbild, nur für die Beschreibung. */
  like: string;
  desc: string;
  /** Kontrollpunkte (x, Höhe, z) im Uhrzeigersinn; der erste ist Start und Ziel. */
  route: [number, number, number][];
  /** Maßstab der Kontrollpunkte (waagerecht). */
  scale?: number;
  roadWidth: number;
  /** Auslaufzone: Abstand der Leitplanke vom Fahrbahnrand (m). */
  runoff: number;
  /** Bäume rund um die Strecke (Dichte 0..1). */
  trees: number;
  /** Hafenbecken (Wasser) neben der Strecke. */
  water?: { x: number; z: number; w: number; d: number };
}

export const CIRCUITS: Record<CircuitId, CircuitDef> = {
  eifel: {
    name: 'Eifelring',
    like: 'Nürburgring-Nordschleife',
    desc: 'Lang, schmal und wellig: Kuppen, Senken, schnelle Wechselkurven und eine überhöhte Steilkurve mitten im Wald.',
    route: [
      [0, 0, 0], [220, 2, -30], [430, 8, -110], [560, 16, -260], [580, 24, -430], [480, 32, -540], [330, 36, -560], [210, 30, -660],
      [60, 22, -740], [-110, 16, -700], [-170, 10, -560], [-120, 4, -430], [-210, 0, -330], [-380, -4, -360], [-540, -2, -280],
      [-610, 6, -110], [-560, 14, 60], [-420, 18, 130], [-300, 12, 70], [-200, 6, 120], [-100, 2, 60],
    ],
    scale: 1.25,
    roadWidth: 9,
    runoff: 4,
    trees: 1,
  },
  motodrom: {
    name: 'Motodrom Kurpfalz',
    like: 'Hockenheimring (alte Waldstrecke)',
    desc: 'Lange Vollgas-Geraden durch den Wald, eine enge Haarnadel und das Stadion mit den großen Tribünen – Leistung zählt.',
    route: [
      [0, 0, 0], [180, 0, 0], [320, 0, -40], [400, 0, -160], [430, 0, -400], [440, 0, -640], [420, 0, -760], [350, 0, -790],
      [300, 0, -730], [300, 0, -520], [270, 0, -330], [220, 0, -290], [180, 0, -250], [110, 0, -200], [20, 0, -190],
      [-80, 0, -150], [-120, 0, -70], [-90, 0, -10],
    ],
    scale: 1.3,
    roadWidth: 13,
    runoff: 14,
    trees: 0.7,
  },
  hafen: {
    name: 'Hafenkurs Monte Azzurro',
    like: 'Stadtkurs von Monaco',
    desc: 'Enger Stadtkurs am Hafen: Leitplanken direkt neben der Fahrbahn, Anstieg zum Casino, die langsamste Haarnadel der Welt und eine Schikane am Wasser.',
    route: [
      [0, 0, 0], [130, 3, 20], [220, 10, 80], [260, 18, 170], [210, 21, 240], [130, 18, 230], [90, 14, 280], [50, 10, 240],
      [10, 7, 290], [-90, 4, 310], [-200, 2, 250], [-240, 1, 160], [-190, 0, 110], [-230, 0, 40], [-160, 0, -20], [-70, 0, -20],
    ],
    scale: 1.45,
    roadWidth: 9,
    runoff: 0.8,
    trees: 0.15,
    water: { x: -90, z: -210, w: 760, d: 290 },
  },
  ardennen: {
    name: 'Ardennenring',
    like: 'Circuit de Spa-Francorchamps',
    desc: 'Schnell und hügelig: Haarnadel nach dem Start, steil bergauf durch die Senke, eine lange Gerade, schnelle Bögen hinab ins Tal.',
    route: [
      [0, 0, 0], [-70, 0, 50], [-140, -4, 10], [-170, -12, -90], [-190, 6, -190], [-210, 24, -340], [-220, 34, -560], [-170, 36, -680],
      [-60, 30, -730], [80, 22, -720], [190, 12, -640], [250, 4, -520], [330, -2, -420], [360, -6, -300], [300, -6, -170],
      [220, -4, -80], [140, -2, -40], [90, 0, 10],
    ],
    scale: 1.6,
    roadWidth: 12,
    runoff: 10,
    trees: 0.9,
  },
};

const STEP = 2;
const cache = new Map<CircuitId, DriveWorld>();

export function circuitWorld(id: CircuitId): DriveWorld {
  const hit = cache.get(id);
  if (hit) return hit;
  const def = CIRCUITS[id];
  const k = def.scale ?? 1;
  const curve = new THREE.CatmullRomCurve3(def.route.map(([x, y, z]) => new THREE.Vector3(x * k, y, z * k)), true, 'centripetal');
  const length = curve.getLength();
  const n = Math.round(length / STEP);
  const pts = curve.getSpacedPoints(n).slice(0, n);
  const samples: RoadSample[] = pts.map((p, i) => {
    const a = pts[(i + n - 1) % n];
    const b = pts[(i + 1) % n];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: p.x, y: p.y, z: p.z, tx: (b.x - a.x) / l, tz: (b.z - a.z) / l, nx: (b.z - a.z) / l, nz: -(b.x - a.x) / l, curv: 0, railL: true, railR: true, s: i * STEP, town: false, crossing: false };
  });
  for (let i = 0; i < n; i++) {
    const a = samples[(i + n - 4) % n];
    const b = samples[(i + 4) % n];
    samples[i].curv = -(a.tx * b.tz - a.tz * b.tx) / (8 * STEP);
  }
  const CELL = 24;
  const key = (cx: number, cz: number) => cx + ',' + cz;
  const grid = new Map<string, number[]>();
  samples.forEach((p, i) => {
    const k = key(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(i);
  });
  const roadNear = (x: number, z: number, range: number) => {
    let best = Infinity;
    let bi = -1;
    const r = Math.ceil(range / CELL);
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++)
        for (const i of grid.get(key(cx + dx, cz + dz)) ?? []) {
          const d = (samples[i].x - x) ** 2 + (samples[i].z - z) ** 2;
          if (d < best) {
            best = d;
            bi = i;
          }
        }
    return bi < 0 ? null : { i: bi, d: Math.sqrt(best) };
  };
  // Mittlere Höhe der Strecke (weit weg liegt das Gelände dort)
  const mean = samples.reduce((a, p) => a + p.y, 0) / n;
  const half = def.roadWidth / 2;
  const railOffset = half + def.runoff;
  const ground = (x: number, z: number) => {
    const near = roadNear(x, z, 140);
    const far = mean + Math.sin(x * 0.011) * Math.cos(z * 0.009) * 6 + Math.sin(x * 0.03 + z * 0.02) * 1.5;
    if (!near) return far;
    // bis hinter die Leitplanke eben auf Fahrbahnhöhe, dann sanft ins Gelände
    const k = THREE.MathUtils.smoothstep(near.d, railOffset + 3, railOffset + 70);
    return samples[near.i].y - 0.05 + (far - samples[near.i].y) * k;
  };
  // Kiesbetten: in Kurven außen (wo man hinausgetragen wird), sonst Rasen
  const gravelAt = (x: number, z: number) => {
    const near = roadNear(x, z, 30);
    if (!near) return false;
    const p = samples[near.i];
    const lat = (x - p.x) * p.nx + (z - p.z) * p.nz;
    let c = 0;
    for (let k = -12; k <= 12; k += 3) c = Math.max(c, Math.abs(samples[(near.i + k + n) % n].curv) * Math.sign(samples[(near.i + k + n) % n].curv || 1));
    const outside = Math.sign(lat) === -Math.sign(p.curv);
    return near.d > half + 1.2 && near.d < railOffset - 0.5 && outside && Math.abs(p.curv) > 1 / 160;
  };

  // Bäume außerhalb der Leitplanken, Tribünen und Boxengebäude an der Start-Ziel-Geraden
  const rng = mulberry(id.length * 97 + 13);
  const trees: DriveWorld['trees'] = [];
  const xs = samples.map((p) => p.x);
  const zs = samples.map((p) => p.z);
  const box = { minX: Math.min(...xs) - 260, maxX: Math.max(...xs) + 260, minZ: Math.min(...zs) - 260, maxZ: Math.max(...zs) + 260 };
  for (let x = box.minX; x < box.maxX; x += 14)
    for (let z = box.minZ; z < box.maxZ; z += 14) {
      const jx = x + (rng() - 0.5) * 10;
      const jz = z + (rng() - 0.5) * 10;
      const near = roadNear(jx, jz, 60);
      if (near && near.d < railOffset + 10) continue;
      if (!near && rng() > 0.25) continue;
      const forest = Math.sin(jx * 0.012 + 1) * Math.cos(jz * 0.01 - 0.5) + 0.3;
      if (rng() > def.trees * Math.max(0.05, forest)) continue;
      if (def.water && jx > def.water.x - def.water.w / 2 - 10 && jx < def.water.x + def.water.w / 2 + 10 && jz > def.water.z - def.water.d / 2 - 10 && jz < def.water.z + def.water.d / 2 + 10) continue;
      trees.push({ x: jx, z: jz, h: 7 + rng() * 8, kind: rng() < 0.65 ? 0 : 1 });
    }
  const s0 = samples[0];
  const h0 = Math.atan2(-s0.tz, s0.tx);
  const stands: DriveWorld['stands'] = [];
  const houses: DriveWorld['houses'] = [];
  // Tribünen links und rechts der Start-Ziel-Geraden (hinter der Leitplanke), Boxengebäude gegenüber
  for (const k of [-60, 0, 60]) {
    const p = samples[(k / STEP + n) % n];
    stands.push({ x: p.x + p.nx * (railOffset + 7), z: p.z + p.nz * (railOffset + 7), rot: Math.atan2(-p.tz, p.tx), len: 54 });
  }
  const pit = samples[(n - 10) % n];
  houses.push({ x: pit.x - pit.nx * (railOffset + 12), z: pit.z - pit.nz * (railOffset + 12), rot: Math.atan2(-pit.tz, pit.tx), w: 90, d: 14, h: 7, color: '#eceef0' });
  // Hafenkurs: Häuserzeilen an der Bergseite
  if (id === 'hafen') {
    samples.forEach((p, i) => {
      if (i % 14 || p.z < 30) return;
      for (const side of [1, -1]) {
        const off = railOffset + 9 + rng() * 4;
        const x = p.x + p.nx * side * off;
        const z = p.z + p.nz * side * off;
        const near = roadNear(x, z, 30);
        if (near && near.d < railOffset + 6) continue;
        houses.push({ x, z, rot: Math.atan2(-p.tz, p.tx), w: 12 + rng() * 6, d: 9, h: 9 + rng() * 10, color: ['#f2e2c4', '#f0c9a0', '#e8d6b0', '#f4ead8', '#e6b88a'][Math.floor(rng() * 5)] });
      }
    });
  }

  const obstacleGrid = new Map<string, Obstacle[]>();
  const addObstacle = (o: Obstacle) => {
    const k = key(Math.floor(o.x / CELL), Math.floor(o.z / CELL));
    (obstacleGrid.get(k) ?? obstacleGrid.set(k, []).get(k)!).push(o);
  };
  trees.forEach((t) => addObstacle({ x: t.x, z: t.z, r: 0.45 }));
  houses.forEach((h) => addObstacle({ x: h.x, z: h.z, r: Math.min(h.w, h.d) / 2 + 0.5 }));

  const extent = Math.max(Math.abs(box.minX), Math.abs(box.maxX), Math.abs(box.minZ), Math.abs(box.maxZ));
  const water = def.water ? { ...def.water, y: mean - 3 } : null;
  const world: DriveWorld = {
    id,
    name: def.name,
    roadWidth: def.roadWidth,
    railOffset,
    stands,
    water,
    samples,
    length,
    start: { x: s0.x, z: s0.z, heading: h0 },
    ground,
    nearest(x, z, hint) {
      let best = Infinity;
      let bi = hint;
      for (let k = -40; k <= 40; k++) {
        const i = (hint + k + n) % n;
        const d = (samples[i].x - x) ** 2 + (samples[i].z - z) ** 2;
        if (d < best) {
          best = d;
          bi = i;
        }
      }
      if (best > 60 * 60) {
        const g = roadNear(x, z, 400);
        if (g) bi = g.i;
      }
      const p = samples[bi];
      const dx = x - p.x;
      const dz = z - p.z;
      return { i: bi, lateral: dx * p.nx + dz * p.nz, along: dx * p.tx + dz * p.tz, dist: Math.hypot(dx, dz) };
    },
    obstacles(x, z) {
      const out: Obstacle[] = [];
      const cx = Math.floor(x / CELL);
      const cz = Math.floor(z / CELL);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) out.push(...(obstacleGrid.get(key(cx + dx, cz + dz)) ?? []));
      return out;
    },
    onPad: () => false,
    surface: (x, z) => (gravelAt(x, z) ? { grip: 0.45, drag: 0.3, kind: 'gravel' } : { grip: 0.6, drag: 0.06, kind: 'grass' }),
    tracks: [],
    padY: mean,
    lakeY: -999,
    inLake: () => false,
    fence: [],
    apron: { minX: 1e6, maxX: 1e6 + 1, minZ: 1e6, maxZ: 1e6 + 1 },
    apronY: 0,
    trees,
    bales: [],
    houses,
    lamps: [],
    signs: [],
    extent: extent + 40,
  };
  cache.set(id, world);
  return world;
}

/** Welt zu einer Kennung: offene Landschaft oder Rennstrecke. */
export function worldFor(id: WorldId): DriveWorld {
  return id === 'land' ? driveWorld() : circuitWorld(id);
}
