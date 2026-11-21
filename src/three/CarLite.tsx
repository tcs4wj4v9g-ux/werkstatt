import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BodyStyle } from '../game/types';
import { carGeometry, doorHinge, WHEEL_X } from './carGeometry';

/**
 * Vereinfachtes Auto für Gegner und Mitspieler in der Ferne: Karosserie (mit Haube und Türen zu einem Netz
 * zusammengefügt), Kabine, Räder und Rückleuchten – etwa 6 Zeichenaufrufe statt rund 70 für das volle Modell.
 * Gleiche Form und Farbe wie das volle Auto; nah dran zeigt die Fahrszene das volle Modell.
 */
const WY = 0.33;
const WZ = 0.8;
const lite = new Map<string, { body: THREE.BufferGeometry; cabin: THREE.BufferGeometry; tires: THREE.BufferGeometry; rims: THREE.BufferGeometry; lamps: THREE.BufferGeometry }>();

function strip(g: THREE.BufferGeometry) {
  // nur Lage und Normalen – so passen alle Teile zusammen (Farben setzt das Material)
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.getAttribute('position').clone());
  out.setAttribute('normal', g.getAttribute('normal').clone());
  if (g.index) out.setIndex(g.index.clone());
  return out;
}

export function carLiteGeometry(body: BodyStyle) {
  let g = lite.get(body);
  if (g) return g;
  const { shape: S, shell, hood, doors, cabin } = carGeometry(body, 0);
  const B = S.B;
  const hinge = doorHinge(S);
  const parts = [strip(shell), strip(hood).translate(S.F.openX0, S.crown(S.F.openX0), 0), ...doors.map((d, k) => strip(d).translate(hinge[0], 0, (k ? 1 : -1) * hinge[1]))];
  const bodyGeo = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  const wheels: [number, number][] = [
    [WHEEL_X, WZ + B.trackF],
    [WHEEL_X, -(WZ + B.trackF)],
    [B.rearAxle, WZ + B.trackR],
    [B.rearAxle, -(WZ + B.trackR)],
  ];
  const tires = mergeGeometries(wheels.map(([x, z]) => new THREE.CylinderGeometry(0.33, 0.33, 0.22, 14).rotateX(Math.PI / 2).translate(x, WY, z)));
  const rims = mergeGeometries(wheels.map(([x, z]) => new THREE.CircleGeometry(0.22, 12).translate(0, 0, 0.112).rotateY(z > 0 ? 0 : Math.PI).translate(x, WY, z)));
  const ty = S.beltY(B.tail + 0.15) - 0.1;
  const lamps = mergeGeometries([-1, 1].map((s) => new THREE.BoxGeometry(0.05, 0.08, 0.32).translate(B.tail + 0.02, ty, s * 0.55)));
  g = { body: bodyGeo, cabin, tires, rims, lamps };
  lite.set(body, g);
  return g;
}

const shared = {
  glass: new THREE.MeshStandardMaterial({ color: '#0b1217', roughness: 0.08, metalness: 0.4 }),
  trim: new THREE.MeshStandardMaterial({ color: '#0b0c0e', roughness: 0.3, metalness: 0.5 }),
  tire: new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.9 }),
  rim: new THREE.MeshStandardMaterial({ color: '#b9bec4', roughness: 0.3, metalness: 0.9, side: THREE.DoubleSide }),
  lamp: new THREE.MeshBasicMaterial({ color: '#d0241a' }),
};
const paints = new Map<string, THREE.MeshStandardMaterial>();
const paintOf = (c: string) => {
  let m = paints.get(c);
  if (!m) paints.set(c, (m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.32, metalness: 0.55, side: THREE.DoubleSide })));
  return m;
};

export function CarLite({ body, color }: { body: BodyStyle; color: string }) {
  const g = useMemo(() => carLiteGeometry(body), [body]);
  const paint = paintOf(color);
  const cabinMats = useMemo(() => [paint, shared.glass, shared.trim], [paint]);
  return (
    <group raycast={() => null}>
      <mesh geometry={g.body} material={paint} raycast={() => null} />
      <mesh geometry={g.cabin} material={cabinMats} raycast={() => null} />
      <mesh geometry={g.tires} material={shared.tire} raycast={() => null} />
      <mesh geometry={g.rims} material={shared.rim} raycast={() => null} />
      <mesh geometry={g.lamps} material={shared.lamp} raycast={() => null} />
    </group>
  );
}
