import type { BodyStyle, CarClass, FluidProduct } from '../types';
import { ENGINES } from './engines';

export interface CarModelDef {
  id: string;
  brand: string;
  name: string;
  body: BodyStyle;
  cls: CarClass;
  baseValue: number;
  colors: string[];
  engineId: string;
  /** Motorbezeichnung für die Anzeige. */
  engine: string;
  /** Füllmengen in Litern (spielgerecht vereinfacht) – aus dem Motor übernommen. */
  oilCapacity: number;
  coolantCapacity: number;
  oilSpec: FluidProduct;
  /** Leergewicht in kg – zusammen mit der Motorleistung bestimmt es das Fahrverhalten. */
  weight: number;
  /** Nur als Scheunenfund oder in besonderen Auktionen zu bekommen. */
  rare?: boolean;
  /** Sammlerstück: Alter drückt den Wert nicht, Seltenheit und Zustand zählen. */
  collector?: boolean;
  /** Baujahre, falls abweichend vom normalen Markt. */
  years?: [number, number];
  /** Kurzbeschreibung für das Inserat. */
  blurb: string;
}

/** Karosserien mit Motor im Heck (Motordeckel hinten, Kofferraum vorn). */
export const REAR_ENGINE = new Set<BodyStyle>(['tub', 'nine', 'nine2']);

export const CLASS_NAMES: Record<CarClass, string> = {
  budget: 'Günstige Gebrauchte',
  mid: 'Mittelklasse',
  sport: 'Sportliche Oberklasse',
  luxury: 'Luxus- und Sportwagen',
  collector: 'Sammlerfahrzeuge',
};
/** Preisfaktor der Fahrzeugklasse für Fahrwerksteile, Schäden und Arbeitslohn. */
export const CLASS_FACTOR: Record<CarClass, number> = { budget: 1, mid: 1.3, sport: 2.2, luxury: 4, collector: 7 };

const GREY = ['#8c9299', '#1b1c1f', '#c9ccd1', '#2a3a5c'];
type Seed = Omit<CarModelDef, 'engine' | 'oilCapacity' | 'coolantCapacity' | 'oilSpec'>;
const m = (s: Seed): CarModelDef => {
  const e = ENGINES[s.engineId];
  return { ...s, engine: e.name, oilCapacity: e.oilCapacity, coolantCapacity: e.coolantCapacity, oilSpec: e.oilSpec };
};

// Marken und Modelle: Nachbildungen realer Autos tragen leicht abgewandelte Namen (privates Spiel), die übrigen sind frei erfunden.
const list: CarModelDef[] = [
  // --- Günstige Gebrauchte ---
  m({ id: 'renard_twingle', brand: 'Renolt', name: 'Renolt Twingo 1.2', body: 'mono', cls: 'budget', baseValue: 2400, engineId: 'r4_12', weight: 840, colors: ['#e2603f', '#f0c12a', '#4f9b5c', '#2b4f9c', '#c9ccd1'], years: [1993, 2007], blurb: 'Kugelrunder Stadtflitzer mit Froschaugen und verschiebbarer Rückbank – innen erstaunlich viel Platz.' }),
  m({ id: 'tanaka_piccolo', brand: 'Tanaka', name: 'Tanaka Piccolo 1.4', body: 'hatch', cls: 'budget', baseValue: 2900, engineId: 'r4_14', weight: 980, colors: ['#c81e1e', '#e3a81c', '#c9ccd1', '#1f6fb2'], blurb: 'Kleiner Stadtflitzer, sparsam und anspruchslos.' }),
  m({ id: 'nordwind_245', brand: 'Nordwind', name: 'Nordwind 245 Kombi', body: 'wagon', cls: 'budget', baseValue: 3600, engineId: 'r4_20', weight: 1380, years: [1996, 2003], colors: ['#3d4a3f', '#6e2a2a', '#d9d2bd', '#24406e'], blurb: 'Kantiger Lastesel mit riesigem Kofferraum.' }),
  m({ id: 'bavaria_316_compact', brand: 'BMV', name: 'BMV 316 Compact', body: 'hatch', cls: 'budget', baseValue: 4300, engineId: 'r4_14', weight: 1250, colors: ['#1b1c1f', '#7a1f24', '#8c9299', '#2a3a5c'], blurb: 'Dreitürer mit Heckantrieb – der günstige Einstieg.' }),
  m({ id: 'bavaria_318', brand: 'BMV', name: 'BMV 318 Limousine', body: 'sedan', cls: 'budget', baseValue: 7000, engineId: 'r4_20', weight: 1390, colors: ['#8c9299', '#2f4f3a', '#1b1c1f', '#6e2a2a'], blurb: 'Solide Limousine, das Brot-und-Butter-Modell.' }),
  m({ id: 'bavaria_320', brand: 'BMV', name: 'BMV 320 Limousine', body: 'sedan', cls: 'budget', baseValue: 8200, engineId: 'r4_20', weight: 1420, colors: ['#2a3a5c', '#8c9299', '#1b1c1f', '#7a1f24'], blurb: 'Beliebte Mittelklasse-Limousine mit Vierzylinder.' }),
  m({ id: 'bavaria_320d', brand: 'BMV', name: 'BMV 320d Limousine', body: 'sedan', cls: 'budget', baseValue: 8900, engineId: 'r4d_20', weight: 1480, colors: GREY, blurb: 'Sparsamer Turbodiesel für Vielfahrer.' }),
  m({ id: 'bavaria_320_kombi', brand: 'BMV', name: 'BMV 320 Kombi', body: 'wagon', cls: 'budget', baseValue: 9400, engineId: 'r4_20', weight: 1500, colors: ['#3d4a3f', '#c9ccd1', '#1b1c1f', '#24406e'], blurb: 'Praktischer Kombi für Familie und Handwerk.' }),
  // --- Mittelklasse ---
  m({ id: 'bavaria_323i', brand: 'BMV', name: 'BMV 323i (E30)', body: 'box', cls: 'mid', baseValue: 9800, engineId: 'r6_23', weight: 1180, colors: ['#e9e7df', '#b3261e', '#1b1c1f', '#2a3a5c', '#8c9299'], years: [1983, 1991], blurb: 'Kantiger Zweitürer der 80er mit vier Rundscheinwerfern und seidigem Reihensechser – gesuchter Youngtimer.' }),
  m({ id: 'bavaria_325', brand: 'BMV', name: 'BMV 325 Limousine', body: 'sedan', cls: 'mid', baseValue: 10600, engineId: 'r6_25', weight: 1500, colors: ['#1f2a44', '#c9ccd1', '#101114', '#3b3f45'], blurb: 'Seidiger Reihensechszylinder in der Limousine.' }),
  m({ id: 'bavaria_330', brand: 'BMV', name: 'BMV 330 Limousine', body: 'sedan', cls: 'mid', baseValue: 12500, engineId: 'r6_30', weight: 1540, colors: ['#d8d9dc', '#101114', '#5a1a1e'], blurb: 'Der große Sechszylinder mit kräftigem Durchzug.' }),
  m({ id: 'bavaria_330d_kombi', brand: 'BMV', name: 'BMV 330d Kombi', body: 'wagon', cls: 'mid', baseValue: 14800, engineId: 'r6d_30', weight: 1680, colors: GREY, blurb: 'Langstrecken-Kombi mit bärenstarkem Sechszylinder-Diesel.' }),
  m({ id: 'nordwind_s6', brand: 'Nordwind', name: 'Nordwind S6 3.5', body: 'sedan', cls: 'mid', baseValue: 16500, engineId: 'v6_35', weight: 1620, colors: ['#24406e', '#c9ccd1', '#3b3f45', '#5a1a1e'], blurb: 'Skandinavische Reiselimousine mit V6.' }),
  m({ id: 'albrecht_350', brand: 'Albrecht', name: 'Albrecht 350 Elegance', body: 'luxury', cls: 'mid', baseValue: 19500, engineId: 'v6_35', weight: 1780, colors: ['#101114', '#c9ccd1', '#2f3b33', '#d9d2bd'], blurb: 'Komfortbetonte Oberklasse-Limousine, gut ausgestattet.' }),
  m({ id: 'ingol_tc', brand: 'Audy', name: 'Audy TT Coupé 1.8T (8N)', body: 'tt', cls: 'mid', baseValue: 11500, engineId: 'r4t_18', weight: 1240, colors: ['#b8bcc1', '#1f3c78', '#d4a72c', '#1b1c1f', '#a51d22'], years: [1998, 2006], blurb: 'Rundes Designer-Coupé mit Turbo-Vierzylinder, kreisrunden Radhäusern und Alu-Tankdeckel – ein moderner Klassiker.' }),
  m({ id: 'bavaria_335_coupe', brand: 'BMV', name: 'BMV 335 Coupé', body: 'coupe', cls: 'mid', baseValue: 22500, engineId: 'r6t_30', weight: 1600, colors: ['#101114', '#7a1f24', '#d8d9dc', '#1d3fae'], blurb: 'Elegantes Coupé mit Biturbo-Sechszylinder.' }),
  // --- Sportliche Oberklasse ---
  m({ id: 'bavaria_550', brand: 'BMV', name: 'BMV 550 Limousine', body: 'luxury', cls: 'sport', baseValue: 38000, engineId: 'v8t_44', weight: 1890, colors: ['#101114', '#3b3f45', '#d8d9dc', '#1f2a44'], blurb: 'Business-Limousine mit V8-Biturbo – Wolf im Schafspelz.' }),
  m({ id: 'bavaria_340_ms', brand: 'BMV', name: 'BMV 340 M-Sport Coupé', body: 'coupe', cls: 'sport', baseValue: 47000, engineId: 'v8_40', weight: 1650, colors: ['#f2f2ee', '#1d3fae', '#101114', '#c8501e'], blurb: 'Hochdrehzahl-V8 im Sportcoupé – seltenes Sondermodell.' }),
  m({ id: 'veloce_gt', brand: 'Veloce', name: 'Veloce GT 3.0', body: 'sport', cls: 'sport', baseValue: 64000, engineId: 'v6t_30', weight: 1540, colors: ['#c81e1e', '#e3a81c', '#101114', '#f2f2ee'], blurb: 'Italienisch inspirierter Sportwagen mit V6-Biturbo.' }),
  // --- Luxus- und Sportwagen ---
  m({ id: 'kaiser_600', brand: 'Kaiser', name: 'Kaiser 600 Imperial', body: 'luxury', cls: 'luxury', baseValue: 118000, engineId: 'v8t_44', weight: 2150, colors: ['#101114', '#2f3b33', '#5a1a1e', '#c9ccd1'], blurb: 'Staatskarosse mit V8-Biturbo und Fond-Komfort.' }),
  m({ id: 'veloce_stradale', brand: 'Veloce', name: 'Veloce Stradale V8', body: 'sport', cls: 'luxury', baseValue: 189000, engineId: 'v8_45s', weight: 1420, colors: ['#c81e1e', '#e3a81c', '#f2f2ee', '#101114'], blurb: 'Kompromissloser Supersportwagen, 570 PS.' }),
  // --- Seltene Liebhaberstücke (Scheunenfunde, Sonderauktionen) ---
  m({ id: 'bavaria_328_klassik', brand: 'BMV', name: 'BMV 328 Klassik', body: 'sedan', cls: 'mid', baseValue: 15500, engineId: 'r6_28k', weight: 1420, rare: true, years: [1996, 2000], colors: ['#5b6f8f', '#7d1a1f', '#d9d2bd'], blurb: 'Youngtimer mit dem legendären 2,8-Liter.' }),
  m({ id: 'bavaria_330_sport', brand: 'BMV', name: 'BMV 330 Sport-Kombi', body: 'wagon', cls: 'mid', baseValue: 17500, engineId: 'r6_30', weight: 1620, rare: true, years: [2006, 2008], colors: ['#1d3fae', '#f2f2ee', '#101114'], blurb: 'Kombi mit Sportpaket – nur wenige gebaut.' }),
  // --- Extrem seltene Sammlerfahrzeuge ---
  m({ id: 'zuffen_929', brand: 'Porshe', name: 'Porshe 911 Carrera (992)', body: 'nine2', cls: 'luxury', baseValue: 125000, engineId: 'b6t_30', weight: 1505, colors: ['#c9cdd1', '#1c3f8f', '#e8b90f', '#1b1c1f', '#f2f2f0'], years: [2019, 2024], blurb: 'Aktueller Heckmotor-Sportwagen mit Biturbo-Boxer, LED-Leuchtenband und Allrad-Gefühl – schnell, breit und alltagstauglich.' }),
  m({ id: 'zuffen_946', brand: 'Porshe', name: 'Porshe 911 Carrera (964)', body: 'nine', cls: 'luxury', baseValue: 78000, engineId: 'b6_36', weight: 1350, colors: ['#c4161c', '#1b1c1f', '#a7adb3', '#efefea', '#1d2b4f'], years: [1989, 1994], blurb: 'Heckmotor-Sportwagen der späten 80er mit luftgekühltem Sechszylinder-Boxer – der Klassiker unter den Youngtimern.' }),
  m({ id: 'zuffen_365', brand: 'Porshe', name: 'Porshe 356 Coupé', body: 'tub', cls: 'collector', baseValue: 125000, engineId: 'b4_16', weight: 830, colors: ['#b9bdc2', '#e8e0c8', '#a3201b', '#1b1c1f', '#5c7186'], years: [1950, 1965], collector: true, blurb: 'Rundes Sportcoupé der 50er mit luftgekühltem Boxer im Heck – leicht, handlich und heute heiß begehrt.' }),
  m({ id: 'bavaria_30cs', brand: 'BMV', name: 'BMV 3.0 CS Coupé', body: 'classic', cls: 'collector', baseValue: 320000, engineId: 'r6_30cs', weight: 1400, collector: true, years: [1971, 1975], colors: ['#d9d2bd', '#c8501e', '#5b6f8f'], blurb: 'Filigranes Coupé der Siebziger – hochbegehrt.' }),
  m({ id: 'veloce_250', brand: 'Veloce', name: 'Veloce 250 Corsa', body: 'classic', cls: 'collector', baseValue: 980000, engineId: 'v8_30k', weight: 1100, collector: true, years: [1962, 1965], colors: ['#c81e1e', '#d9d2bd'], blurb: 'Rennsport-Ikone der Sechziger. Weltweit eine Handvoll Exemplare.' }),
];

export const CAR_MODELS: Record<string, CarModelDef> = Object.fromEntries(list.map((x) => [x.id, x]));
export const MODEL_LIST = list;

/** Normale Marktmodelle (ohne Scheunenfund-Raritäten und Sammlerstücke). */
export const COMMON_MODELS = list.filter((x) => !x.rare && !x.collector).map((x) => x.id);
export const RARE_MODELS = list.filter((x) => x.rare).map((x) => x.id);
export const COLLECTOR_MODELS = list.filter((x) => x.collector).map((x) => x.id);
export const modelsOfClass = (cls: CarClass) => list.filter((x) => x.cls === cls && !x.rare).map((x) => x.id);
