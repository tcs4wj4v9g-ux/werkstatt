/**
 * Fahreffekte der Probefahrt: Reifenspuren (dunkel auf Asphalt, braun auf Wiese/Schotter) und Wölkchen
 * (weißer Reifenqualm beim Driften und Durchdrehen, Staub abseits der Straße).
 *
 * Alles aus vorher angelegten Puffern (Ringpuffer für Spuren, fester Vorrat an Wölkchen) – kein Speicherzuwachs
 * während der Fahrt, wenige Zeichenaufrufe fürs iPad.
 */
import * as THREE from 'three';

const MAX_SEGMENTS = 900;
const MAX_PUFFS = 36;

function softDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class DriveEffects {
  readonly group = new THREE.Group();
  private pos = new Float32Array(MAX_SEGMENTS * 6 * 3);
  private col = new Float32Array(MAX_SEGMENTS * 6 * 3);
  private geo = new THREE.BufferGeometry();
  private next = 0;
  private filled = 0;
  private last: ({ x: number; y: number; z: number } | null)[] = [null, null];
  private puffs: { sprite: THREE.Sprite; life: number; max: number; vy: number; grow: number }[] = [];
  private puffNext = 0;
  private spawnAcc = 0;

  constructor() {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.frustumCulled = false;
    mesh.raycast = () => undefined;
    this.group.add(mesh);
    const tex = softDot();
    for (let i = 0; i < MAX_PUFFS; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
      sprite.visible = false;
      sprite.raycast = () => undefined;
      this.group.add(sprite);
      this.puffs.push({ sprite, life: 0, max: 1, vy: 0, grow: 1 });
    }
  }

  /** Spur des Rads `i` an Punkt p (Fahrbahnhöhe); `width` quer, `side` = Querrichtung (Einheitsvektor). Ohne Spur: null. */
  mark(i: number, p: { x: number; y: number; z: number } | null, side: { x: number; z: number }, color: THREE.Color) {
    if (!p) {
      this.last[i] = null;
      return;
    }
    const a = this.last[i];
    if (a && Math.hypot(p.x - a.x, p.z - a.z) < 0.35) return;
    if (a && Math.hypot(p.x - a.x, p.z - a.z) < 3) {
      const w = 0.11;
      const k = this.next * 18;
      const q = [
        [a.x - side.x * w, a.y, a.z - side.z * w],
        [a.x + side.x * w, a.y, a.z + side.z * w],
        [p.x + side.x * w, p.y, p.z + side.z * w],
        [p.x - side.x * w, p.y, p.z - side.z * w],
      ];
      [0, 1, 2, 0, 2, 3].forEach((v, j) => {
        this.pos.set(q[v], k + j * 3);
        this.col.set([color.r, color.g, color.b], k + j * 3);
      });
      this.next = (this.next + 1) % MAX_SEGMENTS;
      this.filled = Math.min(MAX_SEGMENTS, this.filled + 1);
      this.geo.setDrawRange(0, this.filled * 6);
      (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }
    this.last[i] = p;
  }

  /** Wölkchen: `rate` je Sekunde an Punkt p (Reifenqualm weiß, Staub braun). */
  emit(p: { x: number; y: number; z: number }, rate: number, dt: number, color: THREE.Color, size: number) {
    this.spawnAcc += rate * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      const f = this.puffs[this.puffNext];
      this.puffNext = (this.puffNext + 1) % MAX_PUFFS;
      f.sprite.position.set(p.x + (Math.random() - 0.5) * 0.6, p.y + 0.3, p.z + (Math.random() - 0.5) * 0.6);
      f.sprite.material.color.copy(color);
      f.max = 0.9 + Math.random() * 0.6;
      f.life = f.max;
      f.vy = 0.5 + Math.random() * 0.5;
      f.grow = size;
      f.sprite.visible = true;
    }
  }

  update(dt: number) {
    for (const f of this.puffs) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.sprite.visible = false;
        continue;
      }
      const t = 1 - f.life / f.max;
      f.sprite.position.y += f.vy * dt;
      const s = f.grow * (0.6 + t * 2.2);
      f.sprite.scale.set(s, s, s);
      f.sprite.material.opacity = 0.5 * (1 - t);
    }
  }

  clear() {
    this.filled = 0;
    this.next = 0;
    this.geo.setDrawRange(0, 0);
    this.last = [null, null];
    for (const f of this.puffs) {
      f.life = 0;
      f.sprite.visible = false;
    }
  }
}
