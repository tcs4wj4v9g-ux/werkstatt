import type { DefectId } from '../types';

export type MarketCheck = 'listen' | 'hood' | 'brakes' | 'under' | 'dash';

export interface DefectDef {
  id: DefectId;
  name: string;
  /** Betroffene Bauteile. 'one' = ein zufälliges davon, 'all' = alle. */
  components: string[];
  pick: 'one' | 'all';
  /** Wertminderung beim Verkauf, solange der Defekt besteht. */
  penalty: number;
  /** Welche Untersuchung auf dem Markt den Mangel aufdeckt. */
  marketCheck: MarketCheck;
  marketHint: string;
  driveSymptom: string;
  /** Kontrollleuchte während der Probefahrt. */
  lamp?: string;
}

export const DEFECTS: Record<DefectId, DefectDef> = {
  coil: {
    id: 'coil',
    name: 'Defekte Zündspule',
    components: ['coil1', 'coil2', 'coil3', 'coil4'],
    pick: 'one',
    penalty: 800,
    marketCheck: 'listen',
    marketHint: 'Der Motor läuft unrund und schüttelt sich – Zündaussetzer!',
    driveSymptom: 'Motor ruckelt und zieht schlecht – Zündaussetzer.',
    lamp: '⚙️ Motor',
  },
  plugs: {
    id: 'plugs',
    name: 'Verschlissene Zündkerzen',
    components: ['plug1', 'plug2', 'plug3', 'plug4'],
    pick: 'all',
    penalty: 350,
    marketCheck: 'listen',
    marketHint: 'Der Motor springt schlecht an und stottert im Leerlauf.',
    driveSymptom: 'Motor nimmt schlecht Gas an und stottert beim Beschleunigen.',
  },
  brakes: {
    id: 'brakes',
    name: 'Verschlissene Bremsbeläge vorne',
    components: ['pads_fl', 'pads_fr'],
    pick: 'all',
    penalty: 600,
    marketCheck: 'brakes',
    marketHint: 'Durch die Felgen sieht man: Die Beläge vorne sind fast runter.',
    driveSymptom: 'Bremsen schleifen und verzögern schwach.',
    lamp: '🛑 Bremse',
  },
  discs: {
    id: 'discs',
    name: 'Verschlissene Bremsscheiben vorne',
    components: ['disc_fl', 'disc_fr'],
    pick: 'all',
    penalty: 700,
    marketCheck: 'brakes',
    marketHint: 'Die Bremsscheiben vorne haben tiefe Riefen und einen dicken Grat.',
    driveSymptom: 'Beim Bremsen rubbelt und vibriert das Lenkrad.',
  },
  gasket: {
    id: 'gasket',
    name: 'Undichte Ventildeckeldichtung',
    components: ['gasket'],
    pick: 'all',
    penalty: 900,
    marketCheck: 'hood',
    marketHint: 'Ölfeuchter Motor – am Ventildeckel schwitzt es deutlich.',
    driveSymptom: 'Es riecht nach verbranntem Öl und qualmt leicht aus dem Motorraum.',
  },
  belt: {
    id: 'belt',
    name: 'Defekter Keilrippenriemen',
    components: ['belt'],
    pick: 'all',
    penalty: 400,
    marketCheck: 'listen',
    marketHint: 'Beim Starten quietscht es laut aus dem Riementrieb.',
    driveSymptom: 'Lautes Quietschen aus dem Motorraum beim Gasgeben.',
  },
  water_pump: {
    id: 'water_pump',
    name: 'Undichte Wasserpumpe',
    components: ['water_pump'],
    pick: 'all',
    penalty: 900,
    marketCheck: 'hood',
    marketHint: 'Eingetrocknete Kühlmittelspuren vorne am Motor – die Wasserpumpe leckt.',
    driveSymptom: 'Die Kühlmitteltemperatur steigt bedenklich an.',
    lamp: '🌡️ heiß',
  },
  thermostat: {
    id: 'thermostat',
    name: 'Defekter Thermostat',
    components: ['thermostat'],
    pick: 'all',
    penalty: 500,
    marketCheck: 'dash',
    marketHint: 'Die Temperaturanzeige bleibt auch nach langem Laufen im Keller.',
    driveSymptom: 'Der Motor wird nicht warm, die Heizung bleibt kalt.',
    lamp: '🌡️ kalt',
  },
  alternator: {
    id: 'alternator',
    name: 'Defekte Lichtmaschine',
    components: ['alternator'],
    pick: 'all',
    penalty: 1100,
    marketCheck: 'dash',
    marketHint: 'Die Batteriekontrollleuchte geht nach dem Start nicht aus.',
    driveSymptom: 'Batterieleuchte brennt, die Bordspannung fällt ab.',
    lamp: '🔋 Batterie',
  },
  oil_pan: {
    id: 'oil_pan',
    name: 'Ölverlust an der Ölwanne',
    components: ['oil_pan_gasket'],
    pick: 'all',
    penalty: 800,
    marketCheck: 'under',
    marketHint: 'Unter dem Motor hängt ein Öltropfen, der Unterboden ist ölverschmiert.',
    driveSymptom: 'Die Öldruckleuchte flackert in Kurven – der Ölstand ist zu niedrig.',
    lamp: '🛢️ Öl',
  },
};

export const DEFECT_LIST = Object.values(DEFECTS);
