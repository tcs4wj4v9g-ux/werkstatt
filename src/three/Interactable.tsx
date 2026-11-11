import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import { useGame } from '../game/store';
import { REACH, stationActions, useFocus } from './player';

type V3 = [number, number, number];

/**
 * Station in der Werkstatt, die man ansehen und benutzen kann. Im Blick wird
 * sie mit einem leuchtenden Rahmen hervorgehoben; Antippen oder der
 * „Benutzen“-Knopf lösen die Aktion aus.
 */
export function Interactable({
  id,
  label,
  onUse,
  halo,
  haloPos = [0, 0, 0],
  position,
  rotation,
  children,
}: {
  id: string;
  label: string;
  onUse(): void;
  halo: V3;
  haloPos?: V3;
  position?: V3;
  rotation?: V3;
  children: ReactNode;
}) {
  const focused = useFocus((f) => f.id === id);
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(...halo)), [halo.join()]);
  useEffect(() => {
    stationActions.set(id, onUse);
    return () => void stationActions.delete(id);
  }, [id, onUse]);

  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 10) return;
    if (e.distance > REACH) return useGame.getState().say('Zu weit weg – geh näher heran.', true);
    onUse();
  };

  return (
    <group position={position} rotation={rotation} userData={{ stationId: id, label }} onClick={click}>
      {children}
      {focused && (
        <mesh position={haloPos} userData={{ noProbe: true }} raycast={() => null}>
          <boxGeometry args={halo} />
          <meshBasicMaterial color="#ffd23f" transparent opacity={0.16} depthWrite={false} />
        </mesh>
      )}
      {focused && (
        <lineSegments position={haloPos} geometry={edges} userData={{ noProbe: true }} raycast={() => null}>
          <lineBasicMaterial color="#ffd23f" />
        </lineSegments>
      )}
    </group>
  );
}
