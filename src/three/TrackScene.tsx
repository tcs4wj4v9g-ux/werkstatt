import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CAR_MODELS } from '../game/data/cars';
import { driveInput, useDriveHud } from '../game/drive';
import { activeDefects } from '../game/repair';
import { engineAudio } from '../game/audio';
import { soundProfile } from '../game/diagnosis';
import { useGame } from '../game/store';
import { CarModel } from './CarModel';
import { Env } from './Env';

const N = 240;
const WIDTH = 10;
const CHECKPOINTS = 8;
const OUTLINE: [number, number][] = [
  [0, 0], [45, 0], [78, 8], [90, 34], [74, 58], [42, 52], [18, 68], [-16, 62], [-32, 36], [-26, 10],
];

function ribbon(samples: THREE.Vector3[], normals: THREE.Vector3[], width: number, y: number) {
  const pos: number[] = [];
  const idx: number[] = [];
  samples.forEach((p, i) => {
    const n = normals[i];
    pos.push(p.x + n.x * width / 2, y, p.z + n.z * width / 2, p.x - n.x * width / 2, y, p.z - n.z * width / 2);
    const a = i * 2;
    const b = ((i + 1) % samples.length) * 2;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function TrackScene() {
  const car = useGame((s) => s.cars[s.driveBay])!;
  const finishDrive = useGame((s) => s.finishDrive);
  const { camera } = useThree();
  const group = useRef<THREE.Group>(null);
  const steerVis = useRef(0);

  const track = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(OUTLINE.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'catmullrom', 0.5);
    const samples = curve.getSpacedPoints(N).slice(0, N);
    const normals = samples.map((_, i) => {
      const t = samples[(i + 1) % N].clone().sub(samples[(i + N - 1) % N]).normalize();
      return new THREE.Vector3(-t.z, 0, t.x);
    });
    const dir = samples[1].clone().sub(samples[0]).normalize();
    const trees: [number, number, number][] = [];
    for (let i = 0; i < N; i += 6) {
      const side = i % 12 ? 1 : -1;
      const d = WIDTH / 2 + 5 + ((i * 7) % 9);
      trees.push([samples[i].x + normals[i].x * d * side, 1.6 + ((i * 3) % 5) * 0.3, samples[i].z + normals[i].z * d * side]);
    }
    return {
      samples,
      normals,
      road: ribbon(samples, normals, WIDTH, 0.03),
      edge: ribbon(samples, normals, WIDTH + 0.8, 0.02),
      heading: Math.atan2(-dir.z, dir.x),
      trees,
    };
  }, []);

  const perf = useMemo(() => {
    const d = activeDefects(car);
    return {
      misfire: d.includes('coil') || d.includes('plugs') || d.includes('vacuum'),
      weakBrakes: d.includes('brakes'),
      judder: d.includes('discs'),
      smoke: d.includes('gasket') || d.includes('water_pump') || d.includes('coolant_hose'),
    };
  }, [car]);

  const sim = useRef({ x: track.samples[0].x, z: track.samples[0].z, heading: track.heading, v: 0, t: 0, cp: 0, hud: 0, done: false });

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = 55;
    cam.updateProjectionMatrix();
    (window as any).__gkDrive = { sim: sim.current, samples: track.samples, input: driveInput };
    driveInput.steer = driveInput.throttle = driveInput.brake = 0;
    useDriveHud.getState().set({ speed: 0, checkpoint: 0, total: CHECKPOINTS, offTrack: false });
    const keys: Record<string, boolean> = {};
    const apply = () => {
      driveInput.steer = (keys.ArrowLeft || keys.a ? 1 : 0) - (keys.ArrowRight || keys.d ? 1 : 0);
      driveInput.throttle = keys.ArrowUp || keys.w ? 1 : 0;
      driveInput.brake = keys.ArrowDown || keys.s ? 1 : 0;
    };
    const down = (e: KeyboardEvent) => ((keys[e.key] = true), apply());
    const up = (e: KeyboardEvent) => ((keys[e.key] = false), apply());
    engineAudio.start(soundProfile(car));
    engineAudio.setWarm(true);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      engineAudio.stop();
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useFrame((_, rawDt) => {
    const s = sim.current;
    const dt = Math.min(rawDt, 0.05);
    s.t += dt;

    // Position relativ zur Strecke
    let near = 0;
    let best = Infinity;
    for (let i = 0; i < N; i++) {
      const dx = track.samples[i].x - s.x;
      const dz = track.samples[i].z - s.z;
      const d = dx * dx + dz * dz;
      if (d < best) {
        best = d;
        near = i;
      }
    }
    const off = Math.sqrt(best) > WIDTH / 2 + 0.6;

    // Antrieb – Defekte sind spürbar
    let power = 7.5;
    if (perf.misfire) power *= Math.sin(s.t * 11) > 0.3 ? 0.15 : 0.6;
    const vmax = off ? 9 : perf.misfire ? 24 : 38;
    const brakeForce = perf.weakBrakes ? 4.5 : 15;
    const { throttle, brake, steer } = driveInput;
    if (throttle && s.v < vmax) s.v += throttle * power * (1 - Math.max(0, s.v) / (vmax * 1.15)) * dt;
    if (brake) {
      if (s.v > 0.3) s.v = Math.max(0, s.v - brakeForce * dt);
      else s.v = Math.max(-5, s.v - 4 * dt); // rückwärts
    }
    const drag = (off ? 2.5 : 0.35) + Math.abs(s.v) * 0.02;
    if (!throttle && !brake) s.v -= Math.sign(s.v) * Math.min(Math.abs(s.v), drag * dt * 3);
    else if (off && s.v > vmax) s.v -= 12 * dt;

    const steerAngle = (steer * 0.5) / (1 + Math.abs(s.v) / 14);
    engineAudio.set(820 + Math.abs(s.v) * 150, throttle);
    steerVis.current += (steer - steerVis.current) * Math.min(1, dt * 10);
    s.heading += (s.v / 2.76) * Math.tan(steerAngle) * dt;
    s.x += Math.cos(s.heading) * s.v * dt;
    s.z -= Math.sin(s.heading) * s.v * dt;

    if (group.current) {
      group.current.position.set(s.x, perf.misfire && s.v > 1 ? Math.sin(s.t * 40) * 0.008 : 0, s.z);
      group.current.rotation.y = s.heading;
    }

    // Verfolgerkamera
    const fx = Math.cos(s.heading);
    const fz = -Math.sin(s.heading);
    const k = Math.min(1, dt * 4);
    const shake = perf.judder && brake && s.v > 2 ? Math.sin(s.t * 55) * 0.06 : 0;
    camera.position.lerp(new THREE.Vector3(s.x - fx * 7.5, 3.4 + shake, s.z - fz * 7.5), k);
    camera.lookAt(s.x + fx * 4, 0.8, s.z + fz * 4);

    // Kontrollpunkte der Reihe nach
    const target = (((s.cp + 1) % CHECKPOINTS) * N) / CHECKPOINTS;
    const gap = Math.min(Math.abs(near - target), N - Math.abs(near - target));
    if (!s.done && gap < 6 && !off) {
      s.cp++;
      if (s.cp >= CHECKPOINTS) {
        s.done = true;
        setTimeout(() => finishDrive(true), 900);
      }
    }
    s.hud += dt;
    if (s.hud > 0.1) {
      s.hud = 0;
      useDriveHud.getState().set({ speed: Math.abs(s.v) * 3.6, checkpoint: s.cp, offTrack: off });
    }
  });

  const start = track.samples[0];
  return (
    <>
      <color attach="background" args={['#9fc4e8']} />
      <fog attach="fog" args={['#9fc4e8', 60, 220]} />
      <Env intensity={0.7} />
      <ambientLight intensity={1.1} />
      <hemisphereLight args={['#ffffff', '#6b6f58', 0.9]} />
      <directionalLight position={[30, 50, 20]} intensity={2} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[30, 0, 30]}>
        <planeGeometry args={[500, 500]} />
        <meshStandardMaterial color="#5f8a4a" roughness={1} />
      </mesh>
      <mesh geometry={track.edge}>
        <meshBasicMaterial color="#f1f1ee" side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={track.road}>
        <meshStandardMaterial color="#3d4046" roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      {/* Start/Ziel */}
      <group position={[start.x, 0, start.z]} rotation={[0, track.heading, 0]}>
        <mesh position={[3, 0.04, 0]}>
          <boxGeometry args={[1, 0.01, WIDTH]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        {[-1, 1].map((k) => (
          <mesh key={k} position={[3, 2.5, k * (WIDTH / 2 + 0.6)]}>
            <boxGeometry args={[0.25, 5, 0.25]} />
            <meshStandardMaterial color="#c8501e" />
          </mesh>
        ))}
        <mesh position={[3, 5, 0]}>
          <boxGeometry args={[0.4, 0.9, WIDTH + 1.5]} />
          <meshStandardMaterial color="#1b1c1f" />
        </mesh>
      </group>
      {track.trees.map(([x, h, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.6, 0]}>
            <cylinderGeometry args={[0.18, 0.22, 1.2, 6]} />
            <meshStandardMaterial color="#5b4630" />
          </mesh>
          <mesh position={[0, 1.2 + h, 0]}>
            <coneGeometry args={[1.3, h * 2, 7]} />
            <meshStandardMaterial color="#2f5d34" roughness={1} />
          </mesh>
        </group>
      ))}
      {/* Pylonen an den Kontrollpunkten */}
      {Array.from({ length: CHECKPOINTS }, (_, c) => {
        const i = (c * N) / CHECKPOINTS;
        return [-1, 1].map((k) => (
          <mesh key={`${c}${k}`} position={[track.samples[i].x + track.normals[i].x * k * (WIDTH / 2 + 0.2), 0.35, track.samples[i].z + track.normals[i].z * k * (WIDTH / 2 + 0.2)]}>
            <coneGeometry args={[0.22, 0.7, 8]} />
            <meshStandardMaterial color="#ff7a1a" />
          </mesh>
        ));
      })}

      <group ref={group}>
        <CarModel body={CAR_MODELS[car.modelId].body} color={car.color} steer={steerVis} modelId={car.modelId} />
        {perf.smoke && (
          <mesh position={[1.4, 1.1, 0]}>
            <sphereGeometry args={[0.35, 8, 6]} />
            <meshBasicMaterial color="#cfcfcf" transparent opacity={0.35} depthWrite={false} />
          </mesh>
        )}
      </group>
    </>
  );
}
