import { CAR_MODELS } from './data/cars';
import { engineOf } from './data/components';
import type { CarClass, Listing } from './types';

// Filtern und Sortieren der Inserate. Arbeitet nur mit dem, was im Inserat
// steht – verborgene Schäden kennt der Spieler nicht, also auch kein Filter.

export type EngineFilter = 'all' | 'R4' | 'R6' | 'V6' | 'V8' | 'diesel' | 'turbo';
export type MarketSort = 'price_asc' | 'price_desc' | 'km' | 'year' | 'power' | 'condition';

export interface MarketFilter {
  cls: CarClass | 'all';
  brand: string;
  engine: EngineFilter;
  /** Nur Inserate, die ausdrücklich mit Mängeln oder als Bastlerfahrzeug angeboten werden. */
  damaged: boolean;
  /** Nur seltene Fahrzeuge und Sammlerstücke. */
  rare: boolean;
  /** Nur was der Kontostand hergibt. */
  affordable: boolean;
  sort: MarketSort;
}

export const DEFAULT_FILTER: MarketFilter = { cls: 'all', brand: 'all', engine: 'all', damaged: false, rare: false, affordable: false, sort: 'price_asc' };

export type AdCondition = 'gepflegt' | 'mit Mängeln' | 'Bastlerfahrzeug' | 'Scheunenfund';

/**
 * Zustand laut Inserat: ergibt sich aus dem verlangten Preis im Verhältnis zum
 * üblichen Wert. Ein ahnungsloser Verkäufer inseriert auch ein krankes Auto
 * als „gepflegt" – genau hinsehen muss man selbst.
 */
export function adCondition(l: Listing): AdCondition {
  if (l.barn) return 'Scheunenfund';
  const ratio = l.asking / Math.max(1, l.car.cleanValue);
  return ratio < 0.62 ? 'Bastlerfahrzeug' : ratio < 0.82 ? 'mit Mängeln' : 'gepflegt';
}
const conditionRank = (l: Listing) => l.asking / Math.max(1, l.car.cleanValue) - (l.barn ? 1 : 0);

export interface FilteredListing {
  listing: Listing;
  /** Position im ungefilterten Markt (für `viewListing`). */
  index: number;
}

export function filterListings(listings: Listing[], f: MarketFilter, money = Infinity): FilteredListing[] {
  const rows = listings
    .map((listing, index) => ({ listing, index }))
    .filter(({ listing: l }) => {
      const m = CAR_MODELS[l.car.modelId];
      const e = engineOf(l.car);
      if (f.cls !== 'all' && m.cls !== f.cls) return false;
      if (f.brand !== 'all' && m.brand !== f.brand) return false;
      if (f.engine === 'diesel' ? e.fuel !== 'diesel' : f.engine === 'turbo' ? !e.turbo : f.engine !== 'all' && e.layout !== f.engine) return false;
      if (f.damaged && adCondition(l) === 'gepflegt') return false;
      if (f.rare && !(l.car.rarity > 0 || m.collector || m.rare)) return false;
      if (f.affordable && l.current > money) return false;
      return true;
    });
  const key: Record<MarketSort, (l: Listing) => number> = {
    price_asc: (l) => l.current,
    price_desc: (l) => -l.current,
    km: (l) => l.car.km,
    year: (l) => -l.car.year,
    power: (l) => -engineOf(l.car).ps,
    condition: (l) => -conditionRank(l),
  };
  return rows.sort((a, b) => key[f.sort](a.listing) - key[f.sort](b.listing) || a.index - b.index);
}

export const brandsOf = (listings: Listing[]) => [...new Set(listings.map((l) => CAR_MODELS[l.car.modelId].brand))].sort();
