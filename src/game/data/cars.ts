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
