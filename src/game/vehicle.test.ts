import { describe, expect, it } from 'vitest';
import { createCar } from './market';
import { initialState, stepVehicle, vehicleSpec, type DriveInput, type VehicleSpec } from './vehicle';
import type { CarInstance } from './types';

const flat = { grade: 0, grip: 1, drag: 0 };
const mk = (id: string, defects: string[] = [], tweak?: (c: CarInstance) => void) => {
  const c = createCar(id, defects as never, () => 0.5, { year: 2010 });
  for (const k of Object.keys(c.components)) if (!defects.length) c.components[k].condition = 'ok';
  tweak?.(c);
  return vehicleSpec(c);
};
/** Fährt mit fester Eingabe, bis die Bedingung erfüllt ist; liefert Zeit und Zustand. */
function run(spec: VehicleSpec, input: DriveInput, until: (s: ReturnType<typeof initialState>) => boolean, start = 0, max = 60) {
  const s = initialState(0, 0, 0);
  s.vx = start;
  let t = 0;
  while (t < max && !until(s)) {
    stepVehicle(spec, s, input, flat, 1 / 60);
    t += 1 / 60;
  }
  return { t, s };
}
const zeroTo100 = (spec: VehicleSpec) => run(spec, { throttle: 1, brake: 0, steer: 0 }, (s) => s.vx >= 100 / 3.6).t;
const topSpeed = (spec: VehicleSpec) => run(spec, { throttle: 1, brake: 0, steer: 0 }, () => false, 0, 90).s.vx * 3.6;
const brakeDist = (spec: VehicleSpec) => {
  const s = initialState(0, 0, 0);
  s.vx = 100 / 3.6;
  s.gear = 4;
  let t = 0;
  while (s.vx > 0.3 && t < 20) {
    stepVehicle(spec, s, { throttle: 0, brake: 1, steer: 0 }, flat, 1 / 60);
    t += 1 / 60;
  }
  return s.x;
};
/** Kreisfahrt mit 70 km/h und vollem Einschlag: Querbeschleunigung (g). */
const cornerG = (spec: VehicleSpec, throttle = 0.3) => {
  const s = initialState(0, 0, 0);
  s.vx = 70 / 3.6;
  s.gear = 3;
  let ay = 0;
  for (let i = 0; i < 240; i++) {
    stepVehicle(spec, s, { throttle, brake: 0, steer: 1 }, flat, 1 / 60);
    if (i > 120) ay = Math.max(ay, Math.abs(s.ay));
  }
  return { g: ay / 9.81, s };
};

describe('Fahrphysik', () => {
  it('Kennzahlen liegen im glaubwürdigen Bereich und unterscheiden die Autos', () => {
    const rows = ['renard_twingle', 'vw_golf2_gti', 'bavaria_320d', 'bavaria_330', 'audy_urquattro', 'bmv_m4_g82', 'zuffen_929', 'veloce_stradale'].map((id) => {
      const spec = mk(id);
      return { id, t100: zeroTo100(spec), vmax: topSpeed(spec), brake: brakeDist(spec), g: cornerG(spec).g };
    });
    console.table(rows.map((r) => ({ ...r, t100: r.t100.toFixed(1), vmax: r.vmax.toFixed(0), brake: r.brake.toFixed(1), g: r.g.toFixed(2) })));
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by.renard_twingle.t100).toBeGreaterThan(10);
    expect(by.renard_twingle.t100).toBeLessThan(18);
    expect(by.veloce_stradale.t100).toBeLessThan(5);
    expect(by.bmv_m4_g82.t100).toBeLessThan(5.5);
    expect(by.renard_twingle.vmax).toBeGreaterThan(140);
    expect(by.renard_twingle.vmax).toBeLessThan(185);
    expect(by.veloce_stradale.vmax).toBeGreaterThan(280);
    for (const r of rows) {
      expect(r.brake, r.id + ' Bremsweg').toBeGreaterThan(30);
      expect(r.brake, r.id + ' Bremsweg').toBeLessThan(48);
      expect(r.g, r.id + ' Querbeschleunigung').toBeGreaterThan(0.6);
      expect(r.g, r.id + ' Querbeschleunigung').toBeLessThan(1.25);
    }
  });

  it('Allrad zieht beim Anfahren besser als Heckantrieb bei gleichem Auto', () => {
    const rwd = mk('bmv_m4_g82');
    const awd = { ...rwd, drive: 'AWD' as const };
    const fwd = { ...rwd, drive: 'FWD' as const };
    const t = (spec: VehicleSpec) => run(spec, { throttle: 1, brake: 0, steer: 0 }, (s) => s.vx >= 60 / 3.6).t;
    expect(t(awd)).toBeLessThan(t(rwd));
    // Frontantrieb mit viel Leistung: Vorderräder entlasten beim Beschleunigen – langsamer als Heck
    expect(t(fwd)).toBeGreaterThan(t(rwd));
  });

  it('Heckantrieb mit Vollgas in der Kurve: Heck drängt (Übersteuern), Frontantrieb schiebt (Untersteuern)', () => {
    const base = mk('bmv_m4_g82');
    const yaw = (drive: 'RWD' | 'FWD') => {
      const s = initialState(0, 0, 0);
      s.vx = 50 / 3.6;
      s.gear = 2;
      for (let i = 0; i < 90; i++) stepVehicle({ ...base, drive }, s, { throttle: 1, brake: 0, steer: 0.6 }, flat, 1 / 60);
      return s.yawRate / Math.max(1, s.vx);
    };
    expect(yaw('RWD')).toBeGreaterThan(yaw('FWD') * 1.1);
  });

  it('Gänge, Motorbremse und Rückwärtsgang', () => {
    const spec = mk('bavaria_330');
    const { s } = run(spec, { throttle: 1, brake: 0, steer: 0 }, (x) => x.vx >= 130 / 3.6);
    expect(s.gear).toBeGreaterThanOrEqual(3);
    expect(s.rpm).toBeLessThan(spec.redline + 150);
    // Schub ohne Bremse: deutlich mehr Verzögerung als reiner Luftwiderstand im Leerlauf
    const coast = (gear: number) => {
      const c = { ...s, vx: 80 / 3.6, gear, shiftTimer: 0 };
      stepVehicle(spec, c, { throttle: 0, brake: 0, steer: 0 }, flat, 2);
      return 80 / 3.6 - c.vx;
    };
    expect(coast(2)).toBeGreaterThan(coast(0) * 1.3);
    const back = run(spec, { throttle: 0, brake: 1, steer: 0 }, (x) => x.gear === -1, 0, 2);
    expect(back.s.gear).toBe(-1);
  });

  it('Tuning und Defekte sind spürbar', () => {
    const stock = mk('bavaria_330');
    const coil = mk('bavaria_330', [], (c) => (c.visual = { ...(c.visual ?? {}), suspension: 'coilover', rimSize: 2 } as never));
    expect(cornerG(coil).g).toBeGreaterThan(cornerG(stock).g);
    const oldTires = mk('bavaria_330', ['tires', 'tires_rear']);
    expect(cornerG(oldTires).g).toBeLessThan(cornerG(stock).g);
    const brakes = mk('bavaria_330', ['brakes']);
    expect(brakeDist(brakes)).toBeGreaterThan(brakeDist(stock) * 1.3);
    const misfire = mk('bavaria_330', ['coil']);
    expect(zeroTo100(misfire)).toBeGreaterThan(zeroTo100(stock) * 1.15);
    const tie = mk('bavaria_330', ['tie_rod']);
    // Lenkung zieht: geradeaus losgelassen weicht das Auto zur Seite ab
    const drift = run(tie, { throttle: 0.4, brake: 0, steer: 0 }, () => false, 20, 6).s.z;
    expect(Math.abs(drift)).toBeGreaterThan(1);
  });

  it('Steigung bremst, Wiese haftet schlechter', () => {
    const spec = mk('bavaria_320d');
    const climb = (grade: number) => {
      const s = initialState(0, 0, 0);
      for (let i = 0; i < 600; i++) stepVehicle(spec, s, { throttle: 1, brake: 0, steer: 0 }, { grade, grip: 1, drag: 0 }, 1 / 60);
      return s.vx;
    };
    expect(climb(0.12)).toBeLessThan(climb(0) * 0.9);
    const grass = { ...spec, muFront: spec.muFront * 0.55, muRear: spec.muRear * 0.55 };
    expect(cornerG(grass).g).toBeLessThan(cornerG(spec).g * 0.75);
  });
});
