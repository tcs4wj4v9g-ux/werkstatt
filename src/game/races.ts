/**
 * Zeitrennen als Tagesereignis: An zwei von drei Tagen (der dritte gehört den Fahrzeugtreffen) ist ein Rennen
 * ausgeschrieben – Strecke auf dem Straßennetz der Probefahrt, Leistungsklasse, Startgeld, Preisgeld je Medaille.
 *
 * Die Sollzeiten (Gold/Silber/Bronze) rechnet das Spiel mit derselben Fahrphysik aus: Ein Computerfahrer fährt die
 * Strecke mit einem Referenzauto genau an der Klassengrenze. Wer sein Auto bis an die Grenze tunt (Leistung, Reifen,
 * Fahrwerk), schafft Gold leichter. Später kommen Gegner (NPCs) dazu – `Race` ist dafür offen.
 *
 * Alles hängt nur am Spieltag (fester Zufall) – kein zusätzlicher gemeinsamer Zustand im Koop nötig. Bestzeiten und
 * ausgezahltes Preisgeld liegen in `career` (gemeinsam).
 */
import { type DriveWorld } from '../three/driveWorld';
import { CIRCUITS, worldFor, type CircuitId, type WorldId } from '../three/circuits';
import { CAR_MODELS } from './data/cars';
import { createCar } from './market';
import { performance } from './performance';
import { driveBlocker } from './repair';
import type { CarInstance } from './types';
import { initialState, stepVehicle, surfaceGrip, vehicleSpec, type DriveInput, type Surface, type VehicleSpec, type VehicleState } from './vehicle';
import { roadCond, weatherOf, type RoadCond } from './grip';

export type RaceClass = 'c150' | 'c250' | 'c400' | 'open';
export const RACE_CLASSES: Record<RaceClass, { name: string; ps: number; gold: number; fee: number }> = {
  c150: { name: 'bis 150 PS', ps: 150, gold: 6000, fee: 300 },
  c250: { name: 'bis 250 PS', ps: 250, gold: 10000, fee: 500 },
  c400: { name: 'bis 400 PS', ps: 400, gold: 16000, fee: 800 },
  open: { name: 'offene Klasse', ps: 9999, gold: 25000, fee: 1200 },
};
/** Referenzleistung der offenen Klasse (für die Sollzeit). */
const OPEN_REF_PS = 600;
/** Reifen der Klasse: stärkere Klassen fahren breitere Sportreifen (mehr Haftung). */
const REF_GRIP: Record<RaceClass, number> = { c150: 1, c250: 1.04, c400: 1.1, open: 1.16 };

export type CourseId = 'runde' | 'ost' | 'west' | CircuitId;
/** Alle Strecken (Auswahl für Koop-Rennen). */
export const COURSE_IDS: CourseId[] = ['ost', 'west', 'runde', 'eifel', 'motodrom', 'hafen', 'ardennen', 'seenland', 'schneewald', 'matschtal'];
export interface Course {
  id: CourseId;
  name: string;
  desc: string;
  /** Preisgeld-Faktor (lange Strecke zahlt mehr). */
  pay: number;
  /** Welt (Landschaft oder Rennstrecke), Runden (Rundkurse) */
  world: WorldId;
  laps: number;
  /** Start- und Zielpunkt auf der Straße (Index in den Straßenpunkten der Welt), Länge in Punkten (2 m), alle Runden zusammen. */
  start: number;
  length: number;
}
/** Runden je Rennstrecke (Renndistanz ≈ 3–6 km). */
const LAPS: Record<CircuitId, number> = { eifel: 1, motodrom: 2, hafen: 2, ardennen: 1, seenland: 1, schneewald: 1, matschtal: 1 };

const COURSE_DEF: Record<'runde' | 'ost' | 'west', { name: string; desc: string; pay: number; from: [number, number]; to: [number, number] | null }> = {
  runde: { name: 'Große Runde um Grünbach', desc: 'Die ganze Acht: Ostschleife über die Hügel, durch den Ort, Westschleife und zurück zur Werkstatt.', pay: 1.4, from: [70, 0], to: null },
  ost: { name: 'Bergsprint Ost', desc: 'Von der Werkstatt über die Hügel der Ostschleife bis zur Einfahrt nach Grünbach.', pay: 1, from: [70, 0], to: [6, 120] },
  west: { name: 'Waldsprint West', desc: 'Aus Grünbach hinaus durch den Wald der Westschleife bis zur Ortseinfahrt West.', pay: 1, from: [-6, -130], to: [-180, 10] },
};

let courses: Record<CourseId, Course> | null = null;
export function courseOf(id: CourseId): Course {
  if (!courses) {
    const w = worldFor('land');
    const n = w.samples.length;
    const idx = ([x, z]: [number, number]) => {
      let best = Infinity;
      let bi = 0;
      w.samples.forEach((p, i) => {
        const d = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d < best) {
          best = d;
          bi = i;
        }
      });
      return bi;
    };
    courses = Object.fromEntries(
      (Object.keys(COURSE_DEF) as ('runde' | 'ost' | 'west')[]).map((k) => {
        const d = COURSE_DEF[k];
        const start = idx(d.from);
        const length = d.to ? (idx(d.to) - start + n) % n : n;
        return [k, { id: k, name: d.name, desc: d.desc, pay: d.pay, world: 'land' as WorldId, laps: 1, start, length }];
      }),
    ) as Record<CourseId, Course>;
    // Rennstrecken: Start und Ziel an der Start-Ziel-Geraden, Preisgeld nach Renndistanz
    for (const id of Object.keys(CIRCUITS) as CircuitId[]) {
      const cw = worldFor(id);
      const c = CIRCUITS[id];
      const laps = LAPS[id];
      const km = (cw.length * laps) / 1000;
      courses[id] = { id, name: c.name, desc: `${c.desc} Vorbild: ${c.like}. ${laps > 1 ? `${laps} Runden` : '1 Runde'}.`, pay: Math.round(Math.min(2.2, Math.max(1.3, km / 2.6)) * 10) / 10, world: id, laps, start: 0, length: cw.samples.length * laps };
    }
  }
  return courses[id];
}

export interface Race {
  id: string;
  day: number;
  course: CourseId;
  cls: RaceClass;
  title: string;
  fee: number;
  /**
   * 'time': Zeitrennen allein gegen die Uhr (Medaillen nach Sollzeit).
   * 'grid': Rennen gegen Gegner – Preisgeld für Platz 1, 2, 3 (in `prize` als gold/silver/bronze).
   * 'rally': Rallye – Zeitfahren allein auf einer Rallyepiste (Schotter, Schnee, Matsch), Medaillen nach Sollzeit.
   * 'drift': Driftwertung – Punkte für Driftwinkel × Tempo mit Kombo, Medaillen nach Punkten (`driftTargets`).
   */
  kind: 'time' | 'grid' | 'rally' | 'drift';
  /** Preisgeld je Medaille bzw. Platz 1–3. */
  prize: { gold: number; silver: number; bronze: number };
  /** Gegner (nur bei 'grid'). */
  opponents: Opponent[];
}

/** Computergegner: Name, Auto (Aussehen), Motorleistung (Anteil der Klassengrenze), Fahrkönnen. */
export interface Opponent {
  name: string;
  modelId: string;
  color: string;
  power: number;
  skill: AiSkill;
}
/** Startplatz des Spielers (0 = erste Reihe links) bei 6 Autos. */
export const PLAYER_GRID = 3;
const NAMES = ['Kalle Brandt', 'Mia Sommer', 'Jens „Turbo“ Kowalski', 'Ayla Demir', 'Rüdiger Moll', 'Lena Vogt', 'Tobi Graf', 'Svenja Kraus', 'Dragan Petrović', 'Hanne Lindqvist', 'Paolo Ricci', 'Ole Hansen', 'Frieda Kühn', 'Mehmet Yıldız'];
/** Fahrkönnen und Leistung der fünf Gegner – vom Spitzenfahrer (etwa Gold-Niveau) bis zum Nachzügler. */
const FIELD: { skill: AiSkill; power: number }[] = [
  { skill: { lat: 0.86, brake: 0.73, pace: 0.985 }, power: 1 },
  { skill: { lat: 0.86, brake: 0.73, pace: 0.965 }, power: 0.98 },
  { skill: { lat: 0.86, brake: 0.73, pace: 0.945 }, power: 0.96 },
  { skill: { lat: 0.86, brake: 0.73, pace: 0.925 }, power: 0.94 },
  { skill: { lat: 0.86, brake: 0.73, pace: 0.9 }, power: 0.92 },
];
const PAINT = ['#c8231e', '#1f4fa8', '#f2c200', '#1b1c1f', '#e8e8e8', '#2f8f4e', '#ff7a1a', '#6b2d8f'];

/** Autos, die zur Klasse passen (Serienleistung bis zur Grenze, nicht viel schwächer) – nur fürs Aussehen der Gegner. */
const classModels = new Map<RaceClass, string[]>();
function modelsFor(cls: RaceClass) {
  let list = classModels.get(cls);
  if (!list) {
    const lim = cls === 'open' ? 9999 : RACE_CLASSES[cls].ps;
    const lo = cls === 'open' ? 380 : lim * 0.55;
    list = Object.keys(CAR_MODELS).filter((id) => {
      const m = CAR_MODELS[id];
      if (m.collector) return false;
      const ps = performance(createCar(id, [], () => 0.5)).ps;
      return ps <= lim && ps >= lo;
    });
    if (!list.length) list = ['bavaria_330'];
    classModels.set(cls, list);
  }
  return list;
}

/**
 * Schwierigkeitsgrad eines Rennens gegen Gegner: Faktoren auf Leistung, Kurventempo (lat), Bremsmut, Grundtempo
 * und Reifenhaftung der Gegner – und auf das Preisgeld. Mittel ist etwas strenger als früher (zu leicht verdientes Geld),
 * Schwer verlangt ein stark getuntes Auto und eine saubere Linie.
 */
export type Difficulty = 'easy' | 'medium' | 'hard';
export const DIFFICULTY: Record<Difficulty, { name: string; prize: number; power: number; lat: number; brake: number; pace: number; grip: number }> = {
  easy: { name: 'Leicht', prize: 0.5, power: 0.94, lat: 0.92, brake: 0.9, pace: -0.04, grip: 0.97 },
  medium: { name: 'Mittel', prize: 1, power: 1.0, lat: 1.04, brake: 1.05, pace: 0.02, grip: 1 },
  hard: { name: 'Schwer', prize: 2.5, power: 1.1, lat: 1.14, brake: 1.2, pace: 0.06, grip: 1.06 },
};
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

/** Gegner mit Schwierigkeitsgrad: Leistung und Fahrkönnen angepasst. */
export function opponentFor(o: Opponent, diff: Difficulty = 'medium'): Opponent {
  const d = DIFFICULTY[diff];
  return { ...o, power: o.power * d.power, skill: { lat: o.skill.lat * d.lat, brake: o.skill.brake * d.brake, pace: Math.min(1, (o.skill.pace ?? 1) + d.pace) } };
}

/** Preisgeld eines Rennens bei diesem Schwierigkeitsgrad (nur Rennen gegen Gegner haben Stufen). */
export function racePrize(race: Pick<Race, 'prize' | 'kind'>, diff: Difficulty = 'medium') {
  const k = race.kind === 'grid' ? DIFFICULTY[diff].prize : 1;
  const r = (v: number) => Math.round((v * k) / 50) * 50;
  return { gold: r(race.prize.gold), silver: r(race.prize.silver), bronze: r(race.prize.bronze) };
}

/** Physik eines Gegners: Referenzauto der Klasse mit seiner Motorleistung (und Reifen je Schwierigkeitsgrad). */
export function opponentSpec(cls: RaceClass, o: Opponent, diff: Difficulty = 'medium'): VehicleSpec {
  const ref = referenceSpec(cls);
  const g = DIFFICULTY[diff].grip;
  return { ...ref, muFront: ref.muFront * g, muRear: ref.muRear * g, torque: ref.torque.map((p) => ({ rpm: p.rpm, nm: p.nm * o.power })) };
}

/** Platz → Preisgeld-Stufe (gold/silver/bronze) bei Rennen gegen Gegner. */
export const placeMedal = (place: number): Medal => (place === 1 ? 'gold' : place === 2 ? 'silver' : place === 3 ? 'bronze' : null);

/** Fester Zufall aus dem Spieltag (gleiches Rennen auf allen Geräten im Koop). */
function seeded(seed: number) {
  let a = seed * 2654435761;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rennen des Tages. An jedem dritten Tag (Fahrzeugtreffen) abwechselnd eine Rallye oder ein Driftwettbewerb. */
export function raceForDay(day: number): Race | null {
  if (day % 3 === 0) return day > 0 ? specialRace(day, day % 6 === 3 ? 'rally' : 'drift') : null;
  const r = seeded(day + 17);
  // Anfangs nur die Strecken rund um Grünbach, ab Tag 4 auch die Rennstrecken
  const course = (day < 4 ? (['ost', 'west', 'runde'] as const) : (['ost', 'west', 'runde', 'eifel', 'motodrom', 'hafen', 'ardennen', 'eifel', 'motodrom', 'hafen', 'ardennen'] as const))[Math.floor(r() * (day < 4 ? 3 : 11))];
  // Die ersten Tage eher kleine Klassen, später alle
  const pool: RaceClass[] = day < 4 ? ['c150', 'c250'] : ['c150', 'c250', 'c250', 'c400', 'c400', 'open'];
  const cls = pool[Math.floor(r() * pool.length)];
  const c = RACE_CLASSES[cls];
  // Meist Rennen gegen Gegner (Preisgeld für die ersten drei, Sieg zahlt etwas mehr als Gold)
  // Rennen gegen Gegner sind die Regel (drei von vier), Zeitrennen seltener
  const kind: Race['kind'] = r() < 0.75 ? 'grid' : 'time';
  const base = Math.round((c.gold * courseOf(course).pay) / 50) * 50;
  const gold = kind === 'grid' ? Math.round((base * 1.15) / 50) * 50 : base;
  const share = kind === 'grid' ? [0.45, 0.2] : [0.55, 0.25];
  const names = [...NAMES].sort(() => r() - 0.5).slice(0, FIELD.length);
  const models = modelsFor(cls);
  const opponents: Opponent[] =
    kind === 'grid'
      ? FIELD.map((f, i) => ({ name: names[i], modelId: models[Math.floor(r() * models.length)], color: PAINT[Math.floor(r() * PAINT.length)], power: f.power, skill: f.skill }))
      : [];
  return {
    id: `rennen-${day}`,
    day,
    course,
    cls,
    kind,
    title: `${kind === 'grid' ? 'Rennen' : 'Zeitrennen'} ${courseOf(course).name} – ${c.name}`,
    fee: c.fee,
    prize: { gold, silver: Math.round((gold * share[0]) / 50) * 50, bronze: Math.round((gold * share[1]) / 50) * 50 },
    opponents,
  };
}

/** Rallyepisten und Driftstrecken (breit, mit Haarnadeln und weiten Bögen). */
export const RALLY_COURSES: CourseId[] = ['seenland', 'schneewald', 'matschtal'];
export const DRIFT_COURSES: CourseId[] = ['motodrom', 'ardennen'];

/** Rallye bzw. Driftwettbewerb des Tages (fester Zufall je Tag; allein gegen Uhr bzw. Punkte). */
function specialRace(day: number, kind: 'rally' | 'drift'): Race {
  const r = seeded(day + 4711);
  const pool = kind === 'rally' ? RALLY_COURSES : DRIFT_COURSES;
  const course = pool[Math.floor(r() * pool.length)];
  const cls = (['c150', 'c250', 'c250', 'c400', 'open'] as RaceClass[])[Math.floor(r() * (day < 7 ? 3 : 5))];
  const c = RACE_CLASSES[cls];
  const gold = Math.round((c.gold * courseOf(course).pay * (kind === 'rally' ? 1.1 : 1)) / 50) * 50;
  return {
    id: `${kind}-${day}`,
    day,
    course,
    cls,
    kind,
    title: `${kind === 'rally' ? 'Rallye' : 'Driftwettbewerb'} ${courseOf(course).name.replace(/^Rallye /, '')} – ${c.name}`,
    fee: c.fee,
    prize: { gold, silver: Math.round((gold * 0.55) / 50) * 50, bronze: Math.round((gold * 0.25) / 50) * 50 },
    opponents: [],
  };
}

/**
 * Driftpunkte: je Sekunde Driftwinkel (Grad) × Tempo (km/h) / 100, mal Kombo. Die Kombo wächst alle 2,5 s ununterbrochenen
 * Driftens um 0,5 (bis ×4); eine Kette endet nach 1,2 s ohne Drift und wird gutgeschrieben. Wer dabei von der Fahrbahn
 * abkommt oder anstößt, verliert die laufende Kette.
 */
export const DRIFT = { minAngle: 10, maxAngle: 100, minKmh: 25, comboStep: 2.5, comboMax: 4, gap: 1.2 };
export interface DriftScore {
  /** gutgeschriebene Punkte, laufende Kette, Kombo, Zeit in der Kette und seit dem letzten Drift */
  banked: number;
  chain: number;
  combo: number;
  chainT: number;
  idle: number;
  /** größter Winkel und beste Kette (Anzeige) */
  best: number;
  lost: number;
}
export const newDriftScore = (): DriftScore => ({ banked: 0, chain: 0, combo: 1, chainT: 0, idle: 99, best: 0, lost: 0 });
/** Einen Zeitschritt werten. `clean` = auf der Fahrbahn und ohne Anstoßen. Liefert true, wenn gerade gedriftet wird. */
export function driftStep(d: DriftScore, angleDeg: number, kmh: number, clean: boolean, dt: number) {
  if (!clean) {
    if (d.chain > 0) d.lost += d.chain;
    d.chain = 0;
    d.combo = 1;
    d.chainT = 0;
    d.idle = 99;
    return false;
  }
  const on = angleDeg >= DRIFT.minAngle && angleDeg <= DRIFT.maxAngle && kmh >= DRIFT.minKmh;
  if (on) {
    d.idle = 0;
    d.chainT += dt;
    d.combo = Math.min(DRIFT.comboMax, 1 + Math.floor(d.chainT / DRIFT.comboStep) * 0.5);
    d.chain += ((angleDeg * kmh) / 100) * d.combo * dt;
  } else {
    d.idle += dt;
    if (d.idle > DRIFT.gap && d.chain > 0) {
      d.banked += d.chain;
      d.best = Math.max(d.best, d.chain);
      d.chain = 0;
      d.combo = 1;
      d.chainT = 0;
    }
  }
  return on;
}
/** Endstand: gutgeschriebene Punkte plus die noch laufende Kette. */
export const driftTotal = (d: DriftScore) => Math.round(d.banked + d.chain);

/** Punkteziele im Driftwettbewerb: nach Streckenlänge (Punkte je Meter). */
export function driftTargets(race: Pick<Race, 'course'>) {
  const m = courseOf(race.course).length * 2;
  const r = (k: number) => Math.round((m * k) / 100) * 100;
  return { gold: r(1.6), silver: r(1.0), bronze: r(0.5) };
}

/** Die nächsten Rennen ab heute (zur Vorschau). */
export const upcomingRaces = (day: number, count = 4) =>
  Array.from({ length: count * 2 }, (_, i) => raceForDay(day + i)).filter((r): r is Race => !!r).slice(0, count);

/** Darf dieses Auto in der Klasse starten? */
export function raceBlocker(car: CarInstance, race: Race): string | null {
  const ps = performance(car).ps;
  const lim = RACE_CLASSES[race.cls].ps;
  if (ps > lim) return `Zu stark für die Klasse: ${ps} PS (erlaubt ${lim} PS).`;
  return driveBlocker(car);
}

// ---------------------------------------------------------------- Computerfahrer und Sollzeiten

/**
 * Fährt die Strecke mit einem einfachen, aber zügigen Fahrer (schaut voraus, bremst vor Kurven, lenkt analog).
 * Liefert die Zeit in Sekunden (oder Infinity, wenn er nicht ankommt).
 */
/** Fahrkönnen eines Computerfahrers: genutzte Querbeschleunigung und Verzögerung (Anteil der Grenze). */
export interface AiSkill {
  lat: number;
  brake: number;
  /** Tempo-Anteil (1 = so schnell wie es geht): langsamere Fahrer fahren überall etwas vorsichtiger. */
  pace?: number;
}
export const REFERENCE_SKILL: AiSkill = { lat: 0.88, brake: 0.75 };
/** Lage eines Computerfahrers auf der Strecke (nächster Straßenpunkt, Fortschritt in Punkten). */
export interface AiTrack {
  near: number;
  prog: number;
}

/**
 * Eingaben eines Computerfahrers für einen Schritt: schaut voraus, lenkt zur Ideallinie (plus seitlichem Versatz
 * `offset` zum Überholen), plant das Tempo so, dass er vor Kurven rechtzeitig bremst. Aktualisiert `ai.near`/`ai.prog`.
 */
export function aiInput(spec: VehicleSpec, st: VehicleState, w: DriveWorld, ai: AiTrack, skill: AiSkill, offset = 0, assist = true, road?: Pick<Surface, 'grip' | 'cls'>): DriveInput {
  const n = w.samples.length;
  const q = w.nearest(st.x, st.z, ai.near);
  let d = q.i - ai.near;
  if (d > n / 2) d -= n;
  if (d < -n / 2) d += n;
  if (Math.abs(d) <= 40) ai.prog += d;
  ai.near = q.i;
  const tg = w.samples[(ai.near + Math.round(8 + st.vx * 0.5)) % n];
  const tx = tg.x + tg.nx * offset;
  const tz = tg.z + tg.nz * offset;
  let diff = Math.atan2(-(tz - st.z), tx - st.x) - st.heading;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  // Tempoplan: jede Kurve voraus erlaubt v = √(a_quer / Krümmung); bremsen erst, wenn der Bremsweg dorthin knapp wird
  // Glatte Fahrbahn (Regen, Schnee, Schotter): Kurven und Bremspunkte nach der tatsächlichen Haftung
  const g = road ? surfaceGrip(spec, road) : 1;
  const aLat = spec.muFront * g * 9.81 * skill.lat;
  const aBrake = Math.min(spec.muFront * g, spec.brakeForce / (spec.mass * 9.81)) * 9.81 * skill.brake;
  let vt = 80;
  for (let k = 2; k < 160; k++) {
    const c = Math.abs(w.samples[(ai.near + k) % n].curv);
    const vc = Math.sqrt(aLat / Math.max(1e-4, c));
    vt = Math.min(vt, Math.sqrt(vc * vc + 2 * aBrake * Math.max(0, k * 2 - 4)));
  }
  vt *= skill.pace ?? 1;
  const steer = Math.max(-1, Math.min(1, diff * 3 - (q.lateral - offset) * 0.04));
  return { steer, throttle: st.vx < vt - 0.5 ? 1 : st.vx < vt ? 0.4 : 0, brake: st.vx > vt + 1.5 ? 1 : 0, assist };
}

/** Fährt die Strecke allein mit einem Computerfahrer; Zeit in Sekunden (oder Infinity, wenn er nicht ankommt). */
export function aiTime(spec: VehicleSpec, course: Course, w: DriveWorld = worldFor(course.world), assist = true, skill: AiSkill = REFERENCE_SKILL, road?: RoadCond) {
  const p0 = w.samples[course.start];
  const st = initialState(p0.x - p0.nx * 1.8, p0.z - p0.nz * 1.8, Math.atan2(-p0.tz, p0.tx));
  const ai = { near: course.start, prog: 0 };
  const flat: Surface = road ? { grade: 0, ...road } : { grade: 0, grip: 1, drag: 0 };
  const dt = 1 / 60;
  for (let t = 0; t < 900; t += dt) {
    const input = aiInput(spec, st, w, ai, skill, 0, assist, road);
    if (ai.prog >= course.length) return t;
    stepVehicle(spec, st, input, flat, dt);
  }
  return Infinity;
}

/**
 * Referenzauto der Klasse: Mittelklasse-Limousine, auf 1,2 t erleichtert (wie ein gut gemachtes Klassenauto) und mit
 * so skaliertem Drehmoment, dass sie genau an der PS-Grenze liegt.
 */
function referenceSpec(cls: RaceClass) {
  const car = createCar('bavaria_330', [], () => 0.5, { year: 2005 });
  for (const k of Object.keys(car.components)) car.components[k].condition = 'ok';
  car.fluids.oil.level = 99;
  const spec = vehicleSpec(car);
  const ps = performance(car).ps;
  const target = cls === 'open' ? OPEN_REF_PS : RACE_CLASSES[cls].ps;
  const k = target / ps;
  const m = 1200 + 80;
  const g = REF_GRIP[cls];
  return { ...spec, muFront: spec.muFront * g, muRear: spec.muRear * g, cornerFront: spec.cornerFront * g, cornerRear: spec.cornerRear * g, mass: m, yawInertia: spec.yawInertia * (m / spec.mass), brakeForce: spec.brakeForce * (m / spec.mass), torque: spec.torque.map((p) => ({ rpm: p.rpm, nm: p.nm * k })), engineBrake: spec.engineBrake * k };
}

const targetCache = new Map<string, { gold: number; silver: number; bronze: number }>();
/** Sollzeiten (s) für Gold, Silber, Bronze. */
export function raceTargets(race: Pick<Race, 'course' | 'cls'> & { day?: number }) {
  // Wetter am Renntag (Regen, Schnee) bzw. eigener Belag der Rallyepiste: die Sollzeiten gelten für diese Fahrbahn
  const c = courseOf(race.course);
  const road = race.day ? roadCond(weatherOf(race.day), worldFor(c.world).road) : worldFor(c.world).road ?? undefined;
  const wet = road && (road.cls !== 'dry' || road.grip !== 1) ? road : undefined;
  const key = race.course + race.cls + (wet ? `${wet.cls}${wet.grip.toFixed(2)}` : '');
  let t = targetCache.get(key);
  if (!t) {
    const ref = aiTime(referenceSpec(race.cls), c, undefined, true, REFERENCE_SKILL, wet);
    t = { gold: Math.round(ref * 1.02 * 10) / 10, silver: Math.round(ref * 1.1 * 10) / 10, bronze: Math.round(ref * 1.2 * 10) / 10 };
    targetCache.set(key, t);
  }
  return t;
}

export type Medal = 'gold' | 'silver' | 'bronze' | null;
export const MEDAL_LABEL: Record<Exclude<Medal, null>, string> = { gold: '🥇 Gold', silver: '🥈 Silber', bronze: '🥉 Bronze' };
export function driftMedal(race: Pick<Race, 'course'>, points: number): Medal {
  const t = driftTargets(race);
  return points >= t.gold ? 'gold' : points >= t.silver ? 'silver' : points >= t.bronze ? 'bronze' : null;
}
export function medalFor(race: Race, time: number): Medal {
  const t = raceTargets(race);
  return time <= t.gold ? 'gold' : time <= t.silver ? 'silver' : time <= t.bronze ? 'bronze' : null;
}

/**
 * Auszahlung für eine gefahrene Zeit: Preisgeld der erreichten Medaille abzüglich dessen, was für dieses Rennen schon
 * ausgezahlt wurde (Verbesserung zahlt die Differenz, mehrfaches Fahren derselben Medaille nichts).
 */
export function payoutFor(race: Race, time: number, alreadyPaid: number, place?: number, points?: number, diff: Difficulty = 'medium') {
  const medal = race.kind === 'grid' ? placeMedal(place ?? 99) : race.kind === 'drift' ? driftMedal(race, points ?? 0) : medalFor(race, time);
  const prize = medal ? racePrize(race, diff)[medal] : 0;
  return { medal, prize, payout: Math.max(0, prize - alreadyPaid) };
}

/** Zeit als 1:23,4 */
export const raceClock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0').replace('.', ',')}`;
