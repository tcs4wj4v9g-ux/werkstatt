import { describe, expect, it } from 'vitest';
import { collideAll, gap, worldVel } from './carCollision';
import { initialState } from './vehicle';

const body = (x: number, z: number, heading: number, vx: number) => {
  const st = initialState(x, z, heading);
  st.vx = vx;
  return { st, mass: 1500, inertia: 2500 };
};
/** Einfaches Weiterbewegen ohne Reifen (nur für den Test der Stoßauflösung). */
function drift(b: ReturnType<typeof body>, dt: number) {
  const v = worldVel(b.st);
  b.st.x += v.x * dt;
  b.st.z += v.z * dt;
  b.st.heading += b.st.yawRate * dt;
}

describe('Autos im Rennen überschneiden sich nicht', () => {
  it('Auffahrunfall von hinten: kein Ineinanderschieben, der Vordere wird angeschoben', () => {
    const front = body(10, 0, 0, 10);
    const back = body(4, 0, 0, 25);
    let min = Infinity;
    for (let t = 0; t < 2; t += 1 / 120) {
      drift(front, 1 / 120);
      drift(back, 1 / 120);
      collideAll([front, back]);
      min = Math.min(min, gap(front.st, back.st));
    }
    expect(min).toBeGreaterThan(-0.05);
    expect(front.st.vx).toBeGreaterThan(14);
    expect(back.st.vx).toBeLessThan(front.st.vx + 0.5);
  });

  it('seitlicher Treffer am Heck: das getroffene Auto dreht sich, Front und Heck bleiben getrennt', () => {
    const a = body(0, 0, 0, 0);
    const b = body(-1.5, 6, Math.PI / 2, 12); // kommt von der Seite auf das Heck zu
    let min = Infinity;
    for (let t = 0; t < 1.5; t += 1 / 120) {
      drift(a, 1 / 120);
      drift(b, 1 / 120);
      collideAll([a, b]);
      min = Math.min(min, gap(a.st, b.st));
    }
    expect(min).toBeGreaterThan(-0.05);
    expect(Math.abs(a.st.yawRate)).toBeGreaterThan(0.1);
  });

  it('ein festes Gegenüber (Mitspieler im Koop) bewegt sich nicht', () => {
    const me = body(0, 0, 0, 15);
    const other = { ...body(4.2, 0, 0, 0), fixed: true };
    for (let t = 0; t < 1; t += 1 / 120) {
      drift(me, 1 / 120);
      collideAll([me, other]);
    }
    expect(other.st.x).toBe(4.2);
    expect(gap(me.st, other.st)).toBeGreaterThan(-0.05);
  });
});
