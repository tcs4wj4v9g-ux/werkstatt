import { CAR_MODELS, COLLECTOR_MODELS, modelsOfClass, RARE_MODELS } from './data/cars';
import { SYMPTOMS } from './data/symptoms';
import { createZones } from './detail';
import { presentSymptoms } from './diagnosis';
import { createCar, randomDefects, valuate, type Rng } from './market';
import type { Auction } from './types';

// Fahrzeugauktionen mit simulierten Händlern. Alles läuft lokal und ist über
// einen Startwert reproduzierbar: Wird das Spiel geschlossen, werden die
// Gebote beim nächsten Start bis zur aktuellen Uhrzeit nachgeholt.

export const MAX_AUCTIONS = 2;
const TICK = 8000;
const SNIPE_WINDOW = 25000;
const round50 = (n: number) => Math.round(n / 50) * 50;
const pick = <T,>(arr: T[], rng: Rng) => arr[Math.floor(rng() * arr.length)];

/** Kleiner, speicherbarer Zufallsgenerator. */
export function seeded(seed: number): Rng {
  let s = (seed % 2147483646) + 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const DEALERS = [
  { name: 'Autohaus Reiter', style: 'früh' as const, risk: 0.9, likes: ['bavaria_330', 'bavaria_325'] },
  { name: 'Export Kaya', style: 'stetig' as const, risk: 0.72, likes: ['bavaria_318', 'bavaria_320'] },
  { name: 'Kfz Steinbach', style: 'spät' as const, risk: 0.82, likes: ['bavaria_320_kombi', 'bavaria_330_sport'] },
  { name: 'Classic Garage Wolf', style: 'spät' as const, risk: 0.95, likes: ['bavaria_328_klassik', 'bavaria_330_sport'] },
  { name: 'Teilehandel Nowak', style: 'stetig' as const, risk: 0.55, likes: [] as string[] },
];

let counter = 0;

export function createAuction(rng: Rng, index: number, now: number, rare = false): Auction {
  const roll = rng();
  // Sonderauktionen bringen Liebhaberstücke, ganz selten ein echtes Sammlerfahrzeug.
  const modelId = rare
    ? pick(roll < 0.2 ? COLLECTOR_MODELS : RARE_MODELS, rng)
    : pick(modelsOfClass(roll < 0.4 ? 'budget' : roll < 0.75 ? 'mid' : roll < 0.93 ? 'sport' : 'luxury'), rng);
  const n = 1 + Math.floor(rng() * 3);
  const defects = randomDefects(modelId, n, rng, ['battery', 'tires']);
  const car = createCar(modelId, defects, rng, { origin: 'auction', rarity: CAR_MODELS[modelId].collector ? 2 : rare ? 1 : 0 });
  if (rare) car.zones = createZones(0.5, 0.3, 0.1 + rng() * 0.2, rng);
  // Was ein Händler für das Auto in diesem Zustand wiederbekäme.
  const worth = valuate({ ...car, testDriven: true }, index).value;
  const seed = Math.floor(rng() * 1e9);
  const r = seeded(seed);
  const bidders = DEALERS.filter(() => r() < 0.7)
    .slice(0, 4)
    .map((d) => {
      // Händler kennen den Zustand nur ungefähr und wollen Marge; Lieblingsmodelle sind ihnen mehr wert.
      const interest = d.likes.includes(modelId) ? 1.12 : d.likes.length ? 0.92 : 0.8;
      return { name: d.name, style: d.style, limit: round50(worth * d.risk * interest * (0.78 + r() * 0.2)) };
    });
  // Der Zustandsbericht nennt nur einen Teil dessen, was auffällt.
  const report = presentSymptoms(car).filter((s) => SYMPTOMS[s] && !SYMPTOMS[s].warm && r() < 0.55).map((s) => SYMPTOMS[s].text);
  const startBid = Math.max(500, round50(worth * (0.3 + rng() * 0.12)));
  const duration = (4 + Math.floor(rng() * 4)) * 60000;
  return {
    id: `auk-${now.toString(36)}-${counter++}`,
    car,
    title: `${CAR_MODELS[modelId].name}, Bj. ${car.year}, ${car.km.toLocaleString('de-DE')} km`,
    report,
    startBid,
    increment: worth > 150000 ? 2500 : worth > 60000 ? 1000 : worth > 25000 ? 250 : worth > 9000 ? 100 : 50,
    current: startBid,
    leader: null,
    startsAt: now,
    endsAt: now + duration,
    simulatedTo: now,
    seed,
    bidders,
    log: [`Auktion eröffnet, Startgebot ${startBid.toLocaleString('de-DE')} €.`],
  };
}

/** Kleinstes gültiges Gebot. */
export const minBid = (a: Auction) => (a.leader === null ? a.startBid : a.current + a.increment);

/**
 * Wertet die Gebote der Händler bis `now` aus und schließt die Auktion ab,
 * wenn die Zeit um ist. Rein deterministisch aus Startwert und Zeitpunkt.
 */
export function advanceAuction(a: Auction, now: number): Auction {
  if (a.result) return a;
  const end = () => Math.min(now, a.endsAt);
  while (a.simulatedTo + TICK <= end()) {
    a.simulatedTo += TICK;
    const t = a.simulatedTo;
    const r = seeded(a.seed + Math.floor((t - a.startsAt) / TICK) * 7919);
    const left = a.endsAt - t;
    const total = a.endsAt - a.startsAt;
    for (const b of a.bidders) {
      if (a.leader === b.name) continue;
      const need = minBid(a);
      if (need > b.limit) continue;
      const chance = b.style === 'früh' ? (left > total * 0.5 ? 0.5 : 0.22) : b.style === 'spät' ? (left < 45000 ? 0.75 : 0.04) : 0.3;
      if (r() > chance) continue;
      // Entschlossene Bieter legen manchmal mehr als den Mindestschritt drauf.
      const jump = r() < 0.25 ? a.increment * (1 + Math.floor(r() * 3)) : 0;
      a.current = Math.min(b.limit, need + jump);
      a.leader = b.name;
      a.log.push(`${b.name} bietet ${a.current.toLocaleString('de-DE')} €.`);
      // Gebot kurz vor Schluss verlängert die Auktion.
      if (a.endsAt - t < SNIPE_WINDOW) a.endsAt = t + SNIPE_WINDOW;
      break;
    }
  }
  if (now >= a.endsAt) {
    a.result = a.leader === 'player' ? 'won' : a.leader ? 'lost' : 'unsold';
    a.log.push(a.result === 'won' ? `Zuschlag an dich für ${a.current.toLocaleString('de-DE')} €.` : a.result === 'lost' ? `Zuschlag an ${a.leader} für ${a.current.toLocaleString('de-DE')} €.` : 'Kein Gebot – nicht verkauft.');
  }
  if (a.log.length > 12) a.log = a.log.slice(-12);
  return a;
}

/** Gebot des Spielers. `free` = Geld, das nicht schon in anderen Höchstgeboten steckt. */
export function placeBid(a: Auction, amount: number, free: number, now: number): { ok: boolean; message: string } {
  advanceAuction(a, now);
  if (a.result) return { ok: false, message: 'Die Auktion ist beendet.' };
  if (a.leader === 'player') return { ok: false, message: 'Du bist bereits Höchstbietender.' };
  if (amount < minBid(a)) return { ok: false, message: `Das Mindestgebot liegt bei ${minBid(a).toLocaleString('de-DE')} €.` };
  if (amount > free) return { ok: false, message: 'So viel freies Geld hast du nicht.' };
  a.current = amount;
  a.leader = 'player';
  a.log.push(`Du bietest ${amount.toLocaleString('de-DE')} €.`);
  if (a.endsAt - now < SNIPE_WINDOW) a.endsAt = now + SNIPE_WINDOW;
  return { ok: true, message: `Gebot abgegeben: ${amount.toLocaleString('de-DE')} €. Du führst.` };
}

/** Geld, das in laufenden Höchstgeboten des Spielers gebunden ist. */
export const heldMoney = (auctions: Auction[]) => auctions.filter((a) => !a.result && a.leader === 'player').reduce((s, a) => s + a.current, 0);
