import { CAR_MODELS } from './data/cars';
import { BRAKE_CAPACITY, FLUID_PRODUCTS } from './data/fluids';
import { isComplete } from './repair';
import type { ActionResult, CarInstance, FluidId, FluidProduct, Fluids, FluidStock, Toolset } from './types';

// Betriebsflüssigkeiten. Spielgerecht vereinfacht – keine Werkstattanleitung.

const fail = (message: string): ActionResult => ({ ok: false, message });
const done = (message: string): ActionResult => ({ ok: true, message });
const r1 = (n: number) => Math.round(n * 10) / 10;
/** Liter in deutscher Schreibweise, z. B. „3,6“. */
const lit = (n: number) => r1(n).toLocaleString('de-DE');

export const capacity = (car: CarInstance, id: FluidId) =>
  id === 'oil' ? CAR_MODELS[car.modelId].oilCapacity : id === 'coolant' ? CAR_MODELS[car.modelId].coolantCapacity : BRAKE_CAPACITY;

/** Füllstand als Anteil der Sollmenge. */
export const fill = (car: CarInstance, id: FluidId) => car.fluids[id].level / capacity(car, id);

export const FLUID_NAMES: Record<FluidId, string> = { oil: 'Motoröl', coolant: 'Kühlmittel', brake: 'Bremsflüssigkeit' };

/** Flüssigkeiten eines Autos erzeugen. `wear` 0 = frisch gewartet … 1 = völlig vernachlässigt. */
export function createFluids(modelId: string, wear: number, rng: () => number): Fluids {
  const m = CAR_MODELS[modelId];
  const q = (base: number) => Math.max(0.05, Math.min(1, base - wear * (0.5 + rng() * 0.4)));
  return {
    oil: { level: r1(m.oilCapacity * (1 - wear * (0.15 + rng() * 0.3))), quality: q(0.85), product: m.oilSpec, filterFresh: false },
    coolant: { level: r1(m.coolantCapacity * (1 - wear * (0.1 + rng() * 0.25))), quality: q(0.9), air: false },
    brake: { level: r1(BRAKE_CAPACITY * (1 - wear * 0.3)), quality: q(0.8), air: wear > 0.85, bled: { fl: false, fr: false } },
  };
}

const quality = (q: number) => (q > 0.8 ? 'frisch' : q > 0.5 ? 'gebraucht, noch in Ordnung' : q > 0.25 ? 'alt und verbraucht' : 'völlig überaltert');

function hoodAccess(car: CarInstance): string | null {
  if (car.lifted) return 'Dafür das Auto ablassen.';
  if (!car.hoodOpen) return 'Erst die Motorhaube öffnen.';
  return null;
}

/** Stand ablesen (Peilstab, Ausgleichsbehälter, Bremsflüssigkeitsbehälter). */
export function checkFluid(car: CarInstance, id: FluidId, day: number): ActionResult {
  const access = hoodAccess(car);
  if (access) return fail(access);
  const f = car.fluids[id];
  car.checked[id] = { level: f.level, quality: f.quality, day };
  const cap = capacity(car, id);
  const pct = f.level / cap;
  const state = pct > 1.03 ? 'überfüllt' : pct >= 0.85 ? 'in Ordnung' : pct >= 0.55 ? 'etwas niedrig' : pct > 0.05 ? 'viel zu niedrig' : 'leer';
  const extra =
    id === 'oil'
      ? ` Vorgeschrieben: ${FLUID_PRODUCTS[CAR_MODELS[car.modelId].oilSpec].name}${f.level > 0.1 && car.fluids.oil.product !== CAR_MODELS[car.modelId].oilSpec ? ' – eingefüllt ist etwas anderes!' : ''}.`
      : id === 'coolant' && car.fluids.coolant.air
        ? ' Im System ist Luft – entlüften.'
        : id === 'brake' && car.fluids.brake.air
          ? ' Luft im System – Bremse entlüften.'
          : '';
  return done(`${FLUID_NAMES[id]}: ${lit(f.level)} von ${lit(cap)} l (${state}), Zustand ${quality(f.quality)}.${extra}`);
}

/** Nachfüllen aus dem Lager. */
export function addFluid(car: CarInstance, stock: FluidStock, id: FluidId, product: FluidProduct, liters: number): ActionResult {
  const access = hoodAccess(car);
  if (access) return fail(access);
  const isOil = product.startsWith('oil');
  if ((id === 'oil') !== isOil || (id === 'coolant' && product !== 'coolant') || (id === 'brake' && product !== 'brake_fluid')) {
    return fail(`${FLUID_PRODUCTS[product].name} gehört nicht in diesen Behälter.`);
  }
  if (id === 'oil' && !car.components.drain_plug.installed) return fail('Die Ölablassschraube ist noch draußen – das Öl liefe unten wieder heraus.');
  if (id === 'oil' && !isComplete(car, 'oil_pan')) return fail('Erst die Ölwanne montieren.');
  if (id === 'oil' && !car.components.oil_filter.installed) return fail('Erst einen Ölfilter einsetzen.');
  if (id === 'coolant' && ['water_pump', 'thermostat', 'hose'].some((c) => !isComplete(car, c))) return fail('Das Kühlsystem ist noch offen – erst Pumpe, Thermostat und Schlauch montieren.');
  if (stock[product] < 0.05) return fail(`Kein ${FLUID_PRODUCTS[product].name} im Lager – am Computer bestellen.`);
  const f = car.fluids[id];
  const cap = capacity(car, id);
  const room = cap * 1.1 - f.level;
  if (room < 0.05) return fail('Mehr passt nicht hinein.');
  const amount = Math.min(liters, stock[product], room);
  // Frische Flüssigkeit verbessert die Mischung anteilig.
  f.quality = Math.min(1, (f.quality * f.level + amount) / (f.level + amount));
  if (id === 'oil') {
    const oil = car.fluids.oil;
    oil.product = oil.level < 0.3 || oil.product === product ? product : 'mixed';
    if (!oil.filterFresh) oil.quality = Math.min(oil.quality, 0.8); // alter Filter verschmutzt frisches Öl sofort
  }
  f.level = r1(f.level + amount);
  stock[product] = r1(stock[product] - amount);
  car.checked[id] = undefined;
  car.testDriven = false;
  const over = f.level > cap * 1.03 ? ' Achtung: überfüllt!' : '';
  return done(`${lit(amount)} l ${FLUID_PRODUCTS[product].name} eingefüllt.${over} Stand kontrollieren.`);
}

/** Kühlsystem entlüften: Motor muss laufen, Behälter voll. */
export function bleedCoolant(car: CarInstance, engineRunning: boolean): ActionResult {
  const access = hoodAccess(car);
  if (access) return fail(access);
  if (!car.fluids.coolant.air) return fail('Im Kühlsystem ist keine Luft.');
  if (!engineRunning) return fail('Zum Entlüften muss der Motor laufen.');
  if (fill(car, 'coolant') < 0.85) return fail('Erst Kühlmittel auffüllen – der Behälter ist zu leer.');
  car.fluids.coolant.air = false;
  car.fluids.coolant.level = r1(car.fluids.coolant.level - 0.4);
  car.checked.coolant = undefined;
  return done('Kühlsystem entlüftet – die Luftblasen sind raus. Stand ist etwas gefallen, noch einmal nachfüllen.');
}

/** Bremse an einem Vorderrad entlüften und dabei die Flüssigkeit erneuern. */
export function bleedBrake(car: CarInstance, stock: FluidStock, side: 'fl' | 'fr', tools: Toolset): ActionResult {
  if (!car.lifted) return fail('Zum Entlüften muss das Auto auf der Hebebühne angehoben sein.');
  if (car.components[`wheel_${side}`].installed) return fail('Erst das Rad abnehmen – der Entlüfternippel sitzt am Bremssattel.');
  if (!isComplete(car, `caliper_${side}`)) return fail('Der Bremssattel muss montiert sein.');
  if (tools.active !== 'wrench' && !tools.carried.includes('wrench')) return fail('Den Entlüfternippel öffnest du mit dem Schraubenschlüssel – hol ihn aus dem Werkzeugschrank.');
  if (tools.active !== 'wrench' && tools.active !== 'hand') return fail('Den Entlüfternippel öffnest du mit dem Schraubenschlüssel.');
  const b = car.fluids.brake;
  if (b.bled[side]) return fail('Diese Seite ist schon entlüftet.');
  if (stock.brake_fluid < 0.5) return fail('Du brauchst 0,5 l frische Bremsflüssigkeit im Lager.');
  stock.brake_fluid = r1(stock.brake_fluid - 0.5);
  b.bled[side] = true;
  car.testDriven = false;
  if (b.bled.fl && b.bled.fr) {
    b.bled = { fl: false, fr: false };
    b.quality = 1;
    b.air = false;
    b.level = BRAKE_CAPACITY;
    car.checked.brake = undefined;
    return done('Beide Seiten entlüftet: frische Bremsflüssigkeit im System, keine Luft mehr.');
  }
  return done('Alte Flüssigkeit läuft blasenfrei heraus. Jetzt noch die andere Seite.');
}

/** Symptome, die von Flüssigkeiten statt von Bauteilen kommen. */
export function fluidSymptoms(car: CarInstance): string[] {
  const out: string[] = [];
  if (fill(car, 'oil') < 0.55) out.push('oil_lamp');
  if (fill(car, 'coolant') < 0.6 || car.fluids.coolant.air) out.push('temp_high');
  if (car.fluids.brake.air || car.fluids.brake.quality < 0.3 || fill(car, 'brake') < 0.5) out.push('brake_soft');
  return out;
}

/** Über Nacht verlieren undichte Autos Flüssigkeit. */
export function dailyLeaks(car: CarInstance) {
  const bad = (id: string) => car.components[id].condition === 'defect' && car.components[id].installed;
  const oilLoss = (bad('gasket') ? 0.2 : 0) + (bad('oil_pan_gasket') ? 0.3 : 0);
  const coolantLoss = (bad('water_pump') ? 0.5 : 0) + (bad('hose') ? 0.4 : 0);
  car.fluids.oil.level = r1(Math.max(0, car.fluids.oil.level - oilLoss));
  car.fluids.coolant.level = r1(Math.max(0, car.fluids.coolant.level - coolantLoss));
}

export interface ServiceState {
  oilChanged: boolean;
  oilOk: boolean;
  coolantOk: boolean;
  brakeOk: boolean;
}

export function serviceState(car: CarInstance): ServiceState {
  const oil = car.fluids.oil;
  const spec = oil.product === CAR_MODELS[car.modelId].oilSpec;
  const level = fill(car, 'oil');
  return {
    oilChanged: oil.quality > 0.85 && oil.filterFresh && spec && level >= 0.85 && level <= 1.05,
    oilOk: oil.quality > 0.35 && spec && level >= 0.7 && level <= 1.05,
    coolantOk: fill(car, 'coolant') >= 0.8 && !car.fluids.coolant.air,
    brakeOk: car.fluids.brake.quality >= 0.3 && !car.fluids.brake.air && fill(car, 'brake') >= 0.7,
  };
}

/** Darf der Motor so laufen? */
export function fluidEngineBlocker(car: CarInstance): string | null {
  if (fill(car, 'oil') < 0.1) return 'Im Motor ist kein Öl – so startest du ihn nicht.';
  return null;
}
