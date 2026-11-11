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
  brake_pads: { id: 'brake_pads', name: 'Bremsbeläge Vorderachse', price: 79, units: 2, desc: 'Satz für links und rechts' },
  valve_cover_gasket: { id: 'valve_cover_gasket', name: 'Ventildeckeldichtung', price: 39, units: 1, desc: 'Dichtungssatz' },
};
