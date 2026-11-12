import { collection } from './career';
import { CAR_MODELS } from './data/cars';
import { dirtLevel, interiorDirt, rustLevel, shineLevel } from './detail';
import { valuate, type Rng } from './market';
import { performance } from './performance';
import { activeDefects, driveBlocker } from './repair';
import type { CarInstance } from './types';

// Händler-Wettbewerbe gegen simulierte Konkurrenten und Fahrzeugtreffen.
// Alle Wertungen entstehen aus den echten Fahrzeugdaten; die Gegner sind beim
// Anlegen ausgewürfelt und werden gespeichert – Neuladen ändert nichts.

export type ContestType = 'restoration' | 'dealer' | 'collector';
export interface Rival {
  name: string;
  score: number;
}
export interface Contest {
  id: string;
  type: ContestType;
  title: string;
  desc: string;
  /** Letzter Tag: Am Morgen danach wird ausgewertet. */
  endDay: number;
  fee: number;
  prize: number;
  rivals: Rival[];
  joined: boolean;
  /** Gesamtgewinn beim Einstieg (für die Händler-Challenge). */
  baseline: number;
}
export interface ContestResult {
  title: string;
  score: number;
  place: number;
  of: number;
  payout: number;
  table: Rival[];
}

const RIVALS = ['Autohaus Reiter', 'Export Kaya', 'Kfz Steinbach', 'Classic Garage Wolf', 'Tuning Brandt', 'Autopark Yilmaz', 'Meisterbetrieb Hofer'];
const pickN = <T,>(arr: T[], n: number, rng: Rng) => [...arr].sort(() => rng() - 0.5).slice(0, n);
const round50 = (n: number) => Math.round(n / 50) * 50;
let counter = 0;

/** Zustand eines Autos von 0 bis 100: Technik, Pflege, Rost, Innenraum. */
export function conditionScore(car: CarInstance): number {
  const v = valuate({ ...car, testDriven: true });
  const tech = Math.max(0, 1 - (activeDefects(car).length ? 0.25 + activeDefects(car).length * 0.12 : 0) - (driveBlocker({ ...car, lifted: false }) ? 0.2 : 0));
  const care = (1 - dirtLevel(car)) * 0.4 + shineLevel(car) * 0.3 + (1 - Math.min(1, rustLevel(car) * 2)) * 0.2 + (1 - interiorDirt(car)) * 0.1;
  return Math.round(100 * (0.55 * tech + 0.35 * care + 0.1 * Math.min(1, v.value / Math.max(1, v.cleanValue))));
}

export interface ContestView {
  cars: (CarInstance | null)[];
  totalProfit: number;
  money: number;
  marketIndex: number;
}

/** Was der Spieler im Wettbewerb gerade auf die Waage bringt. */
export function contestScore(c: Contest, v: ContestView): number {
  const own = v.cars.filter((x): x is CarInstance => !!x && !x.job);
  if (c.type === 'restoration') return own.length ? Math.max(...own.map(conditionScore)) : 0;
  if (c.type === 'dealer') return Math.max(0, Math.round(v.totalProfit - c.baseline));
  return collection(v.cars, v.marketIndex).reduce((s, e) => s + e.prestige, 0);
}

export function createContest(rng: Rng, day: number, v: ContestView, type: ContestType = (['restoration', 'dealer', 'collector'] as const)[Math.floor(rng() * 3)]): Contest {
  const level = Math.max(8000, v.money);
  const names = pickN(RIVALS, 4, rng);
  const base = { id: `wb-${day}-${counter++}`, type, endDay: day + (type === 'dealer' ? 5 : 3), joined: false, baseline: v.totalProfit };
  if (type === 'restoration') {
    return {
      ...base, title: 'Restaurierungs-Wettbewerb', fee: 300, prize: round50(Math.min(20000, 1500 + level * 0.05)),
      desc: 'Die Innung prämiert das am besten hergerichtete Auto: technisch einwandfrei, gewaschen, poliert, rostfrei, Innenraum sauber. Gewertet wird dein bestes eigenes Auto am Stichtag.',
      rivals: names.map((name) => ({ name, score: Math.round(62 + rng() * 30) })),
    };
  }
  if (type === 'dealer') {
    return {
      ...base, title: 'Händler-Challenge', fee: 500, prize: round50(Math.min(30000, 2000 + level * 0.08)),
      desc: 'Wer macht in fünf Tagen den meisten Gewinn mit Autoverkäufen? Es zählt nur, was du ab jetzt verkaufst.',
      rivals: names.map((name) => ({ name, score: round50(level * (0.04 + rng() * 0.2)) })),
    };
  }
  return {
    ...base, title: 'Sammler-Wettbewerb', fee: 400, prize: round50(Math.min(25000, 2500 + level * 0.06)),
    desc: 'Ein Sammlermagazin kürt die eindrucksvollste Privatsammlung. Gewertet wird das Ansehen deiner Privatfahrzeuge – Seltenheit, Klasse und Zustand.',
    rivals: names.map((name) => ({ name, score: Math.round(4 + rng() * 26) })),
  };
}

/** Auswertung am Stichtag. Der Sieger bekommt das Preisgeld, der Zweite sein Startgeld zurück. */
export function resolveContest(c: Contest, v: ContestView): ContestResult {
  const score = contestScore(c, v);
  const table = [...c.rivals, { name: 'Du', score }].sort((a, b) => b.score - a.score || (a.name === 'Du' ? -1 : 1));
  const place = table.findIndex((r) => r.name === 'Du') + 1;
  return { title: c.title, score, place, of: table.length, payout: place === 1 ? c.prize : place === 2 ? c.fee : 0, table };
}

// ---------- Fahrzeugtreffen ----------

export type MeetCategory = 'clean' | 'power' | 'classic' | 'crowd';
export interface Meet {
  id: string;
  day: number;
  category: MeetCategory;
  title: string;
  desc: string;
  fee: number;
  prize: number;
  rivals: Rival[];
  /** Ergebnis, sobald der Spieler teilgenommen hat. */
  result?: ContestResult & { car: string };
}

const MEETS: Record<MeetCategory, { title: string; desc: string; band: [number, number] }> = {
  clean: { title: 'Show & Shine', desc: 'Die Jury sucht das gepflegteste Auto: Lackglanz, sauberer Innenraum, kein Rost.', band: [55, 93] },
  power: { title: 'Leistungstreffen', desc: 'Hier zählt, was wirklich an der Kurbelwelle ankommt – gemessen im aktuellen Zustand, dazu das Leistungsgewicht.', band: [30, 92] },
  classic: { title: 'Klassikertreffen', desc: 'Alter, Seltenheit und Originalzustand zählen. Alltagsautos haben es hier schwer.', band: [35, 90] },
  crowd: { title: 'Großes Sommertreffen', desc: 'Das Publikum stimmt ab: Ein starkes, seltenes und gepflegtes Auto räumt ab.', band: [45, 90] },
};

/** Wertung eines Autos in einer Treffen-Kategorie (0–100), allein aus seinen Daten. */
export function meetScore(car: CarInstance, category: MeetCategory, day = 1): number {
  const m = CAR_MODELS[car.modelId];
  const clean = 100 * ((1 - dirtLevel(car)) * 0.35 + shineLevel(car) * 0.35 + (1 - Math.min(1, rustLevel(car) * 2.5)) * 0.2 + (1 - interiorDirt(car)) * 0.1);
  const p = performance(car);
  const power = Math.min(100, 100 * (0.55 * Math.min(1, p.ps / 520) + 0.45 * Math.min(1, p.powerToWeight / 360)));
  const age = 2012 + Math.floor(day / 60) - car.year;
  const healthy = activeDefects(car).length === 0 ? 1 : 0.55;
  const classic = Math.min(100, (Math.min(1, Math.max(0, age - 8) / 30) * 40 + car.rarity * 18 + (m.collector ? 14 : 0)) * healthy + clean * 0.1);
  const score = category === 'clean' ? clean : category === 'power' ? power : category === 'classic' ? classic : 0.4 * clean + 0.3 * power + 0.3 * classic;
  return Math.round(score);
}

export function createMeet(rng: Rng, day: number, money: number): Meet {
  const category = (['clean', 'power', 'classic', 'crowd'] as const)[Math.floor(rng() * 4)];
  const def = MEETS[category];
  const [lo, hi] = def.band;
  return {
    id: `treffen-${day}-${counter++}`, day, category, title: def.title, desc: def.desc, fee: 80,
    prize: round50(Math.min(6000, 600 + Math.max(8000, money) * 0.02)),
    rivals: pickN(['Opel-Freunde Süd', 'Team Tieferlegt', 'Oldtimer-Stammtisch', 'V8-Brigade', 'Youngtimer e. V.', 'Polier-Profis', 'Kombi-Kollektiv'], 5, rng).map((name) => ({ name, score: Math.round(lo + rng() * (hi - lo)) })),
  };
}

/** Teilnahme: nur fahrbereite eigene Autos. */
export function meetBlocker(car: CarInstance): string | null {
  if (car.job) return 'Mit einem Kundenfahrzeug fährst du nicht aufs Treffen.';
  const b = driveBlocker({ ...car, lifted: false });
  return b ? `Nicht fahrbereit: ${b}` : car.lifted ? 'Das Auto steht noch auf der Hebebühne.' : null;
}

export function enterMeet(meet: Meet, car: CarInstance, day = meet.day): ContestResult & { car: string } {
  const score = meetScore(car, meet.category, day);
  const table = [...meet.rivals, { name: 'Du', score }].sort((a, b) => b.score - a.score || (a.name === 'Du' ? -1 : 1));
  const place = table.findIndex((r) => r.name === 'Du') + 1;
  return { title: meet.title, score, place, of: table.length, payout: place === 1 ? meet.prize : place === 2 ? round50(meet.prize * 0.4) : place === 3 ? meet.fee : 0, table, car: CAR_MODELS[car.modelId].name };
}
