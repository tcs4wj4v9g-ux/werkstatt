import { useFrame, useThree } from '@react-three/fiber';
import { textTexture } from './textures';
import { courseOf, raceForDay } from '../game/races';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CAR_MODELS } from '../game/data/cars';
import { DRIVE_MIN, driveInput, useDriveHud } from '../game/drive';
import { activeDefects } from '../game/repair';
import { engineAudio, roadAudio } from '../game/audio';
import { soundProfile } from '../game/diagnosis';
import { useGame } from '../game/store';
import { initialState, stepVehicle, vehicleSpec } from '../game/vehicle';
import { CarModel } from './CarModel';
import { DriveScenery } from './DriveScenery';
import { driveWorld, LAKE, RAIL_OFFSET, ROAD_WIDTH } from './driveWorld';
import { Env } from './Env';
import { DriveEffects } from './driveEffects';
import { BODY_SPECS } from './carGeometry';

const HALF_WIDTH = 0.9;
/** Kontrollpunkte je Rennstrecke (der letzte ist das Ziel). */
const RACE_CP = 8;
const SKID_ROAD = new THREE.Color('#141414');
const SKID_GRAVEL = new THREE.Color('#6b5d48');
const SKID_GRASS = new THREE.Color('#3f4a26');
const SMOKE = new THREE.Color('#f2f2f2');
const DUST = new THREE.Color('#b9a27c');
const SKY = '#a9cbea';

/**
 * Probefahrt: Fahrphysik (`game/vehicle.ts`) in der offenen Landschaft (`driveWorld.ts`): Landstraßen, Ort, Testgelände,
 * Wiesen und Feldwege. Gewertet ist die Fahrt ab `DRIVE_MIN` Sekunden; beendet wird sie durch Anhalten auf dem Werkstatt-Vorplatz.
 * Der Wagen folgt dem Gelände, Leitplanken und Hindernisse halten ihn auf.
 */
export function TrackScene() {
  const car = useGame((s) => s.cars[s.driveBay])!;
  const finishDrive = useGame((s) => s.finishDrive);
  const finishRace = useGame((s) => s.finishRace);
  const raceRun = useGame((s) => s.race);
  const day = useGame((s) => s.day);
  // Zeitrennen: Strecke und Kontrollpunkte (gleichmäßig verteilt, der letzte ist das Ziel)
  const race = useMemo(() => (raceRun ? raceForDay(day) : null), [raceRun, day]);
  const course = useMemo(() => (race ? courseOf(race.course) : null), [race]);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const steerVis = useRef(0);
  const spinVis = useRef({ f: 0, r: 0 });
  const world = useMemo(() => driveWorld(), []);
  const spec = useMemo(() => vehicleSpec(car), [car]);
  const fx = useMemo(() => new DriveEffects(), []);
  const body3 = BODY_SPECS[CAR_MODELS[car.modelId].body];
  const smoke = useMemo(() => {
    const d = activeDefects(car);
    return d.includes('turbo') ? '#8fa3c4' : d.includes('egr') || d.includes('dpf') ? '#1b1b1b' : '#e9e9e9';
  }, [car]);
  const n = world.samples.length;
  const startAt = course ? world.samples[course.start] : null;
  const sim = useRef(Object.assign(startAt ? initialState(startAt.x - startAt.nx * 1.8, startAt.z - startAt.nz * 1.8, Math.atan2(-startAt.tz, startAt.tx)) : initialState(world.start.x, world.start.z, world.start.heading), {
    raceT: -3,
    cp: 0,
    cpAt: null as null | { x: number; z: number; heading: number; near: number; progress: number }, camYaw: undefined as number | undefined, away: false, tooShort: false, v: 0, near: 0, progress: 0, elapsed: 0, done: false, hud: 0, lastGear: 1, bump: 0, timeScale: 1, autopilot: 0, laySign: 0, respawn: 0 }));
  const camPos = useRef(new THREE.Vector3());
  const smokeRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    const s = sim.current;
    s.y = world.ground(s.x, s.z);
    camera.fov = 58;
    camera.far = 800;
    camera.updateProjectionMatrix();
    camPos.current.set(s.x - Math.cos(s.heading) * 7, s.y + 2.6, s.z + Math.sin(s.heading) * 7);
    (window as any).__gkDrive = { sim: s, samples: world.samples, input: driveInput, spec, spin: spinVis.current };
    driveInput.steer = driveInput.throttle = driveInput.brake = 0;
    driveInput.handbrake = false;
    s.respawn = useDriveHud.getState().respawn;
    if (course) {
      s.near = course.start;
      s.progress = 0;
    }
    useDriveHud.getState().set({ speed: 0, rpm: spec.idle, redline: spec.redline, gear: 1, elapsed: 0, home: 0, away: false, tooShort: false, drift: 0, offTrack: false, distance: 0, raceT: -3, cp: 0, cpTotal: RACE_CP, racing: !!course });
    const keys: Record<string, boolean> = {};
    const apply = () => {
      driveInput.steer = (keys.ArrowLeft || keys.a ? 1 : 0) - (keys.ArrowRight || keys.d ? 1 : 0);
      driveInput.throttle = keys.ArrowUp || keys.w ? 1 : 0;
      driveInput.brake = keys.ArrowDown || keys.s ? 1 : 0;
      driveInput.handbrake = !!keys[' '];
    };
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'c') useDriveHud.getState().set({ camera: (['chase', 'hood', 'cockpit'] as const)[(['chase', 'hood', 'cockpit'].indexOf(useDriveHud.getState().camera) + 1) % 3] });
      keys[e.key] = true;
      apply();
    };
    const up = (e: KeyboardEvent) => ((keys[e.key] = false), apply());
    engineAudio.start(soundProfile(car));
    engineAudio.setWarm(true);
    roadAudio.start();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      engineAudio.stop();
      roadAudio.stop();
      camera.far = 400;
      camera.updateProjectionMatrix();
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useFrame((_, rawDt) => {
    const s = sim.current;
    // Die Physik rechnet in kleinen Teilschritten: auch ruckelige Bilder (bis 0,1 s) bleiben stabil.
    // timeScale > 1 nur für automatische Tests (Zeitraffer).
    const dt = Math.min(rawDt, 0.1) * s.timeScale;

    // --- „Zurück auf die Straße“: an den nächsten Straßenpunkt, in Fahrtrichtung, im Stand
    const want = useDriveHud.getState().respawn;
    if (want !== s.respawn && course) {
      // Im Rennen: zurück zum letzten Kontrollpunkt (bzw. an den Start) – die Uhr läuft weiter
      s.respawn = want;
      const at = s.cpAt ?? { x: startAt!.x - startAt!.nx * 1.8, z: startAt!.z - startAt!.nz * 1.8, heading: Math.atan2(-startAt!.tz, startAt!.tx), near: course.start, progress: 0 };
      Object.assign(s, { x: at.x, z: at.z, heading: at.heading, near: at.near, progress: at.progress, vx: 0, vy: 0, yawRate: 0, gear: 1 });
      s.y = world.samples[at.near].y;
    } else if (want !== s.respawn) {
      s.respawn = want;
      const q = world.nearest(s.x, s.z, s.near);
      const p = world.samples[q.i];
      Object.assign(s, { x: p.x - p.nx * 1.8, z: p.z - p.nz * 1.8, heading: Math.atan2(-p.tz, p.tx), vx: 0, vy: 0, yawRate: 0, gear: 1, near: q.i });
      s.y = p.y;
    }
    // --- Rand der Welt: sanft zurückhalten (dahinter kommt nur noch Wiese bis zum Horizont)
    const edge = Math.hypot(s.x, s.z) - (world.extent - 40);
    if (edge > 0) {
      const k = (world.extent - 40) / Math.hypot(s.x, s.z);
      s.x *= k;
      s.z *= k;
      s.vx *= 0.9;
      s.vy *= 0.5;
    }

    // --- Ins Wasser fährt man nicht: am Ufer stehen bleiben (mit Platschen)
    if (world.inLake(s.x, s.z)) {
      const dx = (s.x - LAKE.x) / LAKE.rx;
      const dz = (s.z - LAKE.z) / LAKE.rz;
      const k = Math.hypot(dx, dz) || 1;
      s.x = LAKE.x + (dx / k) * LAKE.rx * 0.975;
      s.z = LAKE.z + (dz / k) * LAKE.rz * 0.975;
      if (s.bump <= 0 && Math.abs(s.vx) > 3) {
        roadAudio.hit('bump');
        s.bump = 0.6;
      }
      s.vx *= 0.3;
      s.vy *= 0.3;
      s.yawRate *= 0.5;
    }

    // --- Wo auf der Straße? (lokale Suche ab dem letzten Punkt, an der Kreuzung bleibt man auf seinem Ast)
    const near = world.nearest(s.x, s.z, s.near);
    let step = near.i - s.near;
    if (step > n / 2) step -= n;
    if (step < -n / 2) step += n;
    // Sprünge (querfeldein abgekürzt, Suche hat neu angesetzt) zählen nicht als Fortschritt
    if (Math.abs(step) <= 40) s.progress += step;
    s.near = near.i;
    const onRoad = (Math.abs(near.lateral) < ROAD_WIDTH / 2 + 0.9 && near.dist < 30) || world.onPad(s.x, s.z);
    const surface = onRoad ? { grip: 1, drag: 0 } : world.surface(s.x, s.z);
    // Steigung in Fahrtrichtung aus der Bodenhöhe vor und hinter dem Wagen
    const c = Math.cos(s.heading);
    const sn = Math.sin(s.heading);
    const height = (x: number, z: number) => {
      const q = world.nearest(x, z, s.near);
      if (Math.abs(q.lateral) < ROAD_WIDTH / 2 + 1 && q.dist < 20 && !world.onPad(x, z)) {
        const a = world.samples[q.i];
        const b = world.samples[(q.i + (q.along >= 0 ? 1 : n - 1)) % n];
        const k = Math.min(1, Math.abs(q.along) / 2);
        return a.y + (b.y - a.y) * k;
      }
      return world.ground(x, z);
    };
    const yF = height(s.x + c * 1.35, s.z - sn * 1.35);
    const yB = height(s.x - c * 1.35, s.z + sn * 1.35);
    const yL = height(s.x - sn * 0.8, s.z - c * 0.8);
    const yR = height(s.x + sn * 0.8, s.z + c * 0.8);
    const grade = Math.atan2(yF - yB, 2.7);
    const bank = Math.atan2(yL - yR, 1.6);

    // Nur für automatische Tests: fährt die Strecke mit `autopilot` m/s ab (in jedem Schritt, unabhängig von der Bildrate)
    if (s.autopilot > 0) {
      const t = world.samples[(s.near + 12) % n];
      let diff = Math.atan2(-(t.z - s.z), t.x - s.x) - s.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      driveInput.steer = Math.max(-1, Math.min(1, diff * 2.5));
      driveInput.throttle = s.vx < s.autopilot ? 1 : 0;
      driveInput.brake = s.vx > s.autopilot + 4 ? 0.5 : 0;
    }
    // Countdown: Auto steht (Gas geben geht – die Drehzahl steigt), los geht es bei null
    if (course && !s.done) s.raceT += dt;
    const held = course && s.raceT < 0;
    stepVehicle(spec, s, held ? { ...driveInput, brake: 0, handbrake: false } : driveInput, { grade, ...surface }, dt);
    if (held) {
      // Am Start festhalten (wie mit getretener Kupplung): erster Gang, Gas lässt nur die Drehzahl steigen
      s.vx = 0;
      s.vy = 0;
      s.yawRate = 0;
      s.gear = 1;
    }
    // Kontrollpunkte der Reihe nach (nur auf der Straße), das Ziel erst nach allen
    if (course && !s.done && s.raceT >= 0) {
      const need = ((s.cp + 1) * course.length) / RACE_CP;
      if (s.progress >= need && near.dist < 12) {
        s.cp++;
        s.cpAt = { x: s.x, z: s.z, heading: s.heading, near: s.near, progress: s.progress };
        if (s.cp >= RACE_CP) {
          s.done = true;
          const time = s.raceT;
          roadAudio.hit('clunk');
          setTimeout(() => finishRace(Math.round(time * 100) / 100), 1200);
        }
      }
    }
    s.v = s.vx;

    // --- Leitplanken: Wagen bleibt davor, verliert Tempo
    const after = world.nearest(s.x, s.z, s.near);
    const p = world.samples[after.i];
    const limit = RAIL_OFFSET - HALF_WIDTH;
    const hitRail = (p.railL && after.lateral > limit) || (p.railR && after.lateral < -limit);
    if (hitRail) {
      const side = after.lateral > 0 ? 1 : -1;
      const push = after.lateral - side * limit;
      s.x -= p.nx * push;
      s.z -= p.nz * push;
      // Geschwindigkeitsanteil zur Planke hin wegnehmen, Rest gebremst
      s.vy *= 0.2;
      s.yawRate *= 0.3;
      // Wagen dreht sich an der Planke etwas in Straßenrichtung (gleitet entlang statt zu kleben)
      let diff = Math.atan2(-p.tz, p.tx) - s.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (s.vx > 0 && Math.abs(diff) < 1.2) s.heading += diff * Math.min(1, dt * 3);
      if (s.bump <= 0 && Math.abs(s.vx) > 4) {
        roadAudio.hit('bump');
        s.bump = 0.6;
      }
      s.vx *= 1 - Math.min(0.5, dt * 2.5);
    }
    // --- Bäume, Häuser, Laternen
    for (const o of world.obstacles(s.x, s.z)) {
      const dx = s.x - o.x;
      const dz = s.z - o.z;
      const d = Math.hypot(dx, dz);
      const min = o.r + 1.0;
      if (d < min && d > 0.001) {
        s.x = o.x + (dx / d) * min;
        s.z = o.z + (dz / d) * min;
        // Aufprall: der Anteil zum Hindernis hin wird (mit etwas Rückprall) aufgehoben, entlang gleitet das Auto weiter.
        // Frontal: fast Stillstand; streifend: nur etwas langsamer.
        const nx = dx / d;
        const nz = dz / d;
        const ch = Math.cos(s.heading);
        const sh = Math.sin(s.heading);
        let wx = s.vx * ch - s.vy * sh;
        let wz = -(s.vx * sh + s.vy * ch);
        const vn = wx * nx + wz * nz;
        if (vn < 0) {
          wx -= 1.25 * vn * nx;
          wz -= 1.25 * vn * nz;
          wx *= 0.85;
          wz *= 0.85;
          s.vx = wx * ch - wz * sh;
          s.vy = -(wx * sh + wz * ch);
          s.yawRate = s.yawRate * 0.5 + Math.max(-1.5, Math.min(1.5, vn * 0.06 * Math.sign(nx * -sh - nz * ch)));
          if (s.bump <= 0 && -vn > 1.5) {
            roadAudio.hit('bump');
            s.bump = 0.6;
          }
        }
      }
    }
    s.bump -= dt;
    s.y += ((yF + yB) / 2 - s.y) * Math.min(1, dt * 20);

    // --- Darstellung: Wagen auf dem Gelände, Aufbau nickt und wankt
    if (group.current) {
      group.current.position.set(s.x, s.y, s.z);
      group.current.rotation.set(bank, s.heading, grade, 'YZX');
    }
    const shake = spec.faults.judder && driveInput.brake > 0.2 && s.vx > 3 ? Math.sin(s.t * 55) * 0.01 : 0;
    const misfireJolt = spec.faults.misfire && driveInput.throttle > 0.3 && s.vx > 1 ? Math.sin(s.t * 40) * 0.006 : 0;
    if (body.current) {
      body.current.rotation.set(s.roll, 0, s.pitch + shake, 'XYZ');
      body.current.position.y = misfireJolt;
    }
    steerVis.current = s.steer;
    // Räder rollen mit; angetriebene drehen beim Durchdrehen schneller, die Handbremse blockiert hinten
    const roll = (s.vx / spec.wheelRadius) * dt;
    const spinBoost = s.wheelspin * 25 * dt * Math.sign(s.vx || 1);
    const rearDriven = spec.drive !== 'FWD';
    spinVis.current.f += roll + (spec.drive !== 'RWD' ? spinBoost : 0);
    if (!driveInput.handbrake) spinVis.current.r += roll + (rearDriven ? spinBoost : 0);
    if (smokeRef.current) {
      smokeRef.current.visible = spec.faults.smoke;
      (smokeRef.current.material as THREE.MeshBasicMaterial).opacity = 0.35;
    }
    // --- Reifenspuren und Wölkchen an den Hinterrädern: Driften, Durchdrehen, Handbremse, Vollbremsung; abseits Staub
    const speed = Math.hypot(s.vx, s.vy);
    const sliding = speed > 3 && (s.slide > 0.25 || s.wheelspin > 0.35 || (driveInput.handbrake && Math.abs(s.vx) > 2) || (driveInput.brake > 0.8 && Math.abs(s.ax) > 7));
    const ch = Math.cos(s.heading);
    const shd = Math.sin(s.heading);
    const side = { x: shd, z: ch };
    const kind = onRoad ? 'road' : world.surface(s.x, s.z).kind;
    for (const [i, k] of [[0, -1], [1, 1]] as const) {
      const lx = body3.rearAxle;
      const lz = k * (0.8 + body3.trackR);
      const wx = s.x + ch * lx + shd * lz;
      const wz = s.z - shd * lx + ch * lz;
      const marks = sliding || (!onRoad && speed > 4);
      fx.mark(i, marks ? { x: wx, y: height(wx, wz) + 0.04, z: wz } : null, side, onRoad ? SKID_ROAD : kind === 'gravel' ? SKID_GRAVEL : SKID_GRASS);
      if (sliding && onRoad) fx.emit({ x: wx, y: s.y, z: wz }, 14 * Math.min(1, speed / 12), dt, SMOKE, 1.1);
      else if (!onRoad && speed > 6) fx.emit({ x: wx, y: s.y, z: wz }, (kind === 'gravel' || kind === 'field' ? 12 : 6) * Math.min(1, speed / 20), dt, DUST, 1.5);
    }
    fx.update(dt);
    // Unebener Boden abseits der Straße: der Aufbau rüttelt leicht
    if (!onRoad && body.current) {
      const amp = (kind === 'field' ? 0.018 : kind === 'gravel' ? 0.008 : 0.012) * Math.min(1, speed / 15);
      body.current.rotation.x += Math.sin(s.t * 23) * amp;
      body.current.rotation.z += Math.sin(s.t * 17 + 1) * amp * 0.7;
    }

    // --- Klang: echte Drehzahl und Last, Reifen und Wind; Getriebeschaden kracht beim Schalten
    engineAudio.set(s.rpm, driveInput.throttle);
    roadAudio.set(onRoad ? Math.max(s.slide, s.wheelspin * 0.8) : 0, Math.abs(s.vx));
    // Ausgeschlagenes Fahrwerk: Klacken, wenn die Querkraft in der Kurve die Richtung wechselt
    if (spec.faults.play > 0 && Math.abs(s.vx) > 6) {
      const sign = Math.sign(Math.round(s.ay));
      if (sign !== 0 && sign !== s.laySign && Math.abs(s.ay) > 1.5) {
        if (s.laySign !== 0) roadAudio.hit('clunk');
        s.laySign = sign;
      }
    }
    if (s.gear !== s.lastGear) {
      if (spec.faults.gearbox && s.gear > 0 && s.lastGear > 0) roadAudio.hit('crunch');
      s.lastGear = s.gear;
    }

    // --- Kamera
    const mode = useDriveHud.getState().camera;
    const g = group.current;
    if (g) {
      g.updateMatrixWorld();
      const src = body.current ?? g;
      if (mode === 'chase') {
        // Blickrichtung zwischen Fahrzeuglängsachse und Fahrtrichtung: im Drift sieht man das Auto schräg (wie in Rennspielen)
        const travel = Math.abs(s.vx) > 4 ? s.heading + Math.atan2(s.vy, Math.abs(s.vx)) * 0.6 : s.heading;
        s.camYaw = s.camYaw === undefined ? travel : s.camYaw + Math.atan2(Math.sin(travel - s.camYaw), Math.cos(travel - s.camYaw)) * Math.min(1, dt * 4);
        const fx = Math.cos(s.camYaw);
        const fz = -Math.sin(s.camYaw);
        const want = new THREE.Vector3(s.x - fx * 6.6, s.y + 2.3, s.z - fz * 6.6);
        // nicht ins Gelände: Mindesthöhe über dem Boden an der Kameraposition
        want.y = Math.max(want.y, world.ground(want.x, want.z) + 1.2);
        camPos.current.lerp(want, Math.min(1, dt * 5));
        camera.position.copy(camPos.current);
        camera.lookAt(s.x + fx * 2.5, s.y + 0.35, s.z + fz * 2.5);
      } else {
        const eye = mode === 'hood' ? new THREE.Vector3(0.75, 1.22, 0) : new THREE.Vector3(-0.32, 1.13, -0.36);
        const look = mode === 'hood' ? new THREE.Vector3(30, 0.6, 0) : new THREE.Vector3(30, 0.5, -0.36);
        src.localToWorld(eye);
        src.localToWorld(look);
        camera.position.copy(eye);
        camPos.current.copy(eye);
        camera.lookAt(look);
      }
      const fov = mode === 'cockpit' ? 66 : mode === 'hood' ? 62 : 58 + Math.min(10, Math.abs(s.vx) * 0.12);
      if (Math.abs(camera.fov - fov) > 0.2) {
        camera.fov += (fov - camera.fov) * Math.min(1, dt * 4);
        camera.updateProjectionMatrix();
      }
    }

    // --- Ende der Fahrt: zurück zur Werkstatt und auf dem Vorplatz anhalten (erst nachdem man weggefahren ist)
    s.elapsed += dt;
    const A = world.apron;
    const home = Math.hypot(s.x - (A.minX + A.maxX) / 2, s.z - (A.minZ + A.maxZ) / 2);
    if (home > 60) s.away = true;
    const onApron = s.x > A.minX && s.x < A.maxX && s.z > A.minZ && s.z < A.maxZ;
    s.tooShort = s.away && onApron && s.elapsed < DRIVE_MIN;
    if (!course && !s.done && s.away && onApron && s.elapsed >= DRIVE_MIN && Math.abs(s.vx) < 2) {
      s.done = true;
      setTimeout(() => finishDrive(true), 500);
    }
    s.hud += dt;
    if (s.hud > 0.08) {
      s.hud = 0;
      const drift = Math.abs(s.vx) > 6 ? Math.abs(Math.atan2(s.vy, Math.abs(s.vx))) * 57.3 : 0;
      useDriveHud.getState().set({ speed: Math.abs(s.vx) * 3.6, rpm: s.rpm, gear: s.gear, elapsed: s.elapsed, home, away: s.away, tooShort: s.tooShort, drift: drift > 12 ? drift : 0, px: s.x, pz: s.z, ph: s.heading, offTrack: !onRoad, wheelspin: s.wheelspin > 0.3 || s.slide > 0.5, distance: s.odometer, raceT: s.raceT, cp: s.cp });
    }
  });

  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 220, 720]} />
      <Env intensity={0.8} kind="sky" />
      <hemisphereLight args={['#eaf4ff', '#5d6b45', 1.15]} />
      <directionalLight position={[120, 180, 60]} intensity={2.1} />
      {/* Ferne Wiese bis zum Horizont (Nebel verdeckt die Kante) */}
      {/* Zuerst gezeichnet und ohne Tiefe: das Gelände liegt immer darüber, auch wo es tiefer liegt (See, Senken) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]} renderOrder={-2} raycast={() => null}>
        <planeGeometry args={[6000, 6000]} />
        <meshLambertMaterial color="#5f8a4a" depthWrite={false} />
      </mesh>
      <DriveScenery />
      <primitive object={fx.group} />
      {course && <RaceMarks start={course.start} length={course.length} />}
      <group ref={group}>
        <group ref={body}>
          {/* Motorraum bleibt bei geschlossener Haube weg (lod simple) – spart Zeichenaufrufe auf dem iPad */}
          <CarModel body={CAR_MODELS[car.modelId].body} color={car.color} steer={steerVis} spin={spinVis} modelId={car.modelId} car={car} lod="simple" />
        </group>
        <mesh ref={smokeRef} position={[-2.3, 0.5, 0]} visible={false} raycast={() => null}>
          <sphereGeometry args={[0.45, 8, 6]} />
          <meshBasicMaterial color={smoke} transparent opacity={0.3} depthWrite={false} />
        </mesh>
      </group>
    </>
  );
}

/** Start- und Zielbogen über der Straße, Kontrollpunkte als Pfostenpaare mit Fahnen. */
function RaceMarks({ start, length }: { start: number; length: number }) {
  const w = driveWorld();
  const n = w.samples.length;
  const arch = (i: number, label: string, color: string) => {
    const p = w.samples[i % n];
    return (
      <group key={label + i} position={[p.x, p.y, p.z]} rotation={[0, Math.atan2(-p.tz, p.tx), 0]}>
        <mesh position={[0, 0.045, 0]} raycast={() => null}>
          <boxGeometry args={[0.8, 0.01, ROAD_WIDTH]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        {[-1, 1].map((k) => (
          <mesh key={k} position={[0, 2.6, k * (ROAD_WIDTH / 2 + 0.8)]} raycast={() => null}>
            <boxGeometry args={[0.3, 5.2, 0.3]} />
            <meshLambertMaterial color={color} />
          </mesh>
        ))}
        <mesh position={[0, 5.3, 0]} raycast={() => null}>
          <boxGeometry args={[0.5, 0.9, ROAD_WIDTH + 2]} />
          <meshLambertMaterial color="#1b1c1f" />
        </mesh>
        {[-0.26, 0.26].map((x) => (
          <mesh key={x} position={[x, 5.3, 0]} rotation={[0, x < 0 ? -Math.PI / 2 : Math.PI / 2, 0]} raycast={() => null}>
            <planeGeometry args={[ROAD_WIDTH + 1.6, 0.7]} />
            <meshBasicMaterial map={archText(label)} />
          </mesh>
        ))}
      </group>
    );
  };
  const end = (start + length) % n;
  return (
    <>
      {arch(start, end === start ? 'START · ZIEL' : 'START', '#c8501e')}
      {end !== start && arch(end, 'ZIEL', '#1e7a3c')}
      {Array.from({ length: RACE_CP - 1 }, (_, k) => {
        const p = w.samples[Math.round(start + ((k + 1) * length) / RACE_CP) % n];
        return [-1, 1].map((side) => (
          <group key={`${k}${side}`} position={[p.x + p.nx * side * (ROAD_WIDTH / 2 + 0.6), p.y, p.z + p.nz * side * (ROAD_WIDTH / 2 + 0.6)]}>
            <mesh position={[0, 0.9, 0]} raycast={() => null}>
              <cylinderGeometry args={[0.06, 0.06, 1.8, 6]} />
              <meshLambertMaterial color="#e8e8e8" />
            </mesh>
            <mesh position={[0, 1.55, 0]} raycast={() => null}>
              <boxGeometry args={[0.04, 0.5, 0.7]} />
              <meshLambertMaterial color="#ff7a1a" />
            </mesh>
          </group>
        ));
      })}
    </>
  );
}
const archTex = new Map<string, THREE.Texture>();
function archText(label: string) {
  let t = archTex.get(label);
  if (!t) archTex.set(label, (t = textTexture(label, { bg: '#1b1c1f', fg: '#ffffff', w: 512, h: 96, font: 56 })));
  return t;
}
