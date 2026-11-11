import { CAR_MODELS } from '../game/data/cars';
import { useGame } from '../game/store';
import { CarModel } from './CarModel';
import { OrbitRig } from './OrbitRig';

const SPACING = 4.2;

export function MarketScene({ showroom = false }: { showroom?: boolean }) {
  const listings = useGame((s) => s.listings);
  const selected = useGame((s) => s.selected);
  const z = showroom ? 0 : (selected - 1) * SPACING;
  return (
    <>
      <color attach="background" args={['#9fc4e8']} />
      <fog attach="fog" args={['#9fc4e8', 30, 90]} />
      <ambientLight intensity={1.1} />
      <hemisphereLight args={['#ffffff', '#6b6f58', 0.9]} />
      <directionalLight position={[8, 12, 6]} intensity={2} />
      <OrbitRig target={[0, 0.7, z]} position={[5.2, 2.1, z + 3.4]} minDist={3} maxDist={11} />

      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#6f8f55" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[16, 22]} />
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
        <CarModel body="sedan" color="#2a3a5c" />
      ) : (
        listings.map((l, i) => (
          <group key={l.id} position={[0, 0, (i - 1) * SPACING]}>
            <CarModel body={CAR_MODELS[l.car.modelId].body} color={l.car.color} />
            {i === selected && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
                <ringGeometry args={[2.7, 2.85, 48]} />
                <meshBasicMaterial color="#ffd23f" />
              </mesh>
            )}
            {/* Verkäufer */}
            {i === selected && (
              <group position={[1.2, 0, 1.9]}>
                <mesh position={[0, 0.75, 0]}>
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
