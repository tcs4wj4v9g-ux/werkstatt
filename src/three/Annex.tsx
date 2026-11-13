import { useMemo } from 'react';
import * as THREE from 'three';
import { SLOTS } from '../game/data/workshop';
import { useGame } from '../game/store';
import { PASSAGE, ROOM, hall2, SHOWROOM } from './player';
import { concreteTexture, textTexture, wallTexture } from './textures';

// Größere Standorte: Halle 2 (dritte und vierte Hebebühne) schließt an die
// Stammhalle an, der Showroom auf der gegenüberliegenden Seite. Beide sind
// durch einen Durchgang in der Hallenwand begehbar.

type V3 = [number, number, number];
const H = ROOM.height;
const W = ROOM.maxX - ROOM.minX;
const CX = (ROOM.maxX + ROOM.minX) / 2;

function Box({ p, s, c, m = 0.1, r = 0.8 }: { p: V3; s: V3; c: string; m?: number; r?: number }) {
  return (
    <mesh position={p} receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} metalness={m} roughness={r} />
    </mesh>
  );
}
function Sign({ text, p, rot, size, bg = '#16181d', fg = '#ff7a1a' }: { text: string; p: V3; rot: V3; size: [number, number]; bg?: string; fg?: string }) {
  const tex = textTexture(text, { bg, fg, w: 512, h: Math.round((512 * size[1]) / size[0]) });
  return (
    <mesh position={p} rotation={rot}>
      <planeGeometry args={size} />
      <meshStandardMaterial map={tex} roughness={0.7} side={THREE.DoubleSide} />
    </mesh>
  );
}
const Tube = ({ p }: { p: V3 }) => (
  <group position={p}>
    <Box p={[0, 0.05, 0]} s={[1.5, 0.06, 0.22]} c="#d5d8dc" m={0.4} r={0.5} />
    <mesh>
      <boxGeometry args={[1.4, 0.04, 0.12]} />
      <meshStandardMaterial color="#ffffff" emissive="#f4f8ff" emissiveIntensity={2.2} />
    </mesh>
  </group>
);

/** Wand entlang x mit Durchgang (für die Trennwand zur Stammhalle). */
export function GapWall({ z, color = '#d9d6cc', thickness = 0.2 }: { z: number; color?: string; thickness?: number }) {
  const left = PASSAGE.minX - ROOM.minX + 0.2;
  const right = ROOM.maxX - PASSAGE.maxX + 0.2;
  return (
    <group>
      <Box p={[ROOM.minX - 0.2 + left / 2, H / 2, z]} s={[left, H, thickness]} c={color} r={0.95} />
      <Box p={[PASSAGE.maxX + right / 2, H / 2, z]} s={[right, H, thickness]} c={color} r={0.95} />
      <Box p={[(PASSAGE.minX + PASSAGE.maxX) / 2, (H + PASSAGE.height) / 2, z]} s={[PASSAGE.maxX - PASSAGE.minX, H - PASSAGE.height, thickness]} c={color} r={0.95} />
      {/* Türzarge */}
      {[PASSAGE.minX, PASSAGE.maxX].map((x) => (
        <Box key={x} p={[x, PASSAGE.height / 2, z]} s={[0.12, PASSAGE.height, thickness + 0.08]} c="#3f4650" m={0.5} />
      ))}
      <Box p={[(PASSAGE.minX + PASSAGE.maxX) / 2, PASSAGE.height, z]} s={[PASSAGE.maxX - PASSAGE.minX + 0.12, 0.12, thickness + 0.08]} c="#3f4650" m={0.5} />
    </group>
  );
}

export function Annex() {
  const upgrades = useGame((s) => s.upgrades);
  const pro = upgrades.includes('loc_pro');
  const center = upgrades.includes('loc_center');
  const hq = upgrades.includes('loc_hq');
  const tex = useMemo(() => {
    const floor = concreteTexture().clone();
    floor.repeat.set(2, 2);
    floor.needsUpdate = true;
    const wall = wallTexture().clone();
    wall.repeat.set(4, 2);
    wall.needsUpdate = true;
    return { floor, wall };
  }, []);
  const h2 = hall2(center);
  const d2 = h2.maxZ - h2.minZ;
  const cz2 = (h2.maxZ + h2.minZ) / 2;
  const ds = SHOWROOM.maxZ - SHOWROOM.minZ;
  const czs = (SHOWROOM.maxZ + SHOWROOM.minZ) / 2;
  const lifts = SLOTS.filter((s) => s.kind === 'lift' && s.id >= 10 && (s.needs === 'loc_pro' ? pro : center));

  return (
    <group>
      {upgrades.includes('hoist') && (
        <group position={[5.75, 0, 4.95]} rotation={[0, -0.5, 0]}>
          {/* Motor- und Getriebeheber: Fahrgestell, Mast, Ausleger mit Kette und Haken */}
          {[-0.3, 0.3].map((z) => (
            <Box key={z} p={[-0.2, 0.07, z]} s={[1.0, 0.08, 0.08]} c="#b3261e" m={0.5} r={0.5} />
          ))}
          <Box p={[0.3, 0.07, 0]} s={[0.1, 0.08, 0.7]} c="#b3261e" m={0.5} r={0.5} />
          <Box p={[0.3, 0.85, 0]} s={[0.1, 1.6, 0.1]} c="#b3261e" m={0.5} r={0.5} />
          <mesh position={[-0.1, 1.72, 0]} rotation={[0, 0, 0.18]}>
            <boxGeometry args={[0.95, 0.08, 0.08]} />
            <meshStandardMaterial color="#b3261e" metalness={0.5} roughness={0.5} />
          </mesh>
          <mesh position={[0.05, 1.2, 0]} rotation={[0, 0, -0.5]}>
            <cylinderGeometry args={[0.035, 0.035, 0.8, 10]} />
            <meshStandardMaterial color="#c9ccd1" metalness={0.9} roughness={0.25} />
          </mesh>
          <Box p={[-0.52, 1.42, 0]} s={[0.015, 0.4, 0.015]} c="#8d9399" m={0.9} r={0.3} />
          <mesh position={[-0.52, 1.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.045, 0.012, 6, 12, Math.PI * 1.4]} />
            <meshStandardMaterial color="#2a2c30" metalness={0.8} roughness={0.4} />
          </mesh>
        </group>
      )}
      {pro && (
        <group>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[CX, 0, cz2]} receiveShadow>
            <planeGeometry args={[W, d2]} />
            <meshStandardMaterial map={tex.floor} color="#c4c8cc" roughness={0.45} metalness={0.1} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[CX, H, cz2]}>
            <planeGeometry args={[W, d2]} />
            <meshStandardMaterial color="#c9c7c0" roughness={1} />
          </mesh>
          {/* Außenwände: Rückwand, Stirnwand, Front mit geschlossenem Rolltor */}
          <Box p={[ROOM.maxX + 0.1, H / 2, cz2]} s={[0.2, H, d2]} c="#e4e1d8" r={0.95} />
          <Box p={[CX, H / 2, h2.minZ - 0.1]} s={[W + 0.4, H, 0.2]} c="#e4e1d8" r={0.95} />
          <Box p={[ROOM.minX - 0.1, H / 2, cz2]} s={[0.2, H, d2]} c="#e4e1d8" r={0.95} />
          {lifts.map((s) => (
            <group key={s.id}>
              <Box p={[ROOM.minX + 0.03, 1.55, s.z]} s={[0.06, 3.1, 3.2]} c="#8d949c" m={0.6} r={0.5} />
              {[0.5, 1.1, 1.7, 2.3, 2.9].map((y) => (
                <Box key={y} p={[ROOM.minX + 0.07, y, s.z]} s={[0.02, 0.03, 3.2]} c="#59606a" m={0.6} />
              ))}
              {/* Bodenmarkierung */}
              {[-1.15, 1.15].map((o) => (
                <mesh key={o} rotation={[-Math.PI / 2, 0, 0]} position={[-0.2, 0.004, s.z + o]}>
                  <planeGeometry args={[5.2, 0.08]} />
                  <meshStandardMaterial color="#e3a81c" roughness={0.8} />
                </mesh>
              ))}
              <Tube p={[-1.6, H - 0.34, s.z]} />
              <Tube p={[2.6, H - 0.34, s.z]} />
              <pointLight position={[2.6, 3.6, s.z]} intensity={14} distance={9} decay={1.7} color="#f4f8ff" />
            </group>
          ))}
          {/* Sockelband wie in der Stammhalle */}
          <Box p={[ROOM.maxX - 0.005, 0.6, cz2]} s={[0.01, 1.2, d2]} c="#3f4a57" />
          <Box p={[ROOM.maxX - 0.008, 1.22, cz2]} s={[0.012, 0.06, d2]} c="#ff7a1a" />
          <Sign text={center ? 'PERFORMANCE-CENTER' : 'HALLE 2'} p={[ROOM.maxX - 0.03, 2.8, cz2]} rot={[0, -Math.PI / 2, 0]} size={[3.2, 0.5]} />
          {/* Einrichtung: Werkzeugwagen und Regal an der Rückwand */}
          <Box p={[5.7, 0.5, -8.1]} s={[0.7, 1.0, 1.1]} c="#b3261e" m={0.4} r={0.5} />
          <Box p={[5.7, 1.03, -8.1]} s={[0.74, 0.06, 1.14]} c="#2a2c30" m={0.5} />
          {center && (
            <group>
              {/* Rollenprüfstand: im Boden eingelassene Rollen und Bedienpult */}
              <Box p={[4.2, 0.012, -15.3]} s={[2.6, 0.02, 1.9]} c="#2a2c30" m={0.6} r={0.5} />
              {[-0.45, 0.45].map((o) => (
                <mesh key={o} position={[4.2, 0.03, -15.3 + o]} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.11, 0.11, 2.3, 16]} />
                  <meshStandardMaterial color="#9aa0a7" metalness={0.9} roughness={0.3} />
                </mesh>
              ))}
              <Box p={[5.8, 0.6, -13.6]} s={[0.6, 1.2, 0.8]} c="#3f4650" m={0.5} />
              <mesh position={[5.49, 1.0, -13.6]} rotation={[0, -Math.PI / 2, 0]}>
                <planeGeometry args={[0.6, 0.36]} />
                <meshStandardMaterial color="#0f1a12" emissive="#3fae6a" emissiveIntensity={0.7} />
              </mesh>
              <Sign text="LEISTUNGSPRÜFSTAND" p={[ROOM.maxX - 0.03, 2.1, -14.6]} rot={[0, -Math.PI / 2, 0]} size={[2.4, 0.3]} bg="#e3a81c" fg="#16181d" />
            </group>
          )}
        </group>
      )}

      {hq && (
        <group>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[CX, 0, czs]} receiveShadow>
            <planeGeometry args={[W, ds]} />
            <meshStandardMaterial color="#e9e7e1" roughness={0.18} metalness={0.25} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[CX, H, czs]}>
            <planeGeometry args={[W, ds]} />
            <meshStandardMaterial color="#1c1e22" roughness={1} />
          </mesh>
          <Box p={[ROOM.maxX + 0.1, H / 2, czs]} s={[0.2, H, ds]} c="#23262b" r={0.9} />
          <Box p={[CX, H / 2, SHOWROOM.maxZ + 0.1]} s={[W + 0.4, H, 0.2]} c="#23262b" r={0.9} />
          {/* Glasfront zum Hof */}
          <mesh position={[ROOM.minX - 0.05, H / 2, czs]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[ds, H]} />
            <meshPhysicalMaterial color="#9fc4e8" transparent opacity={0.22} roughness={0.05} metalness={0.3} side={THREE.DoubleSide} />
          </mesh>
          {[SHOWROOM.minZ + 0.1, czs, SHOWROOM.maxZ - 0.1].map((z) => (
            <Box key={z} p={[ROOM.minX - 0.05, H / 2, z]} s={[0.1, H, 0.12]} c="#16181d" m={0.6} />
          ))}
          <Box p={[ROOM.minX - 0.05, H - 0.2, czs]} s={[0.14, 0.4, ds]} c="#16181d" m={0.6} />
          {/* Podeste mit Lichtband und Strahlern */}
          {SLOTS.filter((s) => s.kind === 'show').map((s) => (
            <group key={s.id} position={[s.x, 0, s.z]}>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
                <planeGeometry args={[2.6, 5.4]} />
                <meshStandardMaterial color="#16181d" roughness={0.3} metalness={0.4} />
              </mesh>
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
                <ringGeometry args={[1.22, 1.28, 4, 1, Math.PI / 4]} />
                <meshStandardMaterial color="#ffffff" emissive="#ffd9a0" emissiveIntensity={1.4} />
              </mesh>
              <mesh position={[0, H - 0.1, 0]}>
                <cylinderGeometry args={[0.16, 0.22, 0.14, 14]} />
                <meshStandardMaterial color="#ffffff" emissive="#fff1d6" emissiveIntensity={2.4} />
              </mesh>
            </group>
          ))}
          <pointLight position={[1, 3.8, czs]} intensity={26} distance={13} decay={1.6} color="#fff1d6" />
          <Sign text="GARAGE KINGS · SHOWROOM" p={[CX, 3.2, SHOWROOM.maxZ - 0.02]} rot={[0, Math.PI, 0]} size={[5.2, 0.6]} />
          {/* Empfangstresen */}
          <Box p={[5.6, 0.55, 6.6]} s={[1.0, 1.1, 1.6]} c="#16181d" m={0.3} r={0.4} />
          <Box p={[5.6, 1.12, 6.6]} s={[1.1, 0.05, 1.7]} c="#ff7a1a" m={0.3} r={0.4} />
        </group>
      )}
    </group>
  );
}
