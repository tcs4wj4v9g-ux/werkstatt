import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { TEST_MODE, useGfx, type GfxLevel } from './gfx';

type Kind = 'workshop' | 'sky';
const cache = new Map<string, { gl: THREE.WebGLRenderer; tex: THREE.Texture }>();

const glow = (hex: string, k: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.DoubleSide });

/** Werkstatthalle als Spiegelbild: helle Lichtbänder an der Decke geben auf dem Lack lange Glanzstreifen. */
function workshopScene() {
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 14), [
    glow('#b9b7b0', 0.55), glow('#b9b7b0', 0.55), glow('#8f8f8c', 0.5), glow('#6f7276', 0.45), glow('#b9b7b0', 0.55), glow('#b9b7b0', 0.55),
  ].map((m) => ((m.side = THREE.BackSide), m)));
  room.position.y = 2.2;
  s.add(room);
  // Leuchtstoffbänder
  for (const z of [-4.2, -1.4, 1.4, 4.2]) {
    for (const x of [-3, 3]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.05, 0.42), glow('#f6f9ff', 9));
      strip.position.set(x, 4.55, z);
      s.add(strip);
    }
  }
  // Oberlichter und offenes Tor
  for (const z of [-6.95, 6.95]) {
    for (const x of [-3.5, 2]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(3, 1), glow('#cfe4fb', 3.2));
      win.position.set(x, 3.4, z);
      s.add(win);
    }
  }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), glow('#d8e9fb', 2.6));
  door.position.set(-6.95, 1.5, 0);
  door.rotation.y = Math.PI / 2;
  s.add(door);
  // Dunkler Sockel und warme Akzente (Hebebühnen, Zierstreifen)
  const band = new THREE.Mesh(new THREE.BoxGeometry(13.9, 1.2, 13.9), glow('#3f4a57', 0.5));
  (band.material as THREE.Material).side = THREE.BackSide;
  band.position.y = 0.3;
  s.add(band);
  for (const z of [-1.5, 1.5]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 0.3), glow('#e3a81c', 0.9));
    post.position.set(0.4, 1.8, z * 2.4);
    s.add(post);
  }
  return s;
}

/** Freier Himmel: heller Horizont, blauer Zenit, dunkler Boden, Sonne. */
function skyScene() {
  const s = new THREE.Scene();
  const geo = new THREE.SphereGeometry(20, 32, 16);
  const pos = geo.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const zenith = new THREE.Color('#4f86d8').multiplyScalar(1.1);
  const horizon = new THREE.Color('#e9f1fa').multiplyScalar(1.7);
  const ground = new THREE.Color('#5c5e58').multiplyScalar(0.7);
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / 20;
    if (h >= 0) c.copy(horizon).lerp(zenith, Math.pow(h, 0.45));
    else c.copy(horizon).multiplyScalar(0.6).lerp(ground, Math.min(1, -h * 6));
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  s.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const sun = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 8), glow('#fff6e0', 30));
  sun.position.set(8, 12, 6);
  s.add(sun);
  // Ein paar helle Wolkenbänke für lebendigere Spiegelungen
  for (const [x, y, z, w] of [[-9, 7, -12, 9], [12, 6, -6, 7], [-12, 8, 8, 8]] as const) {
    const cloud = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), glow('#ffffff', 2.4));
    cloud.position.set(x, y, z);
    cloud.scale.set(w, 1.1, 3.5);
    s.add(cloud);
  }
  return s;
}

/** Umgebungsbild für Spiegelungen auf Lack, Glas und Chrom (einmal pro Renderer und Art erzeugt). */
export function Env({ intensity = 0.6, kind = 'workshop' }: { intensity?: number; kind?: Kind }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    let entry = cache.get(kind);
    if (!entry || entry.gl !== gl) {
      const pmrem = new THREE.PMREMGenerator(gl);
      const src = kind === 'sky' ? skyScene() : workshopScene();
      entry = { gl, tex: pmrem.fromScene(src, 0.03).texture };
      src.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []).forEach((x) => x.dispose());
      });
      pmrem.dispose();
      cache.set(kind, entry);
    }
    scene.environment = entry.tex;
    scene.environmentIntensity = intensity;
    return () => {
      scene.environment = null;
    };
  }, [gl, scene, intensity, kind]);
  return null;
}

const LOWER: Record<GfxLevel, GfxLevel | null> = { high: 'medium', medium: 'low', low: null };

/**
 * Misst die Bildrate. In der Automatik wird bei dauerhaft zu niedriger Bildrate
 * zuerst die Auflösung, dann die Grafikstufe gesenkt (nie von selbst wieder erhöht).
 */
export function Perf() {
  const acc = useRef({ t: 0, n: 0, slow: 0, warm: 0 });
  useFrame((_, dt) => {
    const a = acc.current;
    a.t += dt;
    a.n++;
    if (a.t < 2) return;
    const fps = a.n / a.t;
    a.t = 0;
    a.n = 0;
    const g = useGfx.getState();
    if (Math.abs(g.fps - fps) > 1) useGfx.setState({ fps: Math.round(fps) });
    // Die ersten Sekunden (Laden, Übersetzen der Shader) und Hintergrund-Tabs zählen nicht.
    if (a.warm++ < 3 || document.hidden || !g.auto || TEST_MODE) return;
    a.slow = fps < 27 ? a.slow + 1 : 0;
    if (a.slow < 3) return;
    a.slow = 0;
    a.warm = 1;
    if (g.scale > 0.72) useGfx.setState({ scale: g.scale - 0.14 });
    else if (LOWER[g.level]) g.set(LOWER[g.level]!, true);
  });
  return null;
}
