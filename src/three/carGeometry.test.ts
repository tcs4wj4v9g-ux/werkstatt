import { describe, expect, it } from 'vitest';
import { CAR_MODELS } from '../game/data/cars';
import { ENGINES } from '../game/data/engines';
import { BODY_SPECS, bodyShape, carGeometry, WHEEL_X } from './carGeometry';
import { doorTrimGeometry, interiorGeometry, lookOf, trimGeometry, wheelGeometry } from './carParts';
import { engineDecor } from './engineBay';
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
    // Vorderachse und Motorraum liegen bei allen gleich, die Räder stehen nicht über die Karosserie hinaus.
    expect(S.width(WHEEL_X)).toBeGreaterThanOrEqual(0.9);
    expect(B.width + B.flare).toBeGreaterThanOrEqual(0.8 + B.trackF + 0.108);
    expect(B.width + B.flare).toBeGreaterThanOrEqual(0.8 + B.trackR + 0.108);
    // Haube: über dem Motor (höchstes Motorteil bei 0,88 m) bleibt Luft.
    expect(S.crown(1.3)).toBeGreaterThan(0.9);
    // Radstand und Länge in einem realistischen Bereich
    const wheelbase = WHEEL_X - B.rearAxle;
    expect(wheelbase).toBeGreaterThan(2.4);
    expect(wheelbase).toBeLessThan(3.1);
    expect(B.nose - B.tail).toBeGreaterThan(4.0);
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
      size.add(g.getAttribute('position').count);
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
});
