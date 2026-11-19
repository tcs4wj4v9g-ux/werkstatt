/**
 * Probefahrt-Landschaft: Landstraßen-Rundkurs als „Acht“ (die beiden Hälften kreuzen sich im Ort Grünbach),
 * Gelände mit Hügeln, Wälder, Wiesen und Felder, Leitplanken, Schilder und Laternen.
 *
 * Alles wird einmal beim Betreten erzeugt und bleibt im Speicher (Zwischenspeicher über Probefahrten hinweg).
 * Abfragen für die Fahrphysik: nächster Straßenpunkt (mit lokaler Suche), Bodenhöhe, Hindernisse.
 */
import * as THREE from 'three';

export const ROAD_WIDTH = 7;
/** Leitplanke steht so weit neben der Straßenmitte. */
export const RAIL_OFFSET = ROAD_WIDTH / 2 + 1.1;
const STEP = 2;

/** Kontrollpunkte der Strecke (x, Höhe, z). Start östlich des Orts Richtung Osten; der Ort liegt bei (0, 0). */
const ROUTE: [number, number, number][] = [
  [70, 0, 0], [190, 0.5, -4], [300, 2, 6], [395, 6, 50], [450, 11, 130], [440, 16, 215], [395, 19, 290], [310, 21, 350],
  [215, 19, 385], [125, 15, 360], [70, 9, 300], [30, 4, 215], [6, 1, 120], [0, 0, 40], [0, 0, -40], [-6, 0, -130],
  [-40, -1, -220], [-125, 0, -285], [-240, 2, -300], [-360, 4, -290], [-470, 7, -240], [-535, 10, -150], [-530, 11, -50],
  [-470, 9, 25], [-380, 5, 55], [-280, 2, 40], [-180, 0.5, 10], [-70, 0, 0],
];

/**
 * Testgelände: große, ebene Asphaltfläche direkt neben der Startgeraden (zum freien Fahren, Wenden und Driften).
 * Liegt zwischen Startgerade und dem Bogen nach Norden; die Höhe folgt der Startgeraden (kein Absatz am Rand).
 */
export const PAD = { minX: 125, maxX: 270, minZ: 7, maxZ: 130 };
/** Feldwege (Schotter) quer durch Wiesen und Felder: Wegpunkte (x, z), Höhe folgt dem Gelände. */
const TRACKS: [number, number][][] = [
  [[285, 60], [330, 110], [360, 175], [352, 250], [300, 300]],
  [[-60, -40], [-120, -110], [-200, -160], [-300, -190], [-400, -175]],
  [[-150, 30], [-210, 95], [-300, 140], [-400, 120], [-470, 70]],
  [[60, -60], [130, -120], [230, -150], [330, -130], [410, -60], [430, 40]],
];
export const TRACK_WIDTH = 3.6;

/** Sanftes Rauschen aus überlagerten Sinuswellen (deterministisch, schnell). */
function noise(x: number, z: number) {
  return (
    Math.sin(x * 0.0071 + 1.3) * Math.cos(z * 0.0063 - 0.4) * 9 +
    Math.sin(x * 0.017 - z * 0.011 + 2.1) * 4 +
    Math.sin(x * 0.041 + z * 0.037) * 1.2 +
    Math.cos(z * 0.023 - x * 0.006) * 3
  );
}
/** Waldanteil an einer Stelle (über 0 = Wald). */
export function forestAt(x: number, z: number) {
  return Math.sin(x * 0.009 + 0.7) * Math.cos(z * 0.011 + 1.9) + Math.sin(x * 0.023 - z * 0.019) * 0.35 - 0.05;
}

export interface RoadSample {
  x: number;
  y: number;
  z: number;
  /** Fahrtrichtung (Einheitsvektor) und Normale nach links. */
  tx: number;
  tz: number;
  nx: number;
  nz: number;
  /** Krümmung (1/m, Vorzeichen: links positiv). */
  curv: number;
  /** Leitplanke links/rechts. */
  railL: boolean;
  railR: boolean;
  /** Abstand in Metern ab Start. */
  s: number;
  /** im Ort (Laternen, keine Mittellinie an der Kreuzung). */
  town: boolean;
  crossing: boolean;
}

export interface Obstacle {
  x: number;
  z: number;
  r: number;
}

export interface DriveWorld {
  samples: RoadSample[];
  /** Liegt der Punkt auf dem Testgelände (Asphalt)? */
  onPad(x: number, z: number): boolean;
  /** Untergrund abseits der Straße: Haftung und Rollwiderstand (Schotterweg, Wiese, Feld, Waldboden). */
  surface(x: number, z: number): { grip: number; drag: number; kind: 'gravel' | 'grass' | 'field' | 'forest' };
  /** Feldwege als Punktfolgen (für die Darstellung). */
  tracks: { x: number; z: number }[][];
  /** Höhe des Testgeländes. */
  padY: number;
  length: number;
  start: { x: number; z: number; heading: number };
  ground(x: number, z: number): number;
  /** Nächster Straßenpunkt, gesucht um den Index `hint` (Fahrzeug bleibt auf seiner Spur, auch an der Kreuzung). */
  nearest(x: number, z: number, hint: number): { i: number; lateral: number; along: number; dist: number };
  obstacles(x: number, z: number): Obstacle[];
  trees: { x: number; z: number; h: number; kind: 0 | 1 }[];
  /** Heuballen auf den Feldern bei den Höfen (liegende Rundballen). */
  bales: { x: number; z: number; rot: number }[];
  houses: { x: number; z: number; rot: number; w: number; d: number; h: number; color: string }[];
  lamps: { x: number; z: number; rot: number }[];
  signs: { x: number; z: number; rot: number; kind: 'town' | 'curveL' | 'curveR' | 'speed50' | 'speed100' | 'cross' }[];
  /** Kachelweise Bodenhöhen für das Gelände. */
  extent: number;
}

let cached: DriveWorld | null = null;

export function driveWorld(): DriveWorld {
  if (cached) return cached;
  const curve = new THREE.CatmullRomCurve3(ROUTE.map(([x, y, z]) => new THREE.Vector3(x, y, z)), true, 'centripetal');
  const length = curve.getLength();
  const n = Math.round(length / STEP);
  const pts = curve.getSpacedPoints(n).slice(0, n);
  const samples: RoadSample[] = pts.map((p, i) => {
    const a = pts[(i + n - 1) % n];
    const b = pts[(i + 1) % n];
    const tx0 = b.x - a.x;
    const tz0 = b.z - a.z;
    const l = Math.hypot(tx0, tz0) || 1;
    return { x: p.x, y: p.y, z: p.z, tx: tx0 / l, tz: tz0 / l, nx: tz0 / l, nz: -tx0 / l, curv: 0, railL: false, railR: false, s: i * STEP, town: Math.hypot(p.x, p.z) < 150, crossing: Math.hypot(p.x, p.z) < 11 };
  });
  // Normale nach links bei Blick in Fahrtrichtung: (tz, -tx) zeigt in der Szene (x nach rechts, z zum Betrachter) nach links
  for (let i = 0; i < n; i++) {
    const a = samples[(i + n - 4) % n];
    const b = samples[(i + 4) % n];
    const cross = a.tx * b.tz - a.tz * b.tx;
    samples[i].curv = -cross / (8 * STEP);
  }
  // Räumliches Raster der Straßenpunkte für Abstandsabfragen
  const CELL = 24;
  const grid = new Map<string, number[]>();
  const key = (cx: number, cz: number) => cx + ',' + cz;
  samples.forEach((p, i) => {
    const k = key(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(i);
  });
  /** Nächster Straßenpunkt und Höhe dort – für das Gelände. */
  const roadNear = (x: number, z: number, range: number) => {
    let best = Infinity;
    let bi = -1;
    const r = Math.ceil(range / CELL);
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        const list = grid.get(key(cx + dx, cz + dz));
        if (list) for (const i of list) {
          const d = (samples[i].x - x) ** 2 + (samples[i].z - z) ** 2;
          if (d < best) {
            best = d;
            bi = i;
          }
        }
      }
    return bi < 0 ? null : { i: bi, d: Math.sqrt(best) };
  };
  // Gelände: Rauschen, zur Straße hin auf Straßenhöhe angeglichen (Böschung), Ortskern flach
  // Höhe des Testgeländes: wie die Startgerade daneben (dort fast eben)
  const straight = samples.filter((p) => p.x > PAD.minX - 10 && p.x < PAD.maxX + 10 && Math.abs(p.z) < 12);
  const padY = straight.reduce((a, p) => a + p.y, 0) / Math.max(1, straight.length);
  const padDist = (x: number, z: number) => Math.hypot(Math.max(PAD.minX - x, 0, x - PAD.maxX), Math.max(PAD.minZ - z, 0, z - PAD.maxZ));
  const onPad = (x: number, z: number) => x > PAD.minX && x < PAD.maxX && z > PAD.minZ && z < PAD.maxZ;
  const ground = (x: number, z: number) => {
    const pd = padDist(x, z);
    if (pd < 0.01) return padY;
    const raw = groundRaw(x, z);
    return pd < 40 ? padY + (raw - padY) * THREE.MathUtils.smoothstep(pd, 0, 40) : raw;
  };
  const groundRaw = (x: number, z: number) => {
    const base = noise(x, z) + 4;
    const town = Math.max(0, 1 - Math.hypot(x, z) / 170);
    const near = roadNear(x, z, 60);
    const flat = base * (1 - town * town);
    if (!near) return flat;
    const k = THREE.MathUtils.smoothstep(near.d, ROAD_WIDTH / 2 + 2, 48);
    return samples[near.i].y - 0.12 + (flat - samples[near.i].y + 0.12) * k;
  };
  // Leitplanken: in engen Kurven außen und dort, wo das Gelände neben der Straße steil abfällt
  for (let i = 0; i < n; i++) {
    const p = samples[i];
    if (p.town) continue;
    const drop = (side: number) => p.y - ground(p.x + p.nx * side * 12, p.z + p.nz * side * 12);
    const tight = Math.abs(p.curv) > 1 / 150;
    p.railL = (tight && p.curv < 0) || drop(1) > 1.4;
    p.railR = (tight && p.curv > 0) || drop(-1) > 1.4;
  }
  // kurze Lücken schließen, einzelne Stücke entfernen (glattere Leitplankenzüge)
  for (const side of ['railL', 'railR'] as const) {
    const on = samples.map((p) => p[side]);
    for (let i = 0; i < n; i++) {
      let around = 0;
      for (let k = -6; k <= 6; k++) around += on[(i + k + n) % n] ? 1 : 0;
      samples[i][side] = around >= 5;
    }
  }

  // --- Ort Grünbach: Häuser an den vier Straßenästen, Laternen, Schilder
  const rng = mulberry(7);
  const houses: DriveWorld['houses'] = [];
  const lamps: DriveWorld['lamps'] = [];
  const signs: DriveWorld['signs'] = [];
  const COLORS = ['#e8dcc4', '#d9c3a0', '#f0ebe0', '#c9b6a0', '#e2d2b8', '#b9c4c9', '#e9d6c8'];
  samples.forEach((p, i) => {
    if (!p.town || p.crossing || Math.hypot(p.x, p.z) < 22) return;
    const heading = Math.atan2(-p.tz, p.tx);
    if (i % 9 === 0)
      for (const side of [-1, 1]) {
        if (rng() < 0.25) continue;
        const off = 14 + rng() * 6;
        const w = 8 + rng() * 4;
        const d = 7 + rng() * 3;
        houses.push({ x: p.x + p.nx * side * off, z: p.z + p.nz * side * off, rot: heading, w, d, h: 5.5 + rng() * 2.5, color: COLORS[Math.floor(rng() * COLORS.length)] });
      }
    if (i % 15 === 0) lamps.push({ x: p.x + p.nx * (ROAD_WIDTH / 2 + 1.2), z: p.z + p.nz * (ROAD_WIDTH / 2 + 1.2), rot: heading });
  });
  // Ortsschilder an den Ortsgrenzen, Kurvenschilder vor engen Kurven, Tempo nach dem Ort
  for (let i = 0; i < n; i++) {
    const p = samples[i];
    const prev = samples[(i + n - 1) % n];
    const heading = Math.atan2(-p.tz, p.tx);
    const right = { x: p.x - p.nx * (ROAD_WIDTH / 2 + 1.4), z: p.z - p.nz * (ROAD_WIDTH / 2 + 1.4) };
    if (p.town && !prev.town) signs.push({ ...right, rot: heading, kind: 'town' });
    if (!p.town && prev.town) signs.push({ ...right, rot: heading, kind: 'speed100' });
    if (p.town && !prev.town && i % 2 === 0) signs.push({ x: right.x - p.tx * 6, z: right.z - p.tz * 6, rot: heading, kind: 'speed50' });
    const ahead = samples[(i + 25) % n];
    const before = samples[(i + 24) % n];
    if (Math.abs(ahead.curv) > 1 / 110 && Math.abs(before.curv) <= 1 / 110 && !p.town) signs.push({ ...right, rot: heading, kind: ahead.curv > 0 ? 'curveL' : 'curveR' });
    const cross = samples[(i + 30) % n];
    if (cross.crossing && !samples[(i + 29) % n].crossing) signs.push({ ...right, rot: heading, kind: 'cross' });
  }

  // --- Bauernhöfe an den Feldwegen: Wohnhaus, rote Scheune, Heuballen
  // (x, z, Drehung, Seite der Heuballen: hinter (−1) oder vor (+1) dem Hof – jeweils weg vom Feldweg)
  const FARMS: [number, number, number, number][] = [
    [382, 192, 0.4, -1],
    [-425, -205, -0.3, -1],
    [-300, 168, 0.15, 1],
    [258, -178, 0.7, -1],
  ];
  const bales: DriveWorld['bales'] = [];
  for (const [fx, fz, rot, side] of FARMS) {
    const c = Math.cos(rot);
    const sn = Math.sin(rot);
    const at = (dx: number, dz: number) => ({ x: fx + dx * c + dz * sn, z: fz - dx * sn + dz * c });
    houses.push({ ...at(0, 0), rot, w: 10, d: 8, h: 6.5, color: '#efe6d2' });
    houses.push({ ...at(18, 4), rot, w: 16, d: 11, h: 7.5, color: '#9b2d22' });
    houses.push({ ...at(4, 16), rot: rot + Math.PI / 2, w: 9, d: 6, h: 4.5, color: '#7d6a55' });
    for (let k = 0; k < 9; k++) bales.push({ ...at(-4 + (k % 3) * 5, side * (18 + Math.floor(k / 3) * 4.5)), rot: rot + (k % 2) * 0.4 });
  }
  const farmNear = (x: number, z: number) => FARMS.some(([fx, fz]) => Math.hypot(x - fx, z - fz) < 34);

  // --- Bäume: Wälder (Rauschen), einzelne Bäume an Wiesen; Abstand zur Straße und zum Ort
  const EXTENT = 820;
  // Grobes Abstandsraster zur Straße (Zellen à 24 m, Breitensuche ab den Straßenzellen) – schnell statt Einzelsuche
  const cells = Math.ceil((2 * EXTENT) / CELL) + 2;
  const off = Math.floor(-EXTENT / CELL) - 1;
  const cellDist = new Int16Array(cells * cells).fill(-1);
  const queue: number[] = [];
  for (const k of grid.keys()) {
    const [cx, cz] = k.split(',').map(Number);
    const ix = cx - off;
    const iz = cz - off;
    if (ix < 0 || iz < 0 || ix >= cells || iz >= cells) continue;
    cellDist[ix * cells + iz] = 0;
    queue.push(ix * cells + iz);
  }
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q];
    const ix = Math.floor(c / cells);
    const iz = c % cells;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const jx = ix + dx;
      const jz = iz + dz;
      if (jx < 0 || jz < 0 || jx >= cells || jz >= cells) continue;
      const j = jx * cells + jz;
      if (cellDist[j] >= 0) continue;
      cellDist[j] = cellDist[c] + 1;
      queue.push(j);
    }
  }
  const roadCells = (x: number, z: number) => cellDist[(Math.floor(x / CELL) - off) * cells + (Math.floor(z / CELL) - off)] ?? 99;
  // Feldwege: Punkte alle 2 m, in einem Raster für Abstandsabfragen
  const tracks = TRACKS.map((pts) => {
    const c = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    return c.getSpacedPoints(Math.round(c.getLength() / 2)).map((p) => ({ x: p.x, z: p.z }));
  });
  const trackGrid = new Map<string, { x: number; z: number }[]>();
  for (const t of tracks) for (const p of t) {
    const k = key(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    (trackGrid.get(k) ?? trackGrid.set(k, []).get(k)!).push(p);
  }
  function trackDist(x: number, z: number) {
    let best = Infinity;
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const p of trackGrid.get(key(cx + dx, cz + dz)) ?? []) best = Math.min(best, (p.x - x) ** 2 + (p.z - z) ** 2);
    return Math.sqrt(best);
  }
  const trees: DriveWorld['trees'] = [];
  // nur bis gut 300 m neben der Straße (weiter weg verdeckt der Dunst ohnehin), Abstand 12 m
  for (let x = -EXTENT; x <= EXTENT; x += 12) {
    for (let z = -EXTENT; z <= EXTENT; z += 12) {
      const jx = x + (rng() - 0.5) * 9;
      const jz = z + (rng() - 0.5) * 9;
      const f = forestAt(jx, jz);
      if (f < 0.12 && rng() > 0.012) continue;
      if (Math.hypot(jx, jz) < 160) continue;
      if (padDist(jx, jz) < 12) continue;
      if (farmNear(jx, jz)) continue;
      if (trackDist(jx, jz) < 6) continue;
      if (roadCells(jx, jz) > 13) continue;
      const near = roadNear(jx, jz, 30);
      if (near && near.d < 13) continue;
      trees.push({ x: jx, z: jz, h: 6 + rng() * 7, kind: f > 0.35 || rng() < 0.6 ? 0 : 1 });
    }
  }
  // Raster der Hindernisse (Bäume, Häuser) für die Kollision
  const obstacleGrid = new Map<string, Obstacle[]>();
  const addObstacle = (o: Obstacle) => {
    const k = key(Math.floor(o.x / CELL), Math.floor(o.z / CELL));
    (obstacleGrid.get(k) ?? obstacleGrid.set(k, []).get(k)!).push(o);
  };
  trees.forEach((t) => addObstacle({ x: t.x, z: t.z, r: 0.45 }));
  houses.forEach((h) => addObstacle({ x: h.x, z: h.z, r: Math.min(h.w, h.d) / 2 + 0.5 }));
  lamps.forEach((l) => addObstacle({ x: l.x, z: l.z, r: 0.2 }));
  bales.forEach((b) => addObstacle({ x: b.x, z: b.z, r: 0.85 }));

  const startHeading = Math.atan2(-samples[0].tz, samples[0].tx);
  cached = {
    samples,
    onPad,
    padY,
    tracks,
    surface(x, z) {
      if (trackDist(x, z) < TRACK_WIDTH / 2 + 0.4) return { grip: 0.78, drag: 0.025, kind: 'gravel' };
      const fo = forestAt(x, z);
      if (fo > 0.12) return { grip: 0.6, drag: 0.07, kind: 'forest' };
      const field = Math.sin(x * 0.013 + 0.4) * Math.sin(z * 0.017 - 1.1);
      if (Math.hypot(x, z) > 175 && (field > 0.55 || field < -0.6)) return { grip: 0.55, drag: 0.09, kind: 'field' };
      return { grip: 0.64, drag: 0.05, kind: 'grass' };
    },
    length,
    start: { x: samples[0].x, z: samples[0].z, heading: startHeading },
    ground,
    nearest(x, z, hint) {
      let best = Infinity;
      let bi = hint;
      // lokale Suche: schnell, und an der Kreuzung bleibt man auf seinem Ast
      for (let k = -40; k <= 40; k++) {
        const i = (hint + k + n) % n;
        const d = (samples[i].x - x) ** 2 + (samples[i].z - z) ** 2;
        if (d < best) {
          best = d;
          bi = i;
        }
      }
      // weit weg (z. B. querfeldein abgekürzt): global neu suchen
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
    trees,
    houses,
    bales,
    lamps,
    signs,
    extent: EXTENT,
  };
  return cached;
}

function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
