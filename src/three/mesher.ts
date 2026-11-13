import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Fasst viele kleine Formen zu einer einzigen Geometrie mit Materialgruppen zusammen.
// Ein Auto besteht dadurch aus wenigen Zeichenaufrufen statt aus hunderten Einzelteilen –
// das ist auf dem iPad der wichtigste Hebel für eine flüssige Darstellung.

export type V3 = [number, number, number];

const tmp = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();

export function mat(p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: V3 | number = 1) {
  e.set(r[0], r[1], r[2]);
  q.setFromEuler(e);
  const sc = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s);
  return new THREE.Matrix4().compose(new THREE.Vector3(...p), q, sc);
}

export class Mesher {
  private pos: number[] = [];
  private nor: number[] = [];
  private idx: number[][];
  /** Übergeordnete Verschiebung/Drehung für alle folgenden Formen. */
  base = new THREE.Matrix4();

  constructor(slots: number) {
    this.idx = Array.from({ length: slots }, () => []);
  }

  /** Fügt eine Geometrie hinzu (wird danach freigegeben). */
  add(slot: number, geo: THREE.BufferGeometry, m?: THREE.Matrix4, keep = false) {
    const g = geo;
    tmp.copy(this.base);
    if (m) tmp.multiply(m);
    const nm = new THREE.Matrix3().getNormalMatrix(tmp);
    const p = g.getAttribute('position');
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const n = g.getAttribute('normal');
    const start = this.pos.length / 3;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(tmp);
      this.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      this.nor.push(v.x, v.y, v.z);
    }
    const out = this.idx[slot];
    const flip = tmp.determinant() < 0;
    const index = g.getIndex();
    const count = index ? index.count : p.count;
    for (let i = 0; i < count; i += 3) {
      const a = start + (index ? index.getX(i) : i);
      const b = start + (index ? index.getX(i + 1) : i + 1);
      const c = start + (index ? index.getX(i + 2) : i + 2);
      if (flip) out.push(a, c, b);
      else out.push(a, b, c);
    }
    if (!keep) g.dispose();
    return this;
  }

  box(slot: number, size: V3, p: V3, r?: V3) {
    return this.add(slot, new THREE.BoxGeometry(...size), mat(p, r));
  }

  /** Quader mit gerundeten Kanten. */
  rbox(slot: number, size: V3, radius: number, p: V3, r?: V3, seg = 2) {
    const rad = Math.min(radius, Math.min(...size) / 2 - 0.0005);
    return this.add(slot, new RoundedBoxGeometry(size[0], size[1], size[2], seg, Math.max(0.001, rad)), mat(p, r));
  }

  /** Zylinder entlang Y (vor der Drehung). */
  cyl(slot: number, rTop: number, rBot: number, h: number, p: V3, r?: V3, seg = 14, open = false) {
    return this.add(slot, new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open), mat(p, r));
  }

  sphere(slot: number, radius: number, p: V3, s: V3 | number = 1, seg = 12) {
    return this.add(slot, new THREE.SphereGeometry(radius, seg, Math.max(6, Math.round(seg * 0.7))), mat(p, [0, 0, 0], s));
  }

  torus(slot: number, radius: number, tube: number, p: V3, r?: V3, seg = 20, arc = Math.PI * 2) {
    return this.add(slot, new THREE.TorusGeometry(radius, tube, 6, seg, arc), mat(p, r));
  }

  /** Rohr/Schlauch entlang einer Punktfolge (weich gebogen). */
  tube(slot: number, pts: V3[], radius: number, seg = 6) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
    return this.add(slot, new THREE.TubeGeometry(curve, Math.max(4, pts.length * 5), radius, seg, false));
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    const all: number[] = [];
    this.idx.forEach((list, slot) => {
      if (!list.length) return;
      g.addGroup(all.length, list.length, slot);
      for (let i = 0; i < list.length; i++) all.push(list[i]);
    });
    g.setIndex(all);
    g.computeBoundingSphere();
    return g;
  }
}
