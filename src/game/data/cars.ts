import type { BodyStyle } from '../types';

export interface CarModelDef {
  id: string;
  name: string;
  body: BodyStyle;
  baseValue: number;
  colors: string[];
}

// Frei erfundene Marke, optisch an eine Mittelklasse-Limousine der 2000er angelehnt.
export const CAR_MODELS: Record<string, CarModelDef> = {
  bavaria_318: {
    id: 'bavaria_318',
    name: 'Bavaria 318 Limousine',
    body: 'sedan',
    baseValue: 7000,
    colors: ['#8c9299', '#2f4f3a', '#1b1c1f', '#6e2a2a'],
  },
  bavaria_325: {
    id: 'bavaria_325',
    name: 'Bavaria 325 Limousine',
    body: 'sedan',
    baseValue: 10600,
    colors: ['#1f2a44', '#c9ccd1', '#101114', '#3b3f45'],
  },
  bavaria_320: {
    id: 'bavaria_320',
    name: 'Bavaria 320 Limousine',
    body: 'sedan',
    baseValue: 8200,
    colors: ['#2a3a5c', '#8c9299', '#1b1c1f', '#7a1f24'],
  },
  bavaria_320_kombi: {
    id: 'bavaria_320_kombi',
    name: 'Bavaria 320 Kombi',
    body: 'wagon',
    baseValue: 9400,
    colors: ['#3d4a3f', '#c9ccd1', '#1b1c1f', '#24406e'],
  },
  bavaria_330: {
    id: 'bavaria_330',
    name: 'Bavaria 330 Limousine',
    body: 'sedan',
    baseValue: 12500,
    colors: ['#d8d9dc', '#101114', '#5a1a1e'],
  },
};
