import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

let cached: { gl: THREE.WebGLRenderer; tex: THREE.Texture } | null = null;

/** Umgebungsbild für Spiegelungen auf Lack, Glas und Chrom (einmal pro Renderer erzeugt). */
export function Env({ intensity = 0.6 }: { intensity?: number }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    if (!cached || cached.gl !== gl) {
      const pmrem = new THREE.PMREMGenerator(gl);
      cached = { gl, tex: pmrem.fromScene(new RoomEnvironment(), 0.04).texture };
      pmrem.dispose();
    }
    scene.environment = cached.tex;
    (scene as any).environmentIntensity = intensity;
    return () => {
      scene.environment = null;
    };
  }, [gl, scene, intensity]);
  return null;
}
