import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import { CAR_MODELS } from '../game/data/cars';
import { useGame } from '../game/store';
import { CarModel } from './CarModel';
import { Env } from './Env';
import { OrbitRig } from './OrbitRig';

const SPACING = 4.4;

/** Händlerhof: hier werden Angebote vor Ort besichtigt. `showroom` = Hintergrund des Hauptmenüs. */
export function MarketScene({ showroom = false }: { showroom?: boolean }) {
  const source = useGame((s) => s.marketSource);
  const market = useGame((s) => s.listings);
  const auctions = useGame((s) => s.auctions);
  const listings = source === 'auctions' ? auctions.map((a) => ({ id: a.id, car: a.car })) : market;
  const selected = useGame((s) => s.selected);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const offset = (i: number) => (i - (listings.length - 1) / 2) * SPACING;
  const z = showroom ? 0 : offset(Math.min(selected, listings.length - 1));

  useEffect(() => {
    camera.fov = 45;
    camera.updateProjectionMatrix();
  }, [camera]);

  return (
    <>
      <color attach="background" args={['#9fc4e8']} />
      <fog attach="fog" args={['#9fc4e8', 30, 90]} />
      <Env intensity={0.8} />
      <ambientLight intensity={0.7} />
      <hemisphereLight args={['#ffffff', '#6b6f58', 0.8]} />
      <directionalLight
        position={[8, 12, 6 + z]}
        intensity={2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-bias={-0.0004}
      />
      <OrbitRig target={[0, 0.7, z]} position={[5.2, 2.1, z + 3.4]} minDist={3} maxDist={11} />

      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#6f8f55" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[16, 26]} />
        <meshStandardMaterial color="#4b4e53" roughness={0.95} />
      </mesh>
      {/* Verkaufsbüro + Wimpelmasten */}
      <mesh position={[-6.5, 1.4, 0]}>
        <boxGeometry args={[2.5, 2.8, 6]} />
        <meshStandardMaterial color="#e8e4da" roughness={0.9} />
      </mesh>
      <mesh position={[-6.5, 2.95, 0]}>
        <boxGeometry args={[2.9, 0.3, 6.4]} />
        <meshStandardMaterial color="#c8501e" />
      </mesh>
      {[-9, -3, 3, 9].map((pz) => (
        <group key={pz} position={[7.5, 0, pz]}>
          <mesh position={[0, 2, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 4, 6]} />
            <meshStandardMaterial color="#ddd" />
          </mesh>
          <mesh position={[0, 3.7, 0.3]}>
            <boxGeometry args={[0.02, 0.5, 0.6]} />
            <meshStandardMaterial color={pz % 2 ? '#e3a81c' : '#c8501e'} />
          </mesh>
        </group>
      ))}

      {showroom ? (
        <CarModel body="sedan" color="#1f2a44" lod="simple" />
      ) : (
        listings.map((l, i) => (
          <group key={l.id} position={[0, 0, offset(i)]}>
            <CarModel body={CAR_MODELS[l.car.modelId].body} color={l.car.color} car={l.car} lod="simple" />
            {i === selected && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
                <ringGeometry args={[2.75, 2.9, 48]} />
                <meshBasicMaterial color="#ffd23f" />
              </mesh>
            )}
            {i === selected && (
              <group position={[1.2, 0, 1.9]}>
                <mesh position={[0, 0.75, 0]} castShadow>
                  <capsuleGeometry args={[0.2, 0.9, 4, 10]} />
                  <meshStandardMaterial color="#3b4a66" roughness={0.8} />
                </mesh>
                <mesh position={[0, 1.6, 0]}>
                  <sphereGeometry args={[0.16, 14, 12]} />
                  <meshStandardMaterial color="#e2b48c" roughness={0.8} />
                </mesh>
              </group>
            )}
          </group>
        ))
      )}
    </>
  );
}
