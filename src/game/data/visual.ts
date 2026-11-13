import type { VisualTune } from '../types';

// Optische Tuningteile. Jedes Teil verändert das 3D-Modell (siehe three/carParts.ts und CarModel.tsx).
// Gekaufte oder am Schrottplatz abgebaute Teile liegen im Optik-Lager (`visualStock`) und werden an der
// Tuning-Werkbank montiert; das abgebaute Teil wandert zurück ins Lager.

export interface VisualPart {
  id: string;
  /** Welches Feld des Fahrzeugs es setzt. */
  field: keyof VisualTune;
  value: VisualTune[keyof VisualTune];
  name: string;
  price: number;
  group: 'Felgen' | 'Fahrwerk' | 'Karosserie' | 'Lack & Folie' | 'Licht' | 'Innenraum' | 'Auspuffblenden';
  desc: string;
}

const P = (id: string, field: keyof VisualTune, value: any, name: string, price: number, group: VisualPart['group'], desc: string): VisualPart => ({ id, field, value, name, price, group, desc });

export const VISUAL_PARTS: VisualPart[] = [
  P('rim:double5', 'rim', 'double5', 'Felgen Doppelspeiche', 780, 'Felgen', 'Fünf Doppelspeichen, silber'),
  P('rim:multi', 'rim', 'multi', 'Felgen Vielspeiche', 920, 'Felgen', 'Zehn schlanke Speichen, schwarz'),
  P('rim:five', 'rim', 'five', 'Felgen Sport-Fünfspeiche', 1150, 'Felgen', 'Breite Speichen, anthrazit'),
  P('rim:turbine', 'rim', 'turbine', 'Felgen Turbinen-Design', 1050, 'Felgen', 'Gedrehte Speichen, glanzgedreht'),
  P('rim:classic', 'rim', 'classic', 'Kreuzspeichen-Felgen', 1400, 'Felgen', 'Klassisches Kreuzspeichen-Design'),
  P('rimsize:1', 'rimSize', 1, 'Felgen +1 Zoll', 450, 'Felgen', 'Größerer Durchmesser, flachere Reifen'),
  P('rimsize:2', 'rimSize', 2, 'Felgen +2 Zoll', 820, 'Felgen', 'Noch größer, sehr flache Reifen'),
  P('rimcolor:#16181d', 'rimColor', '#16181d', 'Felgenfarbe Schwarz', 220, 'Felgen', 'Pulverbeschichtet'),
  P('rimcolor:#c9a54a', 'rimColor', '#c9a54a', 'Felgenfarbe Gold', 260, 'Felgen', 'Pulverbeschichtet'),
  P('rimcolor:#e6e9ed', 'rimColor', '#e6e9ed', 'Felgenfarbe Silber', 180, 'Felgen', 'Lackiert'),
  P('susp:springs', 'suspension', 'springs', 'Tieferlegungsfedern −3 cm', 380, 'Fahrwerk', 'Etwas tiefer, etwas straffer'),
  P('susp:sport', 'suspension', 'sport', 'Sportfahrwerk −4 cm', 1100, 'Fahrwerk', 'Straffere Dämpfer – deutlich agiler'),
  P('susp:coilover', 'suspension', 'coilover', 'Gewindefahrwerk (höhenverstellbar)', 2200, 'Fahrwerk', 'Höhe −2 bis −7 cm einstellbar, sehr agil'),
  P('front:1', 'front', 1, 'Frontstoßstange Sport', 690, 'Karosserie', 'Große Lufteinlässe, Splitter'),
  P('front:2', 'front', 2, 'Frontstoßstange Rennsport', 990, 'Karosserie', 'Tiefer Frontsplitter, offene Einlässe'),
  P('rear:1', 'rear', 1, 'Heckschürze mit Diffusor', 620, 'Karosserie', 'Diffusor mit Finnen'),
  P('skirts', 'skirts', true, 'Seitenschweller', 480, 'Karosserie', 'Verbreiterte Schwellerleisten'),
  P('spoiler:1', 'spoiler', 1, 'Heckspoiler-Lippe', 260, 'Karosserie', 'Dezente Abrisskante'),
  P('spoiler:2', 'spoiler', 2, 'Entenbürzel', 420, 'Karosserie', 'Hochgezogene Heckkante'),
  P('spoiler:3', 'spoiler', 3, 'Heckflügel', 890, 'Karosserie', 'Großer Flügel auf Stützen'),
  P('hood:1', 'hood', 1, 'Motorhaube mit Lufthutze', 760, 'Karosserie', 'Erhöhter Mittelteil mit Hutze'),
  P('hood:2', 'hood', 2, 'Carbon-Motorhaube', 1450, 'Karosserie', 'Leichtbau in Sichtcarbon'),
  P('flares', 'flares', true, 'Kotflügelverbreiterungen', 1300, 'Karosserie', 'Deutlich breitere Radläufe'),
  P('finish:matte', 'finish', 'matte', 'Mattlack', 1800, 'Lack & Folie', 'Matte Oberfläche ohne Spiegelung'),
  P('finish:solid', 'finish', 'solid', 'Uni-Lack', 900, 'Lack & Folie', 'Deckender Lack ohne Metallic'),
  P('finish:metallic', 'finish', 'metallic', 'Metallic-Lack', 1200, 'Lack & Folie', 'Mit Metallic-Effekt und Klarlack'),
  P('wrap:stripes', 'wrap', 'stripes', 'Rennstreifen (Folie)', 420, 'Lack & Folie', 'Zwei Streifen über Haube, Dach und Heck'),
  P('wrap:side', 'wrap', 'side', 'Seitenstreifen (Folie)', 320, 'Lack & Folie', 'Streifen entlang der Flanke'),
  P('wrap:twotone', 'wrap', 'twotone', 'Zweifarbig (Teilfolierung)', 980, 'Lack & Folie', 'Dach und Säulen in Kontrastfarbe'),
  P('lamps:smoked', 'lamps', 'smoked', 'Rückleuchten getönt', 340, 'Licht', 'Dunkel getönte Gläser'),
  P('lamps:clear', 'lamps', 'clear', 'Klarglas-Rückleuchten', 290, 'Licht', 'Helle Klarglas-Optik'),
  P('tips:dual', 'tips', 'dual', 'Doppelendrohr', 260, 'Auspuffblenden', 'Zwei Rohre'),
  P('tips:quad', 'tips', 'quad', 'Vier Endrohre', 480, 'Auspuffblenden', 'Zwei links, zwei rechts'),
  P('tips:oval', 'tips', 'oval', 'Ovale Endrohrblenden', 340, 'Auspuffblenden', 'Breite ovale Blenden'),
  P('seats:sport', 'seats', 'sport', 'Sportsitze', 1600, 'Innenraum', 'Schalensitze mit hohen Wangen'),
  P('wheel:sport', 'wheel', 'sport', 'Sportlenkrad', 420, 'Innenraum', 'Kleinerer Kranz, abgeflachte Unterseite'),
];
export const VISUAL_MAP = Object.fromEntries(VISUAL_PARTS.map((v) => [v.id, v]));

/** Kennung des aktuell am Auto montierten Teils dieses Bereichs (für die Rückgabe ins Lager). */
export function mountedId(visual: VisualTune | undefined, field: keyof VisualTune): string | null {
  const v = visual?.[field];
  if (v === undefined || v === null || v === false || v === 0 || v === 'stock' || v === 'none') return null;
  return VISUAL_PARTS.find((p) => p.field === field && p.value === v)?.id ?? null;
}

/** Tieferlegung in cm je Fahrwerk (Gewinde: frei einstellbar 2…7). */
export const dropOf = (v: VisualTune | undefined) =>
  !v?.suspension || v.suspension === 'stock' ? 0 : v.suspension === 'springs' ? 3 : v.suspension === 'sport' ? 4 : Math.min(7, Math.max(2, v.drop ?? 5));
