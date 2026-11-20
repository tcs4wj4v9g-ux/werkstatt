import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

/** Richtung zur Sonne (passt zum Hauptlicht der Fahrszene). */
export const SUN_DIR = new THREE.Vector3(120, 180, 60).normalize();
/** Dunst am Horizont – Nebelfarbe der Fahrszene, damit Gelände und Himmel nahtlos ineinander übergehen. */
export const HAZE = '#c9dbea';

/**
 * Himmel wie in Rennspielen: Verlauf vom dunstigen Horizont zum tiefen Blau, heller Hof um die Sonne und ziehende
 * Haufenwolken. Eine Kugel um die Kamera mit einem kleinen Shader (ein Zeichenaufruf, keine Texturen).
 */
export function DriveSky() {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uSun: { value: SUN_DIR.clone() },
          uTime: { value: 0 },
          uZenith: { value: new THREE.Color('#3d73c4') },
          uHorizon: { value: new THREE.Color(HAZE) },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          precision mediump float;
          varying vec3 vDir;
          uniform vec3 uSun; uniform float uTime; uniform vec3 uZenith; uniform vec3 uHorizon;
          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
          }
          float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
          void main() {
            vec3 d = normalize(vDir);
            float h = max(d.y, 0.0);
            vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
            // Sonne: heller Hof und kleine Scheibe
            float s = max(dot(d, uSun), 0.0);
            col += vec3(1.0, 0.93, 0.78) * (pow(s, 8.0) * 0.35 + pow(s, 600.0) * 2.5);
            // Wolken auf einer gedachten Ebene über der Landschaft, zum Horizont hin dünner
            if (d.y > 0.02) {
              vec2 uv = d.xz / (d.y + 0.08) * 1.4 + vec2(uTime * 0.004, uTime * 0.0015);
              float c = fbm(uv);
              float cover = smoothstep(0.52, 0.78, c) * smoothstep(0.02, 0.22, d.y);
              float shade = mix(0.78, 1.05, smoothstep(0.5, 0.9, fbm(uv * 1.7 + 3.1)));
              vec3 cloud = vec3(1.0, 0.99, 0.97) * shade + vec3(1.0, 0.9, 0.7) * pow(s, 6.0) * 0.25;
              col = mix(col, cloud, cover * 0.92);
            }
            // unter dem Horizont: Dunst (wird ohnehin vom Gelände verdeckt)
            if (d.y < 0.0) col = uHorizon;
            gl_FragColor = vec4(col, 1.0);
          }`,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    [],
  );
  useFrame(({ camera }, dt) => {
    if (!ref.current) return;
    ref.current.position.copy(camera.position);
    mat.uniforms.uTime.value += dt;
  });
  return (
    <mesh ref={ref} material={mat} renderOrder={-3} frustumCulled={false} raycast={() => null}>
      <sphereGeometry args={[800, 32, 16]} />
    </mesh>
  );
}

let blob: THREE.Texture | null = null;
/** Weicher, runder Schatten (Kontaktschatten) – dunkle Mitte, zum Rand ausblendend. */
export function blobTexture() {
  if (blob) return blob;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  r.addColorStop(0, 'rgba(0,0,0,0.85)');
  r.addColorStop(0.55, 'rgba(0,0,0,0.6)');
  r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  blob = new THREE.CanvasTexture(c);
  return blob;
}

const shadowMat = () => new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.75, polygonOffset: true, polygonOffsetFactor: -2 });
let mat0: THREE.MeshBasicMaterial | null = null;
/** Kontaktschatten unter einem Auto (Länge × Breite in m) – im Fahrzeug-Koordinatensystem, x = Längsachse. */
export function CarShadow({ length = 4.9, width = 2.3 }: { length?: number; width?: number }) {
  if (!mat0) mat0 = shadowMat();
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} material={mat0} renderOrder={1} raycast={() => null}>
      <planeGeometry args={[length, width]} />
    </mesh>
  );
}
