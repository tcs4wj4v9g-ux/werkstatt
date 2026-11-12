import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { COMPONENT_MAP } from '../game/data/components';
import { dirtLevel, shineLevel, visibleDirt } from '../game/detail';
import { beneath, blockersRemoved, installReady, removable } from '../game/repair';
import { useGame } from '../game/store';
import type { BodyStyle, CarInstance, FluidId, ToolId, ZoneId } from '../game/types';
import { carGeometry, HOOD_X0, roundedRect, topY } from './carGeometry';

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
const ghostTap = (id: string, fn: () => void) => (e: ThreeEvent<MouseEvent>) => {
  const under = beneath(id);
  if (e.intersections.some((i) => under.includes(liveId(i.object) ?? ''))) return;
  tap(fn)(e);
};

/** Platzhalter schweben etwas neben der Einbauposition, damit das Teil darunter erreichbar bleibt. */
const GHOST_LIFT: Record<string, number> = { valve_cover: 0.14, caliper_fl: 0.12, caliper_fr: 0.12, oil_pan: -0.14, engine_cover: 0.36 };

type Axis = 'y' | 'y-' | 'z+' | 'z-' | 'x+';
const AXIS_ROT: Record<Axis, V3> = {
  y: [0, 0, 0],
  'y-': [Math.PI, 0, 0],
  'z+': [Math.PI / 2, 0, 0],
  'z-': [-Math.PI / 2, 0, 0],
  'x+': [0, 0, -Math.PI / 2],
};

/** Unsichtbare Trefferfläche für kleine Teile. */
const Hit = ({ r = 0.046 }: { r?: number }) => (
  <mesh>
    <sphereGeometry args={[r, 8, 6]} />
    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
  </mesh>
);

/** Schraube: 2 = fest, 1 = gelöst (steht sichtbar heraus), 0 = entfernt (grüne Markierung am Gewinde). */
function Bolt({ pos, axis = 'y', state, live, label, onTap }: { pos: V3; axis?: Axis; state: number; live?: string; label: string; onTap?: () => void }) {
  const text = `${label} (${state === 2 ? 'fest' : state === 1 ? 'gelöst' : 'entfernt'})`;
  return (
    <group position={pos} rotation={AXIS_ROT[axis]} userData={{ liveId: live, label: onTap ? text : undefined }} onClick={onTap && tap(onTap)}>
      {state > 0 ? (
        <group position={[0, state === 1 ? 0.03 : 0.012, 0]} rotation={[state === 1 ? 0.22 : 0, 0, 0]}>
          <mesh>
            <cylinderGeometry args={[0.02, 0.02, 0.03, 6]} />
            <meshStandardMaterial color={state === 1 ? '#e8c35a' : '#d9dde2'} metalness={0.9} roughness={0.25} />
          </mesh>
          {state === 1 && (
            <mesh position={[0, -0.025, 0]}>
              <cylinderGeometry args={[0.009, 0.009, 0.03, 6]} />
              <meshStandardMaterial color="#8d9399" metalness={0.9} roughness={0.4} />
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
  return (
    <group position={p} userData={{ label: onTap ? `Stecker ${label} (${connected ? 'verbunden' : 'abgezogen'})` : undefined }} onClick={onTap && tap(onTap)}>
      <mesh>
        <boxGeometry args={[0.045, 0.03, 0.04]} />
        <meshStandardMaterial color={connected ? '#3a3f46' : '#e3a81c'} roughness={0.6} />
      </mesh>
      {onTap && <Hit r={0.04} />}
    </group>
  );
}

const COIL_X = [1.03, 1.21, 1.39, 1.57];
const COVER_BOLTS: V3[] = [1.0, 1.3, 1.6].flatMap((x) => [-0.15, 0.15].map((z) => [x, 0.78, z] as V3));
const WX = 1.38; // Radmitte vorn/hinten (±)
const WZ = 0.8;
const WY = 0.33;
const DIRT = new THREE.Color('#5b4a36');
const RUST = new THREE.Color('#6a3414');
const FOAM = new THREE.Color('#f4f6f8');

// Einmal erzeugte Formen für Leuchten und Grill.
const lampGeo = roundedRect(0.36, 0.105, 0.04, 0.05);
const tailGeo = roundedRect(0.4, 0.12, 0.035, 0.04);
const lampInner = roundedRect(0.33, 0.08, 0.03, 0.054);
const kidneyGeo = roundedRect(0.26, 0.125, 0.045, 0.03);
const kidneyInner = roundedRect(0.225, 0.094, 0.032, 0.034);

/** Karosseriebereich zu einem Punkt in Fahrzeugkoordinaten. */
export function zoneAt(x: number, y: number, z: number): ZoneId {
  if (y > 1.02 && x < 0.85 && x > -2.25) return 'top';
  if (x > 1.0) return 'front';
  if (x < -1.35) return 'rear';
  return z < 0 ? 'left' : 'right';
}

/** Rad mit Niederquerschnittsreifen, Felgenbett und fünf Doppelspeichen. `out` = Außenseite (+1/-1). */
function WheelMeshes({ geo, out, dirt = 0 }: { geo: THREE.BufferGeometry; out: number; dirt?: number }) {
  const rim = useMemo(() => '#' + new THREE.Color('#cdd2d8').lerp(DIRT, dirt * 0.8).getHexString(), [dirt]);
  const rough = 0.22 + dirt * 0.6;
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <mesh geometry={geo} castShadow>
        <Mat color="#151617" rough={0.93} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[0.232, 0.232, 0.19, 32, 1, true]} />
        <meshStandardMaterial color="#8f959c" metalness={0.9} roughness={0.35} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, out * 0.094, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.226, 0.012, 8, 36]} />
        <Mat color={rim} metal={0.95} rough={rough} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <group key={i} rotation={[0, (i / 5) * Math.PI * 2 + 0.31, 0]}>
          {[-0.03, 0.03].map((o) => (
            <mesh key={o} position={[o * 0.9, out * 0.084, 0.135]} rotation={[0, -o * 3.2, 0]}>
              <boxGeometry args={[0.018, 0.016, 0.19]} />
              <Mat color={rim} metal={0.95} rough={rough} />
            </mesh>
          ))}
        </group>
      ))}
      <mesh position={[0, out * 0.082, 0]}>
        <cylinderGeometry args={[0.06, 0.07, 0.03, 20]} />
        <Mat color={rim} metal={0.95} rough={rough} />
      </mesh>
      <mesh position={[0, out * 0.099, 0]}>
        <cylinderGeometry args={[0.028, 0.028, 0.006, 16]} />
        <Mat color="#1b1d21" metal={0.6} rough={0.4} />
      </mesh>
    </group>
  );
}

/** Färbt die Karosserie-Eckpunkte je Bereich: Lackfarbe, Schmutz, Schaum, Rostflecken. */
function tint(geo: THREE.BufferGeometry, car: CarInstance | undefined, base: string, offsetX = 0, offsetY = 0) {
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
    const z = pos.getZ(i);
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

export function CarModel({ body, color, car, handlers, tool = 'hand', lod = 'full', steer }: Props) {
  const shared = useMemo(() => carGeometry(body), [body]);
  // Eigene Kopien je Auto, weil jede Karosserie ihre eigene Einfärbung trägt.
  const geo = useMemo(() => ({ shell: shared.shell.clone(), cabin: shared.cabin.clone(), hood: shared.hood.clone(), tire: shared.tire }), [shared, car?.uid]);
  useEffect(() => () => [geo.shell, geo.cabin, geo.hood].forEach((g) => g.dispose()), [geo]);

  const root = useRef<THREE.Group>(null);
  const hood = useRef<THREE.Group>(null);
  const wheelFL = useRef<THREE.Group>(null);
  const wheelFR = useRef<THREE.Group>(null);
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
    tint(geo.hood, car, color, HOOD_X0, topY(HOOD_X0));
  }, [geo, color, zoneKey]);

  const mats = useMemo(
    () => ({
      paint: new THREE.MeshPhysicalMaterial({ color: '#ffffff', vertexColors: true, metalness: 0.6, side: THREE.DoubleSide }),
      solid: new THREE.MeshPhysicalMaterial({ metalness: 0.6, roughness: 0.4, clearcoat: 0.8 }),
      glass: new THREE.MeshPhysicalMaterial({ metalness: 0.2, transparent: true, side: THREE.DoubleSide }),
      dark: new THREE.MeshStandardMaterial({ color: '#111214', roughness: 0.85 }),
      trim: new THREE.MeshStandardMaterial({ color: '#0c0d0f', roughness: 0.45, metalness: 0.4 }),
      seat: new THREE.MeshStandardMaterial({ color: '#3a342c', roughness: 0.9 }),
      chrome: new THREE.MeshStandardMaterial({ color: '#dfe3e8', roughness: 0.16, metalness: 1 }),
      lens: new THREE.MeshPhysicalMaterial({ color: '#15171b', metalness: 0.7, roughness: 0.08, clearcoat: 1 }),
      reflector: new THREE.MeshStandardMaterial({ color: '#c3cad3', metalness: 1, roughness: 0.18 }),
      ring: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#f3f8ff', emissiveIntensity: 1.6 }),
      tail: new THREE.MeshPhysicalMaterial({ color: '#7d0c10', roughness: 0.12, clearcoat: 1, emissive: '#ff1a1a', emissiveIntensity: 0.35 }),
      tailBar: new THREE.MeshStandardMaterial({ color: '#ff3b30', emissive: '#ff2a1a', emissiveIntensity: 1.3 }),
      amber: new THREE.MeshStandardMaterial({ color: '#f0a020', emissive: '#f08a00', emissiveIntensity: 0.4, roughness: 0.3 }),
    }),
    [],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  // Pflegezustand wirkt auf Glanz und Spiegelung.
  mats.paint.roughness = 0.34 + dirt * 0.5 - shine * 0.12;
  mats.paint.clearcoat = (1 - dirt) * (0.25 + 0.75 * shine);
  mats.paint.clearcoatRoughness = 0.06 + (1 - shine) * 0.3;
  mats.solid.color.set(color).lerp(DIRT, dirt * 0.6);
  mats.glass.color.set('#0b1217').lerp(DIRT, glassDirt * 0.5);
  mats.glass.roughness = 0.04 + glassDirt * 0.55;
  mats.glass.opacity = 0.55 + glassDirt * 0.3;

  useFrame((_, dt) => {
    if (hood.current) {
      const target = hoodOpen ? 1.12 : 0;
      hood.current.rotation.z += (target - hood.current.rotation.z) * Math.min(1, dt * 7);
    }
    if (steer) {
      for (const w of [wheelFL.current, wheelFR.current]) if (w) w.rotation.y = steer.current * 0.45;
    }
  });

  const st = (id: string) => car?.components[id];
  const installed = (id: string) => st(id)?.installed ?? true;
  const interactive = !!car && !!handlers && full;

  /** Passt das aktive Werkzeug zum Herausnehmen dieses Teils? */
  const toolFitsPart = (id: string) => {
    const need = COMPONENT_MAP[id].removeWith;
    return tool === 'lamp' || (need ? tool === need.driver : tool === 'hand');
  };
  const toolFitsBolt = (id: string) => {
    const need = COMPONENT_MAP[id].fastener;
    return !!need && (tool === need.driver || tool === 'hand' || tool === 'lamp' || (!!need.torque && tool === 'torque'));
  };

  /** Ausbaubares Bauteil: eingebaut = echtes Teil, ausgebaut = grüner Platzhalter zum Einbauen. */
  const part = (id: string, children: ReactNode) => {
    const s = st(id);
    const name = COMPONENT_MAP[id].name;
    if (!s || s.installed) {
      const defect = !!s && s.known && s.condition === 'defect';
      const live = interactive && removable(car!, id) && toolFitsPart(id) ? id : undefined;
      return (
        <GhostCtx.Provider value={defect ? 'defect' : 'normal'}>
          <group userData={{ liveId: live, label: interactive ? name : undefined }} onClick={interactive ? tap(() => handlers!.onComponent(id)) : undefined}>
            {children}
          </group>
        </GhostCtx.Provider>
      );
    }
    if (!interactive || !installReady(car!, id) || !blockersRemoved(car!, id)) return null;
    return (
      <GhostCtx.Provider value="ghost">
        <group
          position={[0, GHOST_LIFT[id] ?? 0, 0]}
          userData={{ label: `${name} einbauen` }}
          onClick={ghostTap(id, () => handlers!.onComponent(id))}
        >
          {children}
        </group>
      </GhostCtx.Provider>
    );
  };

  const bolts = (id: string, positions: V3[], axis: Axis = 'y') =>
    installed(id) &&
    positions.map((p, i) => (
      <Bolt
        key={i}
        pos={p}
        axis={axis}
        state={st(id)?.bolts[i] ?? 2}
        label={`Schraube – ${COMPONENT_MAP[id].name}`}
        live={interactive && blockersRemoved(car!, id) && toolFitsBolt(id) ? id : undefined}
        onTap={interactive ? () => handlers!.onBolt(id, i) : undefined}
      />
    ));

  const connector = (id: string, pos: V3, off: V3) =>
    installed(id) && (
      <Connector pos={pos} off={off} connected={st(id)?.connected ?? true} label={COMPONENT_MAP[id].name} onTap={interactive ? () => handlers!.onConnector(id) : undefined} />
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
    const z = (d: number) => sign * d;
    const wheelRef = s === 'fl' ? wheelFL : wheelFR;
    if (!full) {
      return (
        <group key={s} ref={wheelRef} position={[WX, WY, z(WZ)]} onClick={wheelTap}>
          <WheelMeshes geo={geo.tire} out={sign} dirt={wheelDirt} />
          <mesh position={[0, 0, -z(0.08)]} rotation={[Math.PI / 2, 0, 0]}>
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
    return (
      <group key={s}>
        <mesh position={[WX, WY, z(0.69)]} rotation={[Math.PI / 2, 0, 0]} material={mats.dark}>
          <cylinderGeometry args={[0.06, 0.06, 0.1, 14]} />
        </mesh>
        {part(
          `disc_${s}`,
          <>
            <mesh position={[WX, WY, z(0.72)]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.17, 0.17, 0.024, 32]} />
              <Mat color={scored ? '#6e5a4a' : '#a9aeb4'} metal={0.9} rough={scored ? 0.7 : 0.3} />
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
          <mesh position={[WX, cy, z(0.725)]}>
            <boxGeometry args={[0.2, 0.12, 0.11]} />
            <Mat color="#8a9097" metal={0.7} rough={0.45} />
          </mesh>,
        )}
        {bolts(`caliper_${s}`, [[WX - 0.06, cy, z(0.78)], [WX + 0.06, cy, z(0.78)]], axis)}
        <group ref={wheelRef} position={[WX, WY, z(WZ)]}>
          {part(`wheel_${s}`, <WheelMeshes geo={geo.tire} out={sign} dirt={wheelDirt} />)}
          <group position={[-WX, -WY, -z(WZ)]}>{bolts(`wheel_${s}`, lug, axis)}</group>
        </group>
      </group>
    );
  };

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
        <mesh geometry={geo.cabin} material={[mats.paint, mats.glass]} castShadow />
        <mesh position={[0.02, 0.32, 0]} material={mats.dark}>
          <boxGeometry args={[4.3, 0.08, 1.3]} />
        </mesh>
        <mesh position={[0.79, 0.67, 0]} material={mats.dark}>
          <boxGeometry args={[0.03, 0.64, 1.5]} />
        </mesh>

        {/* Front: Doppelscheinwerfer mit Leuchtringen, zweigeteilter Grill, Lufteinlässe */}
        {[-1, 1].map((k) => (
          <group key={k}>
            <group position={[2.262, 0.668, k * 0.585]} rotation={[0, Math.PI / 2 - k * 0.3, 0]}>
              <mesh geometry={lampGeo} material={mats.lens} position={[0, 0, -0.02]} />
              <mesh geometry={lampInner} material={mats.reflector} position={[0, 0, -0.02]} />
              {[-0.085, 0.07].map((o) => (
                <group key={o} position={[k * o, 0, 0.036]}>
                  <mesh material={mats.ring}>
                    <torusGeometry args={[0.036, 0.007, 8, 24]} />
                  </mesh>
                  <mesh material={mats.lens} scale={[1, 1, 0.5]}>
                    <sphereGeometry args={[0.027, 12, 10]} />
                  </mesh>
                </group>
              ))}
              <mesh position={[k * -0.155, 0, 0.03]} material={mats.amber}>
                <boxGeometry args={[0.035, 0.06, 0.012]} />
              </mesh>
            </group>
            {/* Grillhälfte mit Chromrahmen und senkrechten Stäben */}
            <group position={[2.292, 0.642, k * 0.142]} rotation={[0, Math.PI / 2, 0]}>
              <mesh geometry={kidneyGeo} material={mats.chrome} />
              <mesh geometry={kidneyInner} material={mats.trim} />
              {[-0.075, -0.045, -0.015, 0.015, 0.045, 0.075].map((o) => (
                <mesh key={o} position={[o, 0, 0.034]} material={mats.chrome}>
                  <boxGeometry args={[0.006, 0.084, 0.006]} />
                </mesh>
              ))}
            </group>
            {/* Nebelscheinwerfer im seitlichen Lufteinlass */}
            <mesh position={[2.3, 0.44, k * 0.62]} material={mats.trim}>
              <boxGeometry args={[0.03, 0.085, 0.3]} />
            </mesh>
            <mesh position={[2.316, 0.44, k * 0.62]} rotation={[0, 0, Math.PI / 2]} material={mats.ring}>
              <cylinderGeometry args={[0.028, 0.028, 0.008, 14]} />
            </mesh>
            {/* Rückleuchte: L-förmig mit Leuchtbalken */}
            <group position={[-2.262, 0.845, k * 0.6]} rotation={[0, -Math.PI / 2 + k * 0.28, 0]}>
              <mesh geometry={tailGeo} material={mats.tail} position={[0, 0, -0.01]} />
              <mesh position={[0, 0.022, 0.032]} material={mats.tailBar}>
                <boxGeometry args={[0.32, 0.018, 0.006]} />
              </mesh>
              <mesh position={[k * -0.15, -0.012, 0.032]} material={mats.tailBar}>
                <boxGeometry args={[0.018, 0.06, 0.006]} />
              </mesh>
            </group>
            <mesh position={[0.7, 1.03, k * 0.93]} scale={[0.075, 0.05, 0.085]} material={mats.solid}>
              <sphereGeometry args={[1, 12, 10]} />
            </mesh>
            <mesh position={[1.9, 0.74, k * 0.898]} material={mats.amber}>
              <boxGeometry args={[0.07, 0.022, 0.012]} />
            </mesh>
            {/* Schweller, Türfugen, Türgriffe, Fensterschachtleiste */}
            <mesh position={[0, 0.33, k * 0.885]} material={mats.dark}>
              <boxGeometry args={[1.86, 0.07, 0.04]} />
            </mesh>
            {(body === 'wagon' ? [0.74, -0.32, -1.28] : [0.74, -0.32, -1.22]).map((x) => (
              <mesh key={x} position={[x, 0.68, k * 0.903]} material={mats.trim}>
                <boxGeometry args={[0.01, 0.5, 0.012]} />
              </mesh>
            ))}
            {[0.3, -0.7].map((x) => (
              <mesh key={x} position={[x, 0.9, k * 0.905]} material={mats.chrome}>
                <boxGeometry args={[0.15, 0.026, 0.025]} />
              </mesh>
            ))}
            <mesh position={[-0.38, 0.972, k * 0.862]} material={mats.chrome}>
              <boxGeometry args={[body === 'wagon' ? 3.5 : 2.3, 0.012, 0.012]} />
            </mesh>
          </group>
        ))}
        {/* Stoßfänger vorn */}
        <mesh position={[2.3, 0.43, 0]} material={mats.trim}>
          <boxGeometry args={[0.03, 0.1, 0.78]} />
        </mesh>
        <mesh position={[2.316, 0.535, 0]}>
          <boxGeometry args={[0.012, 0.1, 0.46]} />
          <meshStandardMaterial color="#f2f2ee" roughness={0.6} />
        </mesh>
        {/* Heck: Kennzeichenmulde, Chromleiste, Diffusor, Doppelrohr */}
        <mesh position={[-2.305, 0.64, 0]}>
          <boxGeometry args={[0.012, 0.1, 0.46]} />
          <meshStandardMaterial color="#f2f2ee" roughness={0.6} />
        </mesh>
        <mesh position={[-2.3, 0.72, 0]} material={mats.chrome}>
          <boxGeometry args={[0.014, 0.018, 0.62]} />
        </mesh>
        <mesh position={[-2.3, 0.43, 0]} material={mats.trim}>
          <boxGeometry args={[0.03, 0.09, 1.3]} />
        </mesh>
        {[-0.56, -0.46].map((zz) => (
          <mesh key={zz} position={[-2.31, 0.37, zz]} rotation={[0, 0, Math.PI / 2]} material={mats.chrome}>
            <cylinderGeometry args={[0.034, 0.034, 0.1, 14]} />
          </mesh>
        ))}
        <mesh position={[-1.02, 1.458, 0]} scale={[0.11, 0.03, 0.022]} material={mats.solid}>
          <sphereGeometry args={[1, 10, 8]} />
        </mesh>
        {/* Innenraum */}
        {[-0.36, 0.36].map((zz) => (
          <group key={zz}>
            <mesh position={[-0.02, 0.5, zz]} material={mats.seat}>
              <boxGeometry args={[0.5, 0.14, 0.48]} />
            </mesh>
            <mesh position={[-0.32, 0.82, zz]} rotation={[0, 0, 0.16]} material={mats.seat}>
              <boxGeometry args={[0.13, 0.62, 0.46]} />
            </mesh>
            <mesh position={[-0.4, 1.19, zz]} material={mats.seat}>
              <boxGeometry args={[0.1, 0.16, 0.24]} />
            </mesh>
          </group>
        ))}
        <mesh position={[-1.02, 0.5, 0]} material={mats.seat}>
          <boxGeometry args={[0.5, 0.14, 1.3]} />
        </mesh>
        <mesh position={[-1.3, 0.8, 0]} rotation={[0, 0, 0.2]} material={mats.seat}>
          <boxGeometry args={[0.13, 0.58, 1.3]} />
        </mesh>
        <mesh position={[0.6, 0.84, 0]} material={mats.dark}>
          <boxGeometry args={[0.34, 0.3, 1.5]} />
        </mesh>
        <mesh position={[0.36, 0.96, -0.36]} rotation={[0, Math.PI / 2, 0.35]} material={mats.trim}>
          <torusGeometry args={[0.16, 0.018, 8, 22]} />
        </mesh>
      </group>
      {/* Hinterräder (nicht demontierbar) */}
      {[-1, 1].map((k) => (
        <group key={k} position={[-WX, WY, k * WZ]} onClick={wheelTap}>
          <WheelMeshes geo={geo.tire} out={k} dirt={wheelDirt} />
          <mesh position={[0, 0, -k * 0.08]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.16, 0.16, 0.02, 24]} />
            <meshStandardMaterial color="#a9aeb4" metalness={0.9} roughness={0.3} />
          </mesh>
        </group>
      ))}

      {full && (
        <>
          {/* Motorraum: feste Teile */}
          <group onClick={bodyTap}>
            <mesh position={[1.3, 0.565, 0]}>
              <boxGeometry args={[0.7, 0.23, 0.36]} />
              <meshStandardMaterial color="#70767d" metalness={0.6} roughness={0.55} />
            </mesh>
            <mesh position={[1.3, 0.405, 0]} material={mats.dark}>
              <boxGeometry args={[0.66, 0.09, 0.32]} />
            </mesh>
            <mesh position={[1.28, 0.6, 0.44]}>
              <boxGeometry args={[0.3, 0.16, 0.2]} />
              <meshStandardMaterial color="#1b1c1f" roughness={0.7} />
            </mesh>
            <mesh position={[1.95, 0.6, 0]}>
              <boxGeometry args={[0.05, 0.34, 1.2]} />
              <meshStandardMaterial color="#2a2c30" metalness={0.5} roughness={0.6} />
            </mesh>
            <mesh position={[1.69, 0.5, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.065, 0.065, 0.03, 20]} />
              <meshStandardMaterial color="#8d9399" metalness={0.8} roughness={0.4} />
            </mesh>
            {/* Sichtbare Spuren von Lecks */}
            {st('gasket')?.condition === 'defect' && (
              <mesh position={[1.3, 0.6, 0.183]}>
                <boxGeometry args={[0.5, 0.16, 0.005]} />
                <meshStandardMaterial color="#120d06" metalness={0.9} roughness={0.15} />
              </mesh>
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
            <>
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
            </>,
          )}
          {fluidPoint(
            'coolant',
            'Kühlmittel-Ausgleichsbehälter',
            <>
              <mesh position={[1.82, 0.58, -0.52]}>
                <boxGeometry args={[0.16, 0.2, 0.16]} />
                <meshStandardMaterial color="#e9e6d8" roughness={0.5} transparent opacity={0.9} />
              </mesh>
              <mesh position={[1.82, 0.695, -0.52]}>
                <cylinderGeometry args={[0.035, 0.035, 0.03, 12]} />
                <meshStandardMaterial color="#1f6fb2" roughness={0.5} />
              </mesh>
            </>,
          )}
          {fluidPoint(
            'brake',
            'Bremsflüssigkeitsbehälter',
            <>
              <mesh position={[0.92, 0.72, -0.46]}>
                <boxGeometry args={[0.13, 0.1, 0.11]} />
                <meshStandardMaterial color="#ece9da" roughness={0.5} transparent opacity={0.92} />
              </mesh>
              <mesh position={[0.92, 0.78, -0.46]}>
                <cylinderGeometry args={[0.032, 0.032, 0.025, 12]} />
                <meshStandardMaterial color="#e3a81c" roughness={0.5} />
              </mesh>
            </>,
          )}

          {part(
            'battery',
            <>
              <mesh position={[0.98, 0.57, 0.5]}>
                <boxGeometry args={[0.28, 0.22, 0.2]} />
                <Mat color="#15161a" rough={0.6} />
              </mesh>
              <mesh position={[0.9, 0.69, 0.5]}>
                <cylinderGeometry args={[0.016, 0.016, 0.03, 8]} />
                <Mat color="#b3261e" rough={0.5} />
              </mesh>
            </>,
          )}
          {bolts('battery', [[1.06, 0.68, 0.5]])}
          {part(
            'oil_filter',
            <>
              <mesh position={[1.0, 0.66, -0.27]}>
                <cylinderGeometry args={[0.045, 0.045, 0.13, 14]} />
                <Mat color="#1b1d21" rough={0.5} />
              </mesh>
              <mesh position={[1.0, 0.735, -0.27]}>
                <cylinderGeometry args={[0.03, 0.03, 0.02, 6]} />
                <Mat color="#2b2e33" metal={0.5} rough={0.5} />
              </mesh>
            </>,
          )}
          {part(
            'gasket',
            <mesh position={[1.3, 0.69, 0]}>
              <boxGeometry args={[0.73, 0.02, 0.39]} />
              <Mat color={st('gasket')?.condition === 'defect' ? '#3a2412' : '#16171a'} rough={0.9} />
            </mesh>,
          )}
          {part(
            'valve_cover',
            <mesh position={[1.3, 0.74, 0]}>
              <boxGeometry args={[0.7, 0.08, 0.36]} />
              <Mat color="#2b2e33" metal={0.5} rough={0.5} />
            </mesh>,
          )}
          {bolts('valve_cover', COVER_BOLTS)}
          {/* Ventiltrieb unter dem Ventildeckel */}
          {!installed('valve_cover') &&
            part(
              'rocker',
              <mesh position={[1.3, 0.72, 0.1]}>
                <boxGeometry args={[0.62, 0.04, 0.07]} />
                <Mat color={st('rocker')?.condition === 'defect' ? '#6e5a4a' : '#aeb3ba'} metal={0.85} rough={0.35} />
              </mesh>,
            )}
          {!installed('valve_cover') && bolts('rocker', [[1.12, 0.74, 0.1], [1.48, 0.74, 0.1]])}
          {part(
            'engine_cover',
            <>
              <mesh position={[1.25, 0.862, 0]}>
                <boxGeometry args={[0.54, 0.02, 0.34]} />
                <Mat color="#1c1e22" rough={0.55} />
              </mesh>
              <mesh position={[1.25, 0.874, 0]}>
                <boxGeometry args={[0.3, 0.006, 0.08]} />
                <Mat color="#8d9399" metal={0.8} rough={0.3} />
              </mesh>
            </>,
          )}
          {part(
            'intake_hose',
            <>
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
            </>,
          )}
          {bolts('intake_hose', [[1.28, 0.66, 0.215]])}
          {part(
            'chain_tensioner',
            <>
              <mesh position={[1.45, 0.6, -0.215]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.03, 0.03, 0.07, 6]} />
                <Mat color="#c9a54a" metal={0.85} rough={0.35} />
              </mesh>
              <group position={[1.45, 0.6, -0.23]}>
                <Hit r={0.05} />
              </group>
            </>,
          )}
          {COIL_X.map((x, i) => (
            <group key={i}>
              {/* Zündkerze sitzt im Kerzenschacht unter der Spule */}
              {!installed(`coil${i + 1}`) &&
                part(
                  `plug${i + 1}`,
                  <>
                    <mesh position={[x, 0.75, 0]}>
                      <cylinderGeometry args={[0.018, 0.018, 0.1, 10]} />
                      <Mat color={st(`plug${i + 1}`)?.condition === 'defect' ? '#4a4038' : '#f0efe9'} rough={0.4} />
                    </mesh>
                    <mesh position={[x, 0.805, 0]}>
                      <cylinderGeometry args={[0.022, 0.022, 0.025, 6]} />
                      <Mat color="#b9bec5" metal={0.9} rough={0.3} />
                    </mesh>
                    <group position={[x, 0.79, 0]}>
                      <Hit r={0.032} />
                    </group>
                  </>,
                )}
              {part(
                `coil${i + 1}`,
                <>
                  <mesh position={[x, 0.8, 0]}>
                    <cylinderGeometry args={[0.036, 0.036, 0.06, 12]} />
                    <Mat color="#101113" rough={0.5} />
                  </mesh>
                  <mesh position={[x, 0.835, 0.02]}>
                    <boxGeometry args={[0.06, 0.03, 0.11]} />
                    <Mat color="#c8501e" rough={0.6} />
                  </mesh>
                </>,
              )}
              {bolts(`coil${i + 1}`, [[x, 0.78, -0.085]])}
              {connector(`coil${i + 1}`, [x, 0.838, 0.095], [0, 0.03, 0.06])}
            </group>
          ))}

          {/* Riementrieb und Nebenaggregate */}
          {part(
            'belt',
            <>
              <mesh position={[1.69, 0.627, -0.015]}>
                <boxGeometry args={[0.028, 0.012, 0.58]} />
                <Mat color={beltBad ? '#3b332b' : '#0d0d0e'} rough={0.95} />
              </mesh>
              {[-1, 1].map((k) => (
                <mesh key={k} position={[1.69, 0.495, k * 0.165]} rotation={[k * 0.42, 0, 0]}>
                  <boxGeometry args={[0.028, 0.012, 0.27]} />
                  <Mat color={beltBad ? '#3b332b' : '#0d0d0e'} rough={0.95} />
                </mesh>
              ))}
              <mesh position={[1.7, 0.55, 0]}>
                <boxGeometry args={[0.05, 0.2, 0.56]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
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
              <mesh position={[1.58, 0.665, 0.27]}>
                <boxGeometry args={[0.16, 0.03, 0.09]} />
                <Mat color="#8a9097" metal={0.7} rough={0.5} />
              </mesh>
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
              <mesh position={[1.58, 0.58, -0.3]}>
                <boxGeometry args={[0.14, 0.16, 0.16]} />
                <Mat color="#9aa0a7" metal={0.7} rough={0.5} />
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
            <mesh position={[1.3, 0.6, -0.235]}>
              <boxGeometry args={[0.17, 0.1, 0.1]} />
              <Mat color="#a7adb4" metal={0.75} rough={0.45} />
            </mesh>,
          )}
          {bolts('thermostat', [[1.235, 0.65, -0.235], [1.365, 0.65, -0.235]])}
          {part(
            'hose',
            <>
              <mesh position={[1.565, 0.69, -0.45]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.03, 0.03, 0.47, 12]} />
                <Mat color="#151517" rough={0.85} />
              </mesh>
              <mesh position={[1.34, 0.675, -0.375]}>
                <boxGeometry args={[0.06, 0.06, 0.2]} />
                <Mat color="#151517" rough={0.85} />
              </mesh>
            </>,
          )}
          {bolts('hose', [[1.42, 0.72, -0.45]])}

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
            <mesh position={[1.3, 0.235, 0]}>
              <boxGeometry args={[0.5, 0.066, 0.3]} />
              <Mat color={oilLeak ? '#3d3a35' : '#7b8188'} metal={0.7} rough={oilLeak ? 0.25 : 0.5} />
            </mesh>,
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
      <group ref={hood} position={[HOOD_X0, topY(HOOD_X0), 0]}>
        <mesh
          geometry={geo.hood}
          material={mats.paint}
          castShadow
          userData={{ label: interactive ? (hoodOpen ? 'Motorhaube schließen' : 'Motorhaube öffnen') : undefined }}
          onClick={interactive ? tap(handlers!.onHood) : bodyTap}
        />
      </group>

      {frontCorner('fl')}
      {frontCorner('fr')}
    </group>
  );
}
