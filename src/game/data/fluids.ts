import type { FluidProduct } from '../types';

export interface FluidProductDef {
  id: FluidProduct;
  name: string;
  /** Preis je Gebinde. */
  price: number;
  /** Liter je Gebinde. */
  liters: number;
  desc: string;
}

export const FLUID_PRODUCTS: Record<FluidProduct, FluidProductDef> = {
  oil_5w30: { id: 'oil_5w30', name: 'Motoröl 5W-30', price: 42, liters: 5, desc: '5-Liter-Kanister, für die Vierzylinder' },
  oil_5w40: { id: 'oil_5w40', name: 'Motoröl 5W-40', price: 46, liters: 5, desc: '5-Liter-Kanister, für die Sechszylinder' },
  coolant: { id: 'coolant', name: 'Kühlmittel (fertig gemischt)', price: 19, liters: 5, desc: '5-Liter-Kanister' },
  brake_fluid: { id: 'brake_fluid', name: 'Bremsflüssigkeit DOT 4', price: 12, liters: 1, desc: '1-Liter-Flasche' },
};
export const FLUID_LIST = Object.values(FLUID_PRODUCTS);

/** Bremsflüssigkeit: Behälterinhalt in Litern. */
export const BRAKE_CAPACITY = 1;
