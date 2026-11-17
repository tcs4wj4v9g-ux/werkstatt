import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CAR_MODELS } from '../game/data/cars';
import { driveInput, useDriveHud } from '../game/drive';
import { activeDefects } from '../game/repair';
import { engineAudio, roadAudio } from '../game/audio';
import { soundProfile } from '../game/diagnosis';
import { useGame } from '../game/store';
import { initialState, stepVehicle, vehicleSpec } from '../game/vehicle';
import { CarModel } from './CarModel';
import { DriveScenery } from './DriveScenery';
import { driveWorld, RAIL_OFFSET, ROAD_WIDTH } from './driveWorld';
import { Env } from './Env';

const GATES = 8;
const HALF_WIDTH = 0.9;
const SKY = '#a9cbea';

/**
 * Probefahrt: Fahrphysik (`game/vehicle.ts`) auf der Landstraße (`driveWorld.ts`). Der Wagen folgt dem Gelände,
 * Leitplanken und Hindernisse halten ihn auf, die Tore entlang der Runde zählen der Reihe nach.
 */
export function TrackScene() {
  const car = useGame((s) => s.cars[s.driveBay])!;
  const finishDrive = useGame((s) => s.finishDrive);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const steerVis = useRef(0);
  const world = useMemo(() => driveWorld(), []);
  const spec = useMemo(() => vehicleSpec(car), [car]);
  const smoke = useMemo(() => {
    const d = activeDefects(car);
    return d.includes('turbo') ? '#8fa3c4' : d.includes('egr') || d.includes('dpf') ? '#1b1b1b' : '#e9e9e9';
  }, [car]);
  const n = world.samples.length;
  const sim = useRef(Object.assign(initialState(world.start.x, world.start.z, world.start.heading), { v: 0, near: 0, progress: 0, gate: 0, done: false, hud: 0, lastGear: 1, bump: 0, timeScale: 1, autopilot: 0, laySign: 0 }));
  const camPos = useRef(new THREE.Vector3());
  const smokeRef = useRef<THREE.Mesh>(null);

  useEffect(() => {
    const s = sim.current;
    s.y = world.ground(s.x, s.z);
    camera.fov = 58;
    camera.far = 800;
    camera.updateProjectionMatrix();
    camPos.current.set(s.x - Math.cos(s.heading) * 7, s.y + 2.6, s.z + Math.sin(s.heading) * 7);
    (window as any).__gkDrive = { sim: s, samples: world.samples, input: driveInput, spec };
    driveInput.steer = driveInput.throttle = driveInput.brake = 0;
    useDriveHud.getState().set({ speed: 0, rpm: spec.idle, redline: spec.redline, gear: 1, checkpoint: 0, total: GATES, offTrack: false, distance: 0 });
    const keys: Record<string, boolean> = {};
    const apply = () => {
      driveInput.steer = (keys.ArrowLeft || keys.a ? 1 : 0) - (keys.ArrowRight || keys.d ? 1 : 0);
      driveInput.throttle = keys.ArrowUp || keys.w ? 1 : 0;
      driveInput.brake = keys.ArrowDown || keys.s ? 1 : 0;
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

    // --- Wo auf der Straße? (lokale Suche ab dem letzten Punkt, an der Kreuzung bleibt man auf seinem Ast)
    const near = world.nearest(s.x, s.z, s.near);
    let step = near.i - s.near;
    if (step > n / 2) step -= n;
    if (step < -n / 2) step += n;
    s.progress += step;
    s.near = near.i;
    const onRoad = Math.abs(near.lateral) < ROAD_WIDTH / 2 + 0.9 && near.dist < 30;
    // Steigung in Fahrtrichtung aus der Bodenhöhe vor und hinter dem Wagen
    const c = Math.cos(s.heading);
    const sn = Math.sin(s.heading);
    const height = (x: number, z: number) => {
      const q = world.nearest(x, z, s.near);
      if (Math.abs(q.lateral) < ROAD_WIDTH / 2 + 1 && q.dist < 20) {
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
    stepVehicle(spec, s, driveInput, onRoad ? { grade, grip: 1, drag: 0 } : { grade, grip: 0.6, drag: 0.06 }, dt);
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
        if (s.bump <= 0 && Math.abs(s.vx) > 2) {
          roadAudio.hit('bump');
          s.bump = 0.6;
        }
        s.vx *= 0.25;
        s.vy *= 0.25;
        s.yawRate *= 0.3;
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
    if (smokeRef.current) {
      smokeRef.current.visible = spec.faults.smoke || (onRoad && s.wheelspin > 0.5);
      (smokeRef.current.material as THREE.MeshBasicMaterial).opacity = spec.faults.smoke ? 0.35 : Math.min(0.4, Math.max(s.wheelspin, s.slide) * 0.5);
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
        const fx = Math.cos(s.heading);
        const fz = -Math.sin(s.heading);
        const want = new THREE.Vector3(s.x - fx * 6.8, s.y + 2.5, s.z - fz * 6.8);
        // nicht ins Gelände: Mindesthöhe über dem Boden an der Kameraposition
        want.y = Math.max(want.y, world.ground(want.x, want.z) + 1.2);
        camPos.current.lerp(want, Math.min(1, dt * 5));
        camera.position.copy(camPos.current);
        camera.lookAt(s.x + fx * 3.5, s.y + 1.0, s.z + fz * 3.5);
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

    // --- Tore der Reihe nach (Fortschritt entlang der Runde, nur auf der Straße)
    if (!s.done && onRoad && s.progress >= ((s.gate + 1) * n) / GATES) {
      s.gate++;
      if (s.gate >= GATES) {
        s.done = true;
        setTimeout(() => finishDrive(true), 900);
      }
    }
    s.hud += dt;
    if (s.hud > 0.08) {
      s.hud = 0;
      useDriveHud.getState().set({ speed: Math.abs(s.vx) * 3.6, rpm: s.rpm, gear: s.gear, checkpoint: s.gate, offTrack: !onRoad, wheelspin: s.wheelspin > 0.3 || s.slide > 0.5, distance: s.odometer });
    }
  });

  const gates = useMemo(
    () =>
      Array.from({ length: GATES }, (_, k) => {
        const p = world.samples[Math.round(((k + 1) * n) / GATES) % n];
        return [-1, 1].map((side) => ({ x: p.x + p.nx * side * (ROAD_WIDTH / 2 + 0.4), y: p.y, z: p.z + p.nz * side * (ROAD_WIDTH / 2 + 0.4) }));
      }).flat(),
    [world],
  );
  const start = world.samples[0];
  const startHeading = Math.atan2(-start.tz, start.tx);
  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 220, 720]} />
      <Env intensity={0.8} kind="sky" />
      <hemisphereLight args={['#eaf4ff', '#5d6b45', 1.15]} />
      <directionalLight position={[120, 180, 60]} intensity={2.1} />
      {/* Ferne Wiese bis zum Horizont (Nebel verdeckt die Kante) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]} raycast={() => null}>
        <planeGeometry args={[6000, 6000]} />
        <meshLambertMaterial color="#5f8a4a" />
      </mesh>
      <DriveScenery />
      {/* Start und Ziel: Bogen über die Straße */}
      <group position={[start.x, start.y, start.z]} rotation={[0, startHeading, 0]}>
        <mesh position={[0, 0.045, 0]} raycast={() => null}>
          <boxGeometry args={[0.8, 0.01, ROAD_WIDTH]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        {[-1, 1].map((k) => (
          <mesh key={k} position={[0, 2.6, k * (ROAD_WIDTH / 2 + 0.8)]} raycast={() => null}>
            <boxGeometry args={[0.3, 5.2, 0.3]} />
            <meshLambertMaterial color="#c8501e" />
          </mesh>
        ))}
        <mesh position={[0, 5.3, 0]} raycast={() => null}>
          <boxGeometry args={[0.5, 0.9, ROAD_WIDTH + 2]} />
          <meshLambertMaterial color="#1b1c1f" />
        </mesh>
      </group>
      {gates.map((g, i) => (
        <mesh key={i} position={[g.x, g.y + 0.4, g.z]} raycast={() => null}>
          <coneGeometry args={[0.25, 0.8, 8]} />
          <meshLambertMaterial color="#ff7a1a" />
        </mesh>
      ))}
      <group ref={group}>
        <group ref={body}>
          {/* Motorraum bleibt bei geschlossener Haube weg (lod simple) – spart Zeichenaufrufe auf dem iPad */}
          <CarModel body={CAR_MODELS[car.modelId].body} color={car.color} steer={steerVis} modelId={car.modelId} car={car} lod="simple" />
        </group>
        <mesh ref={smokeRef} position={[-2.3, 0.5, 0]} visible={false} raycast={() => null}>
          <sphereGeometry args={[0.45, 8, 6]} />
          <meshBasicMaterial color={smoke} transparent opacity={0.3} depthWrite={false} />
        </mesh>
      </group>
    </>
  );
}
