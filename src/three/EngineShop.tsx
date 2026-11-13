import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ENGINES } from '../game/data/engines';
import { STAND_SLOT, SLOTS } from '../game/data/workshop';
import { asStand } from '../game/motor';
import { useGame } from '../game/store';
import type { ZoneId } from '../game/types';
import { CarModel } from './CarModel';
import { bayMaterials, engineDecor } from './engineBay';
import { Interactable } from './Interactable';
import { Mesher, type V3 } from './mesher';
import type { Box } from './player';
import { useFocus } from './player';
import { DECO, decoMaterials } from './workshopDecor';

// Motorwerkstatt: Motorständer (drehbar), Motorkran mit hängendem Motor, Motorlager auf Paletten im Hof.

export const CRANE_POS: V3 = [3.1, 0, 1.45];
/** Paletten des Motorlagers im Hof (vier je Reihe). */
export const PALLETS: V3[] = [0, 1, 2, 3].flatMap((i) => [0.2, 1.5].map((z) => [-9 - i * 1.3, 0, z] as V3));
export const engineShopBoxes = (hoist: boolean): Box[] => [
  ...(hoist ? [{ minX: CRANE_POS[0] - 0.5, maxX: CRANE_POS[0] + 0.5, minZ: CRANE_POS[2] - 0.38, maxZ: CRANE_POS[2] + 0.38 }] : []),
  { minX: -14.2, maxX: -8.4, minZ: -0.35, maxZ: 2.05 },
];

let standGeo: THREE.BufferGeometry | null = null;
/** Motorständer: Fahrgestell mit Rollen, Säule, drehbarer Kopf mit Haltearmen (Kopf in 0,95 m Höhe bei x = −0,5). */
function standGeometry() {
  if (!standGeo) {
    const m = new Mesher(10);
    m.rbox(DECO.red, [1.1, 0.06, 0.08], 0.01, [-0.25, 0.08, 0]);
    m.rbox(DECO.red, [0.08, 0.06, 0.8], 0.01, [-0.75, 0.08, 0]);
    m.rbox(DECO.red, [0.08, 0.06, 0.8], 0.01, [0.25, 0.08, 0]);
    for (const [x, z] of [[-0.75, -0.38], [-0.75, 0.38], [0.25, -0.38], [0.25, 0.38]] as const) {
      m.cyl(DECO.steelDark, 0.012, 0.012, 0.06, [x, 0.04, z], undefined, 6);
      m.cyl(DECO.black, 0.035, 0.035, 0.025, [x, 0.035, z], [Math.PI / 2, 0, 0], 10);
    }
    m.rbox(DECO.red, [0.08, 0.88, 0.08], 0.01, [-0.62, 0.52, 0]);
    m.rbox(DECO.red, [0.24, 0.08, 0.08], 0.01, [-0.55, 0.95, 0]);
    m.cyl(DECO.steelDark, 0.07, 0.07, 0.06, [-0.42, 0.95, 0], [0, 0, Math.PI / 2], 16);
    // Drehgriff
    m.cyl(DECO.chrome, 0.012, 0.012, 0.22, [-0.62, 0.95, 0.12], [Math.PI / 2, 0, 0], 6);
    m.sphere(DECO.black, 0.025, [-0.62, 0.95, 0.24], 1, 8);
    standGeo = m.build();
  }
  return standGeo;
}
let armsGeo: THREE.BufferGeometry | null = null;
/** Haltearme, die mit dem Motor drehen. */
function armsGeometry() {
  if (!armsGeo) {
    const m = new Mesher(10);
    m.rbox(DECO.steelDark, [0.03, 0.24, 0.24], 0.01, [-0.38, 0, 0]);
    for (const [y, z] of [[0.1, 0.1], [0.1, -0.1], [-0.1, 0.1], [-0.1, -0.1]] as const) m.rbox(DECO.steelDark, [0.06, 0.025, 0.025], 0.006, [-0.34, y * 1.4, z * 1.6]);
    armsGeo = m.build();
  }
  return armsGeo;
}

let craneGeo: THREE.BufferGeometry | null = null;
/** Klappbarer Werkstattkran: Fahrwerk, Mast, Ausleger mit Hydraulikzylinder, Kette mit Haken. Ausleger zeigt nach +x. */
function craneGeometry() {
  if (!craneGeo) {
    const m = new Mesher(10);
    for (const z of [-0.3, 0.3]) {
      m.rbox(DECO.yellow, [1.0, 0.07, 0.07], 0.01, [0.05, 0.08, z]);
      m.cyl(DECO.black, 0.04, 0.04, 0.03, [0.52, 0.04, z], [Math.PI / 2, 0, 0], 10);
      m.cyl(DECO.black, 0.04, 0.04, 0.03, [-0.42, 0.04, z], [Math.PI / 2, 0, 0], 10);
    }
    m.rbox(DECO.yellow, [0.08, 0.07, 0.68], 0.01, [-0.42, 0.08, 0]);
    m.rbox(DECO.yellow, [0.1, 1.45, 0.1], 0.01, [-0.38, 0.8, 0]);
    m.rbox(DECO.yellow, [1.1, 0.09, 0.09], 0.01, [0.1, 1.55, 0], [0, 0, -0.12]);
    m.cyl(DECO.steelDark, 0.03, 0.03, 0.75, [-0.15, 1.05, 0], [0, 0, -0.5], 10);
    m.cyl(DECO.chrome, 0.018, 0.018, 0.45, [-0.03, 1.3, 0], [0, 0, -0.5], 8);
    m.rbox(DECO.black, [0.08, 0.14, 0.08], 0.01, [-0.3, 0.45, 0.07]);
    m.cyl(DECO.chrome, 0.01, 0.01, 0.35, [-0.22, 0.6, 0.07], [0, 0, 0.8], 6);
    // Kette und Haken am Auslegerende
    m.cyl(DECO.galv, 0.008, 0.008, 0.35, [0.63, 1.31, 0], undefined, 5);
    m.torus(DECO.steelDark, 0.03, 0.008, [0.63, 1.12, 0], undefined, 10, Math.PI * 1.6);
    craneGeo = m.build();
  }
  return craneGeo;
}

/** Motorständer mit dem Motor darauf (interaktiv wie ein Auto) und der Kran daneben. */
export function EngineShop() {
  const car = useGame((s) => s.cars[STAND_SLOT]);
  const crane = useGame((s) => s.crane);
  const hoist = useGame((s) => s.upgrades.includes('hoist'));
  const tool = useGame((s) => s.tool);
  const near = useFocus((f) => f.nearBay === STAND_SLOT);
  const flip = useRef<THREE.Group>(null);
  const handlers = useMemo(() => {
    const g = useGame.getState;
    return {
      onHood: () => g().say('Der Motor hat keine Haube – drehen kannst du ihn am Ständer.'),
      onComponent: (id: string) => g().tapComponent(STAND_SLOT, id),
      onBolt: (id: string, i: number) => g().tapBolt(STAND_SLOT, id, i),
      onConnector: (id: string) => g().tapConnector(STAND_SLOT, id),
      onBody: (zone?: ZoneId) => g().tapBody(STAND_SLOT, zone),
      onFluid: () => g().setPanel('fluids', STAND_SLOT),
      onBleed: () => undefined,
    };
  }, []);
  const hanging = useMemo(() => (crane ? asStand(crane, 'bavaria_320') : null), [crane]);
  const slot = SLOTS[STAND_SLOT];
  // Drehung sichtbar nachführen (das Modell selbst springt beim Drehen auf die neue Lage).
  useFrame(() => {
    if (flip.current) flip.current.rotation.x = car?.lifted ? Math.PI : 0;
  });
  return (
    <>
      <group position={[slot.x, 0, slot.z]}>
        <mesh geometry={standGeometry()} material={decoMaterials()} castShadow />
        <group ref={flip} position={[0, 0.95, 0]}>
          <mesh geometry={armsGeometry()} material={decoMaterials()} />
        </group>
        <Interactable id="stand" label={car ? 'Motorständer – drehen, prüfen, an den Kran' : 'Motorständer (leer)'} onUse={() => useGame.getState().setPanel('crane')} position={[-0.62, 0.95, 0.24]} halo={[0.16, 0.16, 0.16]}>
          <mesh>
            <sphereGeometry args={[0.07, 8, 6]} />
            <meshBasicMaterial visible={false} />
          </mesh>
        </Interactable>
        {car && <CarModel body="sedan" color="#6f757c" car={car} handlers={handlers} tool={tool} lod={near ? 'full' : 'full'} modelId={car.modelId} />}
      </group>
      {hoist && (
        <group position={CRANE_POS}>
          <Interactable id="crane" label={crane ? `Motorkran – ${ENGINES[crane.motor.engineId]?.name ?? 'Motor'} hängt dran` : 'Motorkran'} onUse={() => useGame.getState().setPanel('crane')} halo={[1.2, 1.7, 0.8]} haloPos={[0.05, 0.85, 0]}>
            <mesh geometry={craneGeometry()} material={decoMaterials()} castShadow />
          </Interactable>
          {hanging && (
            <group position={[0.63, 0.12, 0]} rotation={[0, Math.PI / 2, 0]}>
              <CarModel body="sedan" color="#6f757c" car={hanging} lod="full" modelId={hanging.modelId} />
            </group>
          )}
        </group>
      )}
    </>
  );
}

const palletEngines = new Map<string, THREE.BufferGeometry>();
/** Motor auf der Palette: Block, Ölwanne, Zylinderkopf(e) mit Ventildeckel, Schwungrad, Riemenscheibe, Krümmer, ggf. Turbo. */
function palletEngine(layout: string, turbo: boolean) {
  const key = layout + +turbo;
  let g = palletEngines.get(key);
  if (!g) {
    const m = new Mesher(10);
    const len = layout === 'R4' ? 0.52 : layout === 'R6' ? 0.72 : layout === 'V6' ? 0.5 : 0.6;
    const v = layout.startsWith('V');
    m.rbox(DECO.galv, [len, 0.3, v ? 0.42 : 0.26], 0.02, [0, 0.33, 0]);
    m.rbox(DECO.steelDark, [len * 0.92, 0.1, v ? 0.36 : 0.24], 0.02, [0, 0.13, 0]);
    const banks = v ? [-1, 1] : [0];
    for (const b of banks) {
      const z = b * 0.15, tilt = b * 0.5;
      m.rbox(DECO.galv, [len, 0.1, 0.2], 0.015, [0, 0.53, z], [tilt, 0, 0]);
      m.rbox(DECO.black, [len * 0.96, 0.07, 0.17], 0.025, [0, 0.62 - Math.abs(b) * 0.02, z + b * 0.04], [tilt, 0, 0]);
      for (let i = 0; i < (v ? 3 : 2); i++) m.cyl(DECO.chrome, 0.012, 0.012, 0.02, [-len * 0.3 + i * len * 0.3, 0.665 - Math.abs(b) * 0.02, z + b * 0.06], undefined, 6);
      // Abgaskrümmer an der Außenseite
      const side = v ? b : -1;
      m.rbox(DECO.steelDark, [len * 0.8, 0.06, 0.05], 0.015, [0, 0.42, side * (v ? 0.25 : 0.16)]);
    }
    m.cyl(DECO.steelDark, 0.17, 0.17, 0.04, [len / 2 + 0.03, 0.3, 0], Z90, 20);
    m.cyl(DECO.black, 0.07, 0.07, 0.04, [-len / 2 - 0.03, 0.3, 0], Z90, 14);
    if (!v) m.rbox(DECO.galv, [len * 0.85, 0.08, 0.1], 0.02, [0, 0.47, 0.17]);
    if (turbo) m.cyl(DECO.galv, 0.07, 0.07, 0.08, [len * 0.2, 0.36, v ? 0.33 : -0.24], Z90, 14);
    g = m.build();
    palletEngines.set(key, g);
  }
  return g;
}
const Z90: V3 = [0, 0, Math.PI / 2];

/** Motorlager im Hof: Paletten mit den ausgebauten Motoren. */
export function EnginePallets() {
  const engines = useGame((s) => s.engines);
  const pallet = useMemo(() => {
    const m = new Mesher(10);
    m.box(DECO.wood, [1.1, 0.03, 0.9], [0, 0.135, 0]);
    for (const z of [-0.38, 0, 0.38]) m.box(DECO.wood, [1.1, 0.1, 0.1], [0, 0.07, z]);
    m.box(DECO.wood, [1.1, 0.02, 0.9], [0, 0.01, 0]);
    return m.build();
  }, []);
  return (
    <Interactable id="engines" label={`Motorlager (${engines.length}/8 Paletten belegt)`} onUse={() => useGame.getState().setPanel('engines')} halo={[5.8, 1.2, 2.4]} haloPos={[-11.3, 0.6, 0.85]}>
      {PALLETS.map((p, i) => {
        const u = engines[i];
        const e = u ? ENGINES[u.motor.engineId] : null;
        return (
          <group key={i} position={p}>
            <mesh geometry={pallet} material={decoMaterials()} receiveShadow />
            {e && (
              <group position={[0, 0.07, 0]}>
                <mesh geometry={palletEngine(e.layout, e.turbo || !!u.motor.turboKit)} material={decoMaterials()} castShadow raycast={() => null} />
              </group>
            )}
          </group>
        );
      })}
    </Interactable>
  );
}
