import type { DefectId } from '../types';

export interface DefectDef {
  id: DefectId;
  name: string;
  /** Betroffene Bauteile. 'one' = ein zufälliges davon, 'all' = alle. */
  components: string[];
  pick: 'one' | 'all';
  /** Wertminderung beim Verkauf, solange der Defekt besteht. */
  penalty: number;
  /** Welche Untersuchung auf dem Markt den Mangel aufdeckt. */
  marketCheck: 'listen' | 'hood' | 'brakes';
  marketHint: string;
  driveSymptom: string;
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
};

export const DEFECT_LIST = Object.values(DEFECTS);
