import { useMemo } from 'react';
import * as THREE from 'three';
import { CAR_MODELS } from '../game/data/cars';
import { ENGINES } from '../game/data/engines';
import { JUNK_SLOTS, SLOTS } from '../game/data/workshop';
import { useGame } from '../game/store';
import type { VisualTune, ZoneId } from '../game/types';
import { coopActive, openBox } from '../net/coop';
import { CarModel } from './CarModel';
import { bayMaterials, engineDecor } from './engineBay';
import { Interactable } from './Interactable';
import { Mesher, type V3 } from './mesher';
import { JUNK, JUNK_BOXES, travel, useFocus, type Box } from './player';
import { asphaltTexture, textTexture } from './textures';
import { DECO, decoMaterials } from './workshopDecor';

// Schrottplatz: eigener Ort mit Fahrzeugreihen, Büro, Teileregalen, Reifenbergen, Motoren auf Paletten,
// Container, Lagerhalle, Gabelstapler und Kran. Die sechs Spenderautos stehen auf den Stellplätzen 16–21.

const OFFICE: V3 = [-54.5, 0, -9.5];
const RACK: V3 = [-56.5, 0, 9.6];
const VAN: V3 = [-53.4, 0, 6.2];
const box = (x: number, z: number, sx: number, sz: number): Box => ({ minX: x - sx / 2, maxX: x + sx / 2, minZ: z - sz / 2, maxZ: z + sz / 2 });
JUNK_BOXES.push(
  box(OFFICE[0], OFFICE[2], 3.2, 2.4),
  box(RACK[0], RACK[2], 2.6, 0.7),
  box(VAN[0], VAN[2], 2.0, 4.4),
  box(-75.5, 0, 4, 22), // Lagerhalle
  box(-66, -10.6, 6, 2.2), // Container
  box(-60.5, 10.6, 5, 1.8), // Reifenberg
  box(-71.5, 10.4, 4.5, 2.2), // Motoren auf Paletten
  box(-58.0, 0, 1.4, 1.2), // Gabelstapler
);

function scrapStacks() {
  const m = new Mesher(10);
  let seed = 11;
  const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  // Gepresste Autos als Stapel an der Rückseite
  for (let i = 0; i < 9; i++) {
    for (let k = 0; k < 3 + Math.floor(r() * 2); k++) {
      const slot = [DECO.red, DECO.blue, DECO.green, DECO.steelDark, DECO.galv, DECO.yellow][Math.floor(r() * 6)];
      m.rbox(slot, [1.6, 0.42, 1.0], 0.06, [-55 - i * 2.1 + r() * 0.2, 0.22 + k * 0.43, -11.4 + r() * 0.2], [0, (r() - 0.5) * 0.2, (r() - 0.5) * 0.06]);
    }
  }
  // Reifenberg
  for (let i = 0; i < 26; i++) m.torus(DECO.black, 0.24, 0.11, [-62.5 + (i % 9) * 0.5 + r() * 0.1, 0.11 + Math.floor(i / 9) * 0.22, 10.6 + (r() - 0.5) * 0.8], [Math.PI / 2 + (r() - 0.5) * 0.3, 0, r()], 14);
  // Teileregal beim Büro
  for (const x of [-1.25, 1.25]) m.box(DECO.steelDark, [0.06, 2.2, 0.6], [RACK[0] + x, 1.1, RACK[2]]);
  for (const y of [0.4, 1.05, 1.7]) {
    m.box(DECO.galv, [2.5, 0.04, 0.6], [RACK[0], y, RACK[2]]);
    for (let k = 0; k < 4; k++) m.rbox([DECO.steelDark, DECO.red, DECO.blue, DECO.wood][k], [0.35, 0.22, 0.4], 0.03, [RACK[0] - 0.9 + k * 0.6, y + 0.13, RACK[2]]);
  }
  // Container
  m.box(DECO.blue, [6, 2.6, 2.4], [-66, 1.3, -10.6]);
  for (let i = 0; i < 20; i++) m.box(DECO.steelDark, [0.04, 2.5, 0.06], [-68.9 + i * 0.3, 1.3, -9.38]);
  // Gabelstapler
  m.rbox(DECO.yellow, [1.1, 0.7, 0.9], 0.08, [-58.0, 0.55, 0]);
  m.box(DECO.steelDark, [0.08, 2.0, 0.6], [-57.4, 1.0, 0]);
  for (const z of [-0.18, 0.18]) m.box(DECO.galv, [0.8, 0.04, 0.1], [-57.0, 0.08, z]);
  for (const z of [-0.45, 0.45]) for (const x of [-58.35, -57.65]) m.cyl(DECO.black, 0.22, 0.22, 0.18, [x, 0.22, z], [Math.PI / 2, 0, 0], 14);
  m.box(DECO.black, [0.8, 0.06, 0.9], [-58.2, 1.95, 0]);
  for (const [x, z] of [[-58.55, -0.4], [-58.55, 0.4], [-57.85, -0.4], [-57.85, 0.4]] as const) m.box(DECO.steelDark, [0.05, 1.05, 0.05], [x, 1.43, z]);
  // Lagerhalle (offene Seite zum Platz)
  m.box(DECO.galv, [4, 4.5, 0.2], [-75.5, 2.25, -11]);
  m.box(DECO.galv, [4, 4.5, 0.2], [-75.5, 2.25, 11]);
  m.box(DECO.galv, [0.2, 4.5, 22], [-77.5, 2.25, 0]);
  m.box(DECO.steelDark, [4.4, 0.2, 22.4], [-75.5, 4.6, 0]);
  for (let i = 0; i < 4; i++) m.box(DECO.steelDark, [0.15, 4.4, 0.15], [-73.5, 2.2, -9 + i * 6]);
  // Büro-Container
  m.box(DECO.white, [3.2, 2.5, 2.4], [OFFICE[0], 1.25, OFFICE[2]]);
  m.box(DECO.steelDark, [3.3, 0.12, 2.5], [OFFICE[0], 2.55, OFFICE[2]]);
  m.box(DECO.blue, [1.4, 0.8, 0.04], [OFFICE[0] + 0.4, 1.5, OFFICE[2] + 1.22]);
  // Lieferwagen
  m.rbox(DECO.white, [4.2, 1.9, 1.9], 0.15, [VAN[0], 1.25, VAN[2]], [0, Math.PI / 2, 0]);
  m.rbox(DECO.steelDark, [0.06, 0.6, 1.6], 0.03, [VAN[0], 1.65, VAN[2] - 2.12], [0, Math.PI / 2, 0]);
  for (const x of [-0.82, 0.82]) for (const z of [-1.3, 1.3]) m.cyl(DECO.black, 0.33, 0.33, 0.22, [VAN[0] + x, 0.33, VAN[2] + z], [0, 0, Math.PI / 2], 16);
  return m.build();
}

let fenceGeo: THREE.BufferGeometry | null = null;
function fence() {
  if (!fenceGeo) {
    const m = new Mesher(10);
    for (const z of [JUNK.minZ, JUNK.maxZ]) {
      m.box(DECO.galv, [JUNK.maxX - JUNK.minX, 0.04, 0.04], [(JUNK.maxX + JUNK.minX) / 2, 1.9, z]);
      m.box(DECO.galv, [JUNK.maxX - JUNK.minX, 0.04, 0.04], [(JUNK.maxX + JUNK.minX) / 2, 0.15, z]);
      for (let x = JUNK.minX; x <= JUNK.maxX; x += 2.5) m.cyl(DECO.galv, 0.03, 0.03, 2, [x, 1, z], undefined, 6);
    }
    m.box(DECO.galv, [0.04, 0.04, 24], [JUNK.maxX, 1.9, 0]);
    fenceGeo = m.build();
  }
  return fenceGeo;
}

function Sign({ text, sub, p, rot, size, bg = '#16181d', fg = '#ffd23f' }: { text: string; sub?: string; p: V3; rot: V3; size: [number, number]; bg?: string; fg?: string }) {
  const tex = textTexture(text, { sub, bg, fg, w: 512, h: Math.round((512 * size[1]) / size[0]) });
  return (
    <mesh position={p} rotation={rot}>
      <planeGeometry args={size} />
      <meshStandardMaterial map={tex} roughness={0.7} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Spenderauto: volles Modell in der Nähe (ausschlachten), sonst vereinfacht. */
function JunkCar({ slot }: { slot: number }) {
  const car = useGame((s) => s.cars[slot]);
  const tool = useGame((s) => s.tool);
  const near = useFocus((f) => f.nearBay === slot);
  const handlers = useMemo(() => {
    const g = useGame.getState;
    return {
      onHood: () => g().tapHood(slot),
      onComponent: (id: string) => g().tapComponent(slot, id),
      onBolt: (id: string, i: number) => g().tapBolt(slot, id, i),
      onConnector: (id: string) => g().tapConnector(slot, id),
      onBody: (zone?: ZoneId) => g().tapBody(slot, zone),
      onFluid: () => g().say('Flüssigkeiten am Schrottauto prüft hier niemand.'),
      onBleed: () => undefined,
      onDoor: (side: number) => g().toggleDoor(slot, side),
      onVisual: (field: keyof VisualTune) => g().junkVisual(slot, field),
    };
  }, [slot]);
  if (!car) return null;
  const d = SLOTS[slot];
  return (
    <group position={[d.x, 0, d.z]} rotation={[0, d.rot, 0]}>
      <CarModel body={CAR_MODELS[car.modelId].body} color={car.color} car={car} handlers={handlers} tool={tool} lod={near || car.hoodOpen ? 'full' : 'simple'} />
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[5.2, 2.6]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.25} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function Junkyard() {
  const ground = useMemo(() => {
    const t = asphaltTexture().clone();
    t.repeat.set(8, 7);
    t.needsUpdate = true;
    return t;
  }, []);
  const stacks = useMemo(scrapStacks, []);
  const setPanel = useGame((s) => s.setPanel);
  const showEngines = useMemo(() => ['r4_20', 'r6_30', 'v8_40', 'r4_20d'].map((id) => ENGINES[id] ?? Object.values(ENGINES)[0]), []);
  return (
    <group>
      <ambientLight intensity={0.45} />
      <hemisphereLight args={['#dfeaf7', '#5b5a50', 0.7]} />
      <directionalLight position={[-50, 14, 8]} intensity={1.9} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(JUNK.minX + JUNK.maxX) / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[JUNK.maxX - JUNK.minX + 30, JUNK.maxZ - JUNK.minZ + 30]} />
        <meshStandardMaterial map={ground} color="#7a7468" roughness={0.95} />
      </mesh>
      <mesh geometry={stacks} material={decoMaterials()} castShadow receiveShadow />
      <mesh geometry={fence()} material={decoMaterials()} />
      {/* Motoren auf Paletten (Dekoration – die kaufbaren stecken in den Autos) */}
      {showEngines.map((e, i) => (
        <group key={i} position={[-73 + i * 1.1, 0.15, 10.4]} scale={0.6}>
          <mesh geometry={engineDecor(e, 0, 'bare')} material={bayMaterials()} position={[-1.3, -0.25, 0]} raycast={() => null} />
        </group>
      ))}
      <Sign text="SCHROTT & TEILE KRÜGER" sub="Ausschlachten erlaubt · Bezahlt wird beim Ausbau" p={[-52.8, 3.0, -9.5]} rot={[0, -Math.PI / 2, 0]} size={[4.2, 0.9]} />
      <Sign text="REIHE A" p={[-65, 2.1, -8.6]} rot={[0, 0, 0]} size={[1.4, 0.35]} />
      <Sign text="REIHE B" p={[-65, 2.1, 8.6]} rot={[0, Math.PI, 0]} size={[1.4, 0.35]} />
      <Interactable id="junk_office" label="Schrottplatz-Büro – Autos und Preise" onUse={() => setPanel('junk')} position={[OFFICE[0] + 0.4, 0, OFFICE[2] + 1.24]} halo={[1.6, 2.2, 0.3]} haloPos={[0, 1.1, 0]}>
        <mesh position={[0, 1.0, 0]}>
          <boxGeometry args={[1.0, 2.0, 0.06]} />
          <meshStandardMaterial color="#59606a" roughness={0.6} />
        </mesh>
      </Interactable>
      {/* Betreiber */}
      <group position={[OFFICE[0] + 1.5, 0, OFFICE[2] + 1.9]}>
        <mesh position={[0, 0.8, 0]} castShadow>
          <capsuleGeometry args={[0.22, 0.9, 4, 10]} />
          <meshStandardMaterial color="#2f6b3a" roughness={0.85} />
        </mesh>
        <mesh position={[0, 1.62, 0]}>
          <sphereGeometry args={[0.15, 14, 12]} />
          <meshStandardMaterial color="#d9a77f" roughness={0.8} />
        </mesh>
      </group>
      <Interactable id="junk_tools" label="Werkzeug zum Ausleihen" onUse={() => (coopActive() ? openBox('schrott') : setPanel('cabinet'))} position={RACK} halo={[2.6, 2.3, 0.7]} haloPos={[0, 1.15, 0]}>
        <mesh position={[0, 1.15, 0]}>
          <boxGeometry args={[2.5, 2.2, 0.6]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </Interactable>
      <Interactable id="junk_van" label="Lieferwagen – zurück zur Werkstatt" onUse={() => travel('werkstatt')} position={VAN} halo={[2.1, 2.2, 4.5]} haloPos={[0, 1.1, 0]}>
        <mesh position={[0, 1.1, 0]}>
          <boxGeometry args={[2, 2.2, 4.4]} />
          <meshBasicMaterial visible={false} />
        </mesh>
      </Interactable>
      {JUNK_SLOTS.map((s) => (
        <JunkCar key={s} slot={s} />
      ))}
    </group>
  );
}
