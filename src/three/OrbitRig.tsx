import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

type V3 = [number, number, number];

/** Touch-Orbitkamera (1 Finger drehen, 2 Finger zoomen) mit weichen Kamerafahrten zu Ansichten. */
export function OrbitRig({ target, position, minDist = 0.5, maxDist = 10 }: { target: V3; position: V3; minDist?: number; maxDist?: number }) {
  const { camera, gl } = useThree();
  const controls = useMemo(() => new OrbitControls(camera, gl.domElement), [camera, gl]);
  const fly = useRef(0);
  const tgt = useMemo(() => new THREE.Vector3(...target), [target.join()]);
  const pos = useMemo(() => new THREE.Vector3(...position), [position.join()]);

  useEffect(() => {
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = minDist;
    controls.maxDistance = maxDist;
    controls.maxPolarAngle = Math.PI * 0.56;
    controls.rotateSpeed = 0.7;
    const stop = () => (fly.current = 0);
    controls.addEventListener('start', stop);
    camera.position.copy(pos);
    controls.target.copy(tgt);
    return () => {
      controls.removeEventListener('start', stop);
      controls.dispose();
    };
  }, [controls]);

  useEffect(() => {
    fly.current = 1.4;
  }, [tgt, pos]);

  useFrame((_, dt) => {
    if (fly.current > 0) {
      fly.current -= dt;
      const k = Math.min(1, dt * 5);
      camera.position.lerp(pos, k);
      controls.target.lerp(tgt, k);
    }
    controls.update();
  });
  return null;
}
