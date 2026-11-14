import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CAR_MODELS } from '../game/data/cars';
import { BAY, GARAGE_MAP, garageLayout, SLOTS, type GarageId } from '../game/data/workshop';
import { useGame } from '../game/store';
import type { ZoneId } from '../game/types';
import { CarModel } from './CarModel';
import { useGfxSettings } from './gfx';
import { Interactable } from './Interactable';
import { Mesher } from './mesher';
import { player, RAMP_GATE, travel, YARD } from './player';
import { concreteTexture, textTexture } from './textures';
import { DECO, decoMaterials } from './workshopDecor';

// Begehbare Tiefgarage: Betonboden mit Buchten, Säulen, Lichtbänder an der Decke, Rampe nach oben zum Hof.
// Für das iPad: Wände, Säulen, Linien und Leuchten sind wenige zusammengefasste Netze; Autos sind vereinfachte
// Modelle und werden nur in der Nähe des Spielers gezeichnet.

const CEIL = 2.8;
const RAMP_LEN = 11;
const RAMP_W = 4.2;
/** Ab dieser Entfernung werden Autos nicht gezeichnet (die Garage ist ohnehin nach hinten abgeschattet). */
const CAR_RANGE = 30;

/** Materialgruppe der Leuchtleisten an der Rampe (nach den Werkstattmaterialien). */
const LAMP = 10;
const geoCache = new Map<string, THREE.BufferGeometry>();

/** Säulen (Beton mit Warnanstrich), Wandsockel, Radstopper und Buchtlinien als ein Netz. */
function structure(id: GarageId) {
  const key = `s${id}`;
  let g = geoCache.get(key);
  if (g) return g;
  const def = GARAGE_MAP[id];
  const { rows, per, bounds } = garageLayout(def);
  const m = new Mesher(10);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const w = bounds.maxX - bounds.minX;
  const d = bounds.maxZ - bounds.minZ;
  // Außenwände (vorn mit Öffnung zur Rampe)
  m.box(DECO.white, [w, CEIL, 0.3], [cx, CEIL / 2, bounds.minZ - 0.15]);
  m.box(DECO.white, [w, CEIL, 0.3], [cx, CEIL / 2, bounds.maxZ + 0.15]);
  m.box(DECO.white, [0.3, CEIL, d], [bounds.maxX + 0.15, CEIL / 2, (bounds.minZ + bounds.maxZ) / 2]);
  const gapA = -RAMP_W / 2;
  const gapB = RAMP_W / 2;
  m.box(DECO.white, [0.3, CEIL, gapA - bounds.minZ], [bounds.minX - 0.15, CEIL / 2, (bounds.minZ + gapA) / 2]);
  m.box(DECO.white, [0.3, CEIL, bounds.maxZ - gapB], [bounds.minX - 0.15, CEIL / 2, (bounds.maxZ + gapB) / 2]);
  m.box(DECO.white, [0.3, 0.5, RAMP_W], [bounds.minX - 0.15, CEIL - 0.25, 0]);
  // Gelber Sockelstreifen rundum
  m.box(DECO.yellow, [w, 0.25, 0.02], [cx, 0.125, bounds.minZ + 0.01]);
  m.box(DECO.yellow, [w, 0.25, 0.02], [cx, 0.125, bounds.maxZ - 0.01]);
  m.box(DECO.yellow, [0.02, 0.25, d], [bounds.maxX - 0.01, 0.125, (bounds.minZ + bounds.maxZ) / 2]);
  for (const row of rows) {
    const dir = row.rot > 0 ? -1 : 1; // Richtung zur Rückwand der Bucht
    const back = row.z + dir * (BAY.depth / 2 - 0.25);
    // Säulen alle drei Buchten
    for (let i = 0; i <= per; i += 3) {
      const x = def.ox + BAY.x0 + i * BAY.w;
      m.box(DECO.galv, [0.4, CEIL, 0.4], [x, CEIL / 2, back]);
      for (let k = 0; k < 4; k++) m.box(k % 2 ? DECO.black : DECO.yellow, [0.42, 0.22, 0.42], [x, 0.11 + k * 0.22, back]);
    }
    for (let i = 0; i < row.count; i++) {
      const x = def.ox + BAY.x0 + BAY.w / 2 + i * BAY.w;
      // Radstopper an der Rückseite
      m.rbox(DECO.yellow, [1.6, 0.1, 0.16], 0.03, [x, 0.05, row.z + dir * (BAY.depth / 2 - 0.75)]);
    }
    // Buchtlinien (weiß, quer zur Fahrgasse)
    for (let i = 0; i <= row.count; i++) {
      const x = def.ox + BAY.x0 + i * BAY.w;
      m.box(DECO.white, [0.1, 0.004, BAY.depth - 0.2], [x, 0.003, row.z]);
    }
  }
  g = m.build();
  geoCache.set(key, g);
  return g;
}

/** Leuchtbänder unter der Decke über den Fahrgassen und Buchten. */
function lamps(id: GarageId) {
  const key = `l${id}`;
  let g = geoCache.get(key);
  if (g) return g;
  const def = GARAGE_MAP[id];
  const { rows, aisles, bounds } = garageLayout(def);
  const m = new Mesher(10);
  for (const z of [...aisles, ...rows.map((r) => r.z)]) {
    for (let x = def.ox + 1.5; x < bounds.maxX - 1; x += 4.2) m.box(0, [1.3, 0.05, 0.16], [x, CEIL - 0.06, z]);
  }
  g = m.build();
  geoCache.set(key, g);
  return g;
}

/** Rampe nach oben: schräge Fahrbahn mit Rillen, Seitenwände, Tageslicht am oberen Ende. */
function ramp(id: GarageId) {
  const key = `r${id}`;
  let g = geoCache.get(key);
  if (g) return g;
  const def = GARAGE_MAP[id];
  const x0 = garageLayout(def).bounds.minX;
  const m = new Mesher(LAMP + 1);
  const ang = Math.atan2(CEIL + 0.4, RAMP_LEN);
  const len = Math.hypot(RAMP_LEN, CEIL + 0.4);
  const mid: [number, number, number] = [x0 - RAMP_LEN / 2, (CEIL + 0.4) / 2 - 0.08, 0];
  m.box(DECO.galv, [len, 0.16, RAMP_W], mid, [0, 0, -ang]);
  for (let i = 1; i < 14; i++) {
    const t = i / 14;
    m.box(DECO.steelDark, [0.06, 0.02, RAMP_W - 0.4], [x0 - RAMP_LEN * t, (CEIL + 0.4) * t + 0.01, 0], [0, 0, -ang]);
  }
  // Leuchtleisten an den Rampenwänden
  for (const z of [-RAMP_W / 2 + 0.02, RAMP_W / 2 - 0.02]) for (let i = 0; i < 4; i++) {
    const t = (i + 0.5) / 4;
    m.box(LAMP, [1.2, 0.08, 0.04], [x0 - RAMP_LEN * t, (CEIL + 0.4) * t + 1.6, z]);
  }
  for (const z of [-RAMP_W / 2 - 0.15, RAMP_W / 2 + 0.15]) {
    m.box(DECO.white, [RAMP_LEN, CEIL + 1.6, 0.3], [x0 - RAMP_LEN / 2, (CEIL + 1.6) / 2, z]);
    m.box(DECO.yellow, [RAMP_LEN, 0.12, 0.05], [x0 - RAMP_LEN / 2, 1.0, z - Math.sign(z) * 0.17]);
  }
  // Decke über dem untersten Teil der Rampe
  m.box(DECO.white, [RAMP_LEN * 0.3, 0.3, RAMP_W + 0.6], [x0 - RAMP_LEN * 0.15, CEIL + 0.15, 0]);
  g = m.build();
  geoCache.set(key, g);
  return g;
}

/** Ein geparktes Auto: vereinfachtes Modell, Türen und Karosserie antippbar; weit entfernt nicht gezeichnet. */
function GarageCar({ slot }: { slot: number }) {
  const car = useGame((s) => s.cars[slot]);
  const group = useRef<THREE.Group>(null);
  const def = SLOTS[slot];
  const handlers = useMemo(() => {
    const g = useGame.getState;
    const lift = () => g().say('In der Tiefgarage wird nicht geschraubt – zum Arbeiten das Auto in die Werkstatt umparken.', true);
    return { onHood: lift, onBody: (zone?: ZoneId) => g().tapBody(slot, zone), onComponent: lift, onBolt: lift, onConnector: lift, onFluid: lift, onBleed: lift, onDoor: (side: number) => g().toggleDoor(slot, side) };
  }, [slot]);
  const tick = useRef(0);
  useFrame((_, dt) => {
    tick.current += dt;
    if (tick.current < 0.4 || !group.current) return;
    tick.current = 0;
    group.current.visible = Math.hypot(player.x - def.x, player.z - def.z) < CAR_RANGE;
  });
  if (!car) return null;
  return (
    <group ref={group} position={[def.x, 0, def.z]} rotation={[0, def.rot, 0]}>
      <CarModel body={CAR_MODELS[car.modelId].body} color={car.color} car={car} handlers={handlers} lod="simple" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} raycast={() => null}>
        <planeGeometry args={[4.6, 2.0]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.28} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Sign({ text, sub, p, rot, size, bg = '#1d3fae', fg = '#ffffff' }: { text: string; sub?: string; p: [number, number, number]; rot: [number, number, number]; size: [number, number]; bg?: string; fg?: string }) {
  const tex = textTexture(text, { sub, bg, fg, w: 512, h: Math.round((512 * size[1]) / size[0]) });
  return (
    <mesh position={p} rotation={rot} raycast={() => null}>
      <planeGeometry args={size} />
      <meshStandardMaterial map={tex} roughness={0.7} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={0.25} />
    </mesh>
  );
}

export function UnderGarage({ id }: { id: GarageId }) {
  const G = useGfxSettings();
  const def = GARAGE_MAP[id];
  const layout = useMemo(() => garageLayout(def), [def]);
  const { bounds, rows, aisles } = layout;
  const floor = useMemo(() => {
    const t = concreteTexture().clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set((bounds.maxX - bounds.minX) / 4, (bounds.maxZ - bounds.minZ) / 4);
    t.needsUpdate = true;
    return t;
  }, [bounds]);
  const lampMat = useMemo(() => [new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#eef4ff', emissiveIntensity: 1.6 })], []);
  // Rampe: Leuchtleisten (Gruppe 0) leuchten, der Rest nutzt die Werkstattmaterialien
  const rampMats = useMemo(() => {
    const m = [...decoMaterials()];
    m[LAMP] = lampMat[0];
    return m;
  }, [lampMat]);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const w = bounds.maxX - bounds.minX;
  const d = bounds.maxZ - bounds.minZ;
  // Punktlichter je nach Grafikstufe entlang der ersten Fahrgasse; den Rest machen Umgebungslicht und Leuchtbänder.
  const lights = G.lights >= 2 ? [0.25, 0.75] : [0.5];
  const numbers = useMemo(() => {
    const out: { x: number; z: number; rot: number; n: number }[] = [];
    let n = 0;
    for (const row of rows) {
      const toAisle = row.rot > 0 ? 1 : -1;
      for (let i = 0; i < row.count; i++) out.push({ x: def.ox + BAY.x0 + BAY.w / 2 + i * BAY.w, z: row.z + toAisle * (BAY.depth / 2 - 0.55), rot: row.rot, n: ++n });
    }
    return out;
  }, [rows, def]);
  return (
    <group>
      <color attach="background" args={['#202328']} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#eef3fa', '#3a3d42', 0.75]} />
      {lights.map((t) => (
        <pointLight key={t} position={[bounds.minX + w * t, CEIL - 0.3, aisles[0]]} intensity={14} distance={18} decay={1.4} color="#f4f8ff" />
      ))}
      {/* Boden und Decke */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0, cz]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial map={floor} color="#9a9ca0" roughness={0.85} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[cx, CEIL, cz]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#c9cbce" roughness={0.95} />
      </mesh>
      {/* Fahrgassen: Richtungspfeile und Mittellinie */}
      {aisles.map((z) => (
        <mesh key={z} rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.004, z]}>
          <planeGeometry args={[w - 2, 0.12]} />
          <meshStandardMaterial color="#e3a81c" roughness={0.9} />
        </mesh>
      ))}
      <mesh geometry={structure(id)} material={decoMaterials()} receiveShadow />
      <mesh geometry={lamps(id)} material={lampMat} raycast={() => null} />
      {/* Buchtnummern auf dem Boden */}
      {numbers.map((b) => (
        <mesh key={b.n} rotation={[-Math.PI / 2, 0, b.rot - Math.PI / 2]} position={[b.x, 0.005, b.z]} raycast={() => null}>
          <planeGeometry args={[0.8, 0.5]} />
          <meshStandardMaterial map={textTexture(String(b.n), { bg: '#8f9296', fg: '#f4f4f1', w: 128, h: 80, font: 64 })} roughness={0.9} />
        </mesh>
      ))}
      {/* Rampe zum Hof */}
      <mesh geometry={ramp(id)} material={rampMats} />
      <pointLight position={[bounds.minX - RAMP_LEN * 0.6, CEIL + 1.8, 0]} intensity={10} distance={12} decay={1.4} color="#eaf2ff" />
      <mesh position={[bounds.minX - RAMP_LEN + 0.3, CEIL + 0.9, 0]} rotation={[0, Math.PI / 2, 0]} raycast={() => null}>
        <planeGeometry args={[RAMP_W, 2.4]} />
        <meshBasicMaterial color="#dcebfa" />
      </mesh>
      <Sign text={def.name.toUpperCase()} sub={`${def.slots} Stellplätze`} p={[bounds.maxX - 0.02, 1.9, aisles[0]]} rot={[0, -Math.PI / 2, 0]} size={[3.2, 0.8]} />
      <Sign text="↑ AUSFAHRT HOF" p={[bounds.minX + 0.02, CEIL - 0.25, -RAMP_W / 2 - 0.9]} rot={[0, Math.PI / 2, 0]} size={[1.6, 0.34]} bg="#1d6b3a" />
      <Interactable id={`tg_exit_${id}`} label="Rampe hoch – zurück in den Hof" onUse={() => travel('werkstatt')} position={[bounds.minX - 0.6, 0, 0]} halo={[0.9, 2.3, RAMP_W]} haloPos={[0, 1.15, 0]}>
        <mesh position={[0, 1.15, 0]}>
          <boxGeometry args={[0.8, 2.3, RAMP_W]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </Interactable>
      {SLOTS.filter((s) => s.place === id).map((s) => (
        <GarageCar key={s.id} slot={s.id} />
      ))}
    </group>
  );
}

let entranceGeo: THREE.BufferGeometry | null = null;
/** Einfahrt am linken Hofrand: Rampe nach unten zwischen Betonwangen, Portal mit Schild. */
export function GarageEntrance() {
  const owned = useGame((s) => s.upgrades.filter((u) => u in GARAGE_MAP).length);
  const setPanel = useGame((s) => s.setPanel);
  if (!entranceGeo) {
    const m = new Mesher(10);
    const x0 = YARD.minX;
    const z = RAMP_GATE.z;
    const w = 2.95;
    const len = 10;
    const drop = 2.8;
    const ang = Math.atan2(drop, len);
    m.box(DECO.steelDark, [Math.hypot(len, drop), 0.16, w], [x0 - len / 2, -drop / 2 - 0.08, z], [0, 0, ang]);
    for (let i = 1; i < 12; i++) m.box(DECO.galv, [0.06, 0.02, w - 0.3], [x0 - (len * i) / 12, (-drop * i) / 12 + 0.01, z], [0, 0, ang]);
    for (const o of [-w / 2 - 0.12, w / 2 + 0.12]) {
      m.box(DECO.white, [len, 0.9 + drop, 0.24], [x0 - len / 2, (0.9 - drop) / 2, z + o]);
      m.box(DECO.yellow, [len, 0.08, 0.26], [x0 - len / 2, 0.9, z + o]);
    }
    // Portal
    for (const o of [-w / 2 - 0.12, w / 2 + 0.12]) m.box(DECO.galv, [0.25, 2.9, 0.25], [x0 - 0.15, 1.45, z + o]);
    m.box(DECO.steelDark, [0.35, 0.45, w + 0.5], [x0 - 0.15, 3.05, z]);
    // Dunkle Einfahrt unten
    m.box(DECO.black, [0.1, drop, w], [x0 - len + 0.05, -drop / 2, z]);
    entranceGeo = m.build();
  }
  return (
    <group>
      <mesh geometry={entranceGeo} material={decoMaterials()} />
      <mesh position={[YARD.minX + 0.04, 3.05, RAMP_GATE.z]} rotation={[0, Math.PI / 2, 0]} raycast={() => null}>
        <planeGeometry args={[2.9, 0.4]} />
        <meshStandardMaterial map={textTexture('P  TIEFGARAGE', { bg: '#1d3fae', fg: '#ffffff', w: 512, h: 70, font: 50 })} roughness={0.7} />
      </mesh>
      <Interactable
        id="tg_gate"
        label={owned ? 'Rampe hinunter – Tiefgarage' : 'Tiefgarage – noch nicht gekauft (Computer → Ausbau)'}
        onUse={() => setPanel('garages')}
        position={[YARD.minX - 0.3, 0, RAMP_GATE.z]}
        halo={[0.6, 2.6, 2.9]}
        haloPos={[0, 1.3, 0]}
      >
        <mesh position={[0, 1.3, 0]}>
          <boxGeometry args={[0.5, 2.6, 2.9]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </Interactable>
    </group>
  );
}
