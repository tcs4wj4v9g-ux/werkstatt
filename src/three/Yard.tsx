import { useMemo } from 'react';
import * as THREE from 'three';
import { SLOTS, slotAvailable } from '../game/data/workshop';
import { useGame } from '../game/store';
import { Interactable } from './Interactable';
import { BAY_Z, DOOR_HALF, ROOM, YARD } from './player';
import { doorTexture, textTexture, wallTexture, asphaltTexture } from './textures';

type V3 = [number, number, number];
const H = ROOM.height;

function Box({ p, s, c, m = 0.1, r = 0.8, e }: { p: V3; s: V3; c: string; m?: number; r?: number; e?: number }) {
  return (
    <mesh position={p}>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} metalness={m} roughness={r} emissive={e ? c : '#000000'} emissiveIntensity={e ?? 0} />
    </mesh>
  );
}

function Sign({ text, p, rot = [0, 0, 0], size, bg = '#16181d', fg = '#f2f3f5' }: { text: string; p: V3; rot?: V3; size: [number, number]; bg?: string; fg?: string }) {
  const tex = textTexture(text, { bg, fg, w: 512, h: Math.round((512 * size[1]) / size[0]) });
  return (
    <mesh position={p} rotation={rot}>
      <planeGeometry args={size} />
      <meshStandardMaterial map={tex} roughness={0.7} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Hof vor der Halle: wächst sichtbar mit den gekauften Ausbaustufen. */
export function Yard() {
  const upgrades = useGame((s) => s.upgrades);
  const setPanel = useGame((s) => s.setPanel);
  const tex = useMemo(() => {
    const asphalt = asphaltTexture().clone();
    asphalt.repeat.set(6, 6);
    asphalt.needsUpdate = true;
    const wall = wallTexture().clone();
    wall.repeat.set(1.2, 2);
    wall.needsUpdate = true;
    const door = doorTexture().clone();
    door.repeat.set(1, 0.5);
    door.needsUpdate = true;
    return { asphalt, wall, door };
  }, []);
  const has = (id: string) => upgrades.includes(id as never);
  const yw = YARD.maxX - YARD.minX;
  const yd = YARD.maxZ - YARD.minZ;
  const ycx = (YARD.maxX + YARD.minX) / 2;
  // Torwand in Abschnitten, damit die beiden Tore offen bleiben.
  const piers: [number, number][] = [
    [ROOM.minZ, BAY_Z[0] - DOOR_HALF],
    [BAY_Z[0] + DOOR_HALF, BAY_Z[1] - DOOR_HALF],
    [BAY_Z[1] + DOOR_HALF, ROOM.maxZ],
  ];

  return (
    <group>
      {/* Gelände */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ycx, -0.02, 0]}>
        <planeGeometry args={[160, 160]} />
        <meshStandardMaterial color="#5f8a4a" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ycx, 0, 0]} receiveShadow>
        <planeGeometry args={[yw, yd]} />
        <meshStandardMaterial map={tex.asphalt} color="#6c6f74" roughness={0.92} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[YARD.minX - 6, -0.01, BAY_Z[0]]}>
        <planeGeometry args={[12, 6]} />
        <meshStandardMaterial color="#4b4e53" roughness={0.95} />
      </mesh>

      {/* Hallenfront mit zwei offenen Rolltoren */}
      {piers.map(([a, b]) => (
        <mesh key={a} position={[ROOM.minX - 0.1, H / 2, (a + b) / 2]}>
          <boxGeometry args={[0.2, H, b - a]} />
          <meshStandardMaterial map={tex.wall} roughness={0.95} />
        </mesh>
      ))}
      {BAY_Z.map((z) => (
        <group key={z} position={[ROOM.minX - 0.1, 0, z]}>
          <Box p={[0, 3.75, 0]} s={[0.2, 1.3, DOOR_HALF * 2]} c="#d9d6cc" r={0.95} />
          <mesh position={[0.02, 3.02, 0]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[DOOR_HALF * 2, 0.36]} />
            <meshStandardMaterial map={tex.door} metalness={0.5} roughness={0.5} side={THREE.DoubleSide} />
          </mesh>
          {[-DOOR_HALF, DOOR_HALF].map((o) => (
            <Box key={o} p={[0, 1.55, o]} s={[0.26, 3.1, 0.12]} c="#3f4650" m={0.5} />
          ))}
        </group>
      ))}
      <Box p={[ROOM.minX - 0.1, H + 0.15, 0]} s={[0.5, 0.3, ROOM.maxZ - ROOM.minZ + 0.6]} c="#3f4650" m={0.4} />
      <Sign text="GARAGE KINGS" p={[ROOM.minX - 0.22, 3.75, 0]} rot={[0, -Math.PI / 2, 0]} size={[3.0, 0.7]} fg="#ff7a1a" />
      {/* Seitenwände der Halle von außen */}
      {[...(has('loc_pro') ? [] : [ROOM.minZ - 0.1]), ...(has('loc_hq') ? [] : [ROOM.maxZ + 0.1])].map((z) => (
        <Box key={z} p={[(ROOM.minX + ROOM.maxX) / 2, H / 2, z]} s={[ROOM.maxX - ROOM.minX + 0.4, H, 0.2]} c="#d9d6cc" r={0.95} />
      ))}

      {/* Zaun und Hoftor */}
      {[YARD.minZ, YARD.maxZ].map((z) => (
        <group key={z}>
          <Box p={[ycx, 0.9, z]} s={[yw, 0.06, 0.06]} c="#59606a" m={0.6} />
          <Box p={[ycx, 1.7, z]} s={[yw, 0.06, 0.06]} c="#59606a" m={0.6} />
          {Array.from({ length: 10 }, (_, i) => (
            <Box key={i} p={[YARD.minX + (i * yw) / 9, 0.9, z]} s={[0.08, 1.8, 0.08]} c="#3f4650" m={0.6} />
          ))}
        </group>
      ))}
      {[[YARD.minZ, BAY_Z[0] - 2.2], [BAY_Z[0] + 2.2, YARD.maxZ]].map(([a, b]) => (
        <group key={a}>
          <Box p={[YARD.minX, 0.9, (a + b) / 2]} s={[0.06, 0.06, b - a]} c="#59606a" m={0.6} />
          <Box p={[YARD.minX, 1.7, (a + b) / 2]} s={[0.06, 0.06, b - a]} c="#59606a" m={0.6} />
        </group>
      ))}
      <Interactable id="gate" label="Hoftor – Probefahrt" onUse={() => setPanel('drive')} position={[YARD.minX + 0.05, 0, BAY_Z[0]]} halo={[0.3, 2.2, 4.4]} haloPos={[0, 1.1, 0]}>
        {[-2.2, 2.2].map((o) => (
          <Box key={o} p={[0, 1.1, o]} s={[0.18, 2.2, 0.18]} c="#c8501e" m={0.4} />
        ))}
        <Box p={[0, 0.55, 0]} s={[0.06, 0.08, 4.4]} c="#e3a81c" />
        <Box p={[0, 1.25, 0]} s={[0.06, 0.08, 4.4]} c="#e3a81c" />
      </Interactable>
      <Sign text="AUSFAHRT · PROBEFAHRT" p={[YARD.minX + 0.12, 2.5, BAY_Z[0]]} rot={[0, Math.PI / 2, 0]} size={[3.6, 0.42]} bg="#1d6b3a" />
      {/* Bäume hinter dem Zaun */}
      {[-20, -15, -9, -6].flatMap((x, i) =>
        // Wo Halle 2 bzw. der Showroom steht, wächst kein Baum mehr.
        [YARD.minZ - 3, YARD.maxZ + 3].filter((z) => x < -8 || !(z < 0 ? has('loc_pro') : has('loc_hq'))).map((z) => (
          <group key={`${x}${z}`} position={[x + (i % 2), 0, z + (i % 3) - 1]}>
            <mesh position={[0, 0.8, 0]}>
              <cylinderGeometry args={[0.18, 0.24, 1.6, 6]} />
              <meshStandardMaterial color="#5b4630" />
            </mesh>
            <mesh position={[0, 3.2, 0]}>
              <coneGeometry args={[1.5, 4, 7]} />
              <meshStandardMaterial color="#2f5d34" roughness={1} />
            </mesh>
          </group>
        )),
      )}

      {/* Stellplätze: erscheinen mit dem jeweiligen Ausbau */}
      {SLOTS.filter((s) => s.kind === 'park' && slotAvailable(s, upgrades)).map((s) => (
        <group key={s.id} position={[s.x, 0.006, s.z]} rotation={[0, s.rot, 0]}>
          {[-1.25, 1.25].map((o) => (
            <mesh key={o} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, o]}>
              <planeGeometry args={[4.9, 0.1]} />
              <meshStandardMaterial color="#f1f1ee" roughness={0.9} />
            </mesh>
          ))}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[2.45, 0, 0]}>
            <planeGeometry args={[0.1, 2.6]} />
            <meshStandardMaterial color="#f1f1ee" roughness={0.9} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, -Math.PI / 2]} position={[-2.0, 0, 0]}>
            <planeGeometry args={[0.7, 0.42]} />
            <meshStandardMaterial map={textTexture(`P${s.id - 3}`, { bg: '#7a7d82', fg: '#f1f1ee', w: 128, h: 77, font: 60 })} roughness={0.9} />
          </mesh>
        </group>
      ))}
      {has('parking') &&
        [-9, -16].map((x) => (
          <group key={x} position={[x, 0, -8.7]}>
            <Box p={[0, 2.6, 0]} s={[0.12, 5.2, 0.12]} c="#59606a" m={0.6} />
            <Box p={[0, 5.15, 0.4]} s={[0.5, 0.1, 0.9]} c="#f4f8ff" e={1.6} />
          </group>
        ))}
      {has('parking') && <pointLight position={[-12.5, 5, -6]} intensity={30} distance={16} decay={1.6} color="#f4f8ff" />}

      {/* Waschplatz */}
      {has('wash') && (
        <group position={[SLOTS[2].x, 0, SLOTS[2].z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
            <planeGeometry args={[6.4, 4.2]} />
            <meshStandardMaterial color="#9aa3ad" roughness={0.35} metalness={0.1} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
            <planeGeometry args={[1.2, 0.3]} />
            <meshStandardMaterial color="#2c2f34" metalness={0.7} roughness={0.5} />
          </mesh>
          {[-3.1, 3.1].flatMap((x) => [-2.0, 2.0].map((z) => <Box key={`${x}${z}`} p={[x, 1.6, z]} s={[0.14, 3.2, 0.14]} c="#1f6fb2" m={0.5} r={0.5} />))}
          <mesh position={[0, 3.25, 0]}>
            <boxGeometry args={[6.6, 0.08, 4.4]} />
            <meshStandardMaterial color="#bfe0ff" transparent opacity={0.45} roughness={0.2} />
          </mesh>
          <Box p={[2.4, 0.55, 2.25]} s={[0.7, 1.1, 0.5]} c="#e3a81c" m={0.4} r={0.5} />
          <Box p={[2.4, 1.15, 2.25]} s={[0.5, 0.1, 0.3]} c="#23262b" />
          <mesh position={[1.6, 0.6, 2.3]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.26, 0.05, 8, 20]} />
            <meshStandardMaterial color="#16181d" roughness={0.8} />
          </mesh>
          <mesh position={[-2.3, 0.18, 2.2]}>
            <cylinderGeometry args={[0.17, 0.14, 0.36, 14]} />
            <meshStandardMaterial color="#c81e1e" roughness={0.5} />
          </mesh>
          <Box p={[-1.5, 0.4, 2.3]} s={[0.5, 0.8, 0.4]} c="#3f4650" m={0.5} />
          <Sign text="WASCHPLATZ" p={[0, 2.85, 2.06]} rot={[0, Math.PI, 0]} size={[2.2, 0.36]} bg="#1f6fb2" />
        </group>
      )}

      {/* Lackierkabine */}
      {has('paint') && (
        <group position={[SLOTS[3].x, 0, SLOTS[3].z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
            <planeGeometry args={[6.6, 4.6]} />
            <meshStandardMaterial color="#c9ccd1" roughness={0.3} metalness={0.2} />
          </mesh>
          <Box p={[0, 1.6, 2.35]} s={[6.8, 3.2, 0.12]} c="#eef1f4" r={0.5} />
          {[-3.35, 3.35].map((x) => (
            <Box key={x} p={[x, 1.6, 0.9]} s={[0.12, 3.2, 2.9]} c="#eef1f4" r={0.5} />
          ))}
          <Box p={[0, 3.26, 0]} s={[6.8, 0.12, 4.8]} c="#dfe3e8" r={0.5} />
          {[-1.8, 0, 1.8].map((x) => (
            <Box key={x} p={[x, 3.18, 0]} s={[1.2, 0.04, 2.6]} c="#ffffff" e={1.5} />
          ))}
          <Box p={[2.6, 0.5, 1.9]} s={[0.6, 1.0, 0.5]} c="#59606a" m={0.5} />
          {['#1d3fae', '#7a1f24', '#e3a81c'].map((c, i) => (
            <mesh key={c} position={[2.45 + i * 0.17, 1.1, 1.9]}>
              <cylinderGeometry args={[0.07, 0.07, 0.2, 12]} />
              <meshStandardMaterial color={c} roughness={0.4} />
            </mesh>
          ))}
          <Sign text="LACKIERKABINE" p={[0, 2.85, -2.42]} size={[2.6, 0.36]} bg="#7a1f24" />
          <pointLight position={[0, 2.8, 0]} intensity={18} distance={8} decay={1.6} />
        </group>
      )}

      {/* Lageranbau */}
      {has('expansion') && (
        <group position={[-22.1, 0, 2.0]}>
          <Box p={[0, 1.3, 0]} s={[1.5, 2.6, 3.8]} c="#24406e" m={0.5} r={0.6} />
          {[-1.6, -0.8, 0, 0.8, 1.6].map((z) => (
            <Box key={z} p={[0.76, 1.3, z]} s={[0.03, 2.5, 0.08]} c="#1b3157" m={0.5} />
          ))}
          <Sign text="LAGER" p={[0.78, 2.1, 0]} rot={[0, Math.PI / 2, 0]} size={[1.4, 0.36]} bg="#e3a81c" fg="#16181d" />
          {[[1.3, 0.25, -1.2], [1.4, 0.25, 0.4], [1.3, 0.75, -1.2]].map((q, i) => (
            <Box key={i} p={q as V3} s={[0.7, 0.5, 0.9]} c="#a9825a" r={0.9} />
          ))}
        </group>
      )}
    </group>
  );
}
