import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CAR_MODELS } from '../game/data/cars';
import { useGame } from '../game/store';
import { Annex } from './Annex';
import type { ZoneId } from '../game/types';
import { CarModel } from './CarModel';
import { Env } from './Env';
import { Interactable } from './Interactable';
import { availableSlots, SLOTS, slotAvailable } from '../game/data/workshop';
import { BAY_Z, setSite, carBox, EYE, LIFT_HEIGHT, moveInput, movePlayer, nearestSlot, player, pushOutOf, REACH, useFocus, type Box, place, travel, usePlace } from './player';
import { Yard } from './Yard';
import { textTexture } from './textures';
import { Workshop } from './Workshop';
import { EnginePallets, EngineShop, engineShopBoxes } from './EngineShop';
import { Junkyard } from './Junkyard';
import { Mesher } from './mesher';
import { DECO } from './workshopDecor';
import { decoMaterials, liftCarriage, liftFrame } from './workshopDecor';
import { useGfxSettings } from './gfx';
import { Avatars, coopBoxes, ToolBoxes } from './CoopScene';
import { coopActive } from '../net/coop';

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
        const dynamic: Box[] = s.cars.flatMap((c, i) => (c && !c.lifted && SLOTS[i].kind !== 'stand' ? [carBox(i)] : []));
        dynamic.push(...engineShopBoxes(s.upgrades.includes('hoist')), { minX: -21.3, maxX: -17.7, minZ: 1.2, maxZ: 3.3 });
        if (s.upgrades.includes('expansion')) dynamic.push({ minX: -22.9, maxX: -21.3, minZ: 0.1, maxZ: 3.9 });
        if (s.upgrades.includes('paint')) dynamic.push({ minX: -22.9, maxX: -16, minZ: 8.6, maxZ: 9 });
        if (coopActive()) dynamic.push(...coopBoxes());
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
      const st = useGame.getState();
      const nearBay = nearestSlot(player.x, player.z, (i) => slotAvailable(SLOTS[i], st.upgrades) && (SLOTS[i].kind === 'junk') === (place.at === 'schrott'));
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
  // iPad-Leistung: Motorraum, Schrauben und Bremsen werden nur an dem Auto aufgebaut, an dem gerade gearbeitet wird
  // (Spieler steht daneben, Haube offen, angehoben oder Motor läuft). Alle anderen Bühnenautos zeigen die einfache Darstellung.
  const near = useFocus((f) => f.nearBay === index);
  const running = useGame((s) => s.engineBay === index);
  const detailed = near || running || !!car?.hoodOpen || !!car?.lifted || up;
  const carriage = useRef<THREE.Group>(null);
  const target = up ? LIFT_HEIGHT : 0;
  const z = SLOTS[index].z;
  const inner = index === 0 ? 1 : -1; // Seite zum Mittelgang
  const number = SLOTS.filter((x) => x.kind === 'lift' && x.id <= index).length;
  const wasUp = useRef(up);

  const handlers = useMemo(() => {
    const g = useGame.getState;
    return {
      onHood: () => g().tapHood(index),
      onComponent: (id: string) => g().tapComponent(index, id),
      onBolt: (id: string, i: number) => g().tapBolt(index, id, i),
      onConnector: (id: string) => g().tapConnector(index, id),
      onBody: (zone?: ZoneId) => g().tapBody(index, zone),
      onFluid: () => g().setPanel('fluids', index),
      onBleed: (side: 'fl' | 'fr') => g().bleedBrake(index, side),
      onDoor: (side: number) => g().toggleDoor(index, side),
    };
  }, [index]);
  const useLift = useMemo(() => () => useGame.getState().tapLift(index), [index]);
  const usePan = useMemo(() => () => useGame.getState().togglePan(index), [index]);
  const pan = useGame((s) => s.drainPan[index]);
  const drained = !!car && car.components.drain_plug?.installed === false;

  useEffect(() => {
    // Beim Ablassen niemanden unter dem Auto einklemmen.
    if (wasUp.current && !up && car) pushOutOf(carBox(index));
    wasUp.current = up;
  }, [up, car, index]);

  useFrame((_, dt) => {
    if (carriage.current) carriage.current.position.y += (target - carriage.current.position.y) * Math.min(1, dt * 2.6);
  });

  const leak = car && car.components.oil_pan_gasket?.condition === 'defect';
  const coolant = car && (car.components.water_pump?.condition === 'defect' || car.components.hose?.condition === 'defect');
  const label = textTexture(`BÜHNE ${number}`, { bg: '#e3a81c', fg: '#16181d', w: 256, h: 64, font: 44 });

  return (
    <group position={[0, 0, z]}>
      {/* Säulen, Fußplatten, Quertraverse und Hydraulikaggregat als ein Netz */}
      <mesh name="lift" geometry={liftFrame(inner)} material={decoMaterials()} castShadow receiveShadow />
      {[-1.5, 1.5].map((o) => (
        <mesh key={o} position={[0.134, 2.9, o]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[0.28, 0.1]} />
          <meshStandardMaterial map={label} roughness={0.7} />
        </mesh>
      ))}

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

      {/* Ölauffangwanne: steht an der Säule oder unter dem Motor */}
      <Interactable
        id={`pan${index}`}
        label={pan ? 'Auffangwanne wegräumen' : 'Auffangwanne unter den Motor stellen'}
        onUse={usePan}
        position={pan ? [1.3, 0, 0] : [0.75, 0, -inner * 1.45]}
        halo={[0.7, 0.3, 0.7]}
        haloPos={[0, 0.12, 0]}
      >
        <mesh position={[0, 0.09, 0]}>
          <cylinderGeometry args={[0.3, 0.26, 0.16, 20]} />
          <meshStandardMaterial color="#23262b" metalness={0.4} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.172, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.27, 20]} />
          <meshStandardMaterial color={pan && drained ? '#0d0905' : '#3a3d42'} metalness={pan && drained ? 0.9 : 0.3} roughness={pan && drained ? 0.1 : 0.7} />
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
        <mesh geometry={liftCarriage()} material={decoMaterials()} castShadow />
        {car && <CarModel body={CAR_MODELS[car.modelId].body} color={car.color} car={car} handlers={handlers} tool={tool} lod={detailed ? 'full' : 'simple'} hoodTap />}
      </group>
      <Blob />
    </group>
  );
}

let vanGeo: THREE.BufferGeometry | null = null;
/** Lieferwagen im Hof: fährt zum Schrottplatz. Front zeigt in −x. */
function Van() {
  if (!vanGeo) {
    const m = new Mesher(10);
    m.rbox(DECO.white, [3.4, 1.7, 1.9], 0.14, [0, 1.15, 0]);
    m.rbox(DECO.white, [0.9, 1.1, 1.85], 0.2, [-2.05, 0.85, 0]);
    m.rbox(DECO.steelDark, [0.05, 0.55, 1.6], 0.02, [-2.48, 1.1, 0], [0, 0, 0.35]);
    m.box(DECO.yellow, [3.0, 0.25, 0.02], [0, 1.25, 0.96]);
    for (const x of [-1.9, 1.1]) for (const z of [-0.85, 0.85]) m.cyl(DECO.black, 0.33, 0.33, 0.22, [x, 0.33, z], [Math.PI / 2, 0, 0], 16);
    vanGeo = m.build();
  }
  return <mesh geometry={vanGeo} material={decoMaterials()} castShadow />;
}

/** Weicher Kontaktschatten unter einem Auto – billig und macht viel aus. */
function Blob() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,0.6)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.3)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} raycast={() => null}>
      <planeGeometry args={[6.2, 3.2]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
  );
}

/** Auto auf einem Hofplatz, am Waschplatz oder in der Lackierkabine: vereinfachtes Modell, Karosserie antippbar. */
function Parked({ slot }: { slot: number }) {
  const car = useGame((s) => s.cars[slot]);
  const handlers = useMemo(() => {
    const g = useGame.getState;
    const lift = () => g().say('Für Arbeiten an Motor und Fahrwerk das Auto auf eine Hebebühne umparken.', true);
    return { onHood: lift, onBody: (zone?: ZoneId) => g().tapBody(slot, zone), onComponent: lift, onBolt: lift, onConnector: lift, onFluid: lift, onBleed: lift, onDoor: (side: number) => g().toggleDoor(slot, side) };
  }, [slot]);
  if (!car) return null;
  const def = SLOTS[slot];
  return (
    <group position={[def.x, 0, def.z]} rotation={[0, def.rot, 0]}>
      <CarModel body={CAR_MODELS[car.modelId].body} color={car.color} car={car} handlers={handlers} lod="simple" />
      <Blob />
    </group>
  );
}

/** Alle vorhandenen Hebebühnen – die dritte und vierte kommen mit den größeren Standorten. */
function Bays() {
  const upgrades = useGame((s) => s.upgrades);
  // Begehbare Bereiche folgen den gekauften Standorten.
  setSite(upgrades);
  return (
    <>
      {availableSlots(upgrades)
        .filter((x) => x.kind === 'lift')
        .map((x) => (
          <Bay key={x.id} index={x.id} />
        ))}
    </>
  );
}

export function GarageScene() {
  const G = useGfxSettings();
  const at = usePlace((p) => p.at);
  if (at === 'schrott') {
    return (
      <>
        <color attach="background" args={['#a9c6e3']} />
        <Env intensity={0.9} kind="sky" />
        <FirstPerson />
        <Junkyard />
        <Avatars />
      </>
    );
  }
  return (
    <>
      <color attach="background" args={['#9fc4e8']} />
      <Env intensity={0.8} />
      <ambientLight intensity={0.3} />
      <directionalLight position={[-14, 16, 6]} intensity={1.0} />
      <hemisphereLight args={['#f4f8ff', '#4a4d52', 0.5]} />
      <directionalLight
        position={[2.5, 9, 1.5]}
        intensity={1.5}
        castShadow={G.shadows}
        shadow-mapSize={[G.shadowMap, G.shadowMap]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-camera-near={1}
        shadow-camera-far={20}
      />
      {/* Hallenlicht: je nach Grafikstufe ein bis vier Punktlichter */}
      {(G.lights === 1 ? [[2.6, 0, 24]] : G.lights === 2 ? BAY_Z.map((z) => [2.6, z, 14]) : [...BAY_Z.map((z) => [2.6, z, 12]), ...BAY_Z.map((z) => [-1.8, z, 7])]).map(([x, z, power]) => (
        <pointLight key={`${x}${z}`} position={[x, 3.6, z]} intensity={power} distance={9.5} decay={1.7} color="#f4f8ff" />
      ))}
      <FirstPerson />
      <Workshop />
      <Yard />
      <Annex />
      <Bays />
      <ToolBoxes />
      <Avatars />
      <EngineShop />
      <EnginePallets />
      <Interactable id="van" label="Lieferwagen – zum Schrottplatz fahren" onUse={() => travel('schrott')} position={[-19.5, 0, 2.25]} halo={[3.6, 2.2, 2.1]} haloPos={[0, 1.1, 0]}>
        <Van />
      </Interactable>
      {SLOTS.filter((x) => x.kind !== 'lift' && x.kind !== 'stand' && x.kind !== 'junk').map((x) => (
        <Parked key={x.id} slot={x.id} />
      ))}
    </>
  );
}
