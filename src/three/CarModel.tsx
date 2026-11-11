import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { beneath, blockersRemoved, installReady, removable } from '../game/repair';
import type { BodyStyle, CarInstance } from '../game/types';

// Selbst gebautes Low-Poly-Fahrzeug (keine Markenlogos). Fahrtrichtung = +X.
// Mit `handlers` wird das Modell interaktiv (Werkstatt), sonst reine Anzeige.

export interface CarHandlers {
  onHood(): void;
  onComponent(id: string): void;
  onBolt(id: string, index: number): void;
}

interface Props {
  body: BodyStyle;
  color: string;
  car?: CarInstance;
  handlers?: CarHandlers;
  steer?: React.MutableRefObject<number>;
}

const GhostCtx = createContext<'normal' | 'ghost' | 'defect'>('normal');

/** Material, das sich je nach Zustand (normal / Platzhalter / bekannter Defekt) umfärbt. */
function Mat({ color, metal = 0.2, rough = 0.6, emissive }: { color: string; metal?: number; rough?: number; emissive?: string }) {
  const mode = useContext(GhostCtx);
  if (mode === 'ghost') return <meshBasicMaterial color="#39e06f" transparent opacity={0.35} depthWrite={false} />;
  return (
    <meshStandardMaterial
      color={color}
      metalness={metal}
      roughness={rough}
      emissive={mode === 'defect' ? '#ff2a1a' : emissive ?? '#000000'}
      emissiveIntensity={mode === 'defect' ? 0.55 : emissive ? 1 : 0}
    />
  );
}

const tap = (fn: () => void) => (e: ThreeEvent<MouseEvent>) => {
  e.stopPropagation();
  if (e.delta > 10) return; // war ein Kameraschwenk, kein Tipp
  fn();
};
const block = (e: ThreeEvent<MouseEvent>) => e.stopPropagation();

const liveId = (o: THREE.Object3D | null): string | undefined => (o ? o.userData.liveId ?? liveId(o.parent) : undefined);
/**
 * Tipp auf einen Einbau-Platzhalter. Liegt dahinter ein gerade bedienbares
 * Teil (oder dessen Schraube), das unter diesem Platzhalter verbaut ist, hat
 * es Vorrang – so verdeckt ein Platzhalter nie das Teil darunter.
 */
const ghostTap = (id: string, fn: () => void) => (e: ThreeEvent<MouseEvent>) => {
  const under = beneath(id);
  if (e.intersections.some((i) => under.includes(liveId(i.object) ?? ''))) return;
  e.stopPropagation();
  if (e.delta > 10) return;
  fn();
};

/** Platzhalter schweben etwas über der Einbauposition, damit das Teil darunter erreichbar bleibt. */
const GHOST_LIFT: Record<string, number> = { valve_cover: 0.14, caliper_fl: 0.12, caliper_fr: 0.12 };

function bodyShape(arches: boolean, notch: boolean) {
  const s = new THREE.Shape();
  s.moveTo(-2.2, 0.3);
  s.lineTo(-2.25, 0.6);
  s.lineTo(-2.2, 0.95);
  s.lineTo(-1.45, 1.0);
  s.lineTo(0.75, 0.98);
  if (notch) {
    s.lineTo(0.78, 0.45);
    s.lineTo(2.0, 0.45);
    s.lineTo(2.0, 0.825);
  }
  s.lineTo(2.05, 0.82);
  s.lineTo(2.25, 0.62);
  s.lineTo(2.22, 0.3);
  if (arches) {
    s.absarc(1.38, 0.32, 0.4, -0.05, Math.PI + 0.05, false);
    s.absarc(-1.38, 0.32, 0.4, -0.05, Math.PI + 0.05, false);
  }
  s.closePath();
  return s;
}

const poly = (pts: number[][]) => {
  const p = new THREE.Path();
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  return p;
};

function useBodyGeometry(body: BodyStyle) {
  return useMemo(() => {
    const ex = (shape: THREE.Shape, depth: number, z: number) => {
      const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
      g.translate(0, 0, z);
      return g;
    };
    const wagon = body === 'wagon';
    const outline = wagon
      ? [[-2.2, 0.94], [-1.98, 1.4], [0.1, 1.42], [0.78, 0.97]]
      : [[-1.5, 0.99], [-0.95, 1.4], [0.1, 1.42], [0.78, 0.97]];
    const glass = new THREE.Shape();
    outline.forEach(([x, y], i) => (i ? glass.lineTo(x, y) : glass.moveTo(x, y)));
    glass.closePath();
    const frame = glass.clone();
    frame.holes.push(poly([[-0.25, 1.04], [-0.25, 1.36], [0.05, 1.37], [0.6, 1.04]]));
    if (wagon) {
      frame.holes.push(poly([[-1.3, 1.04], [-1.3, 1.36], [-0.33, 1.36], [-0.33, 1.04]]));
      frame.holes.push(poly([[-2.08, 1.04], [-1.92, 1.36], [-1.38, 1.36], [-1.38, 1.04]]));
    } else {
      frame.holes.push(poly([[-1.32, 1.04], [-0.92, 1.35], [-0.33, 1.36], [-0.33, 1.04]]));
    }
    return {
      center: ex(bodyShape(false, true), 1.44, -0.72),
      sideR: ex(bodyShape(true, false), 0.2, 0.72),
      sideL: ex(bodyShape(true, false), 0.2, -0.92),
      glass: ex(glass, 1.7, -0.85),
      frameR: ex(frame, 0.03, 0.85),
      frameL: ex(frame, 0.03, -0.88),
      roof: wagon ? [-0.94, 2.1] : [-0.425, 1.07],
    };
  }, [body]);
}

function Bolt({ pos, axis = 'y', present, live, onTap }: { pos: [number, number, number]; axis?: 'y' | 'z+' | 'z-'; present: boolean; live?: string; onTap?: () => void }) {
  const rot: [number, number, number] = axis === 'y' ? [0, 0, 0] : [axis === 'z+' ? Math.PI / 2 : -Math.PI / 2, 0, 0];
  return (
    <group position={pos} rotation={rot} userData={{ liveId: live }} onClick={onTap && tap(onTap)}>
      {present ? (
        <mesh position={[0, 0.012, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.03, 6]} />
          <meshStandardMaterial color="#d9dde2" metalness={0.8} roughness={0.3} />
        </mesh>
      ) : (
        <mesh position={[0, 0.004, 0]}>
          <cylinderGeometry args={[0.022, 0.022, 0.008, 12]} />
          <meshBasicMaterial color="#39e06f" transparent opacity={0.75} />
        </mesh>
      )}
      {onTap && (
        <mesh>
          <sphereGeometry args={[0.05, 8, 6]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

const COIL_X = [1.03, 1.21, 1.39, 1.57];
const COVER_BOLTS: [number, number, number][] = [1.0, 1.3, 1.6].flatMap((x) => [-0.15, 0.15].map((z) => [x, 0.78, z] as [number, number, number]));

export function CarModel({ body, color, car, handlers, steer }: Props) {
  const geo = useBodyGeometry(body);
  const hood = useRef<THREE.Group>(null);
  const wheelFL = useRef<THREE.Group>(null);
  const wheelFR = useRef<THREE.Group>(null);
  const hoodOpen = car?.hoodOpen ?? false;
  const CLOSED = Math.atan2(-0.16, 1.3);

  useFrame((_, dt) => {
    if (hood.current) {
      const target = hoodOpen ? CLOSED + 1.15 : CLOSED;
      hood.current.rotation.z += (target - hood.current.rotation.z) * Math.min(1, dt * 7);
    }
    if (steer) {
      for (const w of [wheelFL.current, wheelFR.current]) if (w) w.rotation.y = steer.current * 0.45;
    }
  });

  const st = (id: string) => car?.components[id];
  const installed = (id: string) => st(id)?.installed ?? true;

  /** Ausbaubares Bauteil: eingebaut = echtes Teil, ausgebaut = grüner Platzhalter zum Einbauen. */
  const Part = ({ id, children }: { id: string; children: ReactNode }) => {
    const s = st(id);
    if (!s || s.installed) {
      const defect = !!s && s.known && s.condition === 'defect';
      return (
        <GhostCtx.Provider value={defect ? 'defect' : 'normal'}>
          <group userData={{ liveId: car && handlers && removable(car, id) ? id : undefined }} onClick={handlers && tap(() => handlers.onComponent(id))}>{children}</group>
        </GhostCtx.Provider>
      );
    }
    if (!handlers || !car || !installReady(car, id)) return null;
    return (
      <GhostCtx.Provider value="ghost">
        <group position={[0, GHOST_LIFT[id] ?? 0, 0]} onClick={ghostTap(id, () => handlers.onComponent(id))}>{children}</group>
      </GhostCtx.Provider>
    );
  };

  const bolts = (id: string, positions: [number, number, number][], axis: 'y' | 'z+' | 'z-' = 'y') =>
    installed(id) &&
    positions.map((p, i) => (
      <Bolt key={i} pos={p} axis={axis} present={st(id)?.bolts[i] ?? true} live={car && handlers && blockersRemoved(car, id) ? id : undefined} onTap={handlers && (() => handlers.onBolt(id, i))} />
    ));

  const paint = <meshStandardMaterial color={color} metalness={0.55} roughness={0.35} />;

  const frontCorner = (s: 'fl' | 'fr') => {
    const sign = s === 'fr' ? 1 : -1;
    const axis = sign > 0 ? 'z+' : 'z-';
    const z = (d: number) => sign * d;
    const lug: [number, number, number][] = [0, 1, 2, 3, 4].map((i) => {
      const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
      return [1.38 + Math.cos(a) * 0.075, 0.32 + Math.sin(a) * 0.075, z(0.975)];
    });
    const worn = st(`pads_${s}`)?.condition === 'defect';
    const padT = worn ? 0.008 : 0.022;
    return (
      <group key={s}>
        {/* Bremsscheibe + Nabe (fest) */}
        <mesh position={[1.38, 0.32, z(0.78)]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.17, 0.17, 0.024, 28]} />
          <meshStandardMaterial color="#9aa0a6" metalness={0.9} roughness={0.35} />
        </mesh>
        <mesh position={[1.38, 0.32, z(0.8)]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 0.08, 16]} />
          <meshStandardMaterial color="#55595e" metalness={0.7} roughness={0.5} />
        </mesh>
        <Part id={`pads_${s}`}>
          {[-1, 1].map((k) => (
            <mesh key={k} position={[1.38, 0.445, z(0.78) + k * (0.014 + padT / 2)]}>
              <boxGeometry args={[0.13, 0.07, padT]} />
              <Mat color={worn ? '#6b4a2a' : '#2b2d30'} rough={0.9} />
            </mesh>
          ))}
        </Part>
        <Part id={`caliper_${s}`}>
          <mesh position={[1.38, 0.455, z(0.785)]}>
            <boxGeometry args={[0.2, 0.12, 0.11]} />
            <Mat color="#b3261e" metal={0.4} rough={0.5} />
          </mesh>
        </Part>
        {bolts(`caliper_${s}`, [[1.32, 0.455, z(0.84)], [1.44, 0.455, z(0.84)]], axis)}
        <group ref={s === 'fl' ? wheelFL : wheelFR} position={[1.38, 0.32, z(0.86)]}>
          <group position={[-1.38, -0.32, -z(0.86)]}>
            <Part id={`wheel_${s}`}>
              <WheelMeshes x={1.38} z={z(0.86)} />
            </Part>
            {bolts(`wheel_${s}`, lug, axis)}
          </group>
        </group>
      </group>
    );
  };

  return (
    <group>
      {/* Karosserie */}
      <group onClick={handlers && block}>
        <mesh geometry={geo.center}>{paint}</mesh>
        <mesh geometry={geo.sideR}>{paint}</mesh>
        <mesh geometry={geo.sideL}>{paint}</mesh>
        <mesh geometry={geo.frameR}>{paint}</mesh>
        <mesh geometry={geo.frameL}>{paint}</mesh>
        <mesh geometry={geo.glass}>
          <meshStandardMaterial color="#10171d" metalness={0.9} roughness={0.1} />
        </mesh>
        <mesh position={[geo.roof[0], 1.425, 0]}>
          <boxGeometry args={[geo.roof[1], 0.04, 1.76]} />
          {paint}
        </mesh>
        {/* Front: Grill, Scheinwerfer, Kennzeichen */}
        <mesh position={[2.16, 0.73, 0]} rotation={[0, 0, 0.78]}>
          <boxGeometry args={[0.03, 0.16, 0.62]} />
          <meshStandardMaterial color="#0c0d0f" metalness={0.6} roughness={0.4} />
        </mesh>
        {[-0.62, 0.62].map((z) => (
          <mesh key={z} position={[2.155, 0.735, z]} rotation={[0, 0, 0.78]}>
            <boxGeometry args={[0.04, 0.14, 0.42]} />
            <meshStandardMaterial color="#f4f7ff" emissive="#cfe0ff" emissiveIntensity={0.7} />
          </mesh>
        ))}
        <mesh position={[2.245, 0.42, 0]}>
          <boxGeometry args={[0.02, 0.11, 0.5]} />
          <meshStandardMaterial color="#f2f2ee" />
        </mesh>
        <mesh position={[2.24, 0.4, 0]}>
          <boxGeometry args={[0.03, 0.16, 1.5]} />
          <meshStandardMaterial color="#111214" roughness={0.8} />
        </mesh>
        {/* Heck */}
        {[-0.66, 0.66].map((z) => (
          <mesh key={z} position={[-2.235, 0.8, z]}>
            <boxGeometry args={[0.04, 0.16, 0.46]} />
            <meshStandardMaterial color="#8f0f12" emissive="#ff1a1a" emissiveIntensity={0.5} />
          </mesh>
        ))}
        <mesh position={[-2.245, 0.6, 0]}>
          <boxGeometry args={[0.02, 0.11, 0.5]} />
          <meshStandardMaterial color="#f2f2ee" />
        </mesh>
        {/* Spiegel + Schweller */}
        {[-1, 1].map((k) => (
          <group key={k}>
            <mesh position={[0.62, 1.04, k * 0.98]}>
              <boxGeometry args={[0.1, 0.09, 0.14]} />
              {paint}
            </mesh>
            <mesh position={[0, 0.33, k * 0.915]}>
              <boxGeometry args={[1.9, 0.08, 0.03]} />
              <meshStandardMaterial color="#111214" roughness={0.8} />
            </mesh>
            {[-0.3, 0.55].map((x) => (
              <mesh key={x} position={[x - 0.45, 0.9, k * 0.925]}>
                <boxGeometry args={[0.14, 0.025, 0.02]} />
                <meshStandardMaterial color="#c9cdd2" metalness={0.8} roughness={0.3} />
              </mesh>
            ))}
          </group>
        ))}
        {/* Hinterräder (nicht demontierbar) */}
        <WheelMeshes x={-1.38} z={0.86} />
        <WheelMeshes x={-1.38} z={-0.86} />
      </group>

      {/* Motorraum */}
      <group onClick={handlers && block}>
        <mesh position={[1.3, 0.565, 0]}>
          <boxGeometry args={[0.7, 0.23, 0.36]} />
          <meshStandardMaterial color="#6f757c" metalness={0.6} roughness={0.55} />
        </mesh>
        <mesh position={[1.3, 0.6, -0.3]}>
          <boxGeometry args={[0.55, 0.14, 0.18]} />
          <meshStandardMaterial color="#1b1c1f" roughness={0.7} />
        </mesh>
        <mesh position={[0.98, 0.57, 0.5]}>
          <boxGeometry args={[0.28, 0.22, 0.2]} />
          <meshStandardMaterial color="#15161a" roughness={0.6} />
        </mesh>
        <mesh position={[1.75, 0.58, -0.5]}>
          <boxGeometry args={[0.2, 0.2, 0.2]} />
          <meshStandardMaterial color="#e9e6d8" roughness={0.5} transparent opacity={0.9} />
        </mesh>
        <mesh position={[1.92, 0.62, 0]}>
          <boxGeometry args={[0.06, 0.32, 1.2]} />
          <meshStandardMaterial color="#2a2c30" metalness={0.5} roughness={0.6} />
        </mesh>
        {/* Ölspur bei undichter Dichtung */}
        {st('gasket')?.condition === 'defect' && (
          <mesh position={[1.3, 0.6, 0.183]}>
            <boxGeometry args={[0.5, 0.16, 0.005]} />
            <meshStandardMaterial color="#120d06" metalness={0.9} roughness={0.15} />
          </mesh>
        )}
      </group>
      <Part id="gasket">
        <mesh position={[1.3, 0.69, 0]}>
          <boxGeometry args={[0.73, 0.02, 0.39]} />
          <Mat color={st('gasket')?.condition === 'defect' ? '#3a2412' : '#16171a'} rough={0.9} />
        </mesh>
      </Part>
      <Part id="valve_cover">
        <mesh position={[1.3, 0.74, 0]}>
          <boxGeometry args={[0.7, 0.08, 0.36]} />
          <Mat color="#2b2e33" metal={0.5} rough={0.5} />
        </mesh>
      </Part>
      {bolts('valve_cover', COVER_BOLTS)}
      {COIL_X.map((x, i) => (
        <group key={i}>
          <Part id={`coil${i + 1}`}>
            <mesh position={[x, 0.8, 0]}>
              <cylinderGeometry args={[0.036, 0.036, 0.06, 12]} />
              <Mat color="#101113" rough={0.5} />
            </mesh>
            <mesh position={[x, 0.835, 0.02]}>
              <boxGeometry args={[0.06, 0.03, 0.11]} />
              <Mat color="#c8501e" rough={0.6} />
            </mesh>
          </Part>
          {bolts(`coil${i + 1}`, [[x, 0.78, -0.085]])}
        </group>
      ))}

      {/* Motorhaube, Scharnier an der Windschutzscheibe */}
      <group ref={hood} position={[0.76, 0.985, 0]} rotation={[0, 0, CLOSED]}>
        <mesh position={[0.65, 0, 0]} onClick={handlers && tap(handlers.onHood)}>
          <boxGeometry args={[1.3, 0.035, 1.44]} />
          {paint}
        </mesh>
      </group>

      {frontCorner('fl')}
      {frontCorner('fr')}
    </group>
  );
}

function WheelMeshes({ x, z }: { x: number; z: number }) {
  const out = Math.sign(z);
  return (
    <group position={[x, 0.32, z]} rotation={[Math.PI / 2, 0, 0]}>
      <mesh>
        <cylinderGeometry args={[0.32, 0.32, 0.2, 28]} />
        <Mat color="#141416" rough={0.9} />
      </mesh>
      <mesh position={[0, out * 0.085, 0]}>
        <cylinderGeometry args={[0.21, 0.21, 0.04, 20]} />
        <Mat color="#c3c8ce" metal={0.85} rough={0.3} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[0, out * 0.108, 0]} rotation={[0, (i / 5) * Math.PI * 2, 0]}>
          <boxGeometry args={[0.035, 0.012, 0.4]} />
          <Mat color="#8d9399" metal={0.8} rough={0.35} />
        </mesh>
      ))}
    </group>
  );
}
