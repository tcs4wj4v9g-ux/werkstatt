import { describe, expect, it } from 'vitest';
import { soundProfile } from './diagnosis';
import { engineVoice } from './engineWorklet';
import { createCar } from './market';

const car = (id: string) => {
  const c = createCar(id, [], () => 0.5, { year: 2015 });
  for (const k of Object.keys(c.components)) c.components[k].condition = 'ok';
  return c;
};

describe('Motorklang je Auto, Auspuff und Turbo', () => {
  it('Crossplane-V8 blubbert, Flatplane-V8 nicht; Boxer mit ungleichen Krümmern grummelt', () => {
    const cross = engineVoice(soundProfile(car('bavaria_340_ms')));
    const flat = engineVoice(soundProfile(car('veloce_stradale')));
    expect(cross.interaction).toBeGreaterThan(1);
    expect(cross.bank).toEqual([0, 1, 0, 0, 1, 0, 1, 1]);
    expect(flat.interaction).toBe(0);
    expect(flat.bank).toEqual([0, 1, 0, 1, 0, 1, 0, 1]);
    expect(flat.ring).toBeGreaterThan(cross.ring);
    const b4 = engineVoice(soundProfile(car('zuffen_365')));
    expect(new Set(b4.header).size).toBeGreaterThan(1);
    // Zylinderzahl und Zündwinkel passen zusammen
    for (const id of ['vw_golf2_gti', 'audy_urquattro', 'bavaria_330', 'zuffen_946', 'bavaria_320d']) {
      const p = soundProfile(car(id));
      expect(engineVoice(p).fire).toHaveLength(p.cylinders);
    }
  });

  it('Auspuffanlage, Fächerkrümmer, Turbo-Art und Knallen im Schub kommen aus dem Zustand des Autos', () => {
    const stock = soundProfile(car('audy_a4_b5'));
    expect(stock.exhaust).toBe('stock');
    expect(stock.bov).toBe('recirc');
    expect(stock.pops).toBe(false);
    const t = car('audy_a4_b5');
    t.components.muffler.variant = 'muffler_sport';
    t.components.turbo.variant = 'turbo_big';
    t.ecu = { map: 2, boost: 0.3, limiter: 0 } as never;
    const tuned = soundProfile(t);
    expect(tuned.exhaust).toBe('sport');
    expect(tuned.bov).toBe('atmo');
    expect(tuned.pops).toBe(true);
    const r = car('bavaria_330');
    r.components.muffler.condition = 'defect';
    r.components.muffler.known = true;
    expect(soundProfile(r).exhaust).toBe('rusty');
    // Fächerkrümmer machen die Pulse heller
    const h = car('bavaria_330');
    h.components.exhaust_manifold.variant = 'manifold_sport';
    expect(engineVoice(soundProfile(h)).ring).toBeGreaterThan(engineVoice(soundProfile(car('bavaria_330'))).ring);
  });
});
