import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { CAR_MODELS } from '../game/data/cars';
import { useGame, type View } from '../game/store';
import { CarModel } from './CarModel';
import { OrbitRig } from './OrbitRig';

type V3 = [number, number, number];
const LIFT = 1.05;

const VIEWS: Record<View, (h: number) => { target: V3; position: V3 }> = {
  overview: (h) => ({ target: [0, 0.7 + h, 0], position: [5.6, 2.3 + h * 0.6, 2.9] }),
  engine: (h) => ({ target: [1.3, 0.72 + h, 0], position: [2.75, 1.75 + h, 0.95] }),
  wheel_fl: (h) => ({ target: [1.38, 0.36 + h, -0.86], position: [1.75, 0.6 + h, -2.3] }),
  wheel_fr: (h) => ({ target: [1.38, 0.36 + h, 0.86], position: [1.75, 0.6 + h, 2.3] }),
};

export function GarageScene() {
  const car = useGame((s) => s.car);
  const view = useGame((s) => s.view);
  const tapHood = useGame((s) => s.tapHood);
  const tapComponent = useGame((s) => s.tapComponent);
  const tapBolt = useGame((s) => s.tapBolt);
  const lift = useRef<THREE.Group>(null);
  const h = car?.lifted ? LIFT : 0;

  useFrame((_, dt) => {
    if (lift.current) lift.current.position.y += (h - lift.current.position.y) * Math.min(1, dt * 4);
  });

  const v = VIEWS[view](h);
  return (
    <>
      <color attach="background" args={['#1a1d22']} />
      <ambientLight intensity={0.9} />
      <hemisphereLight args={['#ffffff', '#30343a', 0.8]} />
      <directionalLight position={[4, 8, 5]} intensity={1.6} />
      <directionalLight position={[-5, 6, -4]} intensity={0.7} />
      <pointLight position={[2.6, 1.8 + h, 0]} intensity={6} distance={5} />
      {[-1, 1].map((k) => (
        <pointLight key={k} position={[1.8, 0.8 + h, k * 2.6]} intensity={8} distance={5} />
      ))}
      <OrbitRig target={v.target} position={v.position} />

      {/* Halle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[18, 14]} />
        <meshStandardMaterial color="#565a60" roughness={0.9} />
      </mesh>
      {[[0, -7, 0, 18], [-9, 0, Math.PI / 2, 14], [9, 0, -Math.PI / 2, 14]].map(([x, z, r, w], i) => (
        <mesh key={i} position={[x, 2.5, z]} rotation={[0, r, 0]}>
          <planeGeometry args={[w, 5]} />
          <meshStandardMaterial color="#8d949c" roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[0, 0.55, -6.99]}>
        <planeGeometry args={[18, 1.1]} />
        <meshStandardMaterial color="#c8501e" />
      </mesh>
      {/* Werkbank + Werkzeugwagen */}
      <mesh position={[-4, 0.45, -6.4]}>
        <boxGeometry args={[3, 0.9, 0.8]} />
        <meshStandardMaterial color="#5b4630" roughness={0.8} />
      </mesh>
      <mesh position={[3.5, 0.5, -6.3]}>
        <boxGeometry args={[1.2, 1, 0.7]} />
        <meshStandardMaterial color="#b3261e" metalness={0.4} roughness={0.5} />
      </mesh>
      {/* Markierung + Hebebühnen-Säulen */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <planeGeometry args={[5.6, 2.9]} />
        <meshStandardMaterial color="#4a4e54" roughness={0.9} />
      </mesh>
      {[-1.75, 1.75].map((z) => (
        <mesh key={z} position={[0, 1.4, z]}>
          <boxGeometry args={[0.2, 2.8, 0.2]} />
          <meshStandardMaterial color="#e3a81c" metalness={0.3} roughness={0.6} />
        </mesh>
      ))}

      <group ref={lift}>
        {[-1.2, 1.2].map((z) => (
          <mesh key={z} position={[0, 0.2, z]}>
            <boxGeometry args={[1.9, 0.08, 0.14]} />
            <meshStandardMaterial color="#e3a81c" metalness={0.3} roughness={0.6} />
          </mesh>
        ))}
        {car && (
          <CarModel
            body={CAR_MODELS[car.modelId].body}
            color={car.color}
            car={car}
            handlers={{ onHood: tapHood, onComponent: tapComponent, onBolt: tapBolt }}
          />
        )}
      </group>
    </>
  );
}
