import * as THREE from 'three';

// Kleine, zur Laufzeit gezeichnete Texturen – keine Bilddateien nötig.
const cache = new Map<string, THREE.Texture>();

function canvasTexture(key: string, size: [number, number], draw: (c: CanvasRenderingContext2D, w: number, h: number) => void) {
  let t = cache.get(key);
  if (t) return t;
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = size;
  draw(canvas.getContext('2d')!, size[0], size[1]);
  t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

// Fester Zufall, damit die Werkstatt bei jedem Start gleich aussieht.
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

export function concreteTexture() {
  const t = canvasTexture('concrete', [512, 512], (c, w, h) => {
    const r = rng(7);
    c.fillStyle = '#7d8187';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const v = 105 + Math.floor(r() * 50);
      c.fillStyle = `rgba(${v},${v + 2},${v + 6},0.35)`;
      c.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
    for (let i = 0; i < 14; i++) {
      const sx = r() * w;
      const sy = r() * h;
      const g = c.createRadialGradient(sx, sy, 2, sx, sy, 30 + r() * 60);
      g.addColorStop(0, 'rgba(30,28,26,0.22)');
      g.addColorStop(1, 'rgba(30,28,26,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }
    c.strokeStyle = 'rgba(40,42,46,0.55)';
    c.lineWidth = 2;
    c.strokeRect(0, 0, w, h); // Fugen der Bodenplatten
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function wallTexture() {
  const t = canvasTexture('wall', [256, 256], (c, w, h) => {
    const r = rng(11);
    c.fillStyle = '#d9d6cc';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) {
      const v = 190 + Math.floor(r() * 40);
      c.fillStyle = `rgba(${v},${v - 3},${v - 12},0.3)`;
      c.fillRect(r() * w, r() * h, 2, 2);
    }
    // Ziegelfugen, leicht durchscheinend unter der Farbe
    c.strokeStyle = 'rgba(120,112,100,0.28)';
    c.lineWidth = 1;
    for (let y = 0; y < h; y += 32) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
      for (let x = (y / 32) % 2 ? 32 : 0; x < w; x += 64) {
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x, y + 32);
        c.stroke();
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function doorTexture() {
  const t = canvasTexture('door', [64, 256], (c, w, h) => {
    for (let y = 0; y < h; y += 32) {
      const g = c.createLinearGradient(0, y, 0, y + 32);
      g.addColorStop(0, '#b9bec5');
      g.addColorStop(0.8, '#8f959d');
      g.addColorStop(1, '#4b4f55');
      c.fillStyle = g;
      c.fillRect(0, y, w, 32);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function textTexture(text: string, opts: { bg?: string; fg?: string; w?: number; h?: number; font?: number; sub?: string } = {}) {
  const { bg = '#16181d', fg = '#f2f3f5', w = 512, h = 128, font = 64, sub } = opts;
  return canvasTexture(`text:${text}:${bg}:${fg}:${w}:${h}:${sub}`, [w, h], (c) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.fillStyle = fg;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `900 ${font}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
    c.fillText(text, w / 2, sub ? h * 0.4 : h / 2, w - 20);
    if (sub) {
      c.font = `600 ${Math.round(font * 0.42)}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
      c.fillText(sub, w / 2, h * 0.78, w - 20);
    }
  });
}

/** Bildschirminhalt des Werkstatt-Computers. */
export function screenTexture() {
  return canvasTexture('screen', [512, 320], (c, w, h) => {
    c.fillStyle = '#0d2238';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#ff7a1a';
    c.fillRect(0, 0, w, 54);
    c.fillStyle = '#fff';
    c.font = '800 30px -apple-system, Arial, sans-serif';
    c.fillText('GEBRAUCHTWAGEN-BÖRSE', 18, 38);
    for (let i = 0; i < 3; i++) {
      c.fillStyle = '#16395c';
      c.fillRect(18, 74 + i * 78, w - 36, 64);
      c.fillStyle = '#9fc4e8';
      c.fillRect(30, 86 + i * 78, 90, 40);
      c.fillStyle = '#e8eef5';
      c.fillRect(136, 90 + i * 78, 200, 12);
      c.fillStyle = '#ffd23f';
      c.fillRect(136, 112 + i * 78, 110, 12);
    }
  });
}
