import { describe, expect, it } from 'vitest';
import { createCar } from './market';
import { initialState, stepVehicle, vehicleSpec, type Surface, type VehicleSpec } from './vehicle';
import { ROAD_GRIP, seasonOf, weatherOf, roadOf } from './grip';
import type { CarInstance, VisualTune } from './types';

const mk = (id: string, visual: VisualTune = {}) => {
  const c: CarInstance = createCar(id, [], () => 0.5, { year: 2010 });
  for (const k of Object.keys(c.components)) c.components[k].condition = 'ok';
  c.visual = { ...c.visual, ...visual };
  return vehicleSpec(c);
};
const dry: Surface = { grade: 0, grip: 1, drag: 0, cls: 'dry' };
const snow: Surface = { grade: 0, grip: ROAD_GRIP.snow, drag: 0, cls: 'snow' };
const wet: Surface = { grade: 0, grip: ROAD_GRIP.wet, drag: 0, cls: 'wet' };
const gravel: Surface = { grade: 0, grip: 0.72, drag: 0.03, cls: 'loose' };

/** Kreisfahrt mit vollem Einschlag: größte stetige Querbeschleunigung (g). */
function cornerG(sp: VehicleSpec, surf: Surface, kmh = 60) {
  const s = initialState(0, 0, 0);
  s.vx = kmh / 3.6;
  s.gear = 3;
  let ay = 0;
  for (let i = 0; i < 300; i++) {
    stepVehicle(sp, s, { throttle: 0.35, brake: 0, steer: 1 }, surf, 1 / 60);
    if (i > 150) ay = Math.max(ay, Math.abs(s.ay));
  }
  return ay / 9.81;
}

/** Driftversuch ohne ESP: Kurve mit Vollgas und kurzem Handbremszug; mittlerer und größter Driftwinkel (Grad). */
function drift(sp: VehicleSpec, surf: Surface = dry) {
  const s = initialState(0, 0, 0);
  s.vx = 55 / 3.6;
  s.gear = 2;
  let sum = 0;
  let max = 0;
  let n = 0;
  for (let i = 0; i < 360; i++) {
    const t = i / 60;
    stepVehicle(sp, s, { assist: false, throttle: t > 0.3 ? 1 : 0.3, brake: 0, steer: t < 1.2 ? 1 : 0.35, handbrake: t > 0.2 && t < 0.5 }, surf, 1 / 60);
    const b = Math.abs(Math.atan2(s.vy, Math.max(0.5, Math.abs(s.vx)))) * 57.3;
    if (t > 1.5) {
      sum += b;
      n++;
    }
    max = Math.max(max, b);
  }
  return { avg: sum / n, max, speed: Math.hypot(s.vx, s.vy) * 3.6 };
}

describe('Reifen und Untergrund', () => {
  it('trocken: Semi-Slicks > Sportreifen > Serie > Driftreifen', () => {
    const g = (tires: VisualTune['tires']) => cornerG(mk('bavaria_330', { tires }), dry);
    const [semi, sport, stock, driftT] = [g('semislick'), g('sport'), g('stock'), g('drift')];
    expect(semi).toBeGreaterThan(sport);
    expect(sport).toBeGreaterThan(stock);
    expect(stock).toBeGreaterThan(driftT);
  });

  it('Schnee: Winter- und Spikereifen haften deutlich besser als Serie, Semi-Slicks schlechter', () => {
    const g = (tires: VisualTune['tires']) => cornerG(mk('bavaria_330', { tires }), snow, 40);
    expect(g('winter')).toBeGreaterThan(g('stock') * 1.25);
    expect(g('spikes')).toBeGreaterThan(g('winter'));
    expect(g('semislick')).toBeLessThan(g('stock'));
    // auch mit Serienreifen fahrbar – nur rutschig
    expect(g('stock')).toBeGreaterThan(0.3);
  });

  it('Regen: rutschiger als trocken, Semi-Slicks besonders', () => {
    expect(cornerG(mk('bavaria_330'), wet)).toBeLessThan(cornerG(mk('bavaria_330'), dry));
    expect(cornerG(mk('bavaria_330', { tires: 'semislick' }), wet)).toBeLessThan(cornerG(mk('bavaria_330'), wet));
  });

  it('Schotter (Rallye): Schotterreifen und Rallyefahrwerk helfen, Unterfahrschutz bremst weniger', () => {
    const stock = cornerG(mk('audy_a4_b5'), gravel, 50);
    const rally = cornerG(mk('audy_a4_b5', { tires: 'gravel', suspension: 'rally' }), gravel, 50);
    expect(rally).toBeGreaterThan(stock * 1.3);
    expect(stock).toBeGreaterThan(0.45);
    // Ausrollen auf Schotter: mit Unterfahrschutz weiter
    const roll = (sp: VehicleSpec) => {
      const s = initialState(0, 0, 0);
      s.vx = 15;
      s.gear = 0;
      for (let i = 0; i < 300; i++) stepVehicle(sp, s, { throttle: 0, brake: 0, steer: 0 }, gravel, 1 / 60);
      return s.x;
    };
    expect(roll(mk('audy_a4_b5', { skid: true }))).toBeGreaterThan(roll(mk('audy_a4_b5')));
  });
});

describe('Drift-Teile', () => {
  it('Differential verschweißt und Driftreifen: Drift entsteht leichter und hält länger als in Serie', () => {
    const stock = drift(mk('bavaria_330'));
    const tuned = drift(mk('bavaria_330', { diff: 'welded', tires: 'drift' }));
    expect(tuned.avg).toBeGreaterThan(stock.avg);
    expect(tuned.avg).toBeGreaterThan(12);
    // kein Dreher: das Auto fährt noch
    expect(tuned.speed).toBeGreaterThan(15);
  });

  it('Sperrdifferential bringt mehr Traktion beim Herausbeschleunigen', () => {
    const exit = (sp: VehicleSpec) => {
      const s = initialState(0, 0, 0);
      s.vx = 40 / 3.6;
      s.gear = 2;
      for (let i = 0; i < 120; i++) stepVehicle(sp, s, { throttle: 1, brake: 0, steer: 0.6 }, dry, 1 / 60);
      return Math.hypot(s.vx, s.vy);
    };
    expect(exit(mk('bmv_m4_g82', { diff: 'lsd' }))).toBeGreaterThan(exit(mk('bmv_m4_g82')));
  });

  it('Lenkwinkel-Kit: mehr Radeinschlag und größere Driftwinkel erlaubt', () => {
    const kit = mk('bavaria_330', { steerKit: true, diff: 'welded', tires: 'drift' });
    expect(kit.steerMax).toBeGreaterThan(mk('bavaria_330').steerMax + 0.15);
    expect(kit.maxDrift).toBeGreaterThan(mk('bavaria_330').maxDrift);
  });

  it('Serienauto ohne Teile verhält sich wie bisher (keine Untergrundklasse = trocken)', () => {
    const a = mk('bavaria_330');
    const b = cornerG(a, { grade: 0, grip: 1, drag: 0 });
    expect(Math.abs(b - cornerG(a, dry))).toBeLessThan(1e-9);
  });
});

describe('Jahreszeiten und Wetter', () => {
  it('40 Tage je Jahr, je zehn Tage eine Jahreszeit; Wetter fest je Tag', () => {
    expect([1, 11, 21, 31, 41].map(seasonOf)).toEqual(['spring', 'summer', 'autumn', 'winter', 'spring']);
    for (let d = 1; d < 200; d++) expect(weatherOf(d)).toBe(weatherOf(d));
    // Schnee nur im Winter, im Winter aber regelmäßig
    const snowDays = Array.from({ length: 400 }, (_, i) => i + 1).filter((d) => weatherOf(d) === 'snow');
    expect(snowDays.every((d) => seasonOf(d) === 'winter')).toBe(true);
    expect(snowDays.length).toBeGreaterThan(30);
    expect(roadOf('rain')).toBe('wet');
  });
});
