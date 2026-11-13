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

/** Beschichteter Werkstattboden: Platten mit Fugen, Flecken, Reifenspuren. */
export function concreteTexture() {
  const t = canvasTexture('concrete', [1024, 1024], (c, w, h) => {
    const r = rng(7);
    c.fillStyle = '#7e8389';
    c.fillRect(0, 0, w, h);
    // Wolkige Helligkeitsunterschiede
    for (let i = 0; i < 60; i++) {
      const sx = r() * w;
      const sy = r() * h;
      const g = c.createRadialGradient(sx, sy, 4, sx, sy, 80 + r() * 160);
      const v = r() > 0.5 ? 255 : 20;
      g.addColorStop(0, `rgba(${v},${v},${v},0.06)`);
      g.addColorStop(1, `rgba(${v},${v},${v},0)`);
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }
    for (let i = 0; i < 26000; i++) {
      const v = 100 + Math.floor(r() * 60);
      c.fillStyle = `rgba(${v},${v + 2},${v + 6},0.28)`;
      c.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
    // Ölflecken und Reifenabrieb
    for (let i = 0; i < 10; i++) {
      const sx = r() * w;
      const sy = r() * h;
      const g = c.createRadialGradient(sx, sy, 2, sx, sy, 24 + r() * 60);
      g.addColorStop(0, 'rgba(26,24,22,0.3)');
      g.addColorStop(1, 'rgba(26,24,22,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }
    c.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      c.strokeStyle = `rgba(20,20,22,${0.06 + r() * 0.07})`;
      c.lineWidth = 16 + r() * 10;
      c.beginPath();
      const x0 = r() * w;
      const y0 = r() * h;
      c.moveTo(x0, y0);
      c.quadraticCurveTo(x0 + (r() - 0.5) * 300, y0 + (r() - 0.5) * 300, x0 + (r() - 0.5) * 600, y0 + (r() - 0.5) * 200);
      c.stroke();
    }
    // Fugen der Bodenplatten (2 × 2 je Kachel) mit heller Kante
    for (const k of [0, w / 2]) {
      c.fillStyle = 'rgba(30,32,36,0.6)';
      c.fillRect(k - 2, 0, 4, h);
      c.fillRect(0, k - 2, w, 4);
      c.fillStyle = 'rgba(255,255,255,0.1)';
      c.fillRect(k + 2, 0, 2, h);
      c.fillRect(0, k + 2, w, 2);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Asphalt für Hof und Händlerplatz: feine Körnung, hellere Flickstellen, einzelne Risse. */
export function asphaltTexture() {
  const t = canvasTexture('asphalt', [512, 512], (c, w, h) => {
    const r = rng(31);
    c.fillStyle = '#8a8d92';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 26000; i++) {
      const v = 95 + Math.floor(r() * 90);
      c.fillStyle = `rgba(${v},${v},${v + 3},0.4)`;
      c.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5);
    }
    for (let i = 0; i < 14; i++) {
      const sx = r() * w;
      const sy = r() * h;
      const g = c.createRadialGradient(sx, sy, 4, sx, sy, 40 + r() * 90);
      const v = r() > 0.5 ? 200 : 40;
      g.addColorStop(0, `rgba(${v},${v},${v},0.1)`);
      g.addColorStop(1, `rgba(${v},${v},${v},0)`);
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }
    c.strokeStyle = 'rgba(30,30,32,0.35)';
    c.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      let x = r() * w;
      let y = r() * h;
      c.beginPath();
      c.moveTo(x, y);
      for (let k = 0; k < 9; k++) {
        x += (r() - 0.5) * 50;
        y += (r() - 0.3) * 40;
        c.lineTo(x, y);
      }
      c.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Glanzverteilung des Bodens: blanke Laufwege, stumpfe Fugen und Flecken. */
export function floorRoughTexture() {
  const t = canvasTexture('floor-rough', [256, 256], (c, w, h) => {
    const r = rng(23);
    c.fillStyle = 'rgb(128,128,128)';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      const sx = r() * w;
      const sy = r() * h;
      const g = c.createRadialGradient(sx, sy, 2, sx, sy, 20 + r() * 50);
      const v = r() > 0.45 ? 70 : 190;
      g.addColorStop(0, `rgba(${v},${v},${v},0.5)`);
      g.addColorStop(1, `rgba(${v},${v},${v},0)`);
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }
    c.fillStyle = 'rgb(215,215,215)';
    for (const k of [0, w / 2]) {
      c.fillRect(k - 1, 0, 2, h);
      c.fillRect(0, k - 1, w, 2);
    }
  });
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Gestrichenes Mauerwerk aus großen Steinen; die Fugen haben eine helle und eine dunkle Kante. */
export function wallTexture() {
  const t = canvasTexture('wall', [512, 512], (c, w, h) => {
    const r = rng(11);
    c.fillStyle = '#dcd9cf';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const v = 195 + Math.floor(r() * 40);
      c.fillStyle = `rgba(${v},${v - 3},${v - 12},0.25)`;
      c.fillRect(r() * w, r() * h, 2, 2);
    }
    const bh = 64;
    const bw = 128;
    for (let y = 0; y < h; y += bh) {
      for (let x = (y / bh) % 2 ? -bw / 2 : 0; x < w; x += bw) {
        // Jeder Stein leicht anders getönt
        const v = Math.floor(r() * 16);
        c.fillStyle = `rgba(${90 + v},${85 + v},${75 + v},0.05)`;
        c.fillRect(x + 2, y + 2, bw - 4, bh - 4);
        c.fillStyle = 'rgba(95,88,78,0.4)';
        c.fillRect(x, y, bw, 2);
        c.fillRect(x, y, 2, bh);
        c.fillStyle = 'rgba(255,255,255,0.35)';
        c.fillRect(x + 2, y + 2, bw - 2, 1);
        c.fillRect(x + 2, y + 2, 1, bh - 2);
      }
    }
    // Schmutzfahnen von oben
    for (let i = 0; i < 8; i++) {
      const x = r() * w;
      const g = c.createLinearGradient(0, 0, 0, 120 + r() * 200);
      g.addColorStop(0, 'rgba(70,64,54,0.1)');
      g.addColorStop(1, 'rgba(70,64,54,0)');
      c.fillStyle = g;
      c.fillRect(x, 0, 8 + r() * 26, h);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Weicher Schattenverlauf (dunkel am Rand u=0, klar bei u=1) für Raumecken und Wandfüße. */
export function shadeTexture() {
  const t = canvasTexture('shade', [64, 4], (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.42)');
    g.addColorStop(0.35, 'rgba(0,0,0,0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });
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
