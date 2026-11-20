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

/** Feine Grasstruktur zum Einfärben des Geländes (Graustufen um Weiß: hellt die Vertexfarben nur leicht ab). */
export function grassDetailTexture() {
  const t = canvasTexture('grassDetail', [256, 256], (c, w, h) => {
    const r = rng(53);
    c.fillStyle = '#ececec';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const v = 175 + Math.floor(r() * 80);
      c.fillStyle = `rgba(${v},${v},${v},0.55)`;
      // kurze Halme
      const x = r() * w;
      const y = r() * h;
      c.fillRect(x, y, 1, 2 + r() * 3);
    }
    for (let i = 0; i < 18; i++) {
      const sx = r() * w;
      const sy = r() * h;
      const g = c.createRadialGradient(sx, sy, 2, sx, sy, 20 + r() * 50);
      g.addColorStop(0, 'rgba(160,160,160,0.25)');
      g.addColorStop(1, 'rgba(160,160,160,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** Bergkette am Horizont: mehrere hintereinander liegende Silhouetten im Dunst (oben durchsichtig). */
export function mountainTexture() {
  const t = canvasTexture('mountains', [2048, 256], (c, w, h) => {
    const r = rng(77);
    c.clearRect(0, 0, w, h);
    const layers: [string, number, number, number][] = [
      ['rgba(150,170,195,0.9)', 0.42, 70, 3],
      ['rgba(120,145,170,0.95)', 0.55, 55, 5],
      ['rgba(95,120,120,1)', 0.7, 30, 9],
    ];
    for (const [col, base, amp, freq] of layers) {
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(0, h);
      const ph = r() * 10;
      const ph2 = r() * 10;
      for (let x = 0; x <= w; x += 8) {
        const u = (x / w) * Math.PI * 2;
        // Periodisch über die volle Breite (nahtlos um den Horizont)
        const y = h * base - amp * (0.55 * Math.sin(u * freq + ph) + 0.3 * Math.sin(u * freq * 2.7 + ph2) + 0.15 * Math.sin(u * freq * 6.1));
        c.lineTo(x, y);
      }
      c.lineTo(w, h);
      c.closePath();
      c.fill();
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Straßenbelag: feine Körnung ohne Risse (wird über 6 m gekachelt). */
export function roadTexture() {
  const t = canvasTexture('road', [256, 256], (c, w, h) => {
    const r = rng(91);
    c.fillStyle = '#9a9da2';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 14000; i++) {
      const v = 110 + Math.floor(r() * 110);
      c.fillStyle = `rgba(${v},${v},${v + 2},0.45)`;
      c.fillRect(r() * w, r() * h, 1 + r(), 1 + r());
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Reifenstapel von der Seite: drei Reihen Altreifen, oben ein rot-weißes Förderband (wie an echten Rennstrecken). */
export function tyreWallTexture() {
  const t = canvasTexture('tyrewall', [256, 128], (g, w, h) => {
    g.fillStyle = '#121214';
    g.fillRect(0, 0, w, h);
    const belt = 22;
    for (let x = 0; x < w; x += 64) {
      g.fillStyle = (x / 64) % 2 ? '#d22a22' : '#f1f1ee';
      g.fillRect(x, 0, 64, belt);
    }
    const rows = 3;
    const rh = (h - belt) / rows;
    for (let r = 0; r < rows; r++)
      for (let x = (r % 2) * 16; x < w + 32; x += 32) {
        const y = belt + r * rh;
        const grd = g.createLinearGradient(0, y, 0, y + rh);
        grd.addColorStop(0, '#2b2c30');
        grd.addColorStop(0.5, '#1a1b1e');
        grd.addColorStop(1, '#0b0b0c');
        g.fillStyle = grd;
        g.beginPath();
        g.roundRect(x - 15, y + 1.5, 30, rh - 3, 6);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.06)';
        g.fillRect(x - 12, y + 4, 24, 2);
      }
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Werbebanden: vier erfundene Werbeflächen nebeneinander (Werkstatt, Öl, Reifen, Zündkerzen). */
export function adBoardTexture() {
  const ads: [string, string, string][] = [
    ['GARAGE KINGS', '#16181d', '#ff7a1a'],
    ['VOLLGAS ÖL', '#f2c200', '#141414'],
    ['GRIP REIFEN', '#1d3f8f', '#ffffff'],
    ['FUNKE ZÜNDKERZEN', '#c8231e', '#ffffff'],
  ];
  const t = canvasTexture('adboards', [2048, 128], (g, w, h) => {
    const pw = w / ads.length;
    ads.forEach(([text, bg, fg], i) => {
      g.fillStyle = bg;
      g.fillRect(i * pw, 0, pw, h);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(i * pw, 0, pw, 10);
      g.fillStyle = fg;
      g.font = `900 ${text.length > 13 ? 58 : 70}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, i * pw + pw / 2, h / 2 + 4, pw - 30);
      g.fillStyle = '#0c0d10';
      g.fillRect(i * pw, 0, 4, h);
    });
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Quer über die Fahrspur: dunkler Gummiabrieb, zu den Rändern weich auslaufend (als Alpha). */
export function rubberTexture() {
  const t = canvasTexture('rubber', [64, 64], (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, '#000');
    grd.addColorStop(0.25, '#9a9a9a');
    grd.addColorStop(0.4, '#c8c8c8');
    grd.addColorStop(0.5, '#8a8a8a');
    grd.addColorStop(0.6, '#c8c8c8');
    grd.addColorStop(0.75, '#9a9a9a');
    grd.addColorStop(1, '#000');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
