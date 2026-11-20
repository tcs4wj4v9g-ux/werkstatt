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
import { createCar } from './market';
import { performance } from './performance';
import { driveBlocker } from './repair';
import type { CarInstance } from './types';
import { initialState, stepVehicle, vehicleSpec, type VehicleSpec } from './vehicle';

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
const LAPS: Record<CircuitId, number> = { eifel: 1, motodrom: 2, hafen: 2, ardennen: 1 };

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
  /** Preisgeld je Medaille. */
  prize: { gold: number; silver: number; bronze: number };
}

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

/** Rennen des Tages (an jedem dritten Tag keins: dann ist Fahrzeugtreffen). */
export function raceForDay(day: number): Race | null {
  if (day % 3 === 0) return null;
  const r = seeded(day + 17);
  // Anfangs nur die Strecken rund um Grünbach, ab Tag 4 auch die Rennstrecken
  const course = (day < 4 ? (['ost', 'west', 'runde'] as const) : (['ost', 'west', 'runde', 'eifel', 'motodrom', 'hafen', 'ardennen', 'eifel', 'motodrom', 'hafen', 'ardennen'] as const))[Math.floor(r() * (day < 4 ? 3 : 11))];
  // Die ersten Tage eher kleine Klassen, später alle
  const pool: RaceClass[] = day < 4 ? ['c150', 'c250'] : ['c150', 'c250', 'c250', 'c400', 'c400', 'open'];
  const cls = pool[Math.floor(r() * pool.length)];
  const c = RACE_CLASSES[cls];
  const gold = Math.round((c.gold * courseOf(course).pay) / 50) * 50;
  return {
    id: `rennen-${day}`,
    day,
    course,
    cls,
    title: `Zeitrennen ${courseOf(course).name} – ${c.name}`,
    fee: c.fee,
    prize: { gold, silver: Math.round((gold * 0.55) / 50) * 50, bronze: Math.round((gold * 0.25) / 50) * 50 },
  };
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
export function aiTime(spec: VehicleSpec, course: Course, w: DriveWorld = worldFor(course.world), assist = true) {
  const n = w.samples.length;
  const p0 = w.samples[course.start];
  const st = initialState(p0.x - p0.nx * 1.8, p0.z - p0.nz * 1.8, Math.atan2(-p0.tz, p0.tx));
  let near = course.start;
  let prog = 0;
  const flat = { grade: 0, grip: 1, drag: 0 };
  const dt = 1 / 60;
  // Grenzen des Autos: Querbeschleunigung etwas unter der Haftgrenze, Verzögerung mit Reserve
  const aLat = spec.muFront * 9.81 * 0.88;
  const aBrake = Math.min(spec.muFront, spec.brakeForce / (spec.mass * 9.81)) * 9.81 * 0.75;
  for (let t = 0; t < 600; t += dt) {
    const q = w.nearest(st.x, st.z, near);
    let d = q.i - near;
    if (d > n / 2) d -= n;
    if (d < -n / 2) d += n;
    prog += d;
    near = q.i;
    if (prog >= course.length) return t;
    const tg = w.samples[(near + Math.round(8 + st.vx * 0.5)) % n];
    let diff = Math.atan2(-(tg.z - st.z), tg.x - st.x) - st.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    // Tempoplan: jede Kurve voraus erlaubt v = √(a_quer / Krümmung); bremsen erst, wenn der Bremsweg dorthin knapp wird
    let vt = 80;
    for (let k = 2; k < 160; k++) {
      const c = Math.abs(w.samples[(near + k) % n].curv);
      const vc = Math.sqrt(aLat / Math.max(1e-4, c));
      vt = Math.min(vt, Math.sqrt(vc * vc + 2 * aBrake * Math.max(0, k * 2 - 4)));
    }
    const steer = Math.max(-1, Math.min(1, diff * 3 - q.lateral * 0.04));
    stepVehicle(spec, st, { steer, throttle: st.vx < vt - 0.5 ? 1 : st.vx < vt ? 0.4 : 0, brake: st.vx > vt + 1.5 ? 1 : 0, assist }, flat, dt);
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
export function raceTargets(race: Pick<Race, 'course' | 'cls'>) {
  const key = race.course + race.cls;
  let t = targetCache.get(key);
  if (!t) {
    const ref = aiTime(referenceSpec(race.cls), courseOf(race.course));
    t = { gold: Math.round(ref * 1.02 * 10) / 10, silver: Math.round(ref * 1.1 * 10) / 10, bronze: Math.round(ref * 1.2 * 10) / 10 };
    targetCache.set(key, t);
  }
  return t;
}

export type Medal = 'gold' | 'silver' | 'bronze' | null;
export const MEDAL_LABEL: Record<Exclude<Medal, null>, string> = { gold: '🥇 Gold', silver: '🥈 Silber', bronze: '🥉 Bronze' };
export function medalFor(race: Race, time: number): Medal {
  const t = raceTargets(race);
  return time <= t.gold ? 'gold' : time <= t.silver ? 'silver' : time <= t.bronze ? 'bronze' : null;
}

/**
 * Auszahlung für eine gefahrene Zeit: Preisgeld der erreichten Medaille abzüglich dessen, was für dieses Rennen schon
 * ausgezahlt wurde (Verbesserung zahlt die Differenz, mehrfaches Fahren derselben Medaille nichts).
 */
export function payoutFor(race: Race, time: number, alreadyPaid: number) {
  const medal = medalFor(race, time);
  const prize = medal ? race.prize[medal] : 0;
  return { medal, prize, payout: Math.max(0, prize - alreadyPaid) };
}

/** Zeit als 1:23,4 */
export const raceClock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0').replace('.', ',')}`;
