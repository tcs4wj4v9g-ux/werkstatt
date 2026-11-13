import type { DefectId } from '../types';

export interface DefectDef {
  id: DefectId;
  name: string;
  /** Betroffene Bauteile; `coil*` meint alle Zündspulen des Motors. 'one' = ein zufälliges davon, 'all' = alle. */
  components: string[];
  pick: 'one' | 'all';
  /** Wertminderung beim Verkauf, solange der Defekt besteht. */
  penalty: number;
  /** Was man von diesem Defekt mitbekommt (siehe symptoms.ts). */
  symptoms: string[];
  /** Arbeitslohn, den ein Kunde für die Behebung zahlt. */
  labor: number;
  category: 'Motor' | 'Bremsen' | 'Kühlung' | 'Elektrik' | 'Wartung' | 'Antrieb';
  /** Wie oft der Schaden zufällig vorkommt (1 = normal). Kapitale Schäden sind selten. */
  weight?: number;
  /** Kontrollleuchte während der Probefahrt. */
  lamp?: string;
}

// Neue Defekte: hier eintragen, Bauteil in components.ts, Teil in parts.ts,
// OBD-Regel (falls elektronisch erfassbar) in diagnosis.ts.
export const DEFECTS: Record<DefectId, DefectDef> = {
  coil: {
    id: 'coil', name: 'Defekte Zündspule', components: ['coil*'], pick: 'one',
    penalty: 800, symptoms: ['rough_idle', 'misfire', 'power_loss'], labor: 90, category: 'Motor', lamp: '⚙️ Motor',
  },
  plugs: {
    id: 'plugs', name: 'Verschlissene Zündkerze', components: ['plug*'], pick: 'one',
    penalty: 400, symptoms: ['rough_idle', 'misfire', 'power_loss'], labor: 80, category: 'Wartung', lamp: '⚙️ Motor',
  },
  vacuum: {
    id: 'vacuum', name: 'Falschluft (Ansaugschlauch gerissen)', components: ['intake_hose'], pick: 'all',
    penalty: 450, symptoms: ['rough_idle', 'hiss', 'power_loss'], labor: 70, category: 'Motor', lamp: '⚙️ Motor',
  },
  bearing: {
    id: 'bearing', name: 'Pleuellagerschaden', components: ['bearing'], pick: 'all',
    penalty: 2600, symptoms: ['metal_noise', 'knock_load'], labor: 520, category: 'Motor',
  },
  lifters: {
    id: 'lifters', name: 'Verschlissene Hydrostößel', components: ['rocker'], pick: 'all',
    penalty: 900, symptoms: ['metal_noise', 'tick_top'], labor: 260, category: 'Motor',
  },
  rings: {
    id: 'rings', name: 'Verschlissene Kolbenringe', components: ['piston*'], pick: 'one',
    penalty: 1800, symptoms: ['blue_smoke', 'power_loss'], labor: 900, category: 'Motor', weight: 0.35,
  },
  main_bearing: {
    id: 'main_bearing', name: 'Verschlissene Hauptlager', components: ['mainbrg'], pick: 'all',
    penalty: 2800, symptoms: ['knock_load', 'oil_lamp'], labor: 1100, category: 'Motor', weight: 0.2, lamp: '🛢️ Öldruck',
  },
  oil_pump: {
    id: 'oil_pump', name: 'Schwache Ölpumpe', components: ['oil_pump'], pick: 'all',
    penalty: 1400, symptoms: ['oil_lamp', 'tick_top'], labor: 420, category: 'Motor', weight: 0.3, lamp: '🛢️ Öldruck',
  },
  camshaft: {
    id: 'camshaft', name: 'Eingelaufene Nockenwellen', components: ['camshaft', 'camshaft_b'], pick: 'one',
    penalty: 1300, symptoms: ['tick_top', 'power_loss'], labor: 520, category: 'Motor', weight: 0.3,
  },
  timing_chain: {
    id: 'timing_chain', name: 'Gelängte Steuerkette', components: ['timing_chain'], pick: 'all',
    penalty: 1500, symptoms: ['rattle_start', 'metal_noise'], labor: 640, category: 'Motor', weight: 0.3,
  },
  chain: {
    id: 'chain', name: 'Defekter Steuerkettenspanner', components: ['chain_tensioner'], pick: 'all',
    penalty: 1200, symptoms: ['metal_noise', 'rattle_start'], labor: 140, category: 'Motor',
  },
  gasket: {
    id: 'gasket', name: 'Undichte Ventildeckeldichtung', components: ['gasket', 'gasket_b'], pick: 'one',
    penalty: 900, symptoms: ['oil_top', 'oil_drip'], labor: 180, category: 'Motor',
  },
  oil_pan: {
    id: 'oil_pan', name: 'Undichte Ölwannendichtung', components: ['oil_pan_gasket'], pick: 'all',
    penalty: 800, symptoms: ['oil_drip'], labor: 160, category: 'Motor', lamp: '🛢️ Öl',
  },
  belt: {
    id: 'belt', name: 'Verschlissener Keilrippenriemen', components: ['belt'], pick: 'all',
    penalty: 400, symptoms: ['squeal', 'battery_lamp'], labor: 60, category: 'Wartung',
  },
  alternator: {
    id: 'alternator', name: 'Defekte Lichtmaschine', components: ['alternator'], pick: 'all',
    penalty: 1100, symptoms: ['battery_lamp'], labor: 150, category: 'Elektrik', lamp: '🔋 Batterie',
  },
  water_pump: {
    id: 'water_pump', name: 'Undichte Wasserpumpe', components: ['water_pump'], pick: 'all',
    penalty: 900, symptoms: ['coolant_wet', 'temp_high'], labor: 190, category: 'Kühlung', lamp: '🌡️ heiß',
  },
  coolant_hose: {
    id: 'coolant_hose', name: 'Undichter Kühlmittelschlauch', components: ['hose'], pick: 'all',
    penalty: 400, symptoms: ['coolant_wet', 'temp_high'], labor: 70, category: 'Kühlung', lamp: '🌡️ heiß',
  },
  thermostat: {
    id: 'thermostat', name: 'Defekter Thermostat', components: ['thermostat'], pick: 'all',
    penalty: 500, symptoms: ['temp_low'], labor: 120, category: 'Kühlung', lamp: '🌡️ kalt',
  },
  glow: {
    id: 'glow', name: 'Defekte Glühkerze', components: ['glow*'], pick: 'one',
    penalty: 350, symptoms: ['cold_start', 'rough_idle'], labor: 90, category: 'Motor',
  },
  injector: {
    id: 'injector', name: 'Defekte Einspritzdüse', components: ['inj*'], pick: 'one',
    penalty: 900, symptoms: ['rough_idle', 'diesel_knock', 'power_loss'], labor: 140, category: 'Motor', lamp: '⚙️ Motor',
  },
  turbo: {
    id: 'turbo', name: 'Turboladerschaden', components: ['turbo'], pick: 'all',
    penalty: 2200, symptoms: ['boost_loss', 'turbo_whine', 'blue_smoke'], labor: 380, category: 'Motor', lamp: '⚙️ Motor',
  },
  boost_leak: {
    id: 'boost_leak', name: 'Undichte Ladeluftstrecke', components: ['charge_pipe'], pick: 'all',
    penalty: 500, symptoms: ['boost_loss', 'boost_hiss'], labor: 80, category: 'Motor',
  },
  egr: {
    id: 'egr', name: 'Verkoktes AGR-Ventil', components: ['egr'], pick: 'all',
    penalty: 650, symptoms: ['rough_idle', 'black_smoke'], labor: 130, category: 'Motor', lamp: '⚙️ Motor',
  },
  dpf: {
    id: 'dpf', name: 'Zugesetzter Partikelfilter', components: ['dpf'], pick: 'all',
    penalty: 1600, symptoms: ['limp_mode', 'dpf_lamp'], labor: 220, category: 'Motor', lamp: '🟠 DPF',
  },
  head_gasket: {
    id: 'head_gasket', name: 'Durchgebrannte Zylinderkopfdichtung', components: ['head_gasket'], pick: 'all',
    penalty: 2600, symptoms: ['white_smoke', 'oil_milky', 'temp_high'], labor: 650, category: 'Motor', lamp: '🌡️ heiß', weight: 0.3,
  },
  gearbox: {
    id: 'gearbox', name: 'Getriebeschaden', components: ['gearbox'], pick: 'all',
    penalty: 3200, symptoms: ['gear_grind', 'gear_whine'], labor: 520, category: 'Antrieb', weight: 0.3,
  },
  battery: {
    id: 'battery', name: 'Defekte Batterie', components: ['battery'], pick: 'all',
    penalty: 250, symptoms: ['no_start'], labor: 40, category: 'Elektrik',
  },
  tires: {
    id: 'tires', name: 'Überalterte Reifen vorne', components: ['wheel_fl', 'wheel_fr'], pick: 'all',
    penalty: 350, symptoms: ['tire_look'], labor: 50, category: 'Wartung',
  },
  brakes: {
    id: 'brakes', name: 'Verschlissene Bremsbeläge vorne', components: ['pads_fl', 'pads_fr'], pick: 'all',
    penalty: 600, symptoms: ['brake_look', 'brake_grind'], labor: 110, category: 'Bremsen', lamp: '🛑 Bremse',
  },
  discs: {
    id: 'discs', name: 'Verschlissene Bremsscheiben vorne', components: ['disc_fl', 'disc_fr'], pick: 'all',
    penalty: 700, symptoms: ['brake_look', 'brake_judder'], labor: 150, category: 'Bremsen',
  },
};

export const DEFECT_LIST = Object.values(DEFECTS);

type WithComponents = { components: Record<string, unknown> };
/** Bauteile eines Autos, die zu einem Defekt gehören (löst `coil*` usw. auf). */
export function defectComponents(car: WithComponents, d: DefectDef): string[] {
  const ids = Object.keys(car.components);
  return d.components.flatMap((p) => (p.endsWith('*') ? ids.filter((id) => new RegExp(`^${p.slice(0, -1)}\\d+$`).test(id)) : ids.includes(p) ? [p] : []));
}
/** Kann dieser Defekt an diesem Auto überhaupt auftreten? (Ein Diesel hat keine Zündspulen, ein Sauger keinen Turbo.) */
export const defectApplies = (car: WithComponents, d: DefectDef) => defectComponents(car, d).length > 0;
