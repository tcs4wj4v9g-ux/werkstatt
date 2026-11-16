import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { create } from 'zustand';
import { CAR_MODELS } from '../game/data/cars';
import { EXPO, SLOTS, slotAvailable } from '../game/data/workshop';
import { useGame } from '../game/store';
import type { ZoneId } from '../game/types';
import { CarModel } from './CarModel';
import { Interactable } from './Interactable';
import { Mesher } from './mesher';
import { EXPO_GATE, travel, useFocus } from './player';
import { textTexture } from './textures';
import { DECO, decoMaterials } from './workshopDecor';

// Autohaus: heller Ausstellungsraum mit Glasfront, Lichtbändern und Drehtellern. Jeder Teller dreht sein Auto langsam,
// damit man es von allen Seiten sieht; dazu gibt es die Rundum-Ansicht (Kamera kreist per Wischen um das Auto).

/** Drehteller an/aus je Platz – nur auf diesem Gerät, nicht im Spielstand. */
export const useTurntables = create<{ stopped: Record<number, boolean>; toggle(slot: number): void }>((set) => ({
  stopped: {},
  toggle: (slot) => set((s) => ({ stopped: { ...s.stopped, [slot]: !s.stopped[slot] } })),
}));

const H = 4.2;
const PLATE_R = 2.45;
const B = EXPO.bounds;
const EXPO_SLOTS = SLOTS.filter((s) => s.kind === 'expo');

let shellGeo: THREE.BufferGeometry | null = null;
/** Wände, Glasfront-Rahmen, Empfangstresen und Pflanzen als ein Netz. */
function shell() {
  if (shellGeo) return shellGeo;
  const m = new Mesher(10);
  const cx = (B.minX + B.maxX) / 2;
  const w = B.maxX - B.minX;
  const d = B.maxZ - B.minZ;
  m.box(DECO.white, [0.25, H, d], [B.maxX + 0.12, H / 2, 0]);
  m.box(DECO.white, [w, H, 0.25], [cx, H / 2, B.minZ - 0.12]);
  // Fensterseite (z max): Glas mit schwarzen Pfosten
  for (let x = B.minX; x <= B.maxX + 0.01; x += 3.1) m.box(DECO.black, [0.08, H, 0.08], [x, H / 2, B.maxZ + 0.05]);
  m.box(DECO.black, [w, 0.12, 0.1], [cx, H - 0.06, B.maxZ + 0.05]);
  m.box(DECO.black, [w, 0.12, 0.1], [cx, 0.06, B.maxZ + 0.05]);
  // Eingangsseite (x min) mit Glastür
  for (const z of [-1.1, 1.1]) m.box(DECO.black, [0.1, 2.5, 0.1], [B.minX - 0.05, 1.25, z]);
  m.box(DECO.black, [0.1, 0.1, 2.3], [B.minX - 0.05, 2.5, 0]);
  for (const [a, b] of [[B.minZ, -1.1], [1.1, B.maxZ]]) m.box(DECO.white, [0.25, H, b - a], [B.minX - 0.12, H / 2, (a + b) / 2]);
  m.box(DECO.white, [0.25, H - 2.5, 2.2], [B.minX - 0.12, 2.5 + (H - 2.5) / 2, 0]);
  // Empfangstresen hinten mittig, Pflanzen in den Ecken
  m.rbox(DECO.white, [0.9, 1.05, 2.4], 0.06, [B.maxX - 1.0, 0.53, 0]);
  m.rbox(DECO.black, [1.0, 0.05, 2.5], 0.02, [B.maxX - 1.0, 1.08, 0]);
  for (const [x, z] of [[B.minX + 0.6, B.minZ + 0.6], [B.maxX - 0.6, B.minZ + 0.6], [B.maxX - 0.6, B.maxZ - 0.6]]) {
    m.cyl(DECO.black, 0.28, 0.22, 0.5, [x, 0.25, z], undefined, 14);
    m.sphere(DECO.green, 0.5, [x, 0.95, z], [1, 1.3, 1], 10);
  }
  shellGeo = m.build();
  return shellGeo;
}

/** Drehteller: dunkle Scheibe mit Chromkante und Leuchtring; fährt das Auto langsam im Kreis. */
function Turntable({ slot }: { slot: number }) {
  const car = useGame((s) => s.cars[slot]);
  const stopped = useTurntables((t) => !!t.stopped[slot]);
  const near = useFocus((f) => f.nearBay === slot);
  const disc = useRef<THREE.Group>(null);
  const def = SLOTS[slot];
  const handlers = useMemo(() => {
    const g = useGame.getState;
    const lift = () => g().say('Im Autohaus wird nicht geschraubt – zum Arbeiten das Auto in die Werkstatt umparken.', true);
    return { onHood: lift, onBody: (zone?: ZoneId) => g().tapBody(slot, zone), onComponent: lift, onBolt: lift, onConnector: lift, onFluid: lift, onBleed: lift, onDoor: (side: number) => g().toggleDoor(slot, side) };
  }, [slot]);
  useFrame((_, dt) => {
    if (disc.current && !stopped && car) disc.current.rotation.y += dt * 0.22;
  });
  return (
    <group position={[def.x, 0, def.z]}>
      <mesh position={[0, 0.04, 0]} receiveShadow raycast={() => null}>
        <cylinderGeometry args={[PLATE_R, PLATE_R + 0.05, 0.08, 48]} />
        <meshStandardMaterial color="#2a2c31" metalness={0.6} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.082, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <ringGeometry args={[PLATE_R - 0.08, PLATE_R - 0.02, 48]} />
        <meshStandardMaterial color="#ffffff" emissive="#dfeaff" emissiveIntensity={1.4} />
      </mesh>
      <mesh position={[0, 0.04, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
        <torusGeometry args={[PLATE_R + 0.03, 0.025, 6, 48]} />
        <meshStandardMaterial color="#d9dde2" metalness={1} roughness={0.15} />
      </mesh>
      <group ref={disc} position={[0, 0.08, 0]}>
        {car && <CarModel body={CAR_MODELS[car.modelId].body} color={car.color} car={car} handlers={handlers} lod={near ? 'full' : 'simple'} />}
      </group>
      {/* Spot von oben auf das Auto */}
      <mesh position={[0, H - 0.05, 0]} raycast={() => null}>
        <cylinderGeometry args={[0.35, 0.35, 0.04, 20]} />
        <meshStandardMaterial color="#ffffff" emissive="#fff6e8" emissiveIntensity={1.6} />
      </mesh>
    </group>
  );
}

/** Noch nicht gekaufter Platz: markierte Fläche mit Hinweisschild. */
function EmptyPlace({ x, z, n }: { x: number; z: number; n: number }) {
  const tex = textTexture(`PLATZ ${n}`, { sub: 'Werkstatt-Computer → Ausbau', bg: '#e6e8eb', fg: '#3a3d42', w: 512, h: 200, font: 70 });
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <ringGeometry args={[PLATE_R - 0.06, PLATE_R, 48]} />
        <meshStandardMaterial color="#9aa0a7" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.007, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]} raycast={() => null}>
        <planeGeometry args={[1.6, 0.62]} />
        <meshStandardMaterial map={tex} roughness={0.8} />
      </mesh>
    </group>
  );
}

function Sign({ text, sub, p, rot, size }: { text: string; sub?: string; p: [number, number, number]; rot: [number, number, number]; size: [number, number] }) {
  const tex = textTexture(text, { sub, bg: '#16181d', fg: '#ffffff', w: 512, h: Math.round((512 * size[1]) / size[0]) });
  return (
    <mesh position={p} rotation={rot} raycast={() => null}>
      <planeGeometry args={size} />
      <meshStandardMaterial map={tex} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={0.35} roughness={0.6} />
    </mesh>
  );
}

export function Autohaus() {
  const upgrades = useGame((s) => s.upgrades);
  const lamp = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#f4f8ff', emissiveIntensity: 1.4 }), []);
  const cx = (B.minX + B.maxX) / 2;
  const w = B.maxX - B.minX;
  const d = B.maxZ - B.minZ;
  const owned = EXPO_SLOTS.filter((s) => slotAvailable(s, upgrades));
  return (
    <group>
      <color attach="background" args={['#cfd9e4']} />
      <ambientLight intensity={0.75} />
      <hemisphereLight args={['#ffffff', '#8a8d92', 0.85]} />
      <directionalLight position={[cx, 9, 14]} intensity={0.9} />
      {[0.3, 0.75].map((t) => (
        <pointLight key={t} position={[B.minX + w * t, H - 0.4, 0]} intensity={18} distance={20} decay={1.4} color="#fff8ee" />
      ))}
      {/* Polierter Boden, Decke, Lichtbänder */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0, 0]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#e9ebee" roughness={0.18} metalness={0.15} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[cx, H, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#f4f5f6" roughness={0.9} />
      </mesh>
      {[-1.6, 1.6].map((z) => (
        <mesh key={z} position={[cx, H - 0.03, z]} material={lamp} raycast={() => null}>
          <boxGeometry args={[w - 2, 0.04, 0.18]} />
        </mesh>
      ))}
      <mesh geometry={shell()} material={decoMaterials()} receiveShadow />
      {/* Glasfront */}
      <mesh position={[cx, H / 2, B.maxZ + 0.05]} raycast={() => null}>
        <planeGeometry args={[w, H]} />
        <meshStandardMaterial color="#bcd3e6" transparent opacity={0.28} roughness={0.05} metalness={0.3} side={THREE.DoubleSide} />
      </mesh>
      <Sign text="GARAGE KINGS AUTOHAUS" sub="Ausgestellte Autos verkaufen sich 4 % teurer" p={[B.minX + 6, 3.2, B.minZ + 0.02]} rot={[0, 0, 0]} size={[5.2, 0.9]} />
      <Interactable id="expo_exit" label="Ausgang – zurück in den Hof" onUse={() => travel('werkstatt')} position={[B.minX + 0.15, 0, 0]} halo={[0.3, 2.4, 2.2]} haloPos={[0, 1.2, 0]}>
        <mesh position={[0, 1.2, 0]}>
          <boxGeometry args={[0.2, 2.4, 2.2]} />
          <meshStandardMaterial color="#bcd3e6" transparent opacity={0.35} roughness={0.05} />
        </mesh>
      </Interactable>
      {EXPO_SLOTS.map((s, i) =>
        slotAvailable(s, upgrades) ? <Turntable key={s.id} slot={s.id} /> : i === owned.length ? <EmptyPlace key={s.id} x={s.x} z={s.z} n={i + 1} /> : null,
      )}
    </group>
  );
}

let portalGeo: THREE.BufferGeometry | null = null;
/** Eingang zum Autohaus am Hofrand: verglastes Portal mit Leuchtschild. */
export function ExpoEntrance() {
  if (!portalGeo) {
    const m = new Mesher(10);
    const { x, z } = EXPO_GATE;
    for (const o of [-0.85, 0.85]) m.box(DECO.white, [0.2, 3.2, 0.3], [x + o, 1.6, z + 0.25]);
    m.box(DECO.white, [1.9, 0.5, 0.35], [x, 3.25, z + 0.25]);
    m.box(DECO.black, [1.5, 2.95, 0.04], [x, 1.47, z + 0.3]);
    portalGeo = m.build();
  }
  const tex = textTexture('AUTOHAUS', { bg: '#16181d', fg: '#ffffff', w: 512, h: 96, font: 60 });
  return (
    <group>
      <mesh geometry={portalGeo} material={decoMaterials()} />
      <mesh position={[EXPO_GATE.x, 3.25, EXPO_GATE.z + 0.06]} rotation={[0, Math.PI, 0]} raycast={() => null}>
        <planeGeometry args={[1.7, 0.34]} />
        <meshStandardMaterial map={tex} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={0.5} />
      </mesh>
      <Interactable id="expo_gate" label="Autohaus betreten" onUse={() => travel('autohaus')} position={[EXPO_GATE.x, 0, EXPO_GATE.z]} halo={[1.5, 2.9, 0.4]} haloPos={[0, 1.45, 0.2]}>
        <mesh position={[0, 1.45, 0.2]}>
          <boxGeometry args={[1.5, 2.9, 0.3]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </Interactable>
    </group>
  );
}
