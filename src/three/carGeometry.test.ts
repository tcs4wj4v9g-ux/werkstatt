import { REAR_ENGINE } from '../game/data/cars';
import { REAR_BAY } from './player';
import { describe, expect, it } from 'vitest';
import { CAR_MODELS } from '../game/data/cars';
import { ENGINES } from '../game/data/engines';
import { BODY_SPECS, bodyShape, carGeometry, WHEEL_X } from './carGeometry';
import { doorTrimGeometry, interiorGeometry, lookOf, trimGeometry, wheelGeometry } from './carParts';
import { engineDecor, exhaustGeometry, intakeGeometry } from './engineBay';
import { GFX } from './gfx';

const finite = (g: { getAttribute(n: string): { array: ArrayLike<number> } }) => Array.from(g.getAttribute('position').array).every((v) => Number.isFinite(v));
const bodies = Object.keys(BODY_SPECS) as (keyof typeof BODY_SPECS)[];

describe('Karosserieformen', () => {
  it('jedes Fahrzeugmodell hat eine Karosserieform und einen Motor', () => {
    for (const m of Object.values(CAR_MODELS)) {
      expect(BODY_SPECS[m.body], m.id).toBeDefined();
      expect(ENGINES[m.engineId], m.id).toBeDefined();
    }
  });

  it.each(bodies)('%s: Netz ist vollständig und ohne ungültige Punkte', (body) => {
    for (const detail of [0, 1]) {
      const g = carGeometry(body, detail);
      for (const part of [g.shell, g.cabin, g.hood, ...g.doors]) {
        expect(part.getIndex()!.count).toBeGreaterThan(30);
        expect(finite(part)).toBe(true);
      }
      // Fahrgastzelle: Lack, Glas und Blenden als getrennte Materialgruppen
      expect(g.cabin.groups.length).toBeGreaterThanOrEqual(2);
      // Beide Türen sind spiegelgleich
      expect(g.doors[0].getIndex()!.count).toBe(g.doors[1].getIndex()!.count);
    }
  });

  it.each(bodies)('%s: Proportionen sind plausibel', (body) => {
    const S = bodyShape(body);
    const B = S.B;
    // Vorderachse liegt bei allen gleich, die Räder stehen nicht über die Karosserie hinaus.
    expect(S.width(WHEEL_X)).toBeGreaterThanOrEqual(0.8);
    expect(B.width + B.flare).toBeGreaterThanOrEqual(0.8 + B.trackF + 0.108);
    expect(B.width + B.flare).toBeGreaterThanOrEqual(0.8 + B.trackR + 0.108);
    // Haube: über dem ganzen Motor (höchstes Teil: Sicken der Motorabdeckung bis 0,88 m, von x = 0,95 bis 1,58) bleibt Luft.
    // Heckmotor: derselbe Motorraum gedreht hinter der Hinterachse und abgesenkt – dort muss der Motordeckel darüber passen.
    if (REAR_ENGINE.has(body)) {
      const bx = B.bayX ?? REAR_BAY.x;
      for (let x = 0.95; x <= 1.58; x += 0.01) expect(S.crown(bx - x), `Motordeckel über x = ${(bx - x).toFixed(2)}`).toBeGreaterThan(0.88 + REAR_BAY.y);
    } else for (let x = Math.max(0.95, S.F.hoodX0); x <= 1.58; x += 0.01) expect(S.crown(x), `Haube bei x = ${x.toFixed(2)}`).toBeGreaterThan(0.88);
    // Radstand und Länge in einem realistischen Bereich (Kleinstwagen kürzer)
    const wheelbase = WHEEL_X - B.rearAxle;
    expect(wheelbase).toBeGreaterThan(2.0);
    expect(wheelbase).toBeLessThan(3.1);
    expect(B.nose - B.tail).toBeGreaterThan(3.3);
    expect(B.nose - B.tail).toBeLessThan(5.0);
    // Dach liegt über der Gürtellinie, die Dachlinie erreicht die Dachhöhe.
    const mid = (B.x1 + B.x2) / 2;
    expect(S.roofY(mid)).toBeGreaterThan(S.beltY(mid) + 0.25);
    expect(Math.abs(S.roofY(mid) - B.roof)).toBeLessThan(0.05);
    // Bug und Heck liegen auf der Außenhaut.
    expect(S.endX(1, B.noseMid, 0)).toBeGreaterThan(B.nose - 0.05);
    expect(S.endX(-1, B.tailMid, 0)).toBeLessThan(B.tail + 0.05);
  });

  it('die Karosserien unterscheiden sich in der Form, nicht nur in der Farbe', () => {
    const { sedan, wagon, coupe, sport, hatch, luxury } = BODY_SPECS;
    expect(sport.roof).toBeLessThan(coupe.roof);
    expect(coupe.roof).toBeLessThan(sedan.roof);
    expect(sport.width).toBeGreaterThan(sedan.width);
    expect(wagon.x1).toBeLessThan(sedan.x1 - 0.8); // Dach reicht beim Kombi bis ans Heck
    expect(hatch.nose - hatch.tail).toBeLessThan(sedan.nose - sedan.tail - 0.3);
    expect(luxury.nose - luxury.tail).toBeGreaterThan(sedan.nose - sedan.tail + 0.15);
    expect(coupe.seams.length).toBe(2);
    expect(sedan.seams.length).toBe(3);
  });
});

describe('Anbauteile, Räder, Innenraum, Motorraum', () => {
  it('lassen sich für alle 22 Modelle erzeugen', () => {
    for (const m of Object.values(CAR_MODELS)) {
      const look = lookOf(m, m.body, ENGINES[m.engineId]);
      for (const g of [trimGeometry(m.body, look, 1), interiorGeometry(m.body, 1), ...doorTrimGeometry(m.body, look), wheelGeometry(look.rim, 1, true)]) {
        expect(g.getIndex()!.count, m.id).toBeGreaterThan(100);
        expect(finite(g), m.id).toBe(true);
      }
    }
  });

  it('Auspuffrohre folgen der Zylinderzahl', () => {
    const pipes = (id: string) => lookOf(CAR_MODELS[id], CAR_MODELS[id].body, ENGINES[CAR_MODELS[id].engineId]).pipes;
    expect(pipes('bavaria_318')).toBe(1);
    expect(pipes('bavaria_330')).toBe(2);
    expect(pipes('bavaria_340_ms')).toBe(4);
  });

  it('jede Motorbauart hat ein eigenes Netz', () => {
    const size = new Set<number>();
    for (const e of Object.values(ENGINES)) {
      const g = engineDecor(e, 1);
      expect(finite(g), e.id).toBe(true);
      size.add(g.getAttribute('position').count + intakeGeometry(e).getAttribute('position').count + exhaustGeometry(e, false).getAttribute('position').count);
    }
    // R4, R6, V6, V8 sowie Diesel unterscheiden sich in der Geometrie
    expect(size.size).toBeGreaterThanOrEqual(5);
  });
});

describe('Grafikstufen', () => {
  it('werden von Niedrig nach Hoch aufwendiger', () => {
    expect(GFX.low.dpr).toBeLessThan(GFX.medium.dpr);
    expect(GFX.medium.dpr).toBeLessThanOrEqual(GFX.high.dpr);
    expect(GFX.low.shadows).toBe(false);
    expect(GFX.medium.shadows && GFX.high.shadows).toBe(true);
    expect(GFX.high.shadowMap).toBeGreaterThan(GFX.medium.shadowMap);
    expect(GFX.low.lights).toBeLessThan(GFX.high.lights);
  });

  it.each(bodies)('%s: Hebebühnen-Teller greifen zwischen den Rädern, nie unter einem Reifen', async (body) => {
    const { liftPads } = await import('./workshopDecor');
    const B = BODY_SPECS[body];
    const pads = liftPads(B.rearAxle, B.width);
    const R = 0.36; // Reifenradius mit Luft
    for (const x of [pads.front, pads.rear]) for (const axle of [WHEEL_X, B.rearAxle]) expect(Math.abs(x - axle), `${body}: Teller bei x=${x.toFixed(2)}`).toBeGreaterThan(R + 0.07);
    expect(pads.front).toBeGreaterThan(pads.rear);
    expect(pads.z).toBeLessThan(B.width);
  });
});

describe('Innenraum: drehbares Lenkrad und sichtbare Tuningteile', () => {
  it('Lenkrad ist ein eigenes Netz (Serie und Sport verschieden), Käfig und Handbremse ergänzen den Innenraum, Käfig bleibt in der Kabine', async () => {
    const { steeringWheelGeometry, steeringWheelPose } = await import('./carParts');
    const count = (g: { getAttribute(n: string): { count: number } }) => g.getAttribute('position').count;
    expect(count(steeringWheelGeometry(1, false))).toBeGreaterThan(100);
    expect(count(steeringWheelGeometry(1, true))).not.toBe(count(steeringWheelGeometry(1, false)));
    for (const body of Object.keys(BODY_SPECS) as (keyof typeof BODY_SPECS)[]) {
      const plain = interiorGeometry(body, 1);
      const tuned = interiorGeometry(body, 1, true, true, { hbrake: true, cage: true });
      expect(count(tuned), body).toBeGreaterThan(count(plain));
      // Käfig innerhalb der Karosserie: höchste Stelle unter dem Dach, seitlich innerhalb der Breite
      const S = bodyShape(body);
      const pos = tuned.getAttribute('position');
      let maxY = 0;
      let maxZ = 0;
      for (let i = 0; i < pos.count; i++) {
        maxY = Math.max(maxY, pos.getY(i));
        maxZ = Math.max(maxZ, Math.abs(pos.getZ(i)));
      }
      expect(maxY, body).toBeLessThan(S.B.roof);
      expect(maxZ, body).toBeLessThan(S.B.width + 0.02);
      expect(steeringWheelPose(body).pos[1]).toBeGreaterThan(0.7);
    }
  });
});

describe('Vereinfachtes Auto (Gegner in der Ferne)', () => {
  it('für jede Karosserie: gleiche Abmessungen wie das volle Modell, viel weniger Teile', async () => {
    const { carLiteGeometry } = await import('./CarLite');
    for (const body of Object.keys(BODY_SPECS) as (keyof typeof BODY_SPECS)[]) {
      const g = carLiteGeometry(body);
      g.body.computeBoundingBox();
      const full = carGeometry(body, 0).shell;
      full.computeBoundingBox();
      const a = g.body.boundingBox!;
      const b = full.boundingBox!;
      expect(Math.abs(a.max.x - a.min.x - (b.max.x - b.min.x)), body).toBeLessThan(0.05);
      expect(a.max.y, body).toBeGreaterThanOrEqual(b.max.y - 0.02);
      expect(g.tires.getAttribute('position').count).toBeGreaterThan(0);
    }
  });
});
