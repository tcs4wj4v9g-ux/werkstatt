import { PARTS } from './data/parts';
import { createAuction } from './auctions';
import { createJobOffer } from './jobs';
import { createBarnFind, createListing, createCar, type Rng } from './market';
import { COMMON_MODELS } from './data/cars';
import { DEFECT_LIST } from './data/defects';
import { SELLERS } from './data/sellers';
import type { DefectId, GameEvent, PartId } from './types';

// Zufällige Ereignisse. Jedes Ereignis bringt seine Daten fertig mit und wird
// beim Annehmen verbraucht – so kann nach einem Neustart nichts doppelt
// ausgelöst werden. Niemand wird zu etwas gezwungen.

export const MAX_EVENTS = 3;
const pick = <T,>(arr: T[], rng: Rng) => arr[Math.floor(rng() * arr.length)];
let counter = 0;
const id = (type: string) => `ev-${type}-${Date.now().toString(36)}-${counter++}`;

export interface Progress {
  day: number;
  marketIndex: number;
  /** Abgeschlossene Verkäufe und Aufträge – ein Maß für den Spielfortschritt. */
  deals: number;
  now: number;
}

type Maker = (rng: Rng, p: Progress) => GameEvent;

const makers: { type: GameEvent['type']; weight: number; minDeals: number; make: Maker }[] = [
  {
    type: 'urgent_job', weight: 3, minDeals: 0,
    make: (rng, p) => {
      const job = createJobOffer(rng);
      job.car.job!.dueDay = p.day + 1;
      return { id: id('job'), type: 'urgent_job', expiresDay: p.day, job, title: 'Dringender Kundenauftrag', text: `${job.car.job!.customer} braucht das Auto bis morgen: „${job.car.job!.complaint}“ Dafür gibt es 60 % Eilzuschlag auf den Arbeitslohn.` };
    },
  },
  {
    type: 'special_listing', weight: 3, minDeals: 0,
    make: (rng, p) => {
      const n = 1 + Math.floor(rng() * 2);
      const defects = [...DEFECT_LIST].sort(() => rng() - 0.5).slice(0, n).map((d) => d.id).filter((d) => d !== 'battery' && d !== 'tires');
      const l = createListing(createCar(pick(COMMON_MODELS, rng), defects, rng), rng, p.marketIndex, SELLERS.hurry);
      l.asking = l.current = Math.round((l.asking * 0.85) / 50) * 50;
      l.minPrice = Math.round((l.asking * 0.88) / 50) * 50;
      l.expiresDay = p.day;
      l.sellerLine = `„Ich ziehe morgen um. ${l.asking.toLocaleString('de-DE')} €, aber nur heute.“`;
      return { id: id('angebot'), type: 'special_listing', expiresDay: p.day, listing: l, title: 'Besonderes Gebrauchtwagenangebot', text: `${l.seller} muss sein Auto bis heute Abend loswerden und geht deutlich unter den üblichen Preis.` };
    },
  },
  {
    type: 'parts_sale', weight: 3, minDeals: 0,
    make: (rng, p) => {
      const partId = pick(Object.keys(PARTS) as PartId[], rng);
      return { id: id('teile'), type: 'parts_sale', expiresDay: p.day + 1, sale: { partId, pct: 30 }, title: 'Ersatzteil-Sonderangebot', text: `Der Großhändler räumt sein Lager: ${PARTS[partId].name} bis morgen 30 % günstiger.` };
    },
  },
  {
    type: 'rare_auction', weight: 2, minDeals: 1,
    make: (rng, p) => {
      const auction = createAuction(rng, p.marketIndex, p.now, true);
      return { id: id('auktion'), type: 'rare_auction', expiresDay: p.day, auction, title: 'Seltenes Auktionsfahrzeug', text: `Das Auktionshaus hat überraschend ein Liebhaberstück im Programm: ${auction.title}.` };
    },
  },
  {
    type: 'barn_hint', weight: 2, minDeals: 2,
    make: (rng, p) => {
      const listing = createBarnFind(rng, p.marketIndex, p.day);
      return { id: id('scheune'), type: 'barn_hint', expiresDay: p.day + 1, listing, title: 'Hinweis auf einen Scheunenfund', text: `Ein Bekannter erzählt dir von einer alten Scheune: Dort steht seit vielen Jahren ein ${listing.car.year}er Sechszylinder. Die Erben wollen ihn loswerden.` };
    },
  },
];

/** Am Morgen eines neuen Tages: vielleicht passiert etwas – oft auch nicht. */
export function rollEvents(existing: GameEvent[], rng: Rng, p: Progress): GameEvent[] {
  const active = existing.filter((e) => e.expiresDay >= p.day);
  if (active.length >= MAX_EVENTS || rng() > 0.55) return active;
  const pool = makers.filter((m) => m.minDeals <= p.deals && !active.some((e) => e.type === m.type));
  const total = pool.reduce((s, m) => s + m.weight, 0);
  if (!total) return active;
  let roll = rng() * total;
  const chosen = pool.find((m) => (roll -= m.weight) < 0) ?? pool[0];
  return [...active, chosen.make(rng, p)];
}

/** Zusatzbefund an einem Kundenauto: Der Kunde wird gefragt, ob er die Arbeit bezahlt. */
export function extraWorkEvent(uid: string, customer: string, defect: DefectId, name: string, day: number): GameEvent {
  return {
    id: id('zusatz'), type: 'extra_work', expiresDay: day + 3, extra: { uid, defect }, title: 'Zusätzlicher Reparaturbedarf',
    text: `Am Auto von ${customer} hast du einen weiteren Schaden gefunden: ${name}. Du kannst den Kunden anrufen und die Zusatzarbeit anbieten.`,
  };
}
