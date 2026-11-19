import { describe, expect, it } from 'vitest';
import { createCar } from './market';
import { initialState, stepVehicle, vehicleSpec, type DriveInput, type VehicleSpec } from './vehicle';
import { driveWorld } from '../three/driveWorld';
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

const beta = (s: { vx: number; vy: number }) => Math.abs(Math.atan2(s.vy, Math.max(0.5, Math.abs(s.vx)))) * 57.3;

describe('Fahrbarkeit: nicht dauernd ausbrechen, Driften nur mit Absicht', () => {
  const cars = ['renard_twingle', 'bavaria_330', 'bmv_m4_g82', 'zuffen_946', 'veloce_stradale'];
  it('mit ESP: voller Einschlag bei 50–110 km/h und Bremsen in der Kurve ohne Ausbrechen', () => {
    for (const id of cars) {
      const sp = mk(id);
      for (const kmh of [50, 80, 110]) {
        const s = initialState(0, 0, 0);
        s.vx = kmh / 3.6;
        s.gear = kmh < 60 ? 2 : kmh < 95 ? 3 : 4;
        let b = 0;
        for (let i = 0; i < 180; i++) {
          stepVehicle(sp, s, { steer: 1, throttle: 0.3, brake: 0 }, flat, 1 / 60);
          b = Math.max(b, beta(s));
        }
        expect(b, `${id} ${kmh} km/h voller Einschlag`).toBeLessThan(12);
      }
      const s = initialState(0, 0, 0);
      s.vx = 80 / 3.6;
      s.gear = 3;
      let b = 0;
      for (let i = 0; i < 60; i++) stepVehicle(sp, s, { steer: 0.6, throttle: 0.3, brake: 0 }, flat, 1 / 60);
      for (let i = 0; i < 120; i++) {
        stepVehicle(sp, s, { steer: 0.6, throttle: 0, brake: 1 }, flat, 1 / 60);
        b = Math.max(b, beta(s));
      }
      expect(b, `${id} Bremsen in der Kurve`).toBeLessThan(15);
    }
  });

  it('Lenkung: enger Wendekreis beim Rangieren, voller Ausschlag nutzt bei Tempo die Haftung ganz aus', () => {
    const sp = mk('bavaria_330');
    const s = initialState(0, 0, 0);
    s.vx = 10 / 3.6;
    for (let i = 0; i < 240; i++) stepVehicle(sp, s, { steer: 1, throttle: s.vx < 10 / 3.6 ? 0.3 : 0, brake: 0 }, flat, 1 / 60);
    const radius = (s.vx * s.vx) / Math.abs(s.ay);
    expect(radius, 'Wendekreis-Radius bei Schritttempo').toBeLessThan(6);
    // Bei 100 km/h: voller Einschlag ergibt annähernd die höchste Querbeschleunigung, ohne dass das Auto schiebt
    const q = initialState(0, 0, 0);
    q.vx = 100 / 3.6;
    q.gear = 4;
    let ay = 0;
    for (let i = 0; i < 180; i++) {
      stepVehicle(sp, q, { steer: 1, throttle: 0.4, brake: 0 }, flat, 1 / 60);
      if (i > 90) ay = Math.max(ay, Math.abs(q.ay));
    }
    expect(ay / 9.81).toBeGreaterThan(0.85);
  });

  it('mit Schieberegler (analog lenken, Gas dosieren) schafft man die Runde ohne Abkommen – mit und ohne ESP', () => {
    const w = driveWorld();
    const n = w.samples.length;
    for (const id of ['renard_twingle', 'bmv_m4_g82', 'zuffen_946', 'veloce_stradale']) {
      for (const assist of [true, false]) {
        const sp = mk(id);
        const st = initialState(w.start.x, w.start.z, w.start.heading);
        let near = 0;
        let prog = 0;
        let off = 0;
        for (let t = 0; t < 300 && prog < n; t += 1 / 60) {
          const q = w.nearest(st.x, st.z, near);
          let d = q.i - near;
          if (d > n / 2) d -= n;
          if (d < -n / 2) d += n;
          prog += d;
          near = q.i;
          if (Math.abs(q.lateral) > 4.4) off += 1 / 60;
          const tg = w.samples[(near + Math.round(8 + st.vx * 0.5)) % n];
          let diff = Math.atan2(-(tg.z - st.z), tg.x - st.x) - st.heading;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          let curv = 0;
          for (let k = 3; k < 50 + st.vx * 2; k++) curv = Math.max(curv, Math.abs(w.samples[(near + k) % n].curv));
          const vt = Math.min(45, Math.sqrt((0.85 * 9.81) / Math.max(1e-4, curv)));
          const steer = Math.max(-1, Math.min(1, diff * 3 - q.lateral * 0.04));
          stepVehicle(sp, st, { steer, throttle: st.vx < vt ? 1 : 0, brake: st.vx > vt + 2 ? 1 : 0, assist }, flat, 1 / 60);
        }
        expect(prog, `${id} ESP ${assist} Runde geschafft`).toBeGreaterThanOrEqual(n);
        expect(off, `${id} ESP ${assist} Sekunden neben der Straße`).toBeLessThan(0.5);
      }
    }
  });

  it('ohne ESP: Drift hält sich mit Gas, Drift-Hilfe verhindert Dreher, nach Gas weg und Lenkung gerade fängt sich das Auto', () => {
    for (const id of ['bmv_m4_g82', 'bavaria_330', 'veloce_stradale']) {
      const sp = mk(id);
      const s = initialState(0, 0, 0);
      s.vx = 60 / 3.6;
      s.gear = 2;
      let b = 0;
      for (let i = 0; i < 300; i++) {
        stepVehicle(sp, s, { steer: 0.8, throttle: 1, brake: 0, assist: false, handbrake: i < 20 }, flat, 1 / 60);
        b = Math.max(b, beta(s));
      }
      expect(b, `${id} Driftwinkel`).toBeGreaterThan(15);
      expect(b, `${id} kein Dreher`).toBeLessThan(60);
      for (let i = 0; i < 150; i++) stepVehicle(sp, s, { steer: 0, throttle: 0.15, brake: 0, assist: false }, flat, 1 / 60);
      expect(beta(s), `${id} gefangen`).toBeLessThan(6);
    }
  });

  it('Handbremse dreht das Auto ein (Wenden, Drift einleiten)', () => {
    const sp = mk('renard_twingle');
    const s = initialState(0, 0, 0);
    s.vx = 40 / 3.6;
    s.gear = 2;
    for (let i = 0; i < 60; i++) stepVehicle(sp, s, { steer: 1, throttle: 0, brake: 0, handbrake: true, assist: false }, flat, 1 / 60);
    const plain = initialState(0, 0, 0);
    plain.vx = 40 / 3.6;
    plain.gear = 2;
    for (let i = 0; i < 60; i++) stepVehicle(sp, plain, { steer: 1, throttle: 0, brake: 0, assist: false }, flat, 1 / 60);
    expect(s.heading).toBeGreaterThan(plain.heading + 0.25);
  });

  it('ohne ESP: starker Hecktriebler driftet mit Vollgas in der Kurve, Frontantrieb nicht', () => {
    const drift = (id: string, assist: boolean) => {
      const sp = mk(id);
      const s = initialState(0, 0, 0);
      s.vx = 50 / 3.6;
      s.gear = 2;
      let b = 0;
      for (let i = 0; i < 90; i++) {
        stepVehicle(sp, s, { steer: 0.6, throttle: 1, brake: 0, assist }, flat, 1 / 60);
        b = Math.max(b, beta(s));
      }
      return b;
    };
    expect(drift('bmv_m4_g82', false)).toBeGreaterThan(25);
    expect(drift('bmv_m4_g82', true)).toBeLessThan(10);
    expect(drift('vw_golf2_gti', false)).toBeLessThan(10);
  });
});

describe('Fahrwelt', () => {
  it('Testgelände ist eben und zählt als Asphalt; abseits gibt es Schotter, Wiese, Feld und Wald', () => {
    const w = driveWorld();
    expect(w.onPad(200, 60)).toBe(true);
    expect(w.onPad(0, 0)).toBe(false);
    const ys = [[130, 10], [200, 60], [265, 125]].map(([x, z]) => w.ground(x, z));
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.01);
    const p = w.tracks[0][20];
    expect(w.surface(p.x, p.z).kind).toBe('gravel');
    const kinds = new Set<string>();
    for (let x = -700; x < 700; x += 37) for (let z = -700; z < 700; z += 41) kinds.add(w.surface(x, z).kind);
    expect([...kinds].sort()).toEqual(['field', 'forest', 'grass', 'gravel'].filter((k) => kinds.has(k)).sort());
    expect(kinds.has('grass') && kinds.has('forest') && kinds.has('field')).toBe(true);
  });
});

describe('Fahrzeugstatistik', () => {
  it('liefert für alle Modelle plausible Werte; Tuning und Defekte ändern sie in die richtige Richtung', async () => {
    const { carStats } = await import('./carStats');
    const { CAR_MODELS } = await import('./data/cars');
    const t0 = Date.now();
    const rows: string[] = [];
    for (const id of Object.keys(CAR_MODELS)) {
      const c = createCar(id, [], () => 0.5, { year: 2012 });
      for (const k of Object.keys(c.components)) c.components[k].condition = 'ok';
      const st = carStats(c);
      rows.push(`${id.padEnd(22)} ${String(st.ps).padStart(3)} PS ${String(st.weight).padStart(4)} kg ${st.drive} 0-100 ${st.t100.toFixed(1).padStart(4)} s  ${Math.round(st.vmax)} km/h  Bremse ${st.brake100.toFixed(0)} m  ${st.lateralG.toFixed(2)} g  Noten ${Object.values(st.rating).join('/')}`);
      expect(st.t100).toBeGreaterThan(2.5);
      expect(st.t100).toBeLessThan(25);
      expect(st.vmax).toBeGreaterThan(120);
      for (const v of Object.values(st.rating)) expect(v).toBeGreaterThanOrEqual(0);
    }
    console.log(rows.join('\n'));
    console.log('Rechenzeit für alle Modelle', Date.now() - t0, 'ms');
    const base = createCar('bavaria_330', [], () => 0.5, { year: 2012 });
    for (const k of Object.keys(base.components)) base.components[k].condition = 'ok';
    const tuned = structuredClone(base);
    tuned.visual = { ...(tuned.visual ?? {}), suspension: 'coilover', rimSize: 2 } as never;
    expect(carStats(tuned).lateralG).toBeGreaterThan(carStats(base).lateralG);
    const worn = createCar('bavaria_330', ['brakes'] as never, () => 0.5, { year: 2012 });
    expect(carStats(worn).brake100).toBeGreaterThan(carStats(base).brake100 * 1.2);
  });
});
