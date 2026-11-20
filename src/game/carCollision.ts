/**
 * Zusammenstöße zwischen Autos im Rennen. Jedes Auto ist drei Kreise entlang der Längsachse (Heck, Mitte, Front) – so
 * passt die Form zu einem 4,5 m langen Auto, Front und Heck können sich nicht mehr ineinander schieben.
 *
 * Bei Berührung: die Autos werden sofort auseinandergeschoben (nach Masse geteilt) und ein Stoß am Berührpunkt
 * gerechnet – mit Drehimpuls (wer am Heck getroffen wird, dreht sich), wenig Rückprall und etwas Reibung.
 * Ein „festes“ Gegenüber (das Auto eines Mitspielers im Koop, das dessen eigenes Gerät rechnet) bewegt sich nicht.
 */
import type { VehicleState } from './vehicle';

const OFFSETS = [-1.45, 0, 1.45];
export const CAR_RADIUS = 0.95;
const RESTITUTION = 0.2;
const FRICTION = 0.25;

export interface Body {
  st: Pick<VehicleState, 'x' | 'z' | 'heading' | 'vx' | 'vy' | 'yawRate'>;
  mass: number;
  inertia: number;
  /** Wird nicht bewegt (z. B. Mitspieler, dessen Auto auf seinem Gerät gerechnet wird). */
  fixed?: boolean;
}

const point = (st: Body['st'], d: number) => ({ x: st.x + Math.cos(st.heading) * d, z: st.z - Math.sin(st.heading) * d });

/** Geschwindigkeit des Schwerpunkts in Weltkoordinaten (x, z). */
export function worldVel(st: Body['st']) {
  const c = Math.cos(st.heading);
  const sn = Math.sin(st.heading);
  return { x: st.vx * c - st.vy * sn, z: -(st.vx * sn + st.vy * c) };
}
function setWorldVel(st: Body['st'], wx: number, wz: number) {
  const c = Math.cos(st.heading);
  const sn = Math.sin(st.heading);
  st.vx = wx * c - wz * sn;
  st.vy = -(wx * sn + wz * c);
}

/**
 * Löst eine Berührung zwischen A und B auf. Liefert die Aufprallgeschwindigkeit (m/s, 0 = keine Berührung)
 * – für Geräusch und Anzeige.
 */
export function collide(A: Body, B: Body): number {
  // tiefste Überschneidung zweier Kreise suchen
  let best: { pen: number; nx: number; nz: number; cx: number; cz: number } | null = null;
  for (const da of OFFSETS) {
    const pa = point(A.st, da);
    for (const db of OFFSETS) {
      const pb = point(B.st, db);
      const dx = pb.x - pa.x;
      const dz = pb.z - pa.z;
      const d = Math.hypot(dx, dz);
      const pen = 2 * CAR_RADIUS - d;
      if (pen <= 0) continue;
      if (!best || pen > best.pen) {
        // genau übereinander: entlang der Verbindung der Schwerpunkte trennen
        const n = d > 1e-4 ? { x: dx / d, z: dz / d } : (() => {
          const ex = B.st.x - A.st.x;
          const ez = B.st.z - A.st.z;
          const l = Math.hypot(ex, ez) || 1;
          return { x: ex / l || 1, z: ez / l };
        })();
        best = { pen, nx: n.x, nz: n.z, cx: (pa.x + pb.x) / 2, cz: (pa.z + pb.z) / 2 };
      }
    }
  }
  if (!best) return 0;
  const { pen, nx, nz, cx, cz } = best;
  const invA = A.fixed ? 0 : 1 / A.mass;
  const invB = B.fixed ? 0 : 1 / B.mass;
  if (invA + invB === 0) return 0;
  // 1) sofort trennen (keine Überschneidung sichtbar)
  const sA = invA / (invA + invB);
  const sB = invB / (invA + invB);
  A.st.x -= nx * pen * sA;
  A.st.z -= nz * pen * sA;
  B.st.x += nx * pen * sB;
  B.st.z += nz * pen * sB;
  // 2) Stoß am Berührpunkt (mit Drehung)
  const rAx = cx - A.st.x;
  const rAz = cz - A.st.z;
  const rBx = cx - B.st.x;
  const rBz = cz - B.st.z;
  const vA = worldVel(A.st);
  const vB = worldVel(B.st);
  // Punktgeschwindigkeit: v + ω × r (ω um die Hochachse): (ω·rz, −ω·rx)
  const pvAx = vA.x + A.st.yawRate * rAz;
  const pvAz = vA.z - A.st.yawRate * rAx;
  const pvBx = vB.x + B.st.yawRate * rBz;
  const pvBz = vB.z - B.st.yawRate * rBx;
  const rx = pvBx - pvAx;
  const rz = pvBz - pvAz;
  const rel = rx * nx + rz * nz;
  if (rel >= 0) return 0;
  const cA = rAz * nx - rAx * nz;
  const cB = rBz * nx - rBx * nz;
  const iA = A.fixed ? 0 : 1 / A.inertia;
  const iB = B.fixed ? 0 : 1 / B.inertia;
  const j = (-(1 + RESTITUTION) * rel) / (invA + invB + cA * cA * iA + cB * cB * iB);
  // Reibung quer zur Stoßrichtung (Autos schrammen aneinander entlang statt zu kleben)
  const tx = -nz;
  const tz = nx;
  const relT = rx * tx + rz * tz;
  const jt = Math.max(-FRICTION * j, Math.min(FRICTION * j, -relT / (invA + invB + 1e-9)));
  const Jx = nx * j + tx * jt;
  const Jz = nz * j + tz * jt;
  setWorldVel(A.st, vA.x - Jx * invA, vA.z - Jz * invA);
  setWorldVel(B.st, vB.x + Jx * invB, vB.z + Jz * invB);
  // Drehimpuls: Δω = (r × J)·y / I, mit (r × J)·y = rz·Jx − rx·Jz
  A.st.yawRate -= (rAz * Jx - rAx * Jz) * iA;
  B.st.yawRate += (rBz * Jx - rBx * Jz) * iB;
  return -rel;
}

/** Mehrere Autos gegeneinander (zwei Durchgänge, damit auch Dreierberührungen sauber aufgehen). Größter Aufprall. */
export function collideAll(bodies: Body[]) {
  let hardest = 0;
  for (let pass = 0; pass < 2; pass++)
    for (let a = 0; a < bodies.length; a++)
      for (let b = a + 1; b < bodies.length; b++) {
        const A = bodies[a].st;
        const B = bodies[b].st;
        if (Math.abs(A.x - B.x) > 6 || Math.abs(A.z - B.z) > 6) continue;
        hardest = Math.max(hardest, collide(bodies[a], bodies[b]));
      }
  return hardest;
}

/** Abstand der Formen (negativ = Überschneidung) – für Tests. */
export function gap(A: Body['st'], B: Body['st']) {
  let min = Infinity;
  for (const da of OFFSETS) for (const db of OFFSETS) {
    const pa = point(A, da);
    const pb = point(B, db);
    min = Math.min(min, Math.hypot(pb.x - pa.x, pb.z - pa.z) - 2 * CAR_RADIUS);
  }
  return min;
}
