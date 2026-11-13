import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { TOOL_MAP } from '../game/data/tools';
import { openBox, remotePlayers, useCoop } from '../net/coop';
import { Interactable } from './Interactable';
import { mat, Mesher } from './mesher';
import { place, type Box } from './player';
import { textTexture } from './textures';
import { DECO, decoMaterials } from './workshopDecor';

// Koop: Werkzeugkisten mit eigenem Bestand und die Figuren der Mitspieler.

type V3 = [number, number, number];
/** Standorte der Werkzeugkisten (der bestehende Werkzeugschrank ist die vierte Kiste). */
export const BOX_SITES: { id: string; label: string; p: V3; rot: number; size: [number, number] }[] = [
  { id: 'kiste_a', label: 'Werkzeugkiste A', p: [-1.3, 0, -0.76], rot: 0, size: [0.8, 0.46] },
  { id: 'kiste_b', label: 'Werkzeugkiste B', p: [-1.3, 0, 0.76], rot: 0, size: [0.8, 0.46] },
  { id: 'spezial', label: 'Spezialwerkzeugschrank', p: [2.45, 0, 5.3], rot: 0, size: [0.9, 0.5] },
];
/** Hindernisse der Koop-Kisten für die Laufsteuerung. */
export const coopBoxes = (): Box[] => BOX_SITES.map((b) => ({ minX: b.p[0] - b.size[0] / 2, maxX: b.p[0] + b.size[0] / 2, minZ: b.p[2] - b.size[1] / 2, maxZ: b.p[2] + b.size[1] / 2 }));

let cartGeo: THREE.BufferGeometry | null = null;
let lockerGeo: THREE.BufferGeometry | null = null;
/** Rollwagen mit Schubladen und Ablage. */
function cart() {
  if (!cartGeo) {
    const m = new Mesher(10);
    m.rbox(DECO.red, [0.76, 0.62, 0.42], 0.02, [0, 0.47, 0]);
    for (const y of [0.26, 0.4, 0.54, 0.68]) {
      m.box(DECO.steelDark, [0.7, 0.008, 0.01], [0, y - 0.065, 0.212]);
      m.box(DECO.chrome, [0.5, 0.018, 0.02], [0, y, 0.22]);
    }
    m.rbox(DECO.steelDark, [0.8, 0.03, 0.46], 0.01, [0, 0.795, 0]);
    m.rbox(DECO.black, [0.74, 0.01, 0.4], 0.004, [0, 0.815, 0]);
    for (const x of [-0.42, 0.42]) m.tube(DECO.chrome, [[x, 0.6, -0.1], [x * 1.08, 0.75, -0.1], [x * 1.08, 0.75, 0.1], [x, 0.6, 0.1]], 0.012, 5);
    for (const x of [-0.3, 0.3]) for (const z of [-0.16, 0.16]) m.cyl(DECO.black, 0.055, 0.055, 0.04, [x, 0.06, z], [Math.PI / 2, 0, 0], 10);
    // Werkzeug auf der Ablage
    m.box(DECO.chrome, [0.3, 0.02, 0.03], [-0.12, 0.83, 0.05], [0, 0.3, 0]);
    m.cyl(DECO.chrome, 0.018, 0.018, 0.06, [0.2, 0.845, -0.08], undefined, 8);
    cartGeo = m.build();
  }
  return cartGeo;
}
/** Abschließbarer Stahlschrank für das Spezialwerkzeug. */
function locker() {
  if (!lockerGeo) {
    const m = new Mesher(10);
    m.rbox(DECO.blue, [0.86, 1.5, 0.46], 0.015, [0, 0.78, 0]);
    for (const x of [-0.215, 0.215]) m.box(DECO.steelDark, [0.4, 1.38, 0.008], [x, 0.78, -0.232]);
    for (const x of [-0.03, 0.03]) m.box(DECO.chrome, [0.018, 0.16, 0.02], [x, 0.85, -0.245]);
    m.box(DECO.yellow, [0.5, 0.09, 0.006], [0, 1.36, -0.238]);
    for (const x of [-0.36, 0.36]) for (const z of [-0.17, 0.17]) m.box(DECO.black, [0.06, 0.04, 0.06], [x, 0.02, z]);
    lockerGeo = m.build();
  }
  return lockerGeo;
}

/** Kisten an den Hebebühnen und der Spezialwerkzeugschrank – nur im Koop vorhanden. */
export function ToolBoxes() {
  const active = useCoop((c) => c.status !== 'off');
  const tools = useCoop((c) => c.tools);
  if (!active) return null;
  return (
    <>
      {BOX_SITES.map((b) => {
        const n = tools.filter((t) => t.box === b.id).length;
        const special = b.id === 'spezial';
        return (
          <Interactable key={b.id} id={`box_${b.id}`} label={`${b.label} (${n} Werkzeuge)`} onUse={() => openBox(b.id)} position={b.p} rotation={[0, b.rot, 0]} halo={special ? [0.92, 1.56, 0.52] : [0.86, 0.9, 0.5]} haloPos={[0, special ? 0.78 : 0.45, 0]}>
            <mesh geometry={special ? locker() : cart()} material={decoMaterials()} castShadow />
            <mesh position={[0, special ? 1.36 : 0.5, special ? -0.243 : 0.214]} rotation={[0, special ? Math.PI : 0, 0]}>
              <planeGeometry args={[special ? 0.48 : 0.34, 0.075]} />
              <meshStandardMaterial map={textTexture(special ? 'SPEZIALWERKZEUG' : b.id === 'kiste_a' ? 'KISTE A' : 'KISTE B', { bg: '#e3a81c', fg: '#16181d', w: 256, h: 56, font: 34 })} roughness={0.7} />
            </mesh>
          </Interactable>
        );
      })}
    </>
  );
}

let bodyGeo: THREE.BufferGeometry | null = null;
const FIG = { overall: 0, skin: 1, dark: 2, cap: 3, tool: 4 } as const;
/** Mechanikerfigur: Arbeitsanzug, Kappe, Arme; Blickrichtung = +Z der Figur. */
function figure() {
  if (!bodyGeo) {
    const m = new Mesher(5);
    // Beine, Stiefel, Rumpf im Arbeitsanzug
    for (const x of [-0.1, 0.1]) {
      m.add(FIG.overall, new THREE.CapsuleGeometry(0.085, 0.62, 4, 10), mat([x, 0.48, 0]));
      m.rbox(FIG.dark, [0.13, 0.09, 0.26], 0.03, [x, 0.045, 0.04]);
    }
    m.add(FIG.overall, new THREE.CapsuleGeometry(0.2, 0.36, 4, 12), mat([0, 1.14, 0], [0, 0, 0], [1, 1, 0.72]));
    m.rbox(FIG.dark, [0.34, 0.05, 0.25], 0.015, [0, 0.9, 0]);
    // Latz und Brusttasche
    m.rbox(FIG.dark, [0.22, 0.2, 0.02], 0.008, [0, 1.24, 0.15]);
    // Arme: linker hängt, rechter ist angewinkelt und hält das Werkzeug
    m.add(FIG.overall, new THREE.CapsuleGeometry(0.06, 0.46, 4, 8), mat([-0.27, 1.1, 0], [0, 0, -0.12]));
    m.sphere(FIG.skin, 0.058, [-0.3, 0.82, 0], 1, 8);
    m.add(FIG.overall, new THREE.CapsuleGeometry(0.06, 0.2, 4, 8), mat([0.27, 1.22, 0.02], [0.2, 0, 0.12]));
    m.add(FIG.overall, new THREE.CapsuleGeometry(0.055, 0.2, 4, 8), mat([0.28, 1.07, 0.16], [1.25, 0, 0]));
    m.sphere(FIG.skin, 0.058, [0.28, 1.1, 0.32], 1, 8);
    // Hals, Kopf, Kappe mit Schirm
    m.cyl(FIG.skin, 0.055, 0.06, 0.08, [0, 1.47, 0], undefined, 8);
    m.sphere(FIG.skin, 0.125, [0, 1.6, 0], [1, 1.1, 1.05], 14);
    m.sphere(FIG.cap, 0.132, [0, 1.645, -0.005], [1, 0.62, 1.05], 14);
    m.rbox(FIG.cap, [0.2, 0.018, 0.12], 0.008, [0, 1.648, 0.15], [0.12, 0, 0]);
    // Augen deuten die Blickrichtung an
    for (const x of [-0.045, 0.045]) m.sphere(FIG.dark, 0.014, [x, 1.61, 0.118], 1, 6);
    bodyGeo = m.build();
  }
  return bodyGeo;
}
const COLORS = ['#c8501e', '#1f6fb2', '#2f6b3a', '#7a3fa0'];

function Avatar({ id, index }: { id: string; index: number }) {
  const root = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const tool = useRef<THREE.Mesh>(null);
  const shown = useRef({ x: 0, z: 0, yaw: 0, init: false, bob: 0 });
  const name = useCoop((c) => c.members.find((m) => m.id === id)?.name ?? 'Partner');
  const mats = useMemo(() => {
    const list: THREE.Material[] = [];
    list[FIG.overall] = new THREE.MeshStandardMaterial({ color: COLORS[index % COLORS.length], roughness: 0.85 });
    list[FIG.skin] = new THREE.MeshStandardMaterial({ color: '#e2b48c', roughness: 0.8 });
    list[FIG.dark] = new THREE.MeshStandardMaterial({ color: '#1b1d21', roughness: 0.7 });
    list[FIG.cap] = new THREE.MeshStandardMaterial({ color: '#16181d', roughness: 0.6 });
    list[FIG.tool] = new THREE.MeshStandardMaterial({ color: '#cfd3d8', metalness: 0.9, roughness: 0.3 });
    return list;
  }, [index]);
  const label = useMemo(() => {
    const t = textTexture(name, { bg: '#16181d', fg: '#ffffff', w: 256, h: 64, font: 40 });
    return new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, opacity: 0.92 });
  }, [name]);
  const toolLabel = useRef('');
  const toolSprite = useRef<THREE.Sprite>(null);

  useFrame((_, dt) => {
    const g = root.current;
    const p = remotePlayers.get(id);
    if (!g) return;
    // Nur in der Halle sichtbar (auf Probefahrt oder beim Händler ist der Partner woanders).
    g.visible = !!p && p.scene === 'garage' && (p.place ?? 'werkstatt') === place.at;
    if (!p || !g.visible) return;
    const s = shown.current;
    if (!s.init) Object.assign(s, { x: p.x, z: p.z, yaw: p.yaw, init: true });
    // Weiches Nachführen: gleicht die niedrige Übertragungsrate und kurze Aussetzer aus.
    const k = 1 - Math.exp(-dt * 9);
    const dx = p.x - s.x;
    const dz = p.z - s.z;
    const far = Math.hypot(dx, dz) > 4;
    s.x += far ? dx : dx * k;
    s.z += far ? dz : dz * k;
    let dy = p.yaw - s.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    s.yaw += dy * k;
    const moving = Math.hypot(dx, dz) > 0.03;
    s.bob += dt * (moving ? 10 : 0);
    g.position.set(s.x, moving ? Math.abs(Math.sin(s.bob)) * 0.025 : 0, s.z);
    // Die Kamera blickt entlang -Z; die Figur ist mit Blick nach +Z gebaut.
    g.rotation.y = s.yaw + Math.PI;
    if (head.current) head.current.rotation.x = -Math.max(-0.6, Math.min(0.6, p.pitch)) * 0.6;
    const held = TOOL_MAP[p.tool]?.kind !== 'builtin' || p.tool === 'lamp';
    if (tool.current) tool.current.visible = held;
    if (toolSprite.current && toolLabel.current !== p.tool) {
      toolLabel.current = p.tool;
      const t = textTexture(`${TOOL_MAP[p.tool]?.icon ?? ''} ${TOOL_MAP[p.tool]?.short ?? ''}`, { bg: '#e3a81c', fg: '#16181d', w: 256, h: 64, font: 38 });
      toolSprite.current.material = new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, opacity: 0.92 });
    }
  });

  return (
    <group ref={root} visible={false} userData={{ label: name, noProbe: false }}>
      <group ref={head}>
        <mesh geometry={figure()} material={mats} castShadow raycast={() => null} />
      </group>
      {/* Werkzeug in der rechten Hand */}
      <mesh ref={tool} position={[0.28, 1.13, 0.4]} rotation={[0.5, 0, 0]} material={mats[FIG.tool]} raycast={() => null}>
        <boxGeometry args={[0.03, 0.03, 0.26]} />
      </mesh>
      <sprite position={[0, 1.95, 0]} scale={[0.4, 0.1, 1]} material={label} raycast={() => null} />
      <sprite ref={toolSprite} position={[0, 1.84, 0]} scale={[0.32, 0.08, 1]} raycast={() => null} />
    </group>
  );
}

/** Figuren aller anderen Mitglieder, die gerade online sind. */
export function Avatars() {
  const me = useCoop((c) => c.me);
  const ids = useCoop((c) => c.members.filter((m) => m.id !== c.me && m.online).map((m) => m.id).join());
  const all = useCoop((c) => c.members.map((m) => m.id).join());
  if (!me || !ids) return null;
  const order = all.split(',');
  return (
    <>
      {ids.split(',').map((id) => (
        <Avatar key={id} id={id} index={order.indexOf(id)} />
      ))}
    </>
  );
}
