import type { BodyStyle, FluidProduct } from '../types';

export interface CarModelDef {
  id: string;
  name: string;
  body: BodyStyle;
  baseValue: number;
  colors: string[];
  engine: string;
  /** Füllmengen in Litern (spielgerecht vereinfacht). */
  oilCapacity: number;
  coolantCapacity: number;
  oilSpec: FluidProduct;
  /** Nur als Scheunenfund oder in besonderen Auktionen zu bekommen. */
  rare?: boolean;
  /** Baujahre, falls abweichend vom normalen Markt. */
  years?: [number, number];
}

const four = { engine: '2,0-l-Vierzylinder', oilCapacity: 4.5, coolantCapacity: 7, oilSpec: 'oil_5w30' as FluidProduct };
const six = { engine: '3,0-l-Reihensechszylinder', oilCapacity: 6.5, coolantCapacity: 8.5, oilSpec: 'oil_5w40' as FluidProduct };

// Frei erfundene Marke, optisch an bayerische Mittelklasse der 2000er angelehnt.
export const CAR_MODELS: Record<string, CarModelDef> = {
  bavaria_318: { id: 'bavaria_318', name: 'Bavaria 318 Limousine', body: 'sedan', baseValue: 7000, colors: ['#8c9299', '#2f4f3a', '#1b1c1f', '#6e2a2a'], ...four },
  bavaria_320: { id: 'bavaria_320', name: 'Bavaria 320 Limousine', body: 'sedan', baseValue: 8200, colors: ['#2a3a5c', '#8c9299', '#1b1c1f', '#7a1f24'], ...four },
  bavaria_320_kombi: { id: 'bavaria_320_kombi', name: 'Bavaria 320 Kombi', body: 'wagon', baseValue: 9400, colors: ['#3d4a3f', '#c9ccd1', '#1b1c1f', '#24406e'], ...four },
  bavaria_325: { id: 'bavaria_325', name: 'Bavaria 325 Limousine', body: 'sedan', baseValue: 10600, colors: ['#1f2a44', '#c9ccd1', '#101114', '#3b3f45'], ...six, engine: '2,5-l-Reihensechszylinder' },
  bavaria_330: { id: 'bavaria_330', name: 'Bavaria 330 Limousine', body: 'sedan', baseValue: 12500, colors: ['#d8d9dc', '#101114', '#5a1a1e'], ...six },
  bavaria_328_klassik: {
    id: 'bavaria_328_klassik', name: 'Bavaria 328 Klassik', body: 'sedan', baseValue: 15500, colors: ['#5b6f8f', '#7d1a1f', '#d9d2bd'],
    ...six, engine: '2,8-l-Reihensechszylinder', rare: true, years: [1996, 2000],
  },
  bavaria_330_sport: {
    id: 'bavaria_330_sport', name: 'Bavaria 330 Sport-Kombi', body: 'wagon', baseValue: 17500, colors: ['#1d3fae', '#f2f2ee', '#101114'],
    ...six, engine: '3,0-l-Reihensechszylinder mit Sportpaket', rare: true, years: [2006, 2008],
  },
};

export const COMMON_MODELS = Object.values(CAR_MODELS).filter((m) => !m.rare).map((m) => m.id);
export const RARE_MODELS = Object.values(CAR_MODELS).filter((m) => m.rare).map((m) => m.id);
