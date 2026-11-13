import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { COMPONENT_MAP, defOf, engineOf } from '../game/data/components';
import { cylinderSlots, ENGINES, isV } from '../game/data/engines';
import { dirtLevel, shineLevel, visibleDirt } from '../game/detail';
import { beneath, blockersRemoved, installReady, removable } from '../game/repair';
import { useGame } from '../game/store';
import type { BodyStyle, CarInstance, FluidId, ToolId, ZoneId } from '../game/types';
import { CAR_MODELS } from '../game/data/cars';
import { BODY_SPECS, carGeometry, doorHinge, HOOD_X0 } from './carGeometry';
import { doorTrimGeometry, interiorGeometry, lookOf, RIM_COLOR, SLOT, trimGeometry, wheelGeometry, type RimStyle } from './carParts';
import { TEST_MODE, useGfxSettings } from './gfx';
import { Mesher } from './mesher';
import { bayMaterials, beltGeometry, engineDecor, V_PIVOT, V_TILT } from './engineBay';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Selbst gebautes Fahrzeug (keine Markenlogos, kein Fremdmodell). Fahrtrichtung = +X.
// Mit `handlers` wird das Modell interaktiv (Werkstatt), sonst reine Anzeige.

export interface CarHandlers {
  onHood(): void;
  /** Tipp auf Karosserie oder Motorblock; `zone` = getroffener Karosseriebereich. */
  onBody(zone?: ZoneId): void;
  onComponent(id: string): void;
  onBolt(id: string, index: number): void;
  onConnector(id: string): void;
  onFluid(id: FluidId): void;
  /** Entlüfternippel am Bremssattel. */
  onBleed(side: 'fl' | 'fr'): void;
  /** Vordertür am Griff öffnen/schließen (0 = links, 1 = rechts). */
  onDoor?(side: number): void;
}

interface Props {
  body: BodyStyle;
  color: string;
  car?: CarInstance;
  handlers?: CarHandlers;
  /** Aktives Werkzeug – bestimmt, welche Teile gerade bedienbar sind. */
  tool?: ToolId;
  /** 'simple' lässt Motorraum, Schrauben und Bremsenteile weg (Hof, Waschplatz, Markt). */
  lod?: 'full' | 'simple';
  steer?: React.MutableRefObject<number>;
  /** Motorhaube auch in der einfachen Darstellung bedienbar (Auto auf einer Hebebühne, aber gerade nicht in Arbeit). */
  hoodTap?: boolean;
  /** Modell für Front, Felgen und Auspuff, falls kein `car` übergeben wird. */
  modelId?: string;
}

type V3 = [number, number, number];
const REACH = 4.2;
const GhostCtx = createContext<'normal' | 'ghost' | 'defect'>('normal');

/** Material, das sich je nach Zustand (normal / Platzhalter / bekannter Defekt) umfärbt. */
function Mat({ color, metal = 0.2, rough = 0.6 }: { color: string; metal?: number; rough?: number }) {
  const mode = useContext(GhostCtx);
  if (mode === 'ghost') return <meshBasicMaterial color="#39e06f" transparent opacity={0.4} depthWrite={false} />;
  return (
    <meshStandardMaterial
      color={color}
      metalness={metal}
      roughness={rough}
      emissive={mode === 'defect' ? '#ff2a1a' : '#000000'}
      emissiveIntensity={mode === 'defect' ? 0.6 : 0}
    />
  );
}

const tooFar = () => useGame.getState().say('Zu weit weg – geh näher heran.', true);
const tap = (fn: (e: ThreeEvent<MouseEvent>) => void) => (e: ThreeEvent<MouseEvent>) => {
  e.stopPropagation();
  if (e.delta > 10) return; // war ein Kameraschwenk, kein Tipp
  if (e.distance > REACH) return tooFar();
  fn(e);
};

const liveId = (o: THREE.Object3D | null): string | undefined => (o ? o.userData.liveId ?? liveId(o.parent) : undefined);
/**
 * Tipp auf einen Einbau-Platzhalter. Liegt dahinter ein gerade bedienbares
 * Teil (oder dessen Schraube), das unter diesem Platzhalter verbaut ist, hat
 * es Vorrang – so verdeckt ein Platzhalter nie das Teil darunter.
 */
const ghostTap = (car: CarInstance, id: string, fn: () => void) => (e: ThreeEvent<MouseEvent>) => {
  const under = beneath(car, id);
  if (e.intersections.some((i) => under.includes(liveId(i.object) ?? ''))) return;
  tap(fn)(e);
};

/** Platzhalter schweben etwas neben der Einbauposition, damit das Teil darunter erreichbar bleibt. */
const GHOST_LIFT: Record<string, number> = { valve_cover: 0.14, valve_cover_b: 0.14, cyl_head: 0.1, gearbox: -0.12, caliper_fl: 0.12, caliper_fr: 0.12, oil_pan: -0.14, engine_cover: 0.36, charge_pipe: 0.12 };

type Axis = 'y' | 'y-' | 'z+' | 'z-' | 'x+';
const AXIS_ROT: Record<Axis, V3> = {
  y: [0, 0, 0],
  'y-': [Math.PI, 0, 0],
  'z+': [Math.PI / 2, 0, 0],
  'z-': [-Math.PI / 2, 0, 0],
  'x+': [0, 0, -Math.PI / 2],
};

/** Unsichtbares Material: wird nicht gezeichnet, bleibt aber antippbar. */
const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false });
const HIT_GEO = new THREE.SphereGeometry(1, 8, 6);
let boltGeo: THREE.BufferGeometry | null = null;
/** Sechskantkopf mit Bund als ein Netz. */
function boltGeometry() {
  if (!boltGeo) {
    const m = new Mesher(1);
    m.cyl(0, 0.019, 0.02, 0.03, [0, 0, 0], undefined, 6);
    m.cyl(0, 0.026, 0.027, 0.006, [0, -0.012, 0], undefined, 12);
    boltGeo = m.build();
  }
  return boltGeo;
}
const BOLT_MATS = {
  tight: new THREE.MeshStandardMaterial({ color: '#d9dde2', metalness: 0.9, roughness: 0.25 }),
  loose: new THREE.MeshStandardMaterial({ color: '#e8c35a', metalness: 0.9, roughness: 0.25 }),
  shaft: new THREE.MeshStandardMaterial({ color: '#8d9399', metalness: 0.9, roughness: 0.4 }),
};

/** Unsichtbare Trefferfläche für kleine Teile. */
const Hit = ({ r = 0.046 }: { r?: number }) => <mesh geometry={HIT_GEO} material={HIT_MAT} scale={r} />;

const rbCache = new Map<string, THREE.BufferGeometry>();
/** Quader mit gerundeten Kanten (Geometrie wird je Abmessung nur einmal erzeugt). */
function RB({ s, r = 0.012, p, rot, children }: { s: V3; r?: number; p?: V3; rot?: V3; children: ReactNode }) {
  const key = `${s.join()}:${r}`;
  let g = rbCache.get(key);
  if (!g) rbCache.set(key, (g = new RoundedBoxGeometry(s[0], s[1], s[2], 2, Math.max(0.001, Math.min(r, Math.min(...s) / 2 - 0.0005)))));
  return (
    <mesh geometry={g} position={p} rotation={rot}>
      {children}
    </mesh>
  );
}
const noRay = () => null;
/** Unsichtbarer Körper, der Tipps abfängt (hinter fest verbauten Motorteilen). */
const Proxy = ({ s, p }: { s: V3; p: V3 }) => (
  <mesh position={p}>
    <boxGeometry args={s} />
    <primitive object={HIT_MAT} attach="material" />
  </mesh>
);
/** Geneigte Zylinderbank eines V-Motors. */
function Bank({ bank, children }: { bank: number; children: ReactNode }) {
  if (!bank) return <>{children}</>;
  return (
    <group position={[0, V_PIVOT, 0]} rotation={[bank * V_TILT, 0, 0]}>
      <group position={[0, -V_PIVOT, 0]}>{children}</group>
    </group>
  );
}

/** Schraube: 2 = fest, 1 = gelöst (steht sichtbar heraus), 0 = entfernt (grüne Markierung am Gewinde). */
function Bolt({ pos, axis = 'y', state, live, label, onTap }: { pos: V3; axis?: Axis; state: number; live?: string; label: string; onTap?: () => void }) {
  const text = `${label} (${state === 2 ? 'fest' : state === 1 ? 'gelöst' : 'entfernt'})`;
  const head = useRef<THREE.Group>(null);
  const targetY = state === 1 ? 0.03 : 0.012;
  // Lösen und Festziehen: die Schraube dreht sich sichtbar heraus bzw. hinein.
  useFrame((_, dt) => {
    const h = head.current;
    if (!h) return;
    const d = targetY - h.position.y;
    if (Math.abs(d) < 0.0004) return;
    const step = TEST_MODE ? d : d * Math.min(1, dt * 9);
    h.position.y += step;
    h.rotation.y -= step * 260;
  });
  return (
    <group position={pos} rotation={AXIS_ROT[axis]} userData={{ liveId: live, label: onTap ? text : undefined }} onClick={onTap && tap(onTap)}>
      {state > 0 ? (
        <group ref={head} position={[0, 0.012, 0]} rotation={[state === 1 ? 0.22 : 0, 0, 0]}>
          <mesh geometry={boltGeometry()} material={state === 1 ? BOLT_MATS.loose : BOLT_MATS.tight} />
          {state === 1 && (
            <mesh position={[0, -0.025, 0]} material={BOLT_MATS.shaft}>
              <cylinderGeometry args={[0.009, 0.009, 0.03, 6]} />
            </mesh>
          )}
        </group>
      ) : (
        <mesh position={[0, 0.004, 0]}>
          <cylinderGeometry args={[0.024, 0.024, 0.008, 12]} />
          <meshBasicMaterial color="#39e06f" transparent opacity={0.8} />
        </mesh>
      )}
      {onTap && <Hit />}
    </group>
  );
}

/** Elektrischer Stecker: aufgesteckt sitzt er am Bauteil, abgezogen hängt er sichtbar daneben. */
function Connector({ pos, off, connected, label, onTap }: { pos: V3; off: V3; connected: boolean; label: string; onTap?: () => void }) {
  const p: V3 = connected ? pos : [pos[0] + off[0], pos[1] + off[1], pos[2] + off[2]];
  const ref = useRef<THREE.Group>(null);
  const start = useRef(true);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    if (start.current || TEST_MODE) {
      g.position.set(...p);
      start.current = false;
      return;
    }
    if (Math.abs(g.position.x - p[0]) + Math.abs(g.position.y - p[1]) + Math.abs(g.position.z - p[2]) < 0.0005) return;
    g.position.lerp(tmpV.set(...p), Math.min(1, dt * 10));
  });
  return (
    <group ref={ref} position={p} userData={{ label: onTap ? `Stecker ${label} (${connected ? 'verbunden' : 'abgezogen'})` : undefined }} onClick={onTap && tap(onTap)}>
      <RB s={[0.045, 0.03, 0.04]} r={0.007}>
        <meshStandardMaterial color={connected ? '#3a3f46' : '#e3a81c'} roughness={0.6} />
      </RB>
      <mesh position={[0, 0.018, 0]}>
        <boxGeometry args={[0.02, 0.008, 0.026]} />
        <meshStandardMaterial color={connected ? '#5a6068' : '#f0c040'} roughness={0.5} />
      </mesh>
      {/* Kabelschwanz */}
      <mesh position={[0, -0.03, 0]} raycast={noRay}>
        <cylinderGeometry args={[0.006, 0.006, 0.04, 5]} />
        <meshStandardMaterial color="#111214" roughness={0.9} />
      </mesh>
      {onTap && <Hit r={0.04} />}
    </group>
  );
}

const tmpV = new THREE.Vector3();
const UNDER = new Set(['oil_pan', 'oil_pan_gasket', 'bearing', 'drain_plug', 'gearbox', 'dpf']);
/** Richtung, in die ein Teil beim Ausbau herausgenommen wird. */
const pullAxis = (id: string): V3 => (id.endsWith('_fl') ? [0, 0, -1] : id.endsWith('_fr') ? [0, 0, 1] : id === 'belt' ? [1, 0, 0] : UNDER.has(id) ? [0, -1, 0] : [0, 1, 0]);
const DURATION = 0.26;

/**
 * Weicher Übergang beim Aus- und Einbau: Das Teil wird sichtbar herausgezogen bzw. eingesetzt,
 * statt schlagartig zu verschwinden oder aufzutauchen.
 */
function PartAnim({ installed, axis, real, ghost }: { installed: boolean; axis: V3; real: ReactNode; ghost: ReactNode }) {
  const [st, setSt] = useState({ installed, leaving: false });
  const ref = useRef<THREE.Group>(null);
  const t = useRef(1);
  if (st.installed !== installed) {
    t.current = TEST_MODE ? 1 : 0;
    setSt({ installed, leaving: !installed && !TEST_MODE });
  }
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g || t.current >= 1) return;
    t.current = Math.min(1, t.current + dt / DURATION);
    const k = t.current * t.current * (3 - 2 * t.current);
    const d = st.leaving ? k * 0.2 : (1 - k) * 0.16;
    g.position.set(axis[0] * d, axis[1] * d, axis[2] * d);
    g.scale.setScalar(st.leaving ? 1 - k * 0.2 : 1);
    if (t.current >= 1) {
      g.position.set(0, 0, 0);
      g.scale.setScalar(1);
      if (st.leaving) setSt({ installed, leaving: false });
    }
  });
  return <group ref={ref}>{st.leaving || installed ? real : ghost}</group>;
}

const COVER_BOLTS: V3[] = [1.0, 1.3, 1.6].flatMap((x) => [-0.15, 0.15].map((z) => [x, 0.78, z] as V3));
/** Ventildeckelschrauben einer Bank beim V-Motor (vier je Deckel). */
const bankBolts = (bank: number, cylinders: number): V3[] => [[0.975, 0.18], [1.635, 0.18], [0.985, 0.03], [cylinders === 8 ? 1.35 : 1.25, 0.03]].map(([x, z]) => [x, 0.78, bank * z] as V3);
const WX = 1.38; // Radmitte vorn/hinten (±)
const WZ = 0.8;
const WY = 0.33;
const DIRT = new THREE.Color('#5b4a36');
const RUST = new THREE.Color('#6a3414');
const FOAM = new THREE.Color('#f4f6f8');

/** Karosseriebereich zu einem Punkt in Fahrzeugkoordinaten. */
export function zoneAt(x: number, y: number, z: number): ZoneId {
  if (y > 1.02 && x < 0.85 && x > -2.25) return 'top';
  if (x > 1.0) return 'front';
  if (x < -1.35) return 'rear';
  return z < 0 ? 'left' : 'right';
}

const wheelMats = new Map<string, THREE.Material[]>();
/** Materialien eines Rads: Reifen, Felge (mit Schmutz), dunkel, Felgenbett. */
function wheelMaterials(style: RimStyle, dirt: number, mode: 'normal' | 'ghost' | 'defect') {
  const key = `${style}:${dirt}:${mode}`;
  let m = wheelMats.get(key);
  if (!m) {
    if (mode === 'ghost') {
      const g = new THREE.MeshBasicMaterial({ color: '#39e06f', transparent: true, opacity: 0.4, depthWrite: false });
      m = [g, g, g, g];
    } else {
      const em = mode === 'defect' ? { emissive: new THREE.Color('#ff2a1a'), emissiveIntensity: 0.6 } : {};
      const rim = new THREE.Color(RIM_COLOR[style]).lerp(DIRT, dirt * 0.8);
      m = [
        new THREE.MeshStandardMaterial({ color: new THREE.Color('#131415').lerp(DIRT, dirt * 0.35), roughness: 0.92, ...em }),
        new THREE.MeshStandardMaterial({ color: rim, metalness: style === 'steel' ? 0.55 : 0.95, roughness: (style === 'steel' ? 0.5 : 0.2) + dirt * 0.6, ...em }),
        new THREE.MeshStandardMaterial({ color: '#16171a', metalness: 0.5, roughness: 0.6, ...em }),
        new THREE.MeshStandardMaterial({ color: new THREE.Color('#9aa0a7').lerp(DIRT, dirt * 0.7), metalness: 0.9, roughness: 0.32 + dirt * 0.5, side: THREE.DoubleSide, ...em }),
      ];
    }
    wheelMats.set(key, m);
  }
  return m;
}

/** Rad als ein einziges Netz. `out` = Außenseite (+1/-1); `lugs` = Zier-Radschrauben (nicht demontierbare Räder). */
function WheelMeshes({ out, dirt = 0, style = 'double5', lugs = false }: { out: number; dirt?: number; style?: RimStyle; lugs?: boolean }) {
  const mode = useContext(GhostCtx);
  const detail = useGfxSettings().detail;
  return <mesh geometry={wheelGeometry(style, detail, lugs)} material={wheelMaterials(style, Math.round(dirt * 5) / 5, mode)} rotation={[(out * Math.PI) / 2, 0, 0]} castShadow />;
}

/** Färbt die Karosserie-Eckpunkte je Bereich: Lackfarbe, Schmutz, Schaum, Rostflecken. */
function tint(geo: THREE.BufferGeometry, car: CarInstance | undefined, base: string, offsetX = 0, offsetY = 0, offsetZ = 0) {
  const pos = geo.getAttribute('position');
  let attr = geo.getAttribute('color') as THREE.BufferAttribute | undefined;
  if (!attr) {
    attr = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
    geo.setAttribute('color', attr);
  }
  const c = new THREE.Color();
  const baseColor = new THREE.Color(base);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + offsetX;
    const y = pos.getY(i) + offsetY;
    const z = pos.getZ(i) + offsetZ;
    c.copy(baseColor);
    if (car) {
      const zone = car.zones[zoneAt(x, y, z)];
      if (zone.paint) c.set(zone.paint);
      // Rost sitzt fleckig, bevorzugt unten an Schwellern und Radläufen.
      if (zone.rust > 0) {
        const n = 0.5 + 0.5 * Math.sin(x * 9.1 + z * 3.3) * Math.sin(y * 13.7 + x * 2.9);
        if (n + (y < 0.6 ? 0.25 : 0) > 1.05 - zone.rust * 0.95) c.lerp(RUST, 0.85);
      }
      if (zone.step === 2) c.lerp(FOAM, 0.7);
      else c.lerp(DIRT, visibleDirt(zone) * (y < 0.7 ? 0.85 : 0.6));
    }
    attr.setXYZ(i, c.r, c.g, c.b);
  }
  attr.needsUpdate = true;
}

export function CarModel({ body, color, car, handlers, tool = 'hand', lod = 'full', steer, modelId, hoodTap }: Props) {
  const G = useGfxSettings();
  const shared = useMemo(() => carGeometry(body, G.detail), [body, G.detail]);
  const S = shared.shape;
  const B = BODY_SPECS[body];
  const hinge = useMemo(() => doorHinge(S), [S]);
  // Eigene Kopien je Auto, weil jede Karosserie ihre eigene Einfärbung trägt.
  const geo = useMemo(() => ({ shell: shared.shell.clone(), cabin: shared.cabin.clone(), hood: shared.hood.clone(), doors: shared.doors.map((d) => d.clone()) }), [shared, car?.uid]);
  useEffect(() => () => [geo.shell, geo.cabin, geo.hood, ...geo.doors].forEach((g) => g.dispose()), [geo]);

  const root = useRef<THREE.Group>(null);
  const hood = useRef<THREE.Group>(null);
  const wheelFL = useRef<THREE.Group>(null);
  const wheelFR = useRef<THREE.Group>(null);
  const doorL = useRef<THREE.Group>(null);
  const doorR = useRef<THREE.Group>(null);
  const doorsOpen = [!!car?.doors?.[0], !!car?.doors?.[1]];
  const hoodOpen = car?.hoodOpen ?? false;
  const full = lod === 'full';
  const dirt = car ? dirtLevel(car) : 0;
  const shine = car ? shineLevel(car) : 0.8;
  const wheelDirt = car ? visibleDirt(car.zones.wheels) : 0;
  const glassDirt = car ? visibleDirt(car.zones.top) : 0;
  const zoneKey = car ? JSON.stringify(car.zones) : '';

  useEffect(() => {
    tint(geo.shell, car, color);
    tint(geo.cabin, car, color);
    tint(geo.hood, car, color, HOOD_X0, S.crown(HOOD_X0));
    geo.doors.forEach((d, k) => tint(d, car, color, hinge[0], 0, (k ? 1 : -1) * hinge[1]));
  }, [geo, color, zoneKey]);

  const mats = useMemo(() => {
    const paintOpts = { color: '#ffffff', vertexColors: true, metalness: 0.62, side: THREE.DoubleSide };
    const m = {
      paint: G.clearcoat ? new THREE.MeshPhysicalMaterial(paintOpts) : new THREE.MeshStandardMaterial(paintOpts),
      solid: new THREE.MeshStandardMaterial({ metalness: 0.62, roughness: 0.3 }),
      glass: new THREE.MeshPhysicalMaterial({ metalness: 0.25, transparent: true, side: THREE.DoubleSide, envMapIntensity: 1.6 }),
      dark: new THREE.MeshStandardMaterial({ color: '#131416', roughness: 0.88 }),
      trim: new THREE.MeshStandardMaterial({ color: '#0b0c0e', roughness: 0.28, metalness: 0.5 }),
      seat: new THREE.MeshStandardMaterial({ roughness: 0.82 }),
      seat2: new THREE.MeshStandardMaterial({ roughness: 0.9 }),
      chrome: new THREE.MeshStandardMaterial({ color: '#e6e9ed', roughness: 0.12, metalness: 1 }),
      lens: new THREE.MeshPhysicalMaterial({ color: '#aab2bc', metalness: 0.95, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03 }),
      ring: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#f3f8ff', emissiveIntensity: 1.5 }),
      tail: new THREE.MeshPhysicalMaterial({ color: '#8a0d12', roughness: 0.1, clearcoat: 1, emissive: '#ff1a1a', emissiveIntensity: 0.3 }),
      tailBar: new THREE.MeshStandardMaterial({ color: '#ff3b30', emissive: '#ff2a1a', emissiveIntensity: 1.25 }),
      amber: new THREE.MeshStandardMaterial({ color: '#f0a020', emissive: '#f08a00', emissiveIntensity: 0.4, roughness: 0.3 }),
      plate: new THREE.MeshStandardMaterial({ color: '#f2f2ee', roughness: 0.55 }),
    };
    return m;
  }, [G.clearcoat]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  // Pflegezustand wirkt auf Glanz und Spiegelung.
  // Weiß und kräftiges Rot sind Uni-Lacke, alles andere Metallic.
  const hsl = useMemo(() => new THREE.Color(color).getHSL({ h: 0, s: 0, l: 0 }), [color]);
  const metallic = hsl.l > 0.78 ? 0.12 : hsl.s > 0.6 && (hsl.h < 0.06 || hsl.h > 0.94) ? 0.3 : 0.68;
  mats.paint.metalness = metallic * (1 - dirt * 0.7);
  mats.solid.metalness = metallic;
  mats.paint.roughness = 0.26 + (0.68 - metallic) * 0.12 + dirt * 0.52 - shine * 0.14;
  mats.paint.envMapIntensity = 1.2 - dirt * 0.7;
  if (mats.paint instanceof THREE.MeshPhysicalMaterial) {
    mats.paint.clearcoat = (1 - dirt) * (0.3 + 0.7 * shine);
    mats.paint.clearcoatRoughness = 0.04 + (1 - shine) * 0.3;
  }
  mats.solid.color.set(color).lerp(DIRT, dirt * 0.6);
  mats.solid.roughness = 0.26 + dirt * 0.5;
  mats.glass.color.set('#0b1217').lerp(DIRT, glassDirt * 0.5);
  mats.glass.roughness = 0.03 + glassDirt * 0.55;
  mats.glass.opacity = 0.5 + glassDirt * 0.3;

  useFrame((_, dt) => {
    if (hood.current) {
      const target = hoodOpen ? 1.12 : 0;
      hood.current.rotation.z += (target - hood.current.rotation.z) * Math.min(1, dt * 7);
    }
    if (steer) {
      for (const w of [wheelFL.current, wheelFR.current]) if (w) w.rotation.y = steer.current * 0.45;
    }
    [doorL.current, doorR.current].forEach((d, k) => {
      if (!d) return;
      const target = doorsOpen[k] ? (k ? 1 : -1) * 1.08 : 0;
      if (Math.abs(target - d.rotation.y) > 0.001) d.rotation.y += (target - d.rotation.y) * Math.min(1, dt * 6);
    });
  });

  const model = CAR_MODELS[car?.modelId ?? modelId ?? ''];
  const engine = car ? engineOf(car) : ENGINES[model?.engineId ?? 'r4_20'];
  const look = useMemo(() => lookOf(model, body, engine), [model, body, engine]);
  const trim = useMemo(() => trimGeometry(body, look, G.detail), [body, look, G.detail]);
  const doorTrim = useMemo(() => doorTrimGeometry(body, look), [body, look]);
  const interior = useMemo(() => interiorGeometry(body, G.detail), [body, G.detail]);
  mats.seat.color.set(look.seat);
  mats.seat2.color.set(look.seat2);
  const trimMats = useMemo(() => {
    const list: THREE.Material[] = [];
    list[SLOT.dark] = mats.dark;
    list[SLOT.gloss] = mats.trim;
    list[SLOT.chrome] = mats.chrome;
    list[SLOT.lens] = mats.lens;
    list[SLOT.glow] = mats.ring;
    list[SLOT.tail] = mats.tail;
    list[SLOT.tailBar] = mats.tailBar;
    list[SLOT.amber] = mats.amber;
    list[SLOT.plate] = mats.plate;
    list[SLOT.solid] = mats.solid;
    list[SLOT.seat] = mats.seat;
    list[SLOT.seat2] = mats.seat2;
    return list;
  }, [mats]);
  const cabinMats = useMemo(() => [mats.paint, mats.glass, mats.trim], [mats]);
  const hoodMats = useMemo(() => [mats.paint, mats.dark], [mats]);
  const vee = isV(engine);
  const diesel = engine.fuel === 'diesel';
  const slots = cylinderSlots(engine);
  /** V-Motoren bauen breiter: seitliche Anbauteile rücken entsprechend nach außen. */
  const wide = vee ? 0.05 : 0;
  const def = (id: string) => (car ? defOf(car, id) : COMPONENT_MAP[id]);
  const st = (id: string) => car?.components[id];
  const installed = (id: string) => st(id)?.installed ?? true;
  const interactive = !!car && !!handlers && full;

  /** Passt das aktive Werkzeug zum Herausnehmen dieses Teils? */
  const toolFitsPart = (id: string) => {
    const need = def(id).removeWith;
    return tool === 'lamp' || (need ? tool === need.driver : tool === 'hand');
  };
  const toolFitsBolt = (id: string) => {
    const need = def(id).fastener;
    return !!need && (tool === need.driver || tool === 'hand' || tool === 'lamp' || (!!need.torque && tool === 'torque'));
  };

  /** Ausbaubares Bauteil: eingebaut = echtes Teil, ausgebaut = grüner Platzhalter zum Einbauen. */
  const part = (id: string, children: ReactNode) => {
    const s = st(id);
    const name = def(id).name;
    const isIn = !s || s.installed;
    const defect = !!s && s.known && s.condition === 'defect';
    const live = interactive && isIn && removable(car!, id) && toolFitsPart(id) ? id : undefined;
    const real = (
      <GhostCtx.Provider value={defect ? 'defect' : 'normal'}>
        <group userData={{ liveId: live, label: interactive ? name : undefined }} onClick={interactive ? tap(() => handlers!.onComponent(id)) : undefined}>
          {children}
        </group>
      </GhostCtx.Provider>
    );
    const ghost =
      isIn || !interactive || !installReady(car!, id) || !blockersRemoved(car!, id) ? null : (
        <GhostCtx.Provider value="ghost">
          <group position={[0, GHOST_LIFT[id] ?? 0, 0]} userData={{ label: `${name} einbauen` }} onClick={ghostTap(car!, id, () => handlers!.onComponent(id))}>
            {children}
          </group>
        </GhostCtx.Provider>
      );
    if (!s) return real;
    return <PartAnim installed={isIn} axis={pullAxis(id)} real={real} ghost={ghost} />;
  };

  const bolts = (id: string, positions: V3[], axis: Axis = 'y') =>
    installed(id) &&
    positions.map((p, i) => (
      <Bolt
        key={i}
        pos={p}
        axis={axis}
        state={st(id)?.bolts[i] ?? 2}
        label={`Schraube – ${def(id).name}`}
        live={interactive && blockersRemoved(car!, id) && toolFitsBolt(id) ? id : undefined}
        onTap={interactive ? () => handlers!.onBolt(id, i) : undefined}
      />
    ));

  const connector = (id: string, pos: V3, off: V3) =>
    installed(id) && (
      <Connector pos={pos} off={off} connected={st(id)?.connected ?? true} label={def(id).name} onTap={interactive && blockersRemoved(car!, id) ? () => handlers!.onConnector(id) : undefined} />
    );

  /** Tipp auf die Karosserie: meldet den getroffenen Bereich (für Waschen, Lackieren, Sichtprüfung). */
  const bodyTap =
    handlers &&
    tap((e) => {
      const p = root.current ? root.current.worldToLocal(e.point.clone()) : e.point;
      handlers.onBody(zoneAt(p.x, p.y, p.z));
    });
  const wheelTap = handlers && tap(() => handlers.onBody('wheels'));
  const fluidPoint = (id: FluidId, label: string, children: ReactNode) => (
    <group userData={{ label: interactive ? label : undefined }} onClick={interactive ? tap(() => handlers!.onFluid(id)) : undefined}>
      {children}
    </group>
  );

  const frontCorner = (s: 'fl' | 'fr') => {
    const sign = s === 'fr' ? 1 : -1;
    const axis: Axis = sign > 0 ? 'z+' : 'z-';
    const z = (d: number) => sign * (d + B.trackF);
    const wheelRef = s === 'fl' ? wheelFL : wheelFR;
    if (!full) {
      return (
        <group key={s} ref={wheelRef} position={[WX, WY, z(WZ)]} onClick={wheelTap}>
          <WheelMeshes out={sign} dirt={wheelDirt} style={look.rim} lugs />
          <mesh position={[0, 0, -sign * 0.08]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.17, 0.17, 0.02, 24]} />
            <meshStandardMaterial color="#a9aeb4" metalness={0.9} roughness={0.3} />
          </mesh>
        </group>
      );
    }
    const lug: V3[] = [0, 1, 2, 3, 4].map((i) => {
      const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
      return [WX + Math.cos(a) * 0.075, WY + Math.sin(a) * 0.075, z(WZ + 0.1)];
    });
    const worn = st(`pads_${s}`)?.condition === 'defect';
    const scored = st(`disc_${s}`)?.condition === 'defect';
    const padT = worn ? 0.008 : 0.022;
    const cy = WY + 0.125;
    const caliperColor = model?.cls === 'sport' || body === 'sport' ? '#b3261e' : model?.cls === 'luxury' ? '#2a2c30' : '#8a9097';
    return (
      <group key={s}>
        <mesh position={[WX, WY, z(0.69)]} rotation={[Math.PI / 2, 0, 0]} material={mats.dark}>
          <cylinderGeometry args={[0.06, 0.06, 0.1, 14]} />
        </mesh>
        {part(
          `disc_${s}`,
          <>
            {/* Innenbelüftete Scheibe: zwei Reibringe mit dunklem Luftspalt */}
            {[-0.009, 0.009].map((o) => (
              <mesh key={o} position={[WX, WY, z(0.72) + o]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.17, 0.17, 0.007, 32]} />
                <Mat color={scored ? '#6e5a4a' : '#a9aeb4'} metal={0.9} rough={scored ? 0.7 : 0.3} />
              </mesh>
            ))}
            <mesh position={[WX, WY, z(0.72)]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.166, 0.166, 0.012, 32]} />
              <Mat color="#3a3d42" metal={0.7} rough={0.6} />
            </mesh>
            <mesh position={[WX, WY, z(0.735)]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.08, 0.08, 0.04, 20]} />
              <Mat color="#55595e" metal={0.7} rough={0.5} />
            </mesh>
            {scored &&
              [0.11, 0.135, 0.155].map((r) => (
                <mesh key={r} position={[WX, WY, z(0.7325)]}>
                  <torusGeometry args={[r, 0.003, 4, 28]} />
                  <meshStandardMaterial color="#2c2118" roughness={0.9} />
                </mesh>
              ))}
          </>,
        )}
        {bolts(`disc_${s}`, [[WX + 0.05, WY, z(0.755)]], axis)}
        {part(
          `pads_${s}`,
          [-1, 1].map((k) => (
            <mesh key={k} position={[WX, cy - 0.01, z(0.72) + k * (0.014 + padT / 2)]}>
              <boxGeometry args={[0.13, 0.07, padT]} />
              <Mat color={worn ? '#6b4a2a' : '#2b2d30'} rough={0.9} />
            </mesh>
          )),
        )}
        {part(
          `caliper_${s}`,
          <>
            <RB s={[0.2, 0.12, 0.11]} r={0.028} p={[WX, cy, z(0.725)]}>
              <Mat color={caliperColor} metal={0.55} rough={0.42} />
            </RB>
            <RB s={[0.12, 0.05, 0.03]} r={0.01} p={[WX, cy + 0.01, z(0.785)]}>
              <Mat color={caliperColor} metal={0.55} rough={0.42} />
            </RB>
          </>,
        )}
        {bolts(`caliper_${s}`, [[WX - 0.06, cy, z(0.78)], [WX + 0.06, cy, z(0.78)]], axis)}
        {/* Entlüfternippel oben am Bremssattel; nach dem Entlüften steckt ein Schlauch mit Auffangflasche daran */}
        {installed(`caliper_${s}`) && (
          <group
            position={[WX + 0.075, cy + 0.07, z(0.8)]}
            rotation={[sign * 0.6, 0, 0]}
            userData={{ liveId: `caliper_${s}`, label: interactive ? `Entlüfternippel vorne ${s === 'fl' ? 'links' : 'rechts'}${car!.fluids.brake.bled[s] ? ' (entlüftet)' : ''}` : undefined }}
            onClick={interactive ? tap(() => handlers!.onBleed(s)) : undefined}
          >
            <mesh>
              <cylinderGeometry args={[0.009, 0.012, 0.035, 8]} />
              <meshStandardMaterial color="#c9a54a" metalness={0.9} roughness={0.3} />
            </mesh>
            <mesh position={[0, 0.02, 0]}>
              <sphereGeometry args={[0.012, 8, 6]} />
              <meshStandardMaterial color="#1b1d21" roughness={0.6} />
            </mesh>
            {car?.fluids.brake.bled[s] && (
              <>
                <mesh position={[0, 0.07, z(0.05)]} rotation={[sign * 0.9, 0, 0]}>
                  <cylinderGeometry args={[0.006, 0.006, 0.13, 6]} />
                  <meshStandardMaterial color="#d9e9f2" transparent opacity={0.7} />
                </mesh>
                <mesh position={[0, 0.02, z(0.13)]}>
                  <cylinderGeometry args={[0.035, 0.035, 0.1, 12]} />
                  <meshStandardMaterial color="#e9e6d8" transparent opacity={0.85} />
                </mesh>
              </>
            )}
            {interactive && <Hit r={0.05} />}
          </group>
        )}
        <group ref={wheelRef} position={[WX, WY, z(WZ)]}>
          {part(`wheel_${s}`, <WheelMeshes out={sign} dirt={wheelDirt} style={look.rim} />)}
          <group position={[-WX, -WY, -z(WZ)]}>{bolts(`wheel_${s}`, lug, axis)}</group>
        </group>
      </group>
    );
  };

  // Beim Herausdrehen der Ablassschraube läuft das Öl sichtbar in die Wanne.
  const plugIn = installed('drain_plug');
  const [draining, setDraining] = useState(false);
  const plugWas = useRef(plugIn);
  useEffect(() => {
    if (plugWas.current && !plugIn && !TEST_MODE) {
      setDraining(true);
      const t = setTimeout(() => setDraining(false), 3200);
      plugWas.current = plugIn;
      return () => clearTimeout(t);
    }
    plugWas.current = plugIn;
  }, [plugIn]);
  const oilLeak = st('oil_pan_gasket')?.condition === 'defect';
  const pumpLeak = st('water_pump')?.condition === 'defect';
  const beltBad = st('belt')?.condition === 'defect';
  const hoseLeak = st('hose')?.condition === 'defect';
  const intakeBad = st('intake_hose')?.condition === 'defect';

  return (
    <group ref={root}>
      {/* Karosserie */}
      <group onClick={bodyTap} userData={{ label: handlers && !full ? 'Karosserie' : undefined }}>
        <mesh geometry={geo.shell} material={mats.paint} castShadow />
        <mesh geometry={geo.cabin} material={cabinMats} castShadow />
        <mesh geometry={trim} material={trimMats} />
        <mesh geometry={interior} material={trimMats} />
        {/* Unterboden und Spritzwand */}
        <mesh position={[(B.nose + B.tail) / 2, B.ground + 0.05, 0]} material={mats.dark}>
          <boxGeometry args={[B.nose - B.tail - 0.4, 0.08, 1.3]} />
        </mesh>
        <mesh position={[0.79, 0.67, 0]} material={mats.dark}>
          <boxGeometry args={[0.03, 0.64, B.width * 1.66]} />
        </mesh>
      </group>
      {/* Vordertüren: am Griff zu öffnen */}
      {[0, 1].map((k) => {
        const s = k ? 1 : -1;
        const hx = B.handles[0];
        const hy = S.beltY(hx) - 0.085;
        return (
          <group key={k} ref={k ? doorR : doorL} position={[hinge[0], 0, s * hinge[1]]}>
            <group onClick={bodyTap} userData={{ label: handlers && !full ? 'Karosserie' : undefined }}>
              <mesh geometry={geo.doors[k]} material={cabinMats} castShadow />
              <mesh geometry={doorTrim[k]} material={trimMats} />
            </group>
            {car && handlers?.onDoor && (
              <group
                position={[hx - hinge[0], hy, s * (S.sideZ(hx, hy) + 0.02 - hinge[1])]}
                userData={{ label: doorsOpen[k] ? 'Tür schließen' : 'Tür öffnen' }}
                onClick={tap(() => {
                  if (useGame.getState().tool !== 'hand') return handlers.onBody(k ? 'right' : 'left');
                  handlers.onDoor!(k);
                })}
              >
                <Hit r={0.075} />
              </group>
            )}
          </group>
        );
      })}
      {/* Hinterräder (nicht demontierbar) */}
      {[-1, 1].map((k) => (
        <group key={k} position={[B.rearAxle, WY, k * (WZ + B.trackR)]} onClick={wheelTap}>
          <WheelMeshes out={k} dirt={wheelDirt} style={look.rim} lugs />
          <mesh position={[0, 0, -k * 0.08]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.16, 0.16, 0.02, 24]} />
            <meshStandardMaterial color="#a9aeb4" metalness={0.9} roughness={0.3} />
          </mesh>
          <mesh position={[-0.06, 0.11, -k * 0.075]}>
            <boxGeometry args={[0.13, 0.09, 0.07]} />
            <meshStandardMaterial color="#7d848c" metalness={0.7} roughness={0.45} />
          </mesh>
        </group>
      ))}

      {full && (
        <>
          {/* Motorraum: feste Teile */}
          <group onClick={bodyTap}>
            {/* Fest verbaute Teile (Block, Krümmer, Saugrohr, Kühler, Dome …) als ein Netz; Tipps fangen unsichtbare Körper ab */}
            <mesh geometry={engineDecor(engine, G.detail)} material={bayMaterials()} raycast={noRay} />
            <Proxy s={[0.7, 0.17, 0.36 + wide * 2]} p={[1.3, 0.535, 0]} />
            <Proxy s={[0.66, 0.09, 0.32]} p={[1.3, 0.405, 0]} />
            <Proxy s={[0.3, 0.16, 0.2]} p={[1.28, 0.6, 0.44]} />
            <Proxy s={[0.05, 0.34, 1.2]} p={[1.95, 0.6, 0]} />
            {/* Zylinderkopf der zweiten Bank (der ausbaubare Kopf ist beim V-Motor der der Bank 1) */}
            {vee && (
              <Bank bank={1}>
                <RB s={[0.7, 0.06, 0.23]} r={0.012} p={[1.3, 0.65, 0.115]}>
                  <meshStandardMaterial color="#8a9097" metalness={0.65} roughness={0.5} />
                </RB>
              </Bank>
            )}
            {/* Haubenstütze */}
            {hoodOpen && (
              <mesh position={[1.585, 1.305, 0.62]} rotation={[0, 0, 0.658]} raycast={noRay}>
                <cylinderGeometry args={[0.006, 0.006, 1.23, 5]} />
                <meshStandardMaterial color="#b9bec5" metalness={0.9} roughness={0.3} />
              </mesh>
            )}
            {/* Sichtbare Spuren von Lecks */}
            {(['gasket', 'gasket_b'] as const).map(
              (g) =>
                st(g)?.condition === 'defect' && (
                  <mesh key={g} position={[1.3, 0.6, (vee && g === 'gasket' ? -1 : 1) * (0.183 + wide)]}>
                    <boxGeometry args={[0.5, 0.16, 0.005]} />
                    <meshStandardMaterial color="#120d06" metalness={0.9} roughness={0.15} />
                  </mesh>
                ),
            )}
            {pumpLeak && (
              <mesh position={[1.6, 0.46, -0.3]}>
                <boxGeometry args={[0.09, 0.1, 0.1]} />
                <meshStandardMaterial color="#bfe3c4" roughness={0.9} />
              </mesh>
            )}
            {hoseLeak && (
              <mesh position={[1.36, 0.6, -0.45]}>
                <boxGeometry args={[0.1, 0.12, 0.05]} />
                <meshStandardMaterial color="#bfe3c4" roughness={0.9} />
              </mesh>
            )}
            {oilLeak && (
              <mesh position={[1.42, 0.185, 0.1]} scale={[1, 1.6, 1]}>
                <sphereGeometry args={[0.022, 8, 8]} />
                <meshStandardMaterial color="#0d0905" metalness={0.9} roughness={0.1} />
              </mesh>
            )}
          </group>

          {/* Kontrollpunkte für die Betriebsflüssigkeiten */}
          {fluidPoint(
            'oil',
            'Ölpeilstab & Öleinfüllung',
            <group position={[0, 0, wide]}>
              <mesh position={[1.12, 0.7, 0.235]}>
                <cylinderGeometry args={[0.006, 0.006, 0.16, 6]} />
                <meshStandardMaterial color="#9aa0a7" metalness={0.9} roughness={0.3} />
              </mesh>
              <mesh position={[1.12, 0.79, 0.235]} rotation={[0, Math.PI / 2, 0]}>
                <torusGeometry args={[0.022, 0.007, 6, 14]} />
                <meshStandardMaterial color="#f2c417" roughness={0.5} />
              </mesh>
              <group position={[1.12, 0.78, 0.235]}>
                <Hit r={0.055} />
              </group>
            </group>,
          )}
          {fluidPoint(
            'coolant',
            'Kühlmittel-Ausgleichsbehälter',
            <>
              <RB s={[0.16, 0.2, 0.16]} r={0.04} p={[1.82, 0.58, -0.52]}>
                <meshStandardMaterial color="#e9e6d8" roughness={0.35} transparent opacity={0.72} />
              </RB>
              <mesh position={[1.82, 0.545, -0.52]} raycast={noRay}>
                <boxGeometry args={[0.135, 0.1, 0.135]} />
                <meshStandardMaterial color="#3fae6a" roughness={0.3} />
              </mesh>
              <mesh position={[1.82, 0.695, -0.52]}>
                <cylinderGeometry args={[0.035, 0.038, 0.03, 14]} />
                <meshStandardMaterial color="#1f6fb2" roughness={0.5} />
              </mesh>
            </>,
          )}
          {fluidPoint(
            'brake',
            'Bremsflüssigkeitsbehälter',
            <>
              <RB s={[0.13, 0.1, 0.11]} r={0.02} p={[0.92, 0.72, -0.46]}>
                <meshStandardMaterial color="#ece9da" roughness={0.35} transparent opacity={0.78} />
              </RB>
              <mesh position={[0.92, 0.7, -0.46]} raycast={noRay}>
                <boxGeometry args={[0.11, 0.05, 0.09]} />
                <meshStandardMaterial color="#b98a2a" roughness={0.3} />
              </mesh>
              <mesh position={[0.92, 0.78, -0.46]}>
                <cylinderGeometry args={[0.032, 0.035, 0.025, 14]} />
                <meshStandardMaterial color="#e3a81c" roughness={0.5} />
              </mesh>
            </>,
          )}

          {part(
            'battery',
            <>
              <RB s={[0.28, 0.2, 0.2]} r={0.012} p={[0.98, 0.56, 0.5]}>
                <Mat color="#15161a" rough={0.55} />
              </RB>
              <RB s={[0.286, 0.03, 0.206]} r={0.01} p={[0.98, 0.665, 0.5]}>
                <Mat color="#2a2d33" rough={0.5} />
              </RB>
              {/* Aufkleber, Pluspol mit roter Kappe, Minuspol */}
              <mesh position={[0.98, 0.57, 0.602]}>
                <boxGeometry args={[0.2, 0.09, 0.003]} />
                <Mat color="#d9dde2" rough={0.6} />
              </mesh>
              <mesh position={[0.98, 0.59, 0.604]}>
                <boxGeometry args={[0.2, 0.03, 0.003]} />
                <Mat color="#c8501e" rough={0.6} />
              </mesh>
              <RB s={[0.05, 0.035, 0.05]} r={0.012} p={[0.89, 0.692, 0.44]}>
                <Mat color="#b3261e" rough={0.5} />
              </RB>
              <mesh position={[0.89, 0.69, 0.56]}>
                <cylinderGeometry args={[0.014, 0.017, 0.03, 8]} />
                <Mat color="#8d9399" metal={0.8} rough={0.4} />
              </mesh>
            </>,
          )}
          {bolts('battery', [[1.06, 0.68, 0.5]])}
          {part(
            'oil_filter',
            <group position={[0, 0, -wide]}>
              <mesh position={[1.0, 0.66, -0.27]}>
                <cylinderGeometry args={[0.045, 0.045, 0.13, 14]} />
                <Mat color="#1b1d21" rough={0.5} />
              </mesh>
              <mesh position={[1.0, 0.735, -0.27]}>
                <cylinderGeometry args={[0.03, 0.03, 0.02, 6]} />
                <Mat color="#2b2e33" metal={0.5} rough={0.5} />
              </mesh>
            </group>,
          )}
          {part(
            'head_gasket',
            <Bank bank={vee ? -1 : 0}>
              <mesh position={[1.3, 0.624, vee ? -0.115 : 0]}>
                <boxGeometry args={[0.68, 0.008, vee ? 0.21 : 0.34]} />
                <Mat color={st('head_gasket')?.condition === 'defect' ? '#5a3a1c' : '#3d4046'} metal={0.4} rough={0.7} />
              </mesh>
            </Bank>,
          )}
          {part(
            'cyl_head',
            <Bank bank={vee ? -1 : 0}>
              <RB s={[0.7, 0.06, vee ? 0.23 : 0.36]} r={0.012} p={[1.3, 0.65, vee ? -0.115 : 0]}>
                <Mat color="#8a9097" metal={0.65} rough={0.5} />
              </RB>
            </Bank>,
          )}
          <Bank bank={vee ? -1 : 0}>{!installed('rocker') && bolts('cyl_head', [1.04, 1.3, 1.56].flatMap((x) => [-0.07, 0.07].map((dz) => [x, 0.69, (vee ? -0.115 : 0) + dz] as V3)))}</Bank>
          {/* Getriebe hinter dem Motor – nur von unten und nur mit dem Getriebeheber */}
          {part(
            'gearbox',
            <>
              <mesh position={[0.9, 0.228, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.085, 0.1, 0.12, 14]} />
                <Mat color="#8d9399" metal={0.75} rough={0.5} />
              </mesh>
              <mesh position={[0.68, 0.2, 0]}>
                <boxGeometry args={[0.34, 0.15, 0.27]} />
                <Mat color={st('gearbox')?.condition === 'defect' && st('gearbox')?.known ? '#6e5a4a' : '#9aa0a7'} metal={0.75} rough={0.5} />
              </mesh>
            </>,
          )}
          {/* versetzt angeordnet, damit von schräg vorn keine Schraube die andere verdeckt */}
          {bolts('gearbox', [[0.58, 0.122, -0.11], [0.78, 0.122, -0.03], [0.58, 0.122, 0.11], [0.78, 0.122, 0.03]], 'y-')}
          {/* Zylinderkopf: Reihenmotor ein Ventildeckel, V-Motor je Bank einer */}
          {(vee ? ([['valve_cover', 'gasket', -1], ['valve_cover_b', 'gasket_b', 1]] as const) : ([['valve_cover', 'gasket', 0]] as const)).map(([cover, gasket, bank]) => (
            <Bank key={cover} bank={bank}>
              {part(
                gasket,
                <mesh position={[1.3, 0.69, bank * 0.105]}>
                  <boxGeometry args={[0.73, 0.02, bank ? 0.19 : 0.39]} />
                  <Mat color={st(gasket)?.condition === 'defect' ? '#3a2412' : '#16171a'} rough={0.9} />
                </mesh>,
              )}
              {part(
                cover,
                <>
                  <RB s={[0.7, 0.08, bank ? 0.17 : 0.36]} r={0.022} p={[1.3, 0.74, bank * 0.105]}>
                    <Mat color={diesel ? '#23252a' : '#2b2e33'} metal={0.5} rough={0.45} />
                  </RB>
                  {/* Versteifungsrippen und Öleinfülldeckel */}
                  {[1.06, 1.3, 1.54].map((x) => (
                    <RB key={x} s={[0.02, 0.012, bank ? 0.13 : 0.3]} r={0.005} p={[x + 0.06, 0.781, bank * 0.105]}>
                      <Mat color={diesel ? '#2b2e33' : '#34383e'} metal={0.5} rough={0.45} />
                    </RB>
                  ))}
                  {bank <= 0 && (
                    <group position={[1.15, 0.79, bank ? -0.165 : -0.135]}>
                      <mesh>
                        <cylinderGeometry args={[0.03, 0.034, 0.022, 12]} />
                        <Mat color="#0e0f11" rough={0.6} />
                      </mesh>
                      <mesh position={[0, 0.012, 0]}>
                        <boxGeometry args={[0.05, 0.008, 0.012]} />
                        <Mat color="#e3b21c" rough={0.6} />
                      </mesh>
                    </group>
                  )}
                </>,
              )}
              {bolts(cover, bank ? bankBolts(bank, engine.cylinders) : COVER_BOLTS)}
            </Bank>
          ))}
          {/* Ventiltrieb unter dem Ventildeckel (beim V-Motor unter dem der Bank 1) */}
          <Bank bank={vee ? -1 : 0}>
            {!installed('valve_cover') &&
              part(
                'rocker',
                <>
                  <mesh position={[1.3, 0.72, vee ? -0.105 : 0.1]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[0.016, 0.016, 0.62, 8]} />
                    <Mat color={st('rocker')?.condition === 'defect' ? '#6e5a4a' : '#aeb3ba'} metal={0.85} rough={0.35} />
                  </mesh>
                  {/* Nocken und Lagerböcke */}
                  {slots.filter((c) => c.bank <= 0).map((c) => (
                    <RB key={c.n} s={[0.04, 0.045, 0.05]} r={0.012} p={[c.x + 0.04, 0.72, vee ? -0.105 : 0.1]}>
                      <Mat color={st('rocker')?.condition === 'defect' ? '#6e5a4a' : '#c2c7cd'} metal={0.9} rough={0.3} />
                    </RB>
                  ))}
                  <mesh position={[1.3, 0.72, vee ? -0.105 : 0.1]}>
                    <boxGeometry args={[0.62, 0.04, 0.07]} />
                    <primitive object={HIT_MAT} attach="material" />
                  </mesh>
                </>,
              )}
            {!installed('valve_cover') && bolts('rocker', [[1.12, 0.74, vee ? -0.105 : 0.1], [1.48, 0.74, vee ? -0.105 : 0.1]])}
          </Bank>
          {part(
            'engine_cover',
            <>
              <RB s={[0.66, 0.024, vee ? 0.46 : 0.34]} r={0.011} p={[1.28, 0.862, 0]}>
                <Mat color="#1c1e22" rough={0.5} />
              </RB>
              {/* Eine Sicke je Zylinder */}
              {slots.map((c) => (
                <RB key={c.n} s={[0.05, 0.01, vee ? 0.15 : 0.12]} r={0.004} p={[c.x - 0.02, 0.875, vee ? c.bank * 0.14 : 0.105 * (c.n % 2 ? 1 : -1)]}>
                  <Mat color="#25282d" rough={0.45} />
                </RB>
              ))}
              {/* Zierleisten verraten die Bauart: eine je Zylinderbank, beim Diesel blau, beim Turbo rot abgesetzt */}
              {(vee ? [-0.12, 0.12] : [0]).map((z) => (
                <mesh key={z} position={[1.28, 0.874, z]}>
                  <boxGeometry args={[0.07 * engine.cylinders / (vee ? 2 : 1), 0.006, 0.07]} />
                  <Mat color={diesel ? '#2f6fb0' : engine.turbo ? '#b3261e' : '#8d9399'} metal={0.8} rough={0.3} />
                </mesh>
              ))}
            </>,
          )}
          {part(
            'intake_hose',
            <group position={[0, 0, wide]}>
              <mesh position={[1.28, 0.62, 0.262]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.042, 0.042, 0.16, 14]} />
                <Mat color="#151517" rough={0.9} />
              </mesh>
              {intakeBad && (
                <mesh position={[1.28, 0.662, 0.27]}>
                  <boxGeometry args={[0.05, 0.006, 0.012]} />
                  <meshStandardMaterial color="#000000" roughness={1} />
                </mesh>
              )}
            </group>,
          )}
          {bolts('intake_hose', [[1.28, 0.66, 0.215 + wide]])}
          {part(
            'chain_tensioner',
            <group position={[0, 0, -wide]}>
              <mesh position={[1.45, 0.6, -0.215]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.03, 0.03, 0.07, 6]} />
                <Mat color="#c9a54a" metal={0.85} rough={0.35} />
              </mesh>
              <group position={[1.45, 0.6, -0.23]}>
                <Hit r={0.05} />
              </group>
            </group>,
          )}
          {/* Je Zylinder: Benziner Zündspule über der Kerze, Diesel Einspritzdüse über der Glühkerze */}
          {slots.map(({ n, x, z, bank }) => {
            const top = diesel ? `inj${n}` : `coil${n}`;
            const low = diesel ? `glow${n}` : `plug${n}`;
            const lowBad = st(low)?.condition === 'defect';
            // Reihenmotor: Schraube auf der einen, Stecker auf der anderen Seite. V-Motor: Schraube innen zum V hin, Stecker außen.
            const boltPos: V3 = bank ? [x + 0.05, 0.78, z - bank * 0.06] : [x, 0.78, -0.085];
            const out = bank || 1;
            // Ohne Zylinderkopf gibt es an dieser Bank nichts einzusetzen.
            if (bank <= 0 && !installed('cyl_head')) return null;
            return (
              <Bank key={n} bank={bank}>
                {!installed(top) &&
                  part(
                    low,
                    <>
                      <mesh position={[x, 0.75, z]}>
                        <cylinderGeometry args={diesel ? [0.01, 0.01, 0.1, 8] : [0.018, 0.018, 0.1, 10]} />
                        <Mat color={lowBad ? '#4a4038' : diesel ? '#c9a54a' : '#f0efe9'} metal={diesel ? 0.8 : 0.2} rough={0.4} />
                      </mesh>
                      <mesh position={[x, 0.805, z]}>
                        <cylinderGeometry args={diesel ? [0.016, 0.016, 0.022, 6] : [0.022, 0.022, 0.025, 6]} />
                        <Mat color="#b9bec5" metal={0.9} rough={0.3} />
                      </mesh>
                      {!diesel && (
                        <mesh position={[x, 0.825, z]}>
                          <cylinderGeometry args={[0.006, 0.008, 0.02, 6]} />
                          <Mat color="#8d9399" metal={0.9} rough={0.3} />
                        </mesh>
                      )}
                      <group position={[x, 0.79, z]}>
                        <Hit r={0.032} />
                      </group>
                    </>,
                  )}
                {part(
                  top,
                  diesel ? (
                    <>
                      <mesh position={[x, 0.805, z]}>
                        <cylinderGeometry args={[0.024, 0.03, 0.075, 10]} />
                        <Mat color="#aeb3ba" metal={0.85} rough={0.3} />
                      </mesh>
                      <mesh position={[x, 0.85, z + out * 0.02]}>
                        <boxGeometry args={[0.04, 0.022, 0.09]} />
                        <Mat color="#1b1d21" rough={0.6} />
                      </mesh>
                      {/* Stück der Einspritzleitung */}
                      <mesh position={[x, 0.83, z - out * 0.035]} rotation={[Math.PI / 2, 0, 0]}>
                        <cylinderGeometry args={[0.006, 0.006, 0.05, 6]} />
                        <Mat color="#d9dde2" metal={0.95} rough={0.2} />
                      </mesh>
                    </>
                  ) : (
                    <>
                      <mesh position={[x, 0.8, z]}>
                        <cylinderGeometry args={[0.034, 0.036, 0.06, 14]} />
                        <Mat color="#101113" rough={0.5} />
                      </mesh>
                      <RB s={[0.06, 0.03, 0.11]} r={0.009} p={[x, 0.835, z + out * 0.02]}>
                        <Mat color="#c8501e" rough={0.55} />
                      </RB>
                      <mesh position={[x, 0.851, z + out * 0.005]}>
                        <boxGeometry args={[0.04, 0.003, 0.05]} />
                        <Mat color="#1b1d21" rough={0.6} />
                      </mesh>
                    </>
                  ),
                )}
                {bolts(top, [boltPos])}
                {connector(top, [x, 0.838, z + out * 0.095], [0, 0.03, out * 0.06])}
              </Bank>
            );
          })}

          {/* Aufladung: Ladeluftrohr quer vor dem Motor, dahinter der Turbolader */}
          {st('charge_pipe') &&
            part(
              'charge_pipe',
              <>
                <mesh position={[1.56, 0.7, 0.52]} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.032, 0.032, 0.3, 12]} />
                  <Mat color="#9aa0a7" metal={0.85} rough={0.3} />
                </mesh>
                <mesh position={[1.69, 0.7, 0.52]} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.039, 0.039, 0.075, 12]} />
                  <Mat color={st('charge_pipe')?.condition === 'defect' ? '#3a2a18' : '#151517'} rough={0.9} />
                </mesh>
              </>,
            )}
          {st('charge_pipe') && bolts('charge_pipe', [[1.69, 0.745, 0.52]])}
          {st('turbo') &&
            part(
              'turbo',
              <>
                {/* Verdichter (Alu) mit Schneckengehäuse und Ansaugstutzen */}
                <mesh position={[1.8, 0.66, 0.46]} rotation={[0, Math.PI / 2, 0]}>
                  <torusGeometry args={[0.058, 0.03, 8, 20]} />
                  <Mat color="#b4b9bf" metal={0.9} rough={0.35} />
                </mesh>
                <mesh position={[1.8, 0.66, 0.46]} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.06, 0.06, 0.06, 16]} />
                  <Mat color="#b4b9bf" metal={0.9} rough={0.35} />
                </mesh>
                {/* Turbine (Guss) und Lagergehäuse */}
                <mesh position={[1.72, 0.66, 0.46]} rotation={[0, Math.PI / 2, 0]}>
                  <torusGeometry args={[0.048, 0.027, 8, 18]} />
                  <Mat color="#5a4a3c" metal={0.7} rough={0.65} />
                </mesh>
                <mesh position={[1.74, 0.66, 0.46]} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.045, 0.045, 0.09, 14]} />
                  <Mat color="#5a4a3c" metal={0.7} rough={0.6} />
                </mesh>
                <mesh position={[1.85, 0.66, 0.46]} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.035, 0.04, 0.04, 14]} />
                  <Mat color="#1b1d21" rough={0.5} />
                </mesh>
                {/* Ladedruckdose */}
                <mesh position={[1.8, 0.6, 0.55]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.03, 0.03, 0.035, 10]} />
                  <Mat color="#c9a54a" metal={0.8} rough={0.4} />
                </mesh>
              </>,
            )}
          {st('turbo') && bolts('turbo', [[1.73, 0.735, 0.46], [1.8, 0.75, 0.42], [1.8, 0.75, 0.5]])}
          {/* Diesel: Abgasrückführung am Kopf, Partikelfilter unter dem Wagenboden */}
          {st('egr') &&
            part(
              'egr',
              <>
                <mesh position={[0.97, 0.72, 0.28 + wide]}>
                  <boxGeometry args={[0.1, 0.08, 0.09]} />
                  <Mat color="#8a9097" metal={0.75} rough={0.45} />
                </mesh>
                <mesh position={[0.97, 0.775, 0.28 + wide]}>
                  <cylinderGeometry args={[0.032, 0.032, 0.035, 12]} />
                  <Mat color="#1b1d21" rough={0.6} />
                </mesh>
              </>,
            )}
          {st('egr') && bolts('egr', [[0.925, 0.765, 0.245 + wide], [1.015, 0.765, 0.315 + wide]])}
          {st('egr') && connector('egr', [0.97, 0.8, 0.28 + wide], [-0.05, 0.04, 0.04])}
          {st('dpf') &&
            part(
              'dpf',
              <>
                <mesh position={[0.72, 0.215, -0.28]} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.075, 0.075, 0.36, 16]} />
                  <Mat color={st('dpf')?.condition === 'defect' ? '#3d3a35' : '#8d9399'} metal={0.8} rough={0.5} />
                </mesh>
                {[-1, 1].map((k) => (
                  <mesh key={k} position={[0.72 + k * 0.23, 0.215, -0.28]} rotation={[0, 0, Math.PI / 2]}>
                    <cylinderGeometry args={[0.03, 0.03, 0.12, 10]} />
                    <Mat color="#6f757c" metal={0.8} rough={0.5} />
                  </mesh>
                ))}
              </>,
            )}
          {st('dpf') && bolts('dpf', [[0.58, 0.15, -0.28], [0.86, 0.15, -0.28]], 'y-')}

          {/* Riementrieb und Nebenaggregate */}
          {part(
            'belt',
            <>
              <mesh geometry={beltGeometry()} position={[1.69, 0, 0]}>
                <Mat color={beltBad ? '#3b332b' : '#0d0d0e'} rough={0.95} />
              </mesh>
              {beltBad &&
                [-0.18, -0.05, 0.1, 0.21].map((z) => (
                  <mesh key={z} position={[1.69, 0.636, z]}>
                    <boxGeometry args={[0.03, 0.004, 0.006]} />
                    <meshStandardMaterial color="#8a7f70" roughness={1} />
                  </mesh>
                ))}
              <mesh position={[1.7, 0.55, 0]}>
                <boxGeometry args={[0.05, 0.2, 0.56]} />
                <primitive object={HIT_MAT} attach="material" />
              </mesh>
            </>,
          )}
          {part(
            'alternator',
            <>
              <mesh position={[1.58, 0.58, 0.27]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.075, 0.075, 0.15, 18]} />
                <Mat color="#b4b9bf" metal={0.8} rough={0.45} />
              </mesh>
              {[-0.05, -0.025, 0, 0.025, 0.05].map((dx) => (
                <mesh key={dx} position={[1.58 + dx, 0.58, 0.27]} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.079, 0.079, 0.008, 18]} />
                  <Mat color="#8a9097" metal={0.8} rough={0.5} />
                </mesh>
              ))}
              <RB s={[0.16, 0.03, 0.09]} r={0.01} p={[1.58, 0.665, 0.27]}>
                <Mat color="#8a9097" metal={0.7} rough={0.5} />
              </RB>
              <mesh position={[1.69, 0.58, 0.27]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.042, 0.042, 0.03, 16]} />
                <Mat color="#6f757c" metal={0.8} rough={0.4} />
              </mesh>
            </>,
          )}
          {bolts('alternator', [[1.53, 0.68, 0.27], [1.63, 0.68, 0.27]])}
          {connector('alternator', [1.48, 0.6, 0.3], [-0.05, 0.05, 0.03])}
          {part(
            'water_pump',
            <>
              <RB s={[0.14, 0.16, 0.16]} r={0.035} p={[1.58, 0.58, -0.3]}>
                <Mat color="#9aa0a7" metal={0.7} rough={0.5} />
              </RB>
              <mesh position={[1.645, 0.58, -0.3]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.062, 0.07, 0.03, 16]} />
                <Mat color="#aeb3ba" metal={0.75} rough={0.45} />
              </mesh>
              <mesh position={[1.69, 0.58, -0.3]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.048, 0.048, 0.03, 16]} />
                <Mat color="#6f757c" metal={0.8} rough={0.4} />
              </mesh>
            </>,
          )}
          {bolts('water_pump', [[1.53, 0.66, -0.35], [1.63, 0.66, -0.35], [1.53, 0.66, -0.25], [1.63, 0.66, -0.25]])}
          {part(
            'thermostat',
            <>
              <RB s={[0.17, 0.1, 0.1]} r={0.03} p={[1.3, 0.6, -0.235 - wide]}>
                <Mat color="#a7adb4" metal={0.75} rough={0.45} />
              </RB>
              <mesh position={[1.32, 0.63, -0.3 - wide]} rotation={[0.9, 0, 0]}>
                <cylinderGeometry args={[0.028, 0.028, 0.09, 10]} />
                <Mat color="#a7adb4" metal={0.75} rough={0.45} />
              </mesh>
            </>,
          )}
          {bolts('thermostat', [[1.235, 0.65, -0.235 - wide], [1.365, 0.65, -0.235 - wide]])}
          {part(
            'hose',
            <>
              <mesh position={[1.565, 0.69, -0.45]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.03, 0.03, 0.47, 12]} />
                <Mat color="#151517" rough={0.85} />
              </mesh>
              <mesh position={[1.34, 0.675, -0.375]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.03, 0.03, 0.2, 10]} />
                <Mat color="#151517" rough={0.85} />
              </mesh>
              <mesh position={[1.335, 0.69, -0.45]}>
                <sphereGeometry args={[0.031, 10, 8]} />
                <Mat color="#151517" rough={0.85} />
              </mesh>
              {/* Schlauchschellen */}
              {[1.4, 1.76].map((x) => (
                <mesh key={x} position={[x, 0.69, -0.45]} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.033, 0.033, 0.014, 12]} />
                  <Mat color="#c9cdd2" metal={0.9} rough={0.3} />
                </mesh>
              ))}
            </>,
          )}
          {bolts('hose', [[1.42, 0.72, -0.45]])}

          {draining && (
            <mesh position={[1.4, 0.185 - 0.84, 0.08]} raycast={noRay}>
              <cylinderGeometry args={[0.009, 0.005, 1.68, 6]} />
              <meshStandardMaterial color="#0d0905" metalness={0.9} roughness={0.08} />
            </mesh>
          )}
          {/* Unter dem Motor – nur von der Hebebühne aus erreichbar */}
          {part(
            'oil_pan_gasket',
            <mesh position={[1.3, 0.274, 0]}>
              <boxGeometry args={[0.52, 0.012, 0.32]} />
              <Mat color={oilLeak ? '#3a2412' : '#16171a'} rough={0.9} />
            </mesh>,
          )}
          {!installed('oil_pan') &&
            part(
              'bearing',
              <mesh position={[1.3, 0.248, 0]}>
                <boxGeometry args={[0.14, 0.035, 0.16]} />
                <Mat color={st('bearing')?.condition === 'defect' ? '#a8703a' : '#aeb3ba'} metal={0.85} rough={0.35} />
              </mesh>,
            )}
          {!installed('oil_pan') && bolts('bearing', [[1.3, 0.23, -0.06], [1.3, 0.23, 0.06]], 'y-')}
          {part(
            'oil_pan',
            <>
              <RB s={[0.5, 0.066, 0.3]} r={0.02} p={[1.3, 0.235, 0]}>
                <Mat color={oilLeak ? '#3d3a35' : '#7b8188'} metal={0.7} rough={oilLeak ? 0.25 : 0.5} />
              </RB>
              {/* Kühlrippen an der Unterseite */}
              {[1.16, 1.23, 1.3].map((x) => (
                <mesh key={x} position={[x, 0.2, -0.02]}>
                  <boxGeometry args={[0.012, 0.01, 0.2]} />
                  <Mat color={oilLeak ? '#3d3a35' : '#70767d'} metal={0.7} rough={0.5} />
                </mesh>
              ))}
            </>,
          )}
          {bolts('oil_pan', [[1.1, 0.202, -0.12], [1.5, 0.202, -0.12], [1.1, 0.202, 0.12], [1.5, 0.202, 0.12]], 'y-')}
          {installed('oil_pan') &&
            part(
              'drain_plug',
              <>
                {/* sitzt seitlich am Wannenrand, damit die Wannenmitte antippbar bleibt */}
                <mesh position={[1.4, 0.193, 0.08]}>
                  <cylinderGeometry args={[0.026, 0.026, 0.022, 6]} />
                  <Mat color="#c9a54a" metal={0.9} rough={0.3} />
                </mesh>
                <group position={[1.4, 0.185, 0.08]}>
                  <Hit r={0.035} />
                </group>
              </>,
            )}
        </>
      )}

      {/* Motorhaube, Scharnier an der Windschutzscheibe */}
      <group ref={hood} position={[HOOD_X0, S.crown(HOOD_X0), 0]}>
        <mesh
          geometry={geo.hood}
          material={hoodMats}
          castShadow
          userData={{ label: interactive || (hoodTap && handlers) ? (hoodOpen ? 'Motorhaube schließen' : 'Motorhaube öffnen') : undefined }}
          onClick={interactive || (hoodTap && handlers) ? tap(handlers!.onHood) : bodyTap}
        />
      </group>

      {frontCorner('fl')}
      {frontCorner('fr')}
    </group>
  );
}
