/**
 * Fahrphysik der Probefahrt: Einspurmodell mit Gewichtsverlagerung, Reifenhaftung (Reibungskreis), Antriebsart,
 * Getriebe mit Automatik, Motorbremse, Luft- und Rollwiderstand, Steigung und einer Federung für die Aufbaubewegung.
 *
 * Alles hier ist reine Rechnung ohne Darstellung – damit testbar und später auch für Rennen oder Koop-Fahrten nutzbar.
 * Koordinaten: Fahrzeug-x nach vorn, Welt-x/z wie in der Szene; Kurs (heading) 0 = Welt +x, positiv = nach links (gegen den Uhrzeigersinn von oben).
 */
import { CAR_MODELS, REAR_ENGINE } from './data/cars';
import { engineOf } from './data/components';
import { performance, powerCurve } from './performance';
import { activeDefects } from './repair';
import type { CarInstance } from './types';
import { BODY_SPECS } from '../three/carGeometry';

export type Drivetrain = 'FWD' | 'RWD' | 'AWD';

/** Antriebsart je Modell (nach dem Vorbild). Nicht aufgeführte Modelle: Heckantrieb. */
const FWD = new Set(['renard_twingle', 'tanaka_piccolo', 'vw_golf2_gti', 'ingol_tc', 'audy_a4_b5', 'nordwind_s6']);
const AWD = new Set(['audy_urquattro']);
export const drivetrainOf = (modelId: string): Drivetrain => (AWD.has(modelId) ? 'AWD' : FWD.has(modelId) ? 'FWD' : 'RWD');

export interface VehicleSpec {
  mass: number;
  /** Abstand Schwerpunkt–Vorderachse und –Hinterachse (m). */
  a: number;
  b: number;
  cgHeight: number;
  yawInertia: number;
  drive: Drivetrain;
  /** Anteil des Antriebsmoments vorn beim Allrad. */
  awdFront: number;
  wheelRadius: number;
  /** Drehmomentkurve (Nm über U/min) aus dem Prüfstand – mit Tuning und Defekten. */
  torque: { rpm: number; nm: number }[];
  idle: number;
  redline: number;
  gears: number[];
  final: number;
  shiftTime: number;
  /** Bremsmoment des Motors im Schub bei Nenndrehzahl (Nm). */
  engineBrake: number;
  /** Haftbeiwert der Reifen vorn/hinten. */
  muFront: number;
  muRear: number;
  /** Seitensteifigkeit je Achse (N/rad). */
  cornerFront: number;
  cornerRear: number;
  brakeForce: number;
  brakeBiasFront: number;
  /** Lenkeinschlag der Räder bei vollem Lenkausschlag im Stand (rad). */
  steerMax: number;
  /** Schräglaufwinkel, bei dem die Reifen am stärksten führen (rad) – Ziel der Lenkhilfe. */
  peakSlip: number;
  dragArea: number;
  /**
   * Abtrieb: Auftriebsbeiwert × Stirnfläche (m², positiv = Abtrieb) und Anteil vorn. Abtrieb wächst mit v², drückt die
   * Reifen auf die Straße und erlaubt schnellere Kurven bei hohem Tempo – Serienautos fast null, Sportwagen und Flügel mehr.
   */
  clA: number;
  aeroFront: number;
  /** Anteil der Querlastübertragung an der Vorderachse (Wankabstützung): mehr vorn = mehr Untersteuern. */
  rollFront: number;
  /** Spurweite (m) für die Querlastübertragung. */
  track: number;
  rollRes: number;
  /** Federung: Eigenfrequenz (Hz) und Dämpfung der Aufbaubewegung – Sportfahrwerk straffer. */
  suspFreq: number;
  suspDamping: number;
  diesel: boolean;
  /** Spürbare Defekte und Verschleiß. */
  faults: Faults;
}

export interface Faults {
  /** Zündaussetzer: Drehmoment stottert. */
  misfire: boolean;
  /** Bremse schwach bzw. Scheiben rubbeln. */
  weakBrakes: boolean;
  judder: boolean;
  /** Fahrwerk: Lenkung zieht bzw. hat Spiel, Aufbau wankt mehr. */
  pull: number;
  play: number;
  /** Kupplung rutscht ab diesem Moment (Nm), Getriebe kracht beim Schalten. */
  clutchSlipNm: number;
  gearbox: boolean;
  smoke: boolean;
}

export interface VehicleState {
  x: number;
  z: number;
  y: number;
  heading: number;
  /** Geschwindigkeit längs/quer im Fahrzeug (m/s) und Gierrate (rad/s). */
  vx: number;
  vy: number;
  yawRate: number;
  rpm: number;
  /** Gang: -1 Rückwärts, 0 Leerlauf, 1… vorwärts. */
  gear: number;
  shiftTimer: number;
  /** Lenkeinschlag (geglättet, −1..1) und tatsächlicher Radwinkel (rad). */
  steer: number;
  wheelAngle: number;
  /** Aufbau: Nicken und Wanken (rad) mit Geschwindigkeit, Längs-/Querbeschleunigung für Last und Anzeige. */
  pitch: number;
  pitchV: number;
  roll: number;
  rollV: number;
  ax: number;
  ay: number;
  /** 0..1: wie stark die Antriebsräder durchdrehen bzw. die Reifen rutschen (für Klang und Rauch). */
  wheelspin: number;
  slide: number;
  /** Kupplung schleift beim Anfahren (0..1). */
  clutch: number;
  odometer: number;
  t: number;
}

export interface DriveInput {
  /** ESP und Antriebsschlupfregelung (Standard an). Aus: Heck kann ausbrechen – Driften für Könner. */
  assist?: boolean;
  throttle: number;
  brake: number;
  /** +1 = links, −1 = rechts. */
  steer: number;
  /** Handbremse: blockiert die Hinterräder (Drift einleiten, Wenden). */
  handbrake?: boolean;
}

/** Umgebung an der aktuellen Stelle. */
export interface Surface {
  /** Steigung in Fahrtrichtung (rad, positiv = bergauf). */
  grade: number;
  /** Haftung der Oberfläche relativ zu trockenem Asphalt (Wiese ~0.55). */
  grip: number;
  /** zusätzlicher Rollwiderstand (Wiese, Schotter). */
  drag: number;
}

const G = 9.81;
/** Lastempfindlichkeit der Reifen: Haftbeiwert sinkt um diesen Anteil je zusätzlicher statischer Radlast. */
const LOAD_SENS = 0.12;
const RHO = 1.2;

/** Typische Übersetzungen: ältere Autos fünf, neuere sechs Gänge; Diesel länger übersetzt. */
function gearsFor(year: number, cls: string, diesel: boolean) {
  const six = year >= 2000 || cls === 'sport' || cls === 'luxury';
  const base = six ? [3.82, 2.2, 1.52, 1.17, 0.96, 0.8] : [3.6, 2.12, 1.39, 1.0, 0.8];
  return diesel ? base.map((g, i) => (i ? g * 0.92 : g)) : base;
}

/** Wie stark ein Fahrwerkstuning die Federung strafft und die Haftung hebt. */
const SUSP: Record<string, { freq: number; damp: number; grip: number }> = {
  stock: { freq: 1.25, damp: 0.32, grip: 1 },
  springs: { freq: 1.5, damp: 0.36, grip: 1.02 },
  sport: { freq: 1.75, damp: 0.45, grip: 1.05 },
  coilover: { freq: 2.0, damp: 0.55, grip: 1.08 },
};

export function vehicleSpec(car: CarInstance): VehicleSpec {
  const model = CAR_MODELS[car.modelId];
  const body = BODY_SPECS[model.body];
  const e = engineOf(car);
  const p = performance(car);
  const defects = activeDefects(car) as string[];
  const mass = p.weight + 80; // mit Fahrer
  const wheelbase = 1.38 - body.rearAxle;
  // Gewichtsverteilung: Frontmotor ~55 % vorn, Heckmotor ~40 % vorn, Frontantrieb etwas kopflastiger.
  const rear = REAR_ENGINE.has(model.body);
  const drive = drivetrainOf(car.modelId);
  // Mittelmotor-Sportwagen (Veloce): Motor vor der Hinterachse, ~42 % vorn
  const mid = car.modelId === 'veloce_stradale' || car.modelId === 'veloce_gt';
  const frontShare = rear ? 0.4 : mid ? 0.42 : drive === 'FWD' ? 0.61 : model.cls === 'sport' || model.cls === 'luxury' ? 0.52 : 0.54;
  const a = wheelbase * (1 - frontShare);
  const b = wheelbase * frontShare;
  const diesel = e.fuel === 'diesel';
  const curve = powerCurve(car, 24);
  const redline = curve[curve.length - 1].rpm;
  const gears = gearsFor(car.year ?? 2005, model.cls, diesel);
  const wheelRadius = 0.31 + 0.0127 * (car.visual?.rimSize ?? 0);
  // Höchstgeschwindigkeit aus Leistung und Luftwiderstand; die Achse ist so übersetzt, dass sie im letzten Gang
  // knapp vor der Abregeldrehzahl erreicht wird.
  const spoiler = car.visual?.spoiler ?? 0;
  const dragArea = (model.body === 'box' || model.body === 'classic' || model.body === 'wagon' ? 0.74 : model.cls === 'sport' ? 0.62 : 0.68) * (spoiler === 3 ? 1.1 : spoiler === 2 ? 1.04 : spoiler === 1 ? 1.015 : 1);
  // Abtrieb: Serienlimousinen leicht Auftrieb (≈ 0), Sportwagen etwas Abtrieb, Mittelmotor-Supersportler deutlich;
  // Spoilerlippe, Entenbürzel und Heckflügel legen hinten zu (der Flügel am meisten), Verbreiterungen mit Schürzen etwas vorn
  const midEngine = car.modelId === 'veloce_stradale' || car.modelId === 'veloce_gt';
  const baseClA = midEngine ? 0.8 : model.cls === 'sport' ? 0.3 : model.cls === 'luxury' ? 0.08 : -0.04;
  const wingClA = spoiler === 3 ? 0.9 : spoiler === 2 ? 0.3 : spoiler === 1 ? 0.12 : 0;
  const flareClA = car.visual?.flares ? 0.08 : 0;
  const clA = baseClA + wingClA + flareClA;
  const aeroFront = clA > 0.05 ? Math.max(0.25, Math.min(0.5, (Math.max(0, baseClA) * 0.45 + flareClA * 0.8 + wingClA * 0.1) / clA)) : 0.45;
  const vmax = Math.cbrt((Math.max(30, p.ps) * 735.5 * 0.82) / (0.5 * RHO * dragArea));
  const final = (redline * 0.97 * 2 * Math.PI * wheelRadius) / (60 * Math.max(10, vmax) * gears[gears.length - 1]);
  const susp = SUSP[car.visual?.suspension ?? 'stock'] ?? SUSP.stock;
  // Reifen: breitere Felgen und Kotflügelverbreiterung haften besser, alte Reifen deutlich schlechter.
  const tireF = defects.includes('tires') ? 0.78 : 1;
  const tireR = defects.includes('tires_rear') ? 0.78 : 1;
  // Starke Autos fahren ab Werk breitere Reifen
  const wide = 1 + Math.min(0.2, Math.max(0, (p.powerToWeight - 120) / 1400));
  // Reifentechnik nach Baujahr: ältere Autos haften weniger (Grundhaftung guter Straßenreifen ~0,93)
  const year = car.year ?? 2005;
  const era = year < 1975 ? 0.86 : year < 1990 ? 0.91 : year < 2005 ? 0.96 : 1;
  const mu = 0.93 * era * wide * (1 + 0.025 * (car.visual?.rimSize ?? 0)) * (car.visual?.flares ? 1.03 : 1) * susp.grip * (model.cls === 'sport' || model.cls === 'luxury' ? 1.06 : 1);
  const has = (id: string) => defects.includes(id);
  const out = p.output;
  const clutchRisk = out.risks.find((r) => r.id === 'clutch');
  const faults: Faults = {
    misfire: has('coil') || has('plugs') || has('vacuum') || has('injector') || has('glow'),
    weakBrakes: has('brakes') || has('brakes_rear'),
    judder: has('discs') || has('discs_rear'),
    pull: has('tie_rod') ? 0.06 : has('control_arm') ? 0.035 : 0,
    play: has('tie_rod') ? 0.08 : has('control_arm') ? 0.05 : 0,
    clutchSlipNm: has('clutch') ? p.nm * 0.7 : clutchRisk ? p.nm * 0.85 : Infinity,
    gearbox: has('gearbox'),
    smoke: ['gasket', 'water_pump', 'coolant_hose', 'turbo', 'egr', 'dpf', 'head_gasket', 'radiator'].some((x) => has(x)),
  };
  return {
    mass,
    a,
    b,
    cgHeight: model.body === 'tub' || model.cls === 'sport' ? 0.48 : model.body === 'box' || model.body === 'wagon' ? 0.58 : 0.54,
    yawInertia: mass * wheelbase * wheelbase * 0.42,
    drive,
    awdFront: 0.4,
    wheelRadius,
    torque: curve.map((c) => ({ rpm: c.rpm, nm: c.nm })),
    idle: diesel ? 780 : 850,
    redline,
    gears,
    final,
    shiftTime: faults.gearbox ? 0.55 : model.cls === 'sport' ? 0.18 : 0.28,
    engineBrake: Math.max(25, p.nm * (diesel ? 0.28 : 0.22)),
    muFront: mu * tireF,
    // Hinterachse mit Reserve (breitere Reifen, Spur, Geometrie): im Grenzbereich schiebt das Auto über die Vorderräder,
    // statt sich zu drehen – wie ein echtes, gutmütig abgestimmtes Serienauto
    muRear: mu * tireR * 1.08 * (rear ? 1.03 : 1),
    // Seitensteifigkeit je Achse (bezogen auf die Achslast): Höchste Seitenführung bei rund 7–8° Schräglauf
    cornerFront: mass * G * (b / wheelbase) * 19 * susp.grip,
    cornerRear: mass * G * (a / wheelbase) * 23 * susp.grip,
    brakeForce: mass * G * 1.05 * (faults.weakBrakes ? 0.45 : 1) * (model.cls === 'budget' ? 0.95 : 1.05),
    brakeBiasFront: 0.7,
    steerMax: 0.62,
    peakSlip: PEAK_K * (mu / 19),
    dragArea,
    clA,
    aeroFront,
    // Serienabstimmung vorn steifer (gutmütiges Untersteuern), Sportfahrwerk ausgeglichener, Fronttriebler vorn mehr
    rollFront: (drive === 'FWD' ? 0.6 : 0.56) - (susp === SUSP.stock ? 0 : susp === SUSP.coilover ? 0.06 : 0.03),
    track: 1.5 + (body.width - 0.9) * 0.8 + (car.visual?.flares ? 0.06 : 0),    rollRes: 0.013,
    suspFreq: susp.freq,
    suspDamping: susp.damp,
    diesel,
    faults,
  };
}

export function initialState(x: number, z: number, heading: number): VehicleState {
  return { x, z, y: 0, heading, vx: 0, vy: 0, yawRate: 0, rpm: 850, gear: 1, shiftTimer: 0, steer: 0, wheelAngle: 0, pitch: 0, pitchV: 0, roll: 0, rollV: 0, ax: 0, ay: 0, wheelspin: 0, slide: 0, clutch: 1, odometer: 0, t: 0 };
}

/** Motormoment bei Volllast (Nm) – lineare Interpolation in der Prüfstandskurve. */
export function torqueAt(spec: VehicleSpec, rpm: number) {
  const c = spec.torque;
  if (rpm <= c[0].rpm) return c[0].nm * Math.max(0.55, rpm / c[0].rpm);
  for (let i = 1; i < c.length; i++) {
    if (rpm <= c[i].rpm) {
      const k = (rpm - c[i - 1].rpm) / (c[i].rpm - c[i - 1].rpm);
      return c[i - 1].nm + (c[i].nm - c[i - 1].nm) * k;
    }
  }
  return c[c.length - 1].nm;
}

const ratio = (spec: VehicleSpec, gear: number) => (gear === -1 ? -3.4 : gear === 0 ? 0 : spec.gears[gear - 1]) * spec.final;

/**
 * Seitenkraft eines Reifens (vereinfachte „Magic Formula“): steigt linear an, erreicht bei einigen Grad Schräglauf
 * ihr Maximum und fällt beim Rutschen auf gut 85 % ab. Dieser Abfall macht Driften möglich, ohne dass das Auto
 * schlagartig wegbricht.
 */
const MF_C = 1.35;
/** Schräglauf (in Einheiten von C·D/Cα), bei dem die Kraft am größten ist: B·α = tan(π / 2C). */
const PEAK_K = Math.tan(Math.PI / (2 * MF_C)) * MF_C;
function tire(alpha: number, stiffness: number, limit: number) {
  if (limit <= 0) return 0;
  const B = stiffness / (MF_C * limit);
  return -limit * Math.sin(MF_C * Math.atan(B * alpha));
}

/**
 * Einen Zeitschritt rechnen. Intern in kleinen Teilschritten (stabil auch bei ruckelnder Bildrate).
 */
export function stepVehicle(spec: VehicleSpec, s: VehicleState, input: DriveInput, surface: Surface, dt: number) {
  const n = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / n;
  for (let i = 0; i < n; i++) substep(spec, s, input, surface, h);
}

function substep(spec: VehicleSpec, s: VehicleState, input: DriveInput, surface: Surface, dt: number) {
  s.t += dt;
  const L = spec.a + spec.b;
  const speed = Math.hypot(s.vx, s.vy);
  const f = spec.faults;
  const assist = input.assist !== false;
  const hand = !!input.handbrake;

  // --- Lenkung. Eingabe folgt zügig (Lenkrad, kein Knopf), der Einschlag hängt vom Tempo ab:
  // im Stand und beim Rangieren der volle Radeinschlag; bei Tempo hält eine Lenkhilfe (wie in Rennspielen) die
  // Vorderräder nahe am besten Schräglaufwinkel, gemessen an der Richtung, in die sich die Vorderachse gerade bewegt.
  // Voller Ausschlag heißt damit bei jedem Tempo: so eng wie die Reifen es hergeben. Rutscht das Auto quer,
  // richten sich die Räder von selbst in Fahrtrichtung aus (Gegenlenken), lenken lässt sich trotzdem in beide Richtungen.
  const rate = 5;
  s.steer += Math.max(-rate * dt, Math.min(rate * dt, input.steer - s.steer));
  const vxa = Math.max(0.5, Math.abs(s.vx));
  const lock = spec.steerMax / (1 + Math.max(0, vxa - 6) / 30);
  let wheel = s.steer * lock;
  if (s.vx > 4) {
    const travel = Math.atan2(s.vy + spec.a * s.yawRate, vxa);
    const reach = spec.peakSlip * 1.25;
    const lo = Math.max(-lock, travel - reach);
    const hi = Math.min(lock, travel + reach);
    // über 4 m/s gleitend einblenden
    const k = Math.min(1, (s.vx - 4) / 6);
    const assisted = Math.max(lo, Math.min(hi, s.steer >= 0 ? travel + (hi - travel) * s.steer : travel + (travel - lo) * s.steer));
    wheel = wheel + (assisted - wheel) * k;
  }
  if (f.play && Math.abs(s.steer) < 0.15) wheel += Math.sin(s.t * 1.7) * f.play * 0.15 * Math.min(1, speed / 15);
  wheel += f.pull * 0.1 * Math.min(1, speed / 10);
  s.wheelAngle = wheel;

  // --- Radlasten mit Gewichtsverlagerung (längs aus der letzten Beschleunigung)
  const weight = spec.mass * G * Math.cos(surface.grade);
  const transfer = (spec.mass * s.ax * spec.cgHeight) / L;
  // Abtrieb (wächst mit dem Quadrat der Geschwindigkeit; Auftrieb entlastet entsprechend)
  const down = 0.5 * RHO * spec.clA * s.vx * s.vx;
  const staticF = (weight * spec.b) / L;
  const staticR = (weight * spec.a) / L;
  const loadF = Math.max(0.15 * weight, staticF - transfer + down * spec.aeroFront);
  const loadR = Math.max(0.15 * weight, staticR + transfer + down * (1 - spec.aeroFront));
  const muF = spec.muFront * surface.grip;
  const muR = spec.muRear * surface.grip;

  // --- Getriebe (Automatik) und Drehzahl
  const wheelRpm = (s.vx / spec.wheelRadius) * (60 / (2 * Math.PI));
  if (s.shiftTimer > 0) s.shiftTimer -= dt;
  const stopped = Math.abs(s.vx) < 0.6;
  if (input.brake > 0.1 && stopped && input.throttle < 0.05 && s.gear >= 1) s.gear = -1;
  else if (input.throttle > 0.1 && s.gear === -1 && stopped) s.gear = 1;
  if (s.gear >= 1 && s.shiftTimer <= 0) {
    const rpmIn = (g: number) => Math.abs(wheelRpm * ratio(spec, g));
    // Volllast: spät schalten; Teillast: früh und schaltfaul. Im Drift (Räder drehen durch) nicht hochschalten.
    const up = spec.redline * (input.throttle > 0.8 ? 0.95 : 0.45 + 0.4 * input.throttle);
    if (s.gear < spec.gears.length && rpmIn(s.gear) > up) {
      s.gear++;
      s.shiftTimer = spec.shiftTime;
    } else if (s.gear > 1 && rpmIn(s.gear - 1) < spec.redline * (input.throttle > 0.8 ? 0.82 : 0.55) && rpmIn(s.gear) < spec.redline * (input.throttle > 0.6 ? 0.45 : 0.3)) {
      s.gear--;
      s.shiftTimer = spec.shiftTime * 0.8;
    }
  }
  const r = ratio(spec, s.gear);
  const coupled = Math.abs(wheelRpm * r);
  // Anfahren: Kupplung schleift, bis die Drehzahl zur Geschwindigkeit passt
  const launch = spec.idle + input.throttle * (spec.diesel ? 1400 : 2600);
  let rpm: number;
  if (coupled < launch && Math.abs(s.gear) === 1) {
    s.clutch = Math.min(1, coupled / launch);
    rpm = Math.max(coupled, spec.idle + (launch - spec.idle) * (1 - s.clutch * 0.6));
  } else {
    s.clutch = 1;
    rpm = Math.max(spec.idle, coupled);
  }
  // Durchdrehende Antriebsräder heben die Drehzahl an (hörbar im Drift)
  rpm += s.wheelspin * 1400 * input.throttle;
  // Rutschende Kupplung: Drehzahl läuft unter Last davon
  let maxNm = torqueAt(spec, Math.min(rpm, spec.redline));
  if (maxNm * input.throttle > f.clutchSlipNm && s.gear >= 2) {
    rpm += (maxNm * input.throttle - f.clutchSlipNm) * 4;
    maxNm = f.clutchSlipNm / Math.max(0.1, input.throttle);
  }
  const limiter = rpm >= spec.redline;
  s.rpm += (Math.min(rpm, spec.redline + 120) - s.rpm) * Math.min(1, dt * 18);

  // --- Antriebsmoment an den Rädern
  let engineNm = 0;
  if (s.shiftTimer <= 0 && s.gear !== 0) {
    if (input.throttle > 0.02 && !limiter) engineNm = maxNm * input.throttle;
    else if (input.throttle > 0.02) engineNm = maxNm * input.throttle * 0.3;
    else engineNm = -spec.engineBrake * Math.min(1, (s.rpm - spec.idle) / (spec.redline - spec.idle));
    if (f.misfire) engineNm *= Math.sin(s.t * 11) > 0.3 ? 0.25 : 0.75;
  }
  const driveForce = (engineNm * r * 0.88) / spec.wheelRadius;
  const shareF = spec.drive === 'FWD' ? 1 : spec.drive === 'AWD' ? spec.awdFront : 0;
  let fxF = driveForce * shareF;
  let fxR = driveForce * (1 - shareF);

  // Haftung je Achse aus den beiden Radlasten: Reifen sind lastempfindlich (doppelte Last ≠ doppelte Haftung).
  // Die Querlastübertragung in der Kurve belastet das kurvenäußere Rad und kostet damit Achshaftung – je nachdem,
  // welche Achse mehr Wankmoment trägt (Wankabstützung), schiebt das Auto oder kommt das Heck.
  const latTransfer = (spec.mass * Math.abs(s.ay) * spec.cgHeight) / spec.track;
  const axleGrip = (mu: number, load: number, staticLoad: number, share: number) => {
    const d = Math.min(load / 2, latTransfer * share);
    const ref = staticLoad / 2;
    const wheel = (fz: number) => mu * fz * Math.max(0.55, 1 - LOAD_SENS * (fz / ref - 1));
    return wheel(load / 2 + d) + wheel(load / 2 - d);
  };
  const capF = axleGrip(muF, loadF, staticF, spec.rollFront);
  const capR = axleGrip(muR, loadR, staticR, 1 - spec.rollFront);
  // Seitenkraft, die die Kurve gerade braucht (aus der letzten Querbeschleunigung), bleibt jeder Achse vorbehalten
  const needF = spec.mass * Math.abs(s.ay) * (spec.b / L);
  const needR = spec.mass * Math.abs(s.ay) * (spec.a / L);

  // --- Bremse mit ABS (immer aktiv): höchstens bis zur Haftgrenze, mit Seitenreserve für die Kurve
  const dir = s.vx >= 0 ? 1 : -1;
  if (input.brake > 0 && !(s.gear === -1 && stopped)) {
    const total = spec.brakeForce * input.brake;
    fxF -= dir * Math.min(total * spec.brakeBiasFront, Math.sqrt(Math.max(0, capF * capF - needF * needF)) * 0.98);
    fxR -= dir * Math.min(total * (1 - spec.brakeBiasFront), Math.sqrt(Math.max(0, capR * capR - needR * needR * 1.3)) * 0.97);
  }
  // Handbremse: Hinterräder blockieren – sie bremsen mit der vollen Gleitreibung und führen kaum noch seitlich
  if (hand && Math.abs(s.vx) > 0.5) {
    fxR = -dir * capR * 0.8;
    engineNm = 0;
  }
  if (assist) {
    // Antriebsschlupfregelung (Teil des ESP): Antriebskraft höchstens bis zur Haftgrenze (keine durchdrehenden Räder)
    if (fxF > 0) fxF = Math.min(fxF, capF * 0.97);
    if (fxR > 0) fxR = Math.min(fxR, Math.sqrt(Math.max(0, capR * capR - needR * needR)) * 0.97);
  }
  const spinF = Math.max(0, Math.abs(fxF) - capF) / Math.max(1, capF);
  const spinR = Math.max(0, Math.abs(fxR) - capR) / Math.max(1, capR);
  fxF = Math.sign(fxF) * Math.min(Math.abs(fxF), capF);
  fxR = Math.sign(fxR) * Math.min(Math.abs(fxR), capR);

  // --- Seitenkräfte über Schräglaufwinkel; bei kleinem Tempo gedämpft (sonst springt der Winkel)
  const vxs = Math.max(Math.abs(s.vx), 2.5);
  const alphaF = Math.atan2(s.vy + spec.a * s.yawRate, vxs) - wheel * Math.sign(s.vx || 1);
  const alphaR = Math.atan2(s.vy - spec.b * s.yawRate, vxs);
  // Reibungskreis: Längskraft nimmt Seitenführung weg (Gas im Heckantrieb → Heck kommt); durchdrehende Räder führen schlechter
  const latF = Math.sqrt(Math.max(0, capF * capF - fxF * fxF)) * (1 - Math.min(0.5, spinF * 0.8));
  let latR = Math.sqrt(Math.max(0, capR * capR - fxR * fxR)) * (1 - Math.min(0.5, spinR * 0.8));
  if (hand && Math.abs(s.vx) > 0.5) latR = capR * 0.3;
  // Seitensteifigkeit wächst mit der Radlast (unterproportional) – mit Abtrieb lenkt das Auto bei Tempo direkter ein
  let fyF = tire(alphaF, spec.cornerFront * (loadF / staticF) ** 0.7, latF);
  let fyR = tire(alphaR, spec.cornerRear * (loadR / staticR) ** 0.7, latR);
  const lowSpeed = Math.min(1, speed / 3);
  fyF *= lowSpeed;
  fyR *= lowSpeed;
  s.wheelspin = Math.min(1, Math.max(spinF * (shareF > 0 ? 1 : 0), spinR * (shareF < 1 ? 1 : 0)) * 3);
  const slipAngle = Math.atan2(s.vy, vxs);
  s.slide = speed > 6 ? Math.min(1, Math.max(0, Math.max(Math.abs(alphaF), Math.abs(alphaR)) - spec.peakSlip) * 5 + (hand ? 0.5 : 0)) : 0;

  // --- Widerstände: Luft, Rollen, Oberfläche, Steigung
  const drag = 0.5 * RHO * spec.dragArea * s.vx * Math.abs(s.vx);
  const rolling = (spec.rollRes + surface.drag) * spec.mass * G * Math.sign(s.vx) * Math.min(1, Math.abs(s.vx) * 2);
  const slope = spec.mass * G * Math.sin(surface.grade);

  // --- Bewegungsgleichungen
  const cos = Math.cos(wheel);
  const sin = Math.sin(wheel);
  const fy = fxF * sin + fyF * cos + fyR;
  // Drehende Teile (Räder, Antriebswelle, Getriebe, Schwungrad) müssen mitbeschleunigt werden – in den kurzen Gängen
  // deutlich spürbar (Faustformel: effektive Masse 1,03 + 0,0011 × Gesamtübersetzung²)
  const massEff = spec.mass * (1.03 + (s.shiftTimer > 0 || s.gear === 0 ? 0 : 0.0011 * r * r));
  const ax = (fxF * cos - fyF * sin + fxR) / massEff - (drag + rolling + slope) / spec.mass;
  const ay = fy / spec.mass;
  s.vx += (ax + s.vy * s.yawRate) * dt;
  s.vy += (ay - s.vx * s.yawRate) * dt;
  let yawMoment = spec.a * (fyF * cos + fxF * sin) - spec.b * fyR;
  if (Math.abs(s.vx) > 3) {
    // Gierrate, die zur Bahnkrümmung passt (Auto dreht sich mit der Kurve): Abweichung davon ist Ein- oder Ausdrehen
    const pathYaw = ay / s.vx;
    if (assist) {
      // ESP: dreht das Auto schneller, als es der Lenkeinschlag bei dieser Haftung erlaubt (Heck kommt), bremst es gezielt
      // gegen – wie im echten Auto.
      const ref = Math.max(-1, Math.min(1, (s.vx * Math.tan(wheel)) / L));
      const limit = (spec.muRear * G * surface.grip) / Math.abs(s.vx);
      const target = Math.max(-limit, Math.min(limit, ref));
      const excess = s.yawRate - target;
      if (Math.abs(excess) > 0.04 && Math.sign(excess) === Math.sign(s.yawRate)) yawMoment -= excess * spec.yawInertia * 5;
      // Schwimmwinkel zu groß (Heck drängt nach außen): gegendrehen
      if (Math.abs(slipAngle) > 0.07) yawMoment += (slipAngle - Math.sign(slipAngle) * 0.07) * spec.mass * 14 * Math.sign(s.vx);
    } else {
      // Drift-Hilfe (ohne ESP): Der Driftwinkel bleibt beherrschbar. Ab etwa 20° wird weiteres Eindrehen zunehmend
      // gedämpft (Zurückdrehen nie), ab etwa 50° drückt sie deutlich zurück – ein Dreher braucht schon Absicht.
      const excess = s.yawRate - pathYaw;
      const into = Math.sign(excess) === -Math.sign(slipAngle);
      const k = Math.max(0, Math.min(1, (Math.abs(slipAngle) - 0.35) / 0.4));
      if (into && k > 0) yawMoment -= excess * spec.yawInertia * 4 * k;
      const maxDrift = 0.87;
      if (Math.abs(slipAngle) > maxDrift) yawMoment += (slipAngle - Math.sign(slipAngle) * maxDrift) * spec.mass * 30 * Math.sign(s.vx);
    }
  }
  s.yawRate += (yawMoment / spec.yawInertia) * dt;
  // Bei kleinem Tempo nur rollen, nicht driften; Stillstand ohne Gas bleibt stehen
  if (speed < 1.5) {
    s.vy *= 1 - Math.min(1, dt * 8);
    s.yawRate = s.yawRate * (1 - Math.min(1, dt * 6)) + ((s.vx * Math.tan(wheel)) / L) * Math.min(1, dt * 6);
  }
  if (input.throttle < 0.02 && Math.abs(s.vx) < 0.25 && Math.abs(slope) < spec.mass * G * 0.06) s.vx = 0;
  if (s.gear === -1 && s.vx < -6) s.vx = -6;
  s.ax += (ax - s.ax) * Math.min(1, dt * 10);
  s.ay += (ay - s.ay) * Math.min(1, dt * 10);

  s.heading += s.yawRate * dt;
  const c = Math.cos(s.heading);
  const sn = Math.sin(s.heading);
  // Fahrzeug-y zeigt nach links: Welt-Verschiebung
  const wx = s.vx * c - s.vy * sn;
  const wz = -(s.vx * sn + s.vy * c);
  s.x += wx * dt;
  s.z += wz * dt;
  s.odometer += speed * dt;

  // --- Aufbau: Feder-Dämpfer-System für Nicken und Wanken (Sportfahrwerk straffer, Bremsen taucht ein)
  const w = 2 * Math.PI * spec.suspFreq;
  // Beschleunigen: Front hebt sich (Nicken positiv = Nase hoch), Bremsen: Front taucht ein
  const pitchTarget = s.ax * 0.0065 * (1.25 / spec.suspFreq) ** 2;
  const rollTarget = s.ay * 0.0085 * (1.25 / spec.suspFreq) ** 2 * (f.play ? 1.3 : 1);
  s.pitchV += (w * w * (pitchTarget - s.pitch) - 2 * spec.suspDamping * w * s.pitchV) * dt;
  s.rollV += (w * w * (rollTarget - s.roll) - 2 * spec.suspDamping * w * s.rollV) * dt;
  s.pitch += s.pitchV * dt;
  s.roll += s.rollV * dt;
}

/** Geschwindigkeit in km/h (vorwärts positiv). */
export const kmh = (s: VehicleState) => s.vx * 3.6;
