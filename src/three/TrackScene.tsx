import { useFrame, useThree } from '@react-three/fiber';
import { remotePlayers, syncedNow, useCoop } from '../net/coop';
import { coopRaceOut, participantsOf } from '../net/coopRace';
import { textTexture } from './textures';
import { aiInput, courseOf, opponentSpec, PLAYER_GRID, raceForDay } from '../game/races';
import { createCar } from '../game/market';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CAR_MODELS } from '../game/data/cars';
import { DRIVE_MIN, driveInput, useDriveHud } from '../game/drive';
import { activeDefects } from '../game/repair';
import { engineAudio, roadAudio } from '../game/audio';
import { soundProfile } from '../game/diagnosis';
import { useGame } from '../game/store';
import { initialState, stepVehicle, surfaceGrip, vehicleSpec, type VehicleState } from '../game/vehicle';
import { offRoadCond, roadCond, seasonOf, weatherOf } from '../game/grip';
import { CarModel } from './CarModel';
import { CarShadow, DriveSky, HAZE, Precip } from './DriveSky';
import { DriveScenery } from './DriveScenery';
import { LAKE } from './driveWorld';
import { worldFor } from './circuits';
import { Env } from './Env';
import { DriveEffects } from './driveEffects';
import { collideAll } from '../game/carCollision';
import type { DriveWorld } from './driveWorld';
import { BODY_SPECS } from './carGeometry';

const HALF_WIDTH = 0.9;
/** Kontrollpunkte je Rennstrecke (der letzte ist das Ziel). */
const RACE_CP = 8;
const SKID_ROAD = new THREE.Color('#141414');
const SKID_GRAVEL = new THREE.Color('#6b5d48');
const SKID_GRASS = new THREE.Color('#3f4a26');
const SMOKE = new THREE.Color('#f2f2f2');
const DUST = new THREE.Color('#b9a27c');

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
  const coop = raceRun?.coop ?? null;
  const race = useMemo(() => (raceRun && !coop ? raceForDay(day) : null), [raceRun, coop, day]);
  const course = useMemo(() => (race ? courseOf(race.course) : coop ? courseOf(coop.course) : null), [race, coop]);
  // Koop-Rennen: Teilnehmer (feste Reihenfolge = Startplätze); ich selbst rechne nur mein Auto
  const me = useCoop.getState().me;
  const rivals = useMemo(() => {
    if (!coop) return [];
    return participantsOf(useCoop.getState().members as never, me, coop.lobby).map((p) => {
      const look = createCar(p.join.modelId, [], () => 0.5, {});
      look.color = p.join.color;
      return { id: p.member.id, name: p.member.name, join: p.join, look, st: initialState(0, 0, 0), seen: false };
    });
  }, [coop, me]);
  const myIndex = Math.max(0, rivals.findIndex((r) => r.id === me));
  const rivalRefs = useRef<(THREE.Group | null)[]>([]);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const steerVis = useRef(0);
  const spinVis = useRef({ f: 0, r: 0 });
  const world = useMemo(() => worldFor(course?.world ?? 'land'), [course]);
  // Witterung des Tages (für alle Geräte gleich): Fahrbahnzustand, Optik. Rallyepisten haben ihren eigenen Belag.
  const weather = useMemo(() => weatherOf(day), [day]);
  const road = useMemo(() => roadCond(weather, world.road), [weather, world]);
  const season = useMemo(() => seasonOf(day), [day]);
  // Aussehen: Dunst und Sichtweite, Bewölkung, trübes Licht; Schnee liegt bei Schneefall und auf Schneepisten
  const look = useMemo(() => {
    const dull = weather === 'rain' ? 0.75 : weather === 'snow' ? 0.6 : weather === 'fog' ? 0.55 : weather === 'cloudy' ? 0.25 : 0;
    const haze = weather === 'fog' ? '#c3c8cc' : weather === 'rain' ? '#a9b1b8' : weather === 'snow' ? '#d4d9de' : HAZE;
    const fog: [number, number] = weather === 'fog' ? [25, 230] : weather === 'rain' ? [90, 480] : weather === 'snow' ? [70, 420] : [240, 760];
    return { dull, haze, fog, cover: weather === 'sun' ? 0 : weather === 'cloudy' ? 0.6 : 1, snowy: weather === 'snow' || road.cls === 'snow' };
  }, [weather, road]);
  const spec = useMemo(() => vehicleSpec(car), [car]);
  const fx = useMemo(() => new DriveEffects(), []);
  const body3 = BODY_SPECS[CAR_MODELS[car.modelId].body];
  const smoke = useMemo(() => {
    const d = activeDefects(car);
    return d.includes('turbo') ? '#8fa3c4' : d.includes('egr') || d.includes('dpf') ? '#1b1b1b' : '#e9e9e9';
  }, [car]);
  const n = world.samples.length;
  const startAt = course ? world.samples[course.start] : null;
  // Rennen gegen Gegner: Startaufstellung zu zweit nebeneinander, der Spieler in der Mitte des Feldes
  const grid = race?.kind === 'grid' && course;
  const mySlot = grid ? gridSlot(world, course, PLAYER_GRID) : coop && course ? gridSlot(world, course, myIndex) : null;
  const npcs = useMemo(
    () =>
      grid
        ? race!.opponents.map((o, i) => {
            const slot = gridSlot(world, course!, i < PLAYER_GRID ? i : i + 1);
            const look = createCar(o.modelId, [], () => 0.5, {});
            look.color = o.color;
            return { o, spec: opponentSpec(race!.cls, o), look, st: initialState(slot.x, slot.z, slot.heading), ai: { near: slot.near, prog: slot.prog }, offset: 0, finished: null as number | null };
          })
        : [],
    [race, course, world],
  );
  const npcRefs = useRef<(THREE.Group | null)[]>([]);
  const sim = useRef(Object.assign(mySlot ? initialState(mySlot.x, mySlot.z, mySlot.heading) : startAt ? initialState(startAt.x - startAt.nx * 1.8, startAt.z - startAt.nz * 1.8, Math.atan2(-startAt.tz, startAt.tx)) : initialState(world.start.x, world.start.z, world.start.heading), {
    raceT: -3,
    cp: 0,
    cpAt: null as null | { x: number; z: number; heading: number; near: number; progress: number }, camYaw: undefined as number | undefined, away: false, tooShort: false, v: 0, near: 0, progress: 0, elapsed: 0, done: false, hud: 0, lastGear: 1, bump: 0, timeScale: 1, autopilot: 0, laySign: 0, respawn: 0 }));
  const camPos = useRef(new THREE.Vector3());
  const smokeRef = useRef<THREE.Mesh>(null);

  /** Platz im Koop-Rennen: Mitspieler im Ziel (vor mir) oder mit mehr Fortschritt liegen vorn. */
  const coopPlace = () => {
    const s = sim.current;
    let ahead = 0;
    for (const r of rivals) {
      if (r.id === me) continue;
      const rr = remotePlayers.get(r.id)?.rr;
      if (!rr || rr.id !== coop?.lobby) continue;
      if (rr.fin !== null ? !s.done || rr.fin < s.raceT : rr.p > s.progress) ahead++;
    }
    return ahead + 1;
  };
  /** Aktueller Platz des Spielers: Gegner im Ziel oder mit mehr Fortschritt liegen vorn. */
  const placeNow = () => {
    const s = sim.current;
    return 1 + npcs.filter((c) => c.finished !== null || c.ai.prog > s.progress).length;
  };
  /** Endstand bei Zieleinlauf des Spielers: Gegner im Ziel mit ihrer Zeit, die übrigen hochgerechnet. */
  const standings = (time: number) => {
    const s = sim.current;
    const rows = [
      { name: 'Du', car: CAR_MODELS[car.modelId].name, time, you: true },
      ...npcs.map((c) => {
        const left = Math.max(0, course!.length - c.ai.prog) * 2;
        const avg = Math.max(5, (Math.max(1, c.ai.prog) * 2) / Math.max(1, s.raceT));
        return { name: c.o.name, car: CAR_MODELS[c.o.modelId].name, time: Math.round((c.finished ?? s.raceT + left / avg) * 100) / 100, you: false };
      }),
    ].sort((a, b) => a.time - b.time);
    return { place: rows.findIndex((r) => r.you) + 1, table: rows };
  };

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
      s.near = mySlot ? mySlot.near : course.start;
      s.progress = mySlot ? mySlot.prog : 0;
    }
    useDriveHud.getState().set({ speed: 0, rpm: spec.idle, redline: spec.redline, gear: 1, elapsed: 0, home: 0, away: false, tooShort: false, drift: 0, offTrack: false, distance: 0, raceT: -3, cp: 0, cpTotal: RACE_CP * (course?.laps ?? 1), laps: course?.laps ?? 1, racing: !!course });
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
    const onRoad = (Math.abs(near.lateral) < world.roadWidth / 2 + 0.9 && near.dist < 30) || world.onPad(s.x, s.z);
    const surface = onRoad ? road : offRoadCond(world.surface(s.x, s.z), weather);
    // Steigung in Fahrtrichtung aus der Bodenhöhe vor und hinter dem Wagen
    const c = Math.cos(s.heading);
    const sn = Math.sin(s.heading);
    const height = (x: number, z: number) => {
      const q = world.nearest(x, z, s.near);
      if (Math.abs(q.lateral) < world.roadWidth / 2 + 1 && q.dist < 20 && !world.onPad(x, z)) {
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
      // auf glatter Fahrbahn langsamer (Kurvengrenze wächst mit der Wurzel der Haftung)
      const vmax = s.autopilot * Math.min(1, Math.sqrt(surfaceGrip(spec, road)));
      driveInput.throttle = s.vx < vmax ? 1 : 0;
      driveInput.brake = s.vx > vmax + 4 ? 0.5 : 0;
    }
    // Countdown: Auto steht (Gas geben geht – die Drehzahl steigt), los geht es bei null
    if (coop) s.raceT = s.done ? s.raceT : (syncedNow() - coop.startAt) / 1000;
    else if (course && !s.done) s.raceT += dt;
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
      const need = ((s.cp + 1) * course.length) / (RACE_CP * course.laps);
      if (s.progress >= need && near.dist < 12) {
        s.cp++;
        s.cpAt = { x: s.x, z: s.z, heading: s.heading, near: s.near, progress: s.progress };
        if (s.cp >= RACE_CP * course.laps) {
          s.done = true;
          const time = s.raceT;
          roadAudio.hit('clunk');
          if (coop && coopRaceOut.car) coopRaceOut.car.fin = Math.round(time * 100) / 100;
          setTimeout(() => finishRace(Math.round(time * 100) / 100, grid ? standings(time) : undefined), 1200);
        }
      }
    }
    s.v = s.vx;

    // --- Koop-Rennen: eigene Lage hinaus, Autos der Mitspieler aus ihrer Lage (kurz vorausgerechnet), feste Hindernisse
    if (coop) {
      const prev = coopRaceOut.car;
      coopRaceOut.car = { id: coop.lobby, x: Math.round(s.x * 100) / 100, z: Math.round(s.z * 100) / 100, h: Math.round(s.heading * 1000) / 1000, vx: Math.round(s.vx * 10) / 10, vy: Math.round(s.vy * 10) / 10, yr: Math.round(s.yawRate * 100) / 100, p: s.progress, fin: prev?.id === coop.lobby ? prev.fin : null };
      const bodies: { st: VehicleState; mass: number; inertia: number; fixed?: boolean }[] = [{ st: s, mass: spec.mass, inertia: spec.yawInertia }];
      rivals.forEach((r, k) => {
        const g = rivalRefs.current[k];
        if (r.id === me) {
          if (g) g.visible = false;
          return;
        }
        const rp = remotePlayers.get(r.id);
        const rr = rp?.rr;
        if (!rr || rr.id !== coop.lobby) {
          if (g) g.visible = false;
          return;
        }
        const ahead = Math.min(0.6, Math.max(0, (performance.now() - rp!.at) / 1000));
        const c = Math.cos(rr.h);
        const sn = Math.sin(rr.h);
        Object.assign(r.st, { x: rr.x + (rr.vx * c - rr.vy * sn) * ahead, z: rr.z - (rr.vx * sn + rr.vy * c) * ahead, heading: rr.h + rr.yr * ahead, vx: rr.vx, vy: rr.vy, yawRate: rr.yr });
        r.seen = true;
        bodies.push({ st: r.st, mass: 1400, inertia: 2400, fixed: true });
        if (g) {
          g.visible = true;
          g.position.set(r.st.x, height(r.st.x, r.st.z), r.st.z);
          g.rotation.set(0, r.st.heading, 0);
        }
      });
      if (collideAll(bodies) > 1.5 && s.bump <= 0) {
        roadAudio.hit('bump');
        s.bump = 0.5;
      }
    }

    // --- Gegner: fahren mit derselben Physik, überholen langsamere Autos, berühren sich (Abstoßen)
    if (grid) {
      const cars = [{ st: s as VehicleState, prog: s.progress }, ...npcs.map((c) => ({ st: c.st, prog: c.ai.prog }))];
      npcs.forEach((c, k) => {
        if (s.raceT < 0) return;
        // Wer ist knapp vor mir auf ähnlicher Linie? Dann auf die freie Seite ausweichen (und zurück, wenn frei)
        const me = c.st;
        const q = world.nearest(me.x, me.z, c.ai.near);
        let want = 0;
        for (let j = 0; j < cars.length; j++) {
          if (j === k + 1) continue;
          const o = cars[j];
          const ahead = (o.prog - c.ai.prog) * 2;
          if (ahead < 2 || ahead > 22) continue;
          const oq = world.nearest(o.st.x, o.st.z, c.ai.near);
          if (Math.abs(oq.lateral - q.lateral) > 2.6) continue;
          if (me.vx < o.st.vx - 0.5) continue;
          const side = world.roadWidth / 2 - 1.4;
          want = oq.lateral > 0 ? -side : side;
        }
        c.offset += Math.max(-dt * 2.5, Math.min(dt * 2.5, want - c.offset));
        const input = aiInput(c.spec, me, world, c.ai, c.o.skill, c.offset, true, road);
        const on = Math.abs(q.lateral) < world.roadWidth / 2 + 0.9;
        stepVehicle(c.spec, me, input, on ? { grade: 0, ...road } : { grade: 0, ...offRoadCond(world.surface(me.x, me.z), weather) }, dt);
        // Leitplanke
        const p = world.samples[q.i];
        const lim = world.railOffset - HALF_WIDTH;
        if (Math.abs(q.lateral) > lim) {
          const push = q.lateral - Math.sign(q.lateral) * lim;
          me.x -= p.nx * push;
          me.z -= p.nz * push;
          me.vy *= 0.3;
          me.vx *= 0.98;
        }
        if (c.finished === null && c.ai.prog >= course!.length) c.finished = s.raceT;
      });
      if (s.raceT < 0) for (const c of npcs) Object.assign(c.st, { vx: 0, vy: 0, yawRate: 0 });
      // Berührungen: jedes Auto als drei Kreise (Heck, Mitte, Front) – nichts schiebt sich ineinander
      const hit = collideAll([{ st: s, mass: spec.mass, inertia: spec.yawInertia }, ...npcs.map((c) => ({ st: c.st, mass: c.spec.mass, inertia: c.spec.yawInertia }))]);
      if (hit > 1.5 && s.bump <= 0) {
        roadAudio.hit('bump');
        s.bump = 0.5;
      }
      // Gegner zeichnen
      npcs.forEach((c, k) => {
        const g = npcRefs.current[k];
        if (!g) return;
        const st = c.st;
        g.position.set(st.x, height(st.x, st.z), st.z);
        g.rotation.set(0, st.heading, 0);
      });
    }

    // --- Leitplanken: Wagen bleibt davor, verliert Tempo
    const after = world.nearest(s.x, s.z, s.near);
    const p = world.samples[after.i];
    const limit = world.railOffset - HALF_WIDTH;
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
      useDriveHud.getState().set({ speed: Math.abs(s.vx) * 3.6, rpm: s.rpm, gear: s.gear, elapsed: s.elapsed, home, away: s.away, tooShort: s.tooShort, drift: drift > 12 ? drift : 0, px: s.x, pz: s.z, ph: s.heading, offTrack: !onRoad, wheelspin: s.wheelspin > 0.3 || s.slide > 0.5, distance: s.odometer, raceT: s.raceT, cp: s.cp, place: grid ? placeNow() : coop ? coopPlace() : 0, field: grid ? npcs.length + 1 : coop ? rivals.length : 0 });
    }
  });

  return (
    <>
      <color attach="background" args={[look.haze]} />
      <fog attach="fog" args={[look.haze, look.fog[0], look.fog[1]]} />
      <DriveSky cover={look.cover} dull={look.dull} />
      {(weather === 'rain' || weather === 'snow') && <Precip kind={weather} />}
      <Env intensity={0.8} kind="sky" />
      <hemisphereLight args={['#eaf4ff', look.snowy ? '#c9d0d8' : '#5d6b45', 1.15 + look.dull * 0.25]} />
      <directionalLight position={[120, 180, 60]} intensity={2.3 * (1 - look.dull * 0.6)} color="#fff6e6" />
      {/* Ferne Wiese bis zum Horizont (Nebel verdeckt die Kante) */}
      {/* Zuerst gezeichnet und ohne Tiefe: das Gelände liegt immer darüber, auch wo es tiefer liegt (See, Senken) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]} renderOrder={-2} raycast={() => null}>
        <planeGeometry args={[6000, 6000]} />
        <meshLambertMaterial color="#5f8a4a" depthWrite={false} />
      </mesh>
      <DriveScenery world={world} snowy={look.snowy} wet={road.cls === 'wet'} season={season} />
      <primitive object={fx.group} />
      {course && <RaceMarks w={world} start={course.start} length={course.length} laps={course.laps} clock={() => sim.current.raceT} />}
      {rivals.map((r, k) => (
        <group key={r.id} ref={(g) => void (rivalRefs.current[k] = g)} visible={false}>
          <CarShadow />
          <CarModel body={CAR_MODELS[r.look.modelId].body} color={r.join.color} modelId={r.look.modelId} car={r.look} lod="simple" />
        </group>
      ))}
      {npcs.map((c, k) => (
        <group key={k} ref={(g) => void (npcRefs.current[k] = g)}>
          <CarShadow />
          <CarModel body={CAR_MODELS[c.look.modelId].body} color={c.o.color} modelId={c.look.modelId} car={c.look} lod="simple" />
        </group>
      ))}
      <group ref={group}>
        <CarShadow />
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
function RaceMarks({ w, start, length, laps, clock }: { w: DriveWorld; start: number; length: number; laps: number; clock: () => number }) {
  // Startampel: fünf Lampenpaare am Startbogen gehen im Countdown nacheinander rot an und beim Start alle aus
  const lamps = useRef<THREE.MeshBasicMaterial[]>([]);
  useFrame(() => {
    const t = clock();
    const on = t < 0 ? Math.min(5, Math.floor(((t + 3) / 3) * 5) + 1) : 0;
    lamps.current.forEach((m, k) => m.color.set(k < on ? '#ff2a1a' : '#2a0c0a'));
  });
  const ROAD_WIDTH = w.roadWidth;
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
        {label.startsWith('START') && (
          <group position={[-0.3, 4.35, 0]}>
            <mesh raycast={() => null}>
              <boxGeometry args={[0.25, 0.75, 3.4]} />
              <meshLambertMaterial color="#111215" />
            </mesh>
            {[0, 1, 2, 3, 4].map((k) =>
              [-0.17, 0.17].map((y) => (
                <mesh key={`${k}${y}`} position={[-0.13, y, -1.36 + k * 0.68]} rotation={[0, -Math.PI / 2, 0]} raycast={() => null}>
                  <circleGeometry args={[0.14, 14]} />
                  <meshBasicMaterial ref={(m) => void (m && (lamps.current[k] = m))} color="#2a0c0a" />
                </mesh>
              )),
            )}
          </group>
        )}
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
  const lap = length / laps;
  const slots = Array.from({ length: 6 }, (_, g) => gridSlot(w, { start }, g));
  return (
    <>
      {/* Startaufstellung: weiße Winkel je Startplatz */}
      {slots.map((g, k) => (
        <group key={'g' + k} position={[g.x, w.samples[g.near].y + 0.04, g.z]} rotation={[0, g.heading, 0]}>
          <mesh position={[2.6, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <planeGeometry args={[0.2, 2.6]} />
            <meshBasicMaterial color="#efefea" />
          </mesh>
          {[-1.2, 1.2].map((z) => (
            <mesh key={z} position={[2.0, 0, z]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
              <planeGeometry args={[1.2, 0.18]} />
              <meshBasicMaterial color="#efefea" />
            </mesh>
          ))}
        </group>
      ))}
      {arch(start, end === start ? 'START · ZIEL' : 'START', '#c8501e')}
      {end !== start && arch(end, 'ZIEL', '#1e7a3c')}
      {Array.from({ length: RACE_CP - 1 }, (_, k) => {
        const p = w.samples[Math.round(start + ((k + 1) * lap) / RACE_CP) % n];
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

/** Startplatz g (0 = vorne links): Reihen zu zweit, 9 m Abstand, versetzt hinter der Startlinie. */
function gridSlot(w: DriveWorld, course: { start: number }, g: number) {
  const n = w.samples.length;
  const back = 4 + Math.floor(g / 2) * 9 + (g % 2) * 3;
  const steps = Math.round(back / 2);
  const idx = (course.start - steps + n) % n;
  const p = w.samples[idx];
  const lat = (g % 2 === 0 ? 1 : -1) * Math.min(2.3, w.roadWidth / 4);
  return { x: p.x + p.nx * lat, z: p.z + p.nz * lat, heading: Math.atan2(-p.tz, p.tx), near: idx, prog: -steps };
}
