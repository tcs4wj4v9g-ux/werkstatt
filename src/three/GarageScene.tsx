import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CAR_MODELS } from '../game/data/cars';
import { useGame } from '../game/store';
import { CarModel } from './CarModel';
import { Env } from './Env';
import { Interactable } from './Interactable';
import { BAY_Z, carBox, EYE, LIFT_HEIGHT, moveInput, movePlayer, player, pushOutOf, REACH, useFocus } from './player';
import { textTexture } from './textures';
import { Workshop } from './Workshop';

const SPEED = 2.7;
const FOV = 64;
const FOV_ZOOM = 27;

/** First-Person-Steuerung: Joystick/WASD zum Laufen, Wischen zum Umsehen. */
function FirstPerson() {
  const { camera, gl, scene } = useThree();
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const probe = useRef(0);
  const headlamp = useRef<THREE.PointLight>(null);

  useEffect(() => {
    const el = gl.domElement;
    let lookId: number | null = null;
    let lx = 0;
    let ly = 0;
    const down = (e: PointerEvent) => {
      if (lookId !== null) return;
      lookId = e.pointerId;
      lx = e.clientX;
      ly = e.clientY;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== lookId) return;
      const w = player.work;
      const k = (w ? 0.003 : player.zoom ? 0.0022 : 0.0052) * (900 / Math.max(600, el.clientHeight));
      // In der Arbeitsansicht dreht das Wischen nur den Blick, nicht den Spieler.
      const view = w ?? player;
      view.yaw -= (e.clientX - lx) * k;
      view.pitch = Math.max(-1.45, Math.min(1.45, view.pitch - (e.clientY - ly) * k));
      lx = e.clientX;
      ly = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === lookId) lookId = null;
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);

    const keys: Record<string, boolean> = {};
    const apply = () => {
      moveInput.x = (keys.d || keys.ArrowRight ? 1 : 0) - (keys.a || keys.ArrowLeft ? 1 : 0);
      moveInput.y = (keys.w || keys.ArrowUp ? 1 : 0) - (keys.s || keys.ArrowDown ? 1 : 0);
    };
    const kd = (e: KeyboardEvent) => ((keys[e.key] = true), apply());
    const ku = (e: KeyboardEvent) => ((keys[e.key] = false), apply());
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    camera.rotation.order = 'YXZ';
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      moveInput.x = moveInput.y = 0;
      player.work = null;
      camera.rotation.set(0, 0, 0);
      camera.rotation.order = 'XYZ';
      useFocus.getState().set({ id: null, label: null, nearBay: -1 });
    };
  }, [camera, gl]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = useGame.getState();
    const paused = s.panel !== null || s.partPrompt !== null;

    if (!paused && !player.work) {
      const len = Math.hypot(moveInput.x, moveInput.y);
      if (len > 0.05) {
        const k = (SPEED * dt * Math.min(1, len)) / len;
        const sin = Math.sin(player.yaw);
        const cos = Math.cos(player.yaw);
        const dx = (-sin * moveInput.y + cos * moveInput.x) * k;
        const dz = (-cos * moveInput.y - sin * moveInput.x) * k;
        // Autos am Boden sind Hindernisse; unter angehobenen kann man durchlaufen.
        const dynamic = s.cars.flatMap((c, i) => (c && !c.lifted ? [carBox(i)] : []));
        movePlayer(dx, dz, dynamic);
      }
    }

    const cam = camera as THREE.PerspectiveCamera;
    const w = player.work;
    if (w) {
      // Sanft an das Bauteil heranfahren.
      cam.position.lerp(new THREE.Vector3(...w.pos), Math.min(1, dt * 8));
      cam.rotation.set(w.pitch, w.yaw, 0);
    } else {
      cam.position.set(player.x, EYE, player.z);
      cam.rotation.set(player.pitch, player.yaw, 0);
    }
    const fov = w ? 52 : player.zoom ? FOV_ZOOM : FOV;
    if (Math.abs(cam.fov - fov) > 0.1) {
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 12);
      cam.updateProjectionMatrix();
    }
    headlamp.current?.position.copy(cam.position);

    // Was ist im Fadenkreuz? (nur ein paar Mal pro Sekunde prüfen)
    probe.current += dt;
    if (probe.current > 0.13) {
      probe.current = 0;
      ray.setFromCamera(new THREE.Vector2(0, 0), cam);
      ray.far = REACH;
      let id: string | null = null;
      let label: string | null = null;
      for (const hit of ray.intersectObjects(scene.children, true)) {
        let o: THREE.Object3D | null = hit.object;
        let skip = false;
        let found: THREE.Object3D | null = null;
        while (o) {
          if (o.userData.noProbe) skip = true;
          if (!found && o.userData.label) found = o;
          o = o.parent;
        }
        if (skip) continue;
        if (found) {
          label = found.userData.label;
          id = found.userData.stationId ?? null;
        }
        break;
      }
      let nearBay = -1;
      BAY_Z.forEach((z, i) => {
        if (Math.abs(player.z - z) < 2.4 && Math.abs(player.x) < 4.6) nearBay = i;
      });
      const f = useFocus.getState();
      if (f.id !== id || f.label !== label || f.nearBay !== nearBay) f.set({ id, label, nearBay });
    }
  });

  return <pointLight ref={headlamp} intensity={2.2} distance={6} decay={1.6} />;
}

/** Zwei-Säulen-Hebebühne mit Bedienkasten; trägt das Auto des Stellplatzes. */
function Bay({ index }: { index: number }) {
  const car = useGame((s) => s.cars[index]);
  const up = useGame((s) => (s.cars[index] ? s.cars[index]!.lifted : s.liftUp[index]));
  const tool = useGame((s) => s.tool);
  const carriage = useRef<THREE.Group>(null);
  const target = up ? LIFT_HEIGHT : 0;
  const z = BAY_Z[index];
  const inner = index === 0 ? 1 : -1; // Seite zum Mittelgang
  const wasUp = useRef(up);

  const handlers = useMemo(() => {
    const g = useGame.getState;
    return {
      onHood: () => g().tapHood(index),
      onBody: () => g().tapBody(index),
      onComponent: (id: string) => g().tapComponent(index, id),
      onBolt: (id: string, i: number) => g().tapBolt(index, id, i),
      onConnector: (id: string) => g().tapConnector(index, id),
    };
  }, [index]);
  const useLift = useMemo(() => () => useGame.getState().tapLift(index), [index]);

  useEffect(() => {
    // Beim Ablassen niemanden unter dem Auto einklemmen.
    if (wasUp.current && !up && car) pushOutOf(carBox(index));
    wasUp.current = up;
  }, [up, car, index]);

  useFrame((_, dt) => {
    if (carriage.current) carriage.current.position.y += (target - carriage.current.position.y) * Math.min(1, dt * 2.6);
  });

  const leak = car && car.components.oil_pan_gasket.condition === 'defect';
  const coolant = car && (car.components.water_pump.condition === 'defect' || car.components.hose.condition === 'defect');
  const label = textTexture(`BÜHNE ${index + 1}`, { bg: '#e3a81c', fg: '#16181d', w: 256, h: 64, font: 44 });

  return (
    <group position={[0, 0, z]}>
      {[-1.5, 1.5].map((o) => (
        <group key={o} position={[0, 0, o]}>
          <mesh position={[0, 1.95, 0]} castShadow>
            <boxGeometry args={[0.24, 3.9, 0.3]} />
            <meshStandardMaterial color="#e3a81c" metalness={0.4} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.02, 0]}>
            <boxGeometry args={[0.6, 0.04, 0.5]} />
            <meshStandardMaterial color="#3f4650" metalness={0.6} roughness={0.5} />
          </mesh>
          <mesh position={[0.125, 2.9, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[0.28, 0.1]} />
            <meshStandardMaterial map={label} roughness={0.7} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 3.86, 0]}>
        <boxGeometry args={[0.16, 0.1, 3.0]} />
        <meshStandardMaterial color="#e3a81c" metalness={0.4} roughness={0.5} />
      </mesh>

      <Interactable
        id={`lift${index}`}
        label={`Hebebühne ${index + 1} ${up ? 'ablassen' : 'anheben'}`}
        onUse={useLift}
        position={[0.2, 1.25, inner * 1.5]}
        halo={[0.2, 0.42, 0.34]}
      >
        <mesh>
          <boxGeometry args={[0.14, 0.36, 0.26]} />
          <meshStandardMaterial color="#23262b" metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh position={[0.075, 0.08, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <cylinderGeometry args={[0.045, 0.045, 0.03, 16]} />
          <meshStandardMaterial color="#2bb24c" emissive="#2bb24c" emissiveIntensity={up ? 0.2 : 0.9} />
        </mesh>
        <mesh position={[0.075, -0.08, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <cylinderGeometry args={[0.045, 0.045, 0.03, 16]} />
          <meshStandardMaterial color="#c81e1e" emissive="#c81e1e" emissiveIntensity={up ? 0.9 : 0.2} />
        </mesh>
      </Interactable>

      {/* Flecken auf dem Boden verraten Lecks */}
      {leak && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1.4, 0.006, 0.1]}>
          <circleGeometry args={[0.19, 20]} />
          <meshStandardMaterial color="#0d0905" metalness={0.8} roughness={0.12} transparent opacity={0.9} />
        </mesh>
      )}
      {coolant && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1.62, 0.006, -0.3]}>
          <circleGeometry args={[0.13, 20]} />
          <meshStandardMaterial color="#3fae6a" roughness={0.15} transparent opacity={0.7} />
        </mesh>
      )}

      <group ref={carriage}>
        {[-1.5, 1.5].map((o) => (
          <group key={o} position={[0, 0.2, o]}>
            <mesh>
              <boxGeometry args={[0.3, 0.3, 0.36]} />
              <meshStandardMaterial color="#3f4650" metalness={0.6} roughness={0.5} />
            </mesh>
            {[-1, 1].map((k) => (
              <mesh key={k} position={[k * 0.55, -0.06, -Math.sign(o) * 0.42]} rotation={[0, k * Math.sign(o) * 0.5, 0]} castShadow>
                <boxGeometry args={[1.25, 0.07, 0.12]} />
                <meshStandardMaterial color="#e3a81c" metalness={0.4} roughness={0.5} />
              </mesh>
            ))}
          </group>
        ))}
        {car && <CarModel body={CAR_MODELS[car.modelId].body} color={car.color} car={car} handlers={handlers} tool={tool} />}
      </group>
    </group>
  );
}

export function GarageScene() {
  return (
    <>
      <color attach="background" args={['#15171b']} />
      <Env intensity={0.45} />
      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#f4f8ff', '#3a3d42', 0.55]} />
      <directionalLight
        position={[2.5, 9, 1.5]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-camera-near={1}
        shadow-camera-far={20}
      />
      {BAY_Z.map((z) => (
        <pointLight key={z} position={[2.6, 3.6, z]} intensity={14} distance={9} decay={1.7} color="#f4f8ff" />
      ))}
      <FirstPerson />
      <Workshop />
      <Bay index={0} />
      <Bay index={1} />
    </>
  );
}
