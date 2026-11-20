/**
 * Reifen, Untergrund und Witterung: wie viel Haftung ein Reifen auf welchem Untergrund hat.
 *
 * Untergrundklassen:
 *  - `dry`: trockener Asphalt
 *  - `wet`: nasser Asphalt (Regen)
 *  - `snow`: Schnee bzw. Eis auf der Straße oder Schneepiste (Rallye)
 *  - `loose`: loser Untergrund – Schotter, Matsch, Wiese, Feld
 * Der Grundwert der Haftung kommt vom Untergrund selbst (z. B. Schotter 0,72), der Reifen multipliziert darauf.
 */
import type { VisualTune } from './types';

export type GroundClass = 'dry' | 'wet' | 'snow' | 'loose';
export type TireKind = NonNullable<VisualTune['tires']>;

/** Haftungsfaktor je Reifen und Untergrund (Serienreifen = Sommerreifen = 1 auf trockener Straße). */
export const TIRE_GRIP: Record<TireKind, Record<GroundClass, number>> = {
  stock: { dry: 1, wet: 1, snow: 1, loose: 1 },
  // Sportreifen: mehr Grip auf der Straße, etwas weniger im Nassen und im Dreck
  sport: { dry: 1.06, wet: 0.97, snow: 0.85, loose: 0.92 },
  // Semi-Slicks: viel Grip im Trockenen, im Nassen und auf Schnee gefährlich
  semislick: { dry: 1.15, wet: 0.72, snow: 0.6, loose: 0.78 },
  // Driftreifen: harte Mischung, weniger Grip – das Heck kommt leichter und rutscht gleichmäßig
  drift: { dry: 0.86, wet: 0.88, snow: 0.85, loose: 0.9 },
  // Winterreifen: Lamellen für Schnee, weich – im Trockenen etwas schwammig
  winter: { dry: 0.93, wet: 1.04, snow: 1.5, loose: 1.08 },
  // Schotterreifen (Rallye): grobes Profil, verstärkte Flanken
  gravel: { dry: 0.9, wet: 0.95, snow: 1.2, loose: 1.35 },
  // Spikereifen (Rallye im Schnee): beißen sich in Schnee und Eis, auf Asphalt schlecht
  spikes: { dry: 0.82, wet: 0.86, snow: 1.85, loose: 1.12 },
};

export const TIRE_NAMES: Record<TireKind, string> = {
  stock: 'Serienreifen',
  sport: 'Sportreifen',
  semislick: 'Semi-Slicks',
  drift: 'Driftreifen',
  winter: 'Winterreifen',
  gravel: 'Schotterreifen',
  spikes: 'Spikereifen',
};

/** Haftung von Asphalt je Witterung (vor dem Reifenfaktor). */
export const ROAD_GRIP: Record<'dry' | 'wet' | 'snow', number> = { dry: 1, wet: 0.78, snow: 0.5 };

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Weather = 'sun' | 'cloudy' | 'rain' | 'fog' | 'snow';
export const SEASON_NAMES: Record<Season, string> = { spring: 'Frühling', summer: 'Sommer', autumn: 'Herbst', winter: 'Winter' };
export const WEATHER_NAMES: Record<Weather, string> = { sun: 'Sonnig', cloudy: 'Bewölkt', rain: 'Regen', fog: 'Nebel', snow: 'Schnee' };
export const WEATHER_ICON: Record<Weather, string> = { sun: '☀️', cloudy: '⛅', rain: '🌧️', fog: '🌫️', snow: '❄️' };

/** Ein Jahr hat 40 Spieltage: je zehn Tage Frühling, Sommer, Herbst, Winter. Tag 1 ist Frühlingsanfang. */
export const SEASON_DAYS = 10;
export function seasonOf(day: number): Season {
  const k = Math.floor(((Math.max(1, day) - 1) % (SEASON_DAYS * 4)) / SEASON_DAYS);
  return (['spring', 'summer', 'autumn', 'winter'] as const)[k];
}

/** Fester Zufall je Tag – alle Geräte (auch im Koop) haben dasselbe Wetter. */
function dayRand(day: number, salt: number) {
  let x = (day * 2654435761 + salt * 97531) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519) >>> 0;
  x ^= x >>> 13;
  return (x % 10000) / 10000;
}

/** Wetter des Tages nach Jahreszeit (fest je Tag). */
export function weatherOf(day: number): Weather {
  const r = dayRand(day, 7);
  switch (seasonOf(day)) {
    case 'summer':
      return r < 0.6 ? 'sun' : r < 0.82 ? 'cloudy' : 'rain';
    case 'autumn':
      return r < 0.25 ? 'sun' : r < 0.5 ? 'cloudy' : r < 0.8 ? 'rain' : 'fog';
    case 'winter':
      return r < 0.2 ? 'sun' : r < 0.4 ? 'cloudy' : r < 0.5 ? 'fog' : 'snow';
    default:
      return r < 0.4 ? 'sun' : r < 0.65 ? 'cloudy' : r < 0.9 ? 'rain' : 'fog';
  }
}

/** Zustand der Asphaltstraßen bei diesem Wetter. */
export const roadOf = (w: Weather): 'dry' | 'wet' | 'snow' => (w === 'rain' ? 'wet' : w === 'snow' ? 'snow' : 'dry');

/** Kurzer Text für die Anzeige, z. B. „❄️ Winter · Schnee“. */
export const weatherLabel = (day: number) => `${WEATHER_ICON[weatherOf(day)]} ${SEASON_NAMES[seasonOf(day)]} · ${WEATHER_NAMES[weatherOf(day)]}`;
