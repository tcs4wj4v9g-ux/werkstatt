import { CAR_MODELS } from './data/cars';
import { engineOf } from './data/components';
import { SLOTS } from './data/workshop';
import { valuate } from './market';
import type { CarInstance } from './types';

// Karriere: Zähler über das ganze Spiel, Erfolge mit einmaliger Belohnung und
// die private Fahrzeugsammlung. Reine Daten und Funktionen – der Store ruft
// sie nach jedem relevanten Ereignis auf.

export interface Career {
  bestSale: number;
  bestProfit: number;
  barnSold: number;
  auctionsWon: number;
  /** Verkaufte oder abgerechnete Autos, an denen selbst repariert wurde – je Motorbauart. */
  layouts: string[];
  dieselFixed: number;
  turboFixed: number;
  /** Behobene kapitale Schäden (Kopfdichtung, Getriebe). */
  severeFixed: number;
  dynoRuns: number;
  /** Verkäufe ohne jeden Abzug. */
  cleanSales: number;
  competitionsWon: number;
  meetsWon: number;
}
export const emptyCareer = (): Career => ({
  bestSale: 0, bestProfit: 0, barnSold: 0, auctionsWon: 0, layouts: [], dieselFixed: 0, turboFixed: 0, severeFixed: 0, dynoRuns: 0, cleanSales: 0, competitionsWon: 0, meetsWon: 0,
});

/** Alles, woran ein Erfolg hängen kann. */
export interface CareerView {
  career: Career;
  carsSold: number;
  totalProfit: number;
  jobsDone: number;
  money: number;
  upgrades: string[];
  cars: (CarInstance | null)[];
}

export interface Achievement {
  id: string;
  title: string;
  desc: string;
  reward: number;
  /** Fortschritt als [erreicht, Ziel]. */
  progress(v: CareerView): [number, number];
}

const kept = (v: CareerView) => v.cars.filter((c): c is CarInstance => !!c && c.keep && !c.job);
const count = (n: number, of: number): [number, number] => [Math.min(n, of), of];
const flag = (ok: boolean): [number, number] => [ok ? 1 : 0, 1];

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_sale', title: 'Erster Handschlag', desc: 'Verkaufe dein erstes Auto.', reward: 250, progress: (v) => count(v.carsSold, 1) },
  { id: 'dealer_10', title: 'Händler', desc: 'Verkaufe 10 Autos.', reward: 2000, progress: (v) => count(v.carsSold, 10) },
  { id: 'dealer_50', title: 'Großhändler', desc: 'Verkaufe 50 Autos.', reward: 15000, progress: (v) => count(v.carsSold, 50) },
  { id: 'profit_50k', title: 'Es läuft', desc: 'Erziele insgesamt 50.000 € Gewinn aus Autoverkäufen.', reward: 5000, progress: (v) => count(Math.max(0, v.totalProfit), 50000) },
  { id: 'profit_250k', title: 'Goldene Hände', desc: 'Erziele insgesamt 250.000 € Gewinn aus Autoverkäufen.', reward: 20000, progress: (v) => count(Math.max(0, v.totalProfit), 250000) },
  { id: 'profit_1m', title: 'Garage King', desc: 'Erziele insgesamt 1.000.000 € Gewinn aus Autoverkäufen.', reward: 75000, progress: (v) => count(Math.max(0, v.totalProfit), 1000000) },
  { id: 'jobs_10', title: 'Stammkundschaft', desc: 'Schließe 10 Kundenaufträge ab.', reward: 1500, progress: (v) => count(v.jobsDone, 10) },
  { id: 'jobs_50', title: 'Meisterbetrieb', desc: 'Schließe 50 Kundenaufträge ab.', reward: 8000, progress: (v) => count(v.jobsDone, 50) },
  { id: 'clean_5', title: 'Ohne Beanstandung', desc: 'Verkaufe 5 Autos ganz ohne Abzüge.', reward: 2500, progress: (v) => count(v.career.cleanSales, 5) },
  { id: 'six', title: 'Sechs in Reihe', desc: 'Repariere und verkaufe ein Auto mit Reihensechszylinder (oder rechne es als Auftrag ab).', reward: 500, progress: (v) => flag(v.career.layouts.includes('R6')) },
  { id: 'vee', title: 'Zwei Bänke', desc: 'Repariere ein Auto mit V6 und eines mit V8.', reward: 2000, progress: (v) => count(['V6', 'V8'].filter((l) => v.career.layouts.includes(l)).length, 2) },
  { id: 'all_layouts', title: 'Motorenkenner', desc: 'Repariere Autos aller vier Bauarten: R4, R6, V6 und V8.', reward: 3000, progress: (v) => count(['R4', 'R6', 'V6', 'V8'].filter((l) => v.career.layouts.includes(l)).length, 4) },
  { id: 'diesel', title: 'Selbstzünder', desc: 'Repariere drei Dieselfahrzeuge.', reward: 1000, progress: (v) => count(v.career.dieselFixed, 3) },
  { id: 'turbo', title: 'Ladedruck', desc: 'Repariere drei Turbofahrzeuge.', reward: 1500, progress: (v) => count(v.career.turboFixed, 3) },
  { id: 'severe', title: 'Kapitaler Schaden', desc: 'Behebe einen Zylinderkopfdichtungs- oder Getriebeschaden.', reward: 2500, progress: (v) => count(v.career.severeFixed, 1) },
  { id: 'barn', title: 'Dornröschen', desc: 'Verkaufe einen restaurierten Scheunenfund.', reward: 2000, progress: (v) => count(v.career.barnSold, 1) },
  { id: 'auction', title: 'Zum Ersten, zum Zweiten …', desc: 'Gewinne eine Auktion.', reward: 750, progress: (v) => count(v.career.auctionsWon, 1) },
  { id: 'sale_50k', title: 'Oberklasse', desc: 'Verkaufe ein Auto für mindestens 50.000 €.', reward: 5000, progress: (v) => count(v.career.bestSale, 50000) },
  { id: 'sale_250k', title: 'Sechsstellig', desc: 'Verkaufe ein Auto für mindestens 250.000 €.', reward: 25000, progress: (v) => count(v.career.bestSale, 250000) },
  { id: 'collection_3', title: 'Sammler', desc: 'Behalte drei Autos gleichzeitig als Privatfahrzeuge.', reward: 3000, progress: (v) => count(kept(v).length, 3) },
  { id: 'collector_car', title: 'Kronjuwel', desc: 'Besitze ein Sammlerfahrzeug in einwandfreiem Zustand als Privatfahrzeug.', reward: 20000, progress: (v) => flag(kept(v).some((c) => CAR_MODELS[c.modelId].collector && valuate(c).deductions.every((d) => !d.defect))) },
  { id: 'equipment', title: 'Voll ausgestattet', desc: 'Besitze Waschplatz, Lackierkabine, Motorheber und Leistungsprüfstand.', reward: 5000, progress: (v) => count(['wash', 'paint', 'hoist', 'dyno'].filter((u) => v.upgrades.includes(u)).length, 4) },
  { id: 'dyno', title: 'Schwarz auf weiß', desc: 'Miss ein Auto auf dem Leistungsprüfstand.', reward: 500, progress: (v) => count(v.career.dynoRuns, 1) },
  { id: 'competition', title: 'Besser als die Konkurrenz', desc: 'Gewinne einen Händler-Wettbewerb.', reward: 3000, progress: (v) => count(v.career.competitionsWon, 1) },
  { id: 'meet', title: 'Publikumsliebling', desc: 'Gewinne bei einem Fahrzeugtreffen.', reward: 2000, progress: (v) => count(v.career.meetsWon, 1) },
  { id: 'hq', title: 'Headquarters', desc: 'Ziehe in das Headquarters mit Showroom.', reward: 50000, progress: (v) => flag(v.upgrades.includes('loc_hq')) },
];

export const isAchieved = (a: Achievement, v: CareerView) => {
  const [n, of] = a.progress(v);
  return n >= of;
};
/** Erfolge, die jetzt erreicht, aber noch nicht belohnt sind. */
export const newlyAchieved = (v: CareerView, already: string[]) => ACHIEVEMENTS.filter((a) => !already.includes(a.id) && isAchieved(a, v));

/** Zählt ein fertig repariertes Auto (Verkauf oder abgerechneter Auftrag) in die Karriere ein. */
export function countRepair(career: Career, car: CarInstance): Career {
  if (car.partsSpent <= 0) return career;
  const e = engineOf(car);
  return {
    ...career,
    layouts: career.layouts.includes(e.layout) ? career.layouts : [...career.layouts, e.layout],
    dieselFixed: career.dieselFixed + (e.fuel === 'diesel' ? 1 : 0),
    turboFixed: career.turboFixed + (e.turbo ? 1 : 0),
  };
}

export interface CollectionEntry {
  slot: number;
  car: CarInstance;
  value: number;
  /** Ansehen: Seltenheit, Klasse und Zustand. */
  prestige: number;
}

/** Private Sammlung: alle als Privatfahrzeug markierten eigenen Autos. */
export function collection(cars: (CarInstance | null)[], index = 1): CollectionEntry[] {
  return cars.flatMap((car, slot) => {
    if (!car || !car.keep || car.job) return [];
    const v = valuate(car, index);
    const m = CAR_MODELS[car.modelId];
    const base = { budget: 1, mid: 2, sport: 5, luxury: 9, collector: 20 }[m.cls] + car.rarity * 4;
    const flawless = v.deductions.every((d) => !d.defect);
    // Im Showroom ausgestellt zählt ein Auto anderthalbfach.
    const shown = SLOTS[slot]?.kind === 'show' ? 1.5 : 1;
    return [{ slot, car, value: v.value, prestige: Math.round(base * shown * (flawless ? 1 : 0.4) * (0.6 + 0.4 * Math.min(1, v.value / Math.max(1, v.cleanValue)))) }];
  });
}
