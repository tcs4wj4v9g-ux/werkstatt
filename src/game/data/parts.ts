import type { PartId } from '../types';

export interface PartDef {
  id: PartId;
  name: string;
  price: number;
  /** Stückzahl pro Kauf (z. B. Bremsbeläge achsweise). */
  units: number;
  desc: string;
}

export const PARTS: Record<PartId, PartDef> = {
  ignition_coil: { id: 'ignition_coil', name: 'Zündspule', price: 49, units: 1, desc: 'Stabzündspule, 1 Stück' },
  spark_plug: { id: 'spark_plug', name: 'Zündkerzen (4er-Satz)', price: 36, units: 4, desc: 'Satz für alle vier Zylinder' },
  brake_pads: { id: 'brake_pads', name: 'Bremsbeläge Vorderachse', price: 79, units: 2, desc: 'Satz für links und rechts' },
  brake_disc: { id: 'brake_disc', name: 'Bremsscheiben Vorderachse', price: 128, units: 2, desc: 'Paar für links und rechts' },
  valve_cover_gasket: { id: 'valve_cover_gasket', name: 'Ventildeckeldichtung', price: 39, units: 1, desc: 'Dichtungssatz' },
  belt: { id: 'belt', name: 'Keilrippenriemen', price: 29, units: 1, desc: 'Antrieb für Lichtmaschine und Wasserpumpe' },
  water_pump: { id: 'water_pump', name: 'Wasserpumpe', price: 89, units: 1, desc: 'inkl. Dichtung' },
  thermostat: { id: 'thermostat', name: 'Thermostat', price: 45, units: 1, desc: 'mit Gehäuse' },
  alternator: { id: 'alternator', name: 'Lichtmaschine', price: 240, units: 1, desc: 'generalüberholt' },
  oil_pan_gasket: { id: 'oil_pan_gasket', name: 'Ölwannendichtung', price: 34, units: 1, desc: 'Dichtung Ölwanne' },
  intake_hose: { id: 'intake_hose', name: 'Ansaugschlauch', price: 28, units: 1, desc: 'Gummibalg zwischen Luftfilter und Drosselklappe' },
  coolant_hose: { id: 'coolant_hose', name: 'Kühlmittelschlauch', price: 24, units: 1, desc: 'Schlauch zum Thermostat' },
  rod_bearing: { id: 'rod_bearing', name: 'Pleuellager-Satz', price: 380, units: 1, desc: 'Lagerschalen inkl. Schrauben – teure Motorreparatur' },
  lifters: { id: 'lifters', name: 'Hydrostößel-Satz', price: 160, units: 1, desc: 'Ventilspielausgleich, kompletter Satz' },
  chain_tensioner: { id: 'chain_tensioner', name: 'Steuerkettenspanner', price: 95, units: 1, desc: 'hydraulischer Kettenspanner' },
  oil_filter: { id: 'oil_filter', name: 'Ölfilter', price: 14, units: 1, desc: 'Filtereinsatz mit Dichtring – bei jedem Ölwechsel neu' },
  battery: { id: 'battery', name: 'Starterbatterie', price: 115, units: 1, desc: '12 V, 70 Ah' },
  tire: { id: 'tire', name: 'Reifen (Paar Vorderachse)', price: 180, units: 2, desc: 'zwei neue Reifen, auf Felge montiert' },
};

export const PART_LIST = Object.values(PARTS);
