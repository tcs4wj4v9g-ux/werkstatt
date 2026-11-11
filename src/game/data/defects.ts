import type { DefectId } from '../types';

export interface DefectDef {
  id: DefectId;
  name: string;
  /** Betroffene Bauteile. 'one' = ein zufälliges davon, 'all' = alle. */
  components: string[];
  pick: 'one' | 'all';
  /** Wertminderung beim Verkauf, solange der Defekt besteht. */
  penalty: number;
  /** Was man von diesem Defekt mitbekommt (siehe symptoms.ts). */
  symptoms: string[];
  /** Arbeitslohn, den ein Kunde für die Behebung zahlt. */
  labor: number;
  category: 'Motor' | 'Bremsen' | 'Kühlung' | 'Elektrik' | 'Wartung';
  /** Kontrollleuchte während der Probefahrt. */
  lamp?: string;
}

// Neue Defekte: hier eintragen, Bauteil in components.ts, Teil in parts.ts,
// OBD-Regel (falls elektronisch erfassbar) in diagnosis.ts.
export const DEFECTS: Record<DefectId, DefectDef> = {
  coil: {
    id: 'coil', name: 'Defekte Zündspule', components: ['coil1', 'coil2', 'coil3', 'coil4'], pick: 'one',
    penalty: 800, symptoms: ['rough_idle', 'misfire', 'power_loss'], labor: 90, category: 'Motor', lamp: '⚙️ Motor',
  },
  plugs: {
    id: 'plugs', name: 'Verschlissene Zündkerze', components: ['plug1', 'plug2', 'plug3', 'plug4'], pick: 'one',
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
  chain: {
    id: 'chain', name: 'Defekter Steuerkettenspanner', components: ['chain_tensioner'], pick: 'all',
    penalty: 1200, symptoms: ['metal_noise', 'rattle_start'], labor: 140, category: 'Motor',
  },
  gasket: {
    id: 'gasket', name: 'Undichte Ventildeckeldichtung', components: ['gasket'], pick: 'all',
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
