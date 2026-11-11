import { CAR_MODELS } from './data/cars';
import { COMPONENTS } from './data/components';
import { DEFECTS, DEFECT_LIST } from './data/defects';
import { activeDefects, isAssembled } from './repair';
import type { CarInstance, DefectId, Listing } from './types';

export type Rng = () => number;
const round50 = (n: number) => Math.round(n / 50) * 50;
const pick = <T,>(arr: T[], rng: Rng) => arr[Math.floor(rng() * arr.length)];
let uidCounter = 0;
const uid = (rng: Rng) => `${Date.now().toString(36)}-${(uidCounter++).toString(36)}-${Math.floor(rng() * 1e6).toString(36)}`;

export function createCar(modelId: string, defects: DefectId[], rng: Rng, opts: Partial<CarInstance> = {}): CarInstance {
  const model = CAR_MODELS[modelId];
  const year = opts.year ?? 2005 + Math.floor(rng() * 7);
  const km = opts.km ?? round50(120000 + rng() * 140000);
  const cleanValue = round50(model.baseValue * (1 + (year - 2008) * 0.04) * (1 - (km - 180000) / 900000));
  const components: CarInstance['components'] = {};
  for (const c of COMPONENTS) {
    components[c.id] = { installed: true, bolts: Array(c.bolts).fill(true), condition: 'ok', known: false };
  }
  for (const d of defects) {
    const def = DEFECTS[d];
    const targets = def.pick === 'one' ? [pick(def.components, rng)] : def.components;
    targets.forEach((t) => (components[t].condition = 'defect'));
  }
  return {
    uid: uid(rng),
    modelId,
    color: pick(model.colors, rng),
    year,
    km,
    cleanValue,
    components,
    hoodOpen: false,
    lifted: false,
    purchasePrice: 0,
    partsSpent: 0,
    testDriven: false,
    haggled: false,
    obdCodes: null,
    ...opts,
  };
}

const SELLERS = ['Herr Brandl', 'Frau Yildiz', 'Herr Kowalski', 'Frau Sommer', 'Herr Aigner', 'Herr Petrovic'];

function createListing(car: CarInstance, rng: Rng, seller = pick(SELLERS, rng)): Listing {
  const penalties = activeDefects(car).reduce((s, d) => s + DEFECTS[d].penalty, 0);
  // Verkäufer preisen Mängel nur teilweise ein – dort liegt die Marge des Spielers.
  const asking = round50((car.cleanValue - penalties * 0.75) * (0.82 + rng() * 0.08));
  return {
    id: car.uid,
    car,
    seller,
    asking,
    minPrice: round50(asking * (0.82 + rng() * 0.06)),
    patience: 4,
    current: asking,
    hints: [],
    checks: [],
    closed: false,
    sellerLine: `„${asking.toLocaleString('de-DE')} € – top gepflegt, läuft einwandfrei!“`,
  };
}

/** Das feste erste Angebot: alle drei Start-Defekte, mit 6.000 € bezahlbar. */
export function starterListing(rng: Rng): Listing {
  const car = createCar('bavaria_320', ['coil', 'brakes', 'gasket'], rng, { year: 2007, km: 189000, color: '#2a3a5c' });
  const l = createListing(car, rng, 'Herr Brandl');
  l.asking = l.current = 5400;
  l.minPrice = 4800;
  l.sellerLine = '„5.400 € – top gepflegt, läuft wie ein Uhrwerk!“';
  return l;
}

export function generateListings(money: number, rng: Rng, first = false): Listing[] {
  const out: Listing[] = first ? [starterListing(rng)] : [];
  const ids = Object.keys(CAR_MODELS);
  let guard = 0;
  while (out.length < 3 && guard++ < 200) {
    const n = 1 + Math.floor(rng() * 3);
    const defects = [...DEFECT_LIST].sort(() => rng() - 0.5).slice(0, n).map((d) => d.id);
    const l = createListing(createCar(pick(ids, rng), defects, rng), rng);
    // Mindestens ein Angebot muss bezahlbar sein; der Rest darf Ansporn sein.
    const affordable = out.some((o) => o.asking <= money);
    if (!affordable && out.length === 2 && l.asking > money) continue;
    out.push(l);
  }
  if (out.length < 3 || !out.some((o) => o.asking <= money)) {
    // Notnagel für knappe Kassen: günstiges Bastlerfahrzeug.
    const car = createCar('bavaria_320', ['coil', 'brakes', 'gasket'], rng, { year: 2005, km: 268000 });
    const l = createListing(car, rng);
    l.asking = l.current = Math.max(1000, round50(Math.min(l.asking, money * 0.85)));
    l.minPrice = round50(l.asking * 0.85);
    l.sellerLine = `„${l.asking.toLocaleString('de-DE')} € – Bastlerfahrzeug, aber ehrlich.“`;
    out[out.length < 3 ? out.length : 2] = l;
  }
  return out;
}

export const MARKET_CHECKS = [
  { id: 'listen', label: 'Motor starten & anhören', none: 'Der Motor läuft ruhig und rund.' },
  { id: 'hood', label: 'Unter die Haube schauen', none: 'Motorraum trocken und sauber.' },
  { id: 'brakes', label: 'Bremsen ansehen', none: 'Beläge und Scheiben sehen gut aus.' },
] as const;

/** Untersuchung auf dem Markt – deckt Mängel auf und liefert Verhandlungsargumente. */
export function inspectListing(l: Listing, check: string): string {
  if (!l.checks.includes(check)) l.checks.push(check);
  const found = activeDefects(l.car).filter((d) => DEFECTS[d].marketCheck === check);
  if (!found.length) return MARKET_CHECKS.find((c) => c.id === check)!.none;
  found.forEach((d) => !l.hints.includes(d) && l.hints.push(d));
  return found.map((d) => DEFECTS[d].marketHint).join(' ');
}

export const sellerFloor = (l: Listing) => round50(l.minPrice * (1 - 0.04 * l.hints.length));

export interface OfferResult {
  accepted: boolean;
  price: number;
}

/** Verhandlungsrunde: Angebot des Spielers, Reaktion des Verkäufers. */
export function makeOffer(l: Listing, amount: number): OfferResult {
  const eur = (n: number) => `${n.toLocaleString('de-DE')} €`;
  const floor = sellerFloor(l);
  if (amount >= l.current) {
    l.sellerLine = '„Abgemacht! Schlüssel und Papiere liegen bereit.“';
    return { accepted: true, price: Math.min(amount, l.current) };
  }
  if (l.closed) {
    l.sellerLine = `„Ich sagte doch: ${eur(l.current)} ist mein letztes Wort.“`;
    return { accepted: false, price: l.current };
  }
  if (amount >= floor) {
    l.sellerLine = l.hints.length
      ? '„Na gut… wegen der Mängel. Sie haben ein gutes Auge. Abgemacht.“'
      : '„Hm. Na gut, weil Sie es sind. Abgemacht.“';
    return { accepted: true, price: amount };
  }
  const insulting = amount < floor * 0.78;
  l.patience -= insulting ? 2 : 1;
  l.current = Math.max(floor, round50(l.current - (l.current - floor) * (insulting ? 0.15 : 0.5)));
  if (l.patience <= 0) {
    l.closed = true;
    l.sellerLine = `„Jetzt reicht's. ${eur(l.current)} – letztes Wort, nehmen oder gehen.“`;
  } else if (insulting) {
    l.sellerLine = `„${eur(amount)}? Wollen Sie mich beleidigen? ${eur(l.current)}, mehr geht nicht runter.“`;
  } else {
    l.sellerLine = l.hints.length
      ? `„Die Mängel sehe ich ein… aber ${eur(amount)} ist zu wenig. Sagen wir ${eur(l.current)}.“`
      : `„Für ${eur(amount)} kann ich ihn nicht hergeben. ${eur(l.current)} könnte ich machen.“`;
  }
  return { accepted: false, price: l.current };
}

export interface Valuation {
  cleanValue: number;
  deductions: { label: string; amount: number }[];
  value: number;
  offer: number;
  haggleOffer: number;
}

/** Bewertung beim Verkauf. Deterministisch pro Fahrzeug, damit Neuladen nichts ändert. */
export function valuate(car: CarInstance): Valuation {
  const deductions = activeDefects(car).map((d) => ({ label: DEFECTS[d].name, amount: DEFECTS[d].penalty }));
  if (!isAssembled(car)) deductions.push({ label: 'Nicht fahrbereit (Teile demontiert)', amount: 1500 });
  const clean = deductions.length === 0;
  if (!car.testDriven) deductions.push({ label: 'Keine Probefahrt nach Reparatur', amount: round50(car.cleanValue * 0.06) });
  const value = Math.max(500, car.cleanValue - deductions.reduce((s, d) => s + d.amount, 0));
  const offer = round50(value * (clean ? 0.97 : 0.93));
  // Nachverhandeln klappt nur, wenn das Auto überzeugt.
  const haggleOffer = round50(offer * (clean && car.testDriven ? 1.05 : 0.98));
  return { cleanValue: car.cleanValue, deductions, value, offer, haggleOffer };
}
