import { CAR_MODELS, COMMON_MODELS, RARE_MODELS } from './data/cars';
import { COMPONENTS } from './data/components';
import { DEFECTS, DEFECT_LIST } from './data/defects';
import { SELLER_LIST, SELLER_NAMES, SELLERS, type SellerProfile } from './data/sellers';
import { SYMPTOMS, type Channel } from './data/symptoms';
import { createZones, detailFactor } from './detail';
import { observe } from './diagnosis';
import { createFluids, serviceState } from './fluids';
import { activeDefects, isAssembled } from './repair';
import type { CarInstance, DefectId, Listing } from './types';

export type Rng = () => number;
const round50 = (n: number) => Math.round(n / 50) * 50;
const pick = <T,>(arr: T[], rng: Rng) => arr[Math.floor(rng() * arr.length)];
let uidCounter = 0;
const uid = (rng: Rng) => `${Date.now().toString(36)}-${(uidCounter++).toString(36)}-${Math.floor(rng() * 1e6).toString(36)}`;

export const MAX_LISTINGS = 4;

export function freshComponents(): CarInstance['components'] {
  const components: CarInstance['components'] = {};
  for (const c of COMPONENTS) {
    components[c.id] = { installed: true, bolts: Array(c.bolts).fill(2), connected: true, condition: 'ok', known: false };
  }
  return components;
}

export function createCar(modelId: string, defects: DefectId[], rng: Rng, opts: Partial<CarInstance> = {}): CarInstance {
  const model = CAR_MODELS[modelId];
  const [y0, y1] = model.years ?? [2005, 2011];
  const year = opts.year ?? y0 + Math.floor(rng() * (y1 - y0 + 1));
  const km = opts.km ?? round50(120000 + rng() * 140000);
  // Seltene Modelle sind Liebhaberstücke: das Alter drückt ihren Wert nicht.
  const age = model.rare ? 1 : 1 + (year - 2008) * 0.04;
  const cleanValue = round50(model.baseValue * age * (1 - (km - 180000) / 900000));
  const wear = opts.rarity !== undefined && opts.origin === 'barn' ? 1 : 0.15 + rng() * 0.45;
  const components = freshComponents();
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
    observed: [],
    fluids: createFluids(modelId, wear, rng),
    checked: {},
    zones: createZones(0.15 + rng() * 0.5, 0.35 + rng() * 0.4, 0, rng),
    interior: { seats: rng() * 0.7, dash: rng() * 0.6, floor: rng() * 0.8 },
    rarity: model.rare ? 1 : 0,
    origin: 'market',
    keep: false,
    ...opts,
  };
}

/** Marktlage: zufällige Schwankung um 1,0 – wirkt auf Ankaufs- und Verkaufspreise. */
export function nextMarketIndex(current: number, rng: Rng): number {
  const drift = (1 - current) * 0.25 + (rng() - 0.5) * 0.09;
  return Math.round(Math.min(1.15, Math.max(0.85, current + drift)) * 100) / 100;
}

export const marketLabel = (index: number) =>
  index >= 1.06 ? 'Verkäufermarkt – Preise hoch' : index <= 0.94 ? 'Käufermarkt – Preise niedrig' : 'Markt ausgeglichen';

const between = ([a, b]: [number, number], rng: Rng) => a + (b - a) * rng();
const eur = (n: number) => `${n.toLocaleString('de-DE')} €`;

export function createListing(car: CarInstance, rng: Rng, index: number, profile: SellerProfile = pick(SELLER_LIST, rng), seller = pick(SELLER_NAMES, rng)): Listing {
  const penalties = activeDefects(car).reduce((s, d) => s + DEFECTS[d].penalty, 0);
  // Wer sein Auto kennt, hat die Mängel schon eingepreist; Ahnungslose verlangen fast den vollen Preis.
  const asking = Math.max(900, round50(car.cleanValue * index * (0.86 + rng() * 0.08) - penalties * (0.2 + 0.65 * profile.knowledge)));
  return {
    id: car.uid,
    car,
    seller,
    asking,
    minPrice: round50(asking * (1 - between(profile.flex, rng))),
    patience: Math.round(between(profile.patience, rng)),
    current: asking,
    hints: [],
    checks: [],
    profile: profile.id,
    usedArgs: [],
    closed: false,
    gone: false,
    sellerLine: profile.opening(eur(asking)),
  };
}

/** Das feste erste Angebot: drei Einsteiger-Defekte, mit 6.000 € bezahlbar. */
export function starterListing(rng: Rng): Listing {
  const car = createCar('bavaria_320', ['coil', 'brakes', 'gasket'], rng, { year: 2007, km: 189000, color: '#2a3a5c' });
  const l = createListing(car, rng, 1, SELLERS.private, 'Herr Brandl');
  l.asking = l.current = 5400;
  l.minPrice = 4800;
  l.patience = 4;
  l.sellerLine = SELLERS.private.opening(eur(5400));
  return l;
}

function randomListing(rng: Rng, index: number): Listing {
  const n = 1 + Math.floor(rng() * 3);
  const defects = [...DEFECT_LIST].sort(() => rng() - 0.5).slice(0, n).map((d) => d.id);
  return createListing(createCar(pick(COMMON_MODELS, rng), defects, rng), rng, index);
}

/** Günstiges Bastlerfahrzeug, damit auch bei knapper Kasse etwas geht. */
function budgetListing(money: number, rng: Rng, index: number): Listing {
  const car = createCar('bavaria_318', ['coil', 'brakes', 'gasket', 'plugs', 'belt'], rng, { year: 2005, km: 268000 });
  const l = createListing(car, rng, index, SELLERS.hurry);
  l.asking = l.current = Math.max(1000, round50(Math.min(l.asking, money * 0.85)));
  l.minPrice = round50(l.asking * 0.85);
  l.sellerLine = `„${eur(l.asking)} – Bastlerfahrzeug, aber ehrlich.“`;
  return l;
}

/** Füllt den Markt auf. Mindestens ein Angebot bleibt bezahlbar. */
export function fillListings(existing: Listing[], money: number, rng: Rng, index = 1, first = false): Listing[] {
  const out = first ? [starterListing(rng)] : existing.filter((l) => !l.gone);
  // Scheunenfunde und Sonderangebote zählen nicht zum normalen Marktbestand.
  const regular = () => out.filter((l) => !l.barn && !l.expiresDay).length;
  while (regular() < MAX_LISTINGS) out.push(randomListing(rng, index));
  if (!out.some((o) => o.asking <= money)) out[out.findIndex((l) => !l.barn && !l.expiresDay)] = budgetListing(money, rng, index);
  return out;
}

/** Neuer Tag: ein bis zwei alte Angebote verschwinden, neue kommen dazu. */
export function refreshListings(existing: Listing[], money: number, rng: Rng, index: number, day = 0): Listing[] {
  const keep = existing.filter((l) => !l.gone && (!l.expiresDay || l.expiresDay >= day));
  const normal = keep.filter((l) => !l.barn && !l.expiresDay);
  const drop = Math.min(normal.length, 1 + Math.floor(rng() * 2));
  for (let i = 0; i < drop; i++) keep.splice(keep.indexOf(normal.splice(Math.floor(rng() * normal.length), 1)[0]), 1);
  return fillListings(keep, money, rng, index);
}

/** Was man beim Verkäufer prüfen kann – jede Prüfung zeigt nur Symptome, nie die Ursache. */
export const MARKET_CHECKS: { id: string; label: string; channels: Channel[]; warm: boolean; none: string }[] = [
  { id: 'listen', label: 'Motor starten & anhören', channels: ['idle', 'sound'], warm: false, none: 'Der Motor springt sofort an und läuft ruhig.' },
  { id: 'dash', label: 'Anzeigen & Kontrollleuchten', channels: ['dash'], warm: false, none: 'Alle Kontrollleuchten gehen aus.' },
  { id: 'hood', label: 'Unter die Haube schauen', channels: ['hood'], warm: false, none: 'Motorraum trocken und sauber.' },
  { id: 'under', label: 'Unter das Auto schauen', channels: ['under'], warm: false, none: 'Unterboden trocken, kein Tropfen.' },
  { id: 'brakes', label: 'Bremsen ansehen', channels: ['wheels'], warm: false, none: 'Beläge und Scheiben sehen gut aus.' },
  { id: 'drive', label: 'Probefahrt mit dem Verkäufer', channels: ['idle', 'sound', 'dash', 'rev', 'drive'], warm: true, none: 'Bei der Probefahrt fällt dir nichts weiter auf.' },
];

/** Untersuchung beim Verkäufer – liefert Symptome als mögliche Verhandlungsargumente. */
export function inspectListing(l: Listing, check: string): string {
  const def = MARKET_CHECKS.find((c) => c.id === check)!;
  if (!l.checks.includes(check)) l.checks.push(check);
  if (l.barn && check === 'drive') return 'Eine Probefahrt ist ausgeschlossen – der Wagen steht seit Jahren und ist abgemeldet.';
  const probe: CarInstance = { ...l.car, observed: [...l.hints] };
  const { added } = observe(probe, def.channels, def.warm);
  l.hints = probe.observed;
  return added.length ? added.map((s) => s.text).join(' ') : def.none;
}

/** Schmerzgrenze des Verkäufers nach allen bisher vorgebrachten Argumenten. */
export const sellerFloor = (l: Listing) => l.minPrice;

export interface OfferResult {
  accepted: boolean;
  price: number;
}

/**
 * Verhandlungsrunde. `args` sind Symptome, die der Spieler selbst bemerkt hat
 * und jetzt als Begründung nennt. Jedes Argument wirkt nur einmal, und nur
 * soweit der Verkäufer den Mangel nicht ohnehin schon eingepreist hat.
 */
export function makeOffer(l: Listing, amount: number, args: string[] = []): OfferResult {
  const profile = SELLERS[l.profile] ?? SELLERS.private;
  if (l.gone) return { accepted: false, price: l.current };

  const fresh = args.filter((a) => l.hints.includes(a) && !l.usedArgs.includes(a));
  let conceded = 0;
  if (fresh.length) {
    const active = activeDefects(l.car);
    const evidenced = (ids: string[]) => active.filter((d) => DEFECTS[d].symptoms.some((s) => ids.includes(s)));
    const before = evidenced(l.usedArgs);
    const newly = evidenced([...l.usedArgs, ...fresh]).filter((d) => !before.includes(d));
    conceded = newly.reduce((s, d) => s + DEFECTS[d].penalty, 0) * (1 - profile.knowledge) * profile.concede;
    l.usedArgs.push(...fresh);
    // Auch mit den besten Argumenten verschenkt niemand sein Auto.
    l.minPrice = Math.max(round50(l.asking * 0.7), round50(l.minPrice - conceded));
  }
  const argLine = !fresh.length
    ? ''
    : conceded < 60
      ? '„Das weiß ich alles, das steckt schon im Preis.“ '
      : `„${fresh.map((a) => SYMPTOMS[a].argument).join(', ')}? Hm, das stimmt allerdings.“ `;

  const floor = l.minPrice;
  if (amount >= l.current) {
    l.sellerLine = '„Abgemacht! Schlüssel und Papiere liegen bereit.“';
    return { accepted: true, price: Math.min(amount, l.current) };
  }
  if (amount >= floor && !l.closed) {
    l.sellerLine = `${argLine}„Na gut – ${eur(amount)}, abgemacht.“`;
    return { accepted: true, price: amount };
  }
  const insulting = amount < floor * profile.insultAt;
  if (l.closed) {
    l.patience -= 1;
    if (insulting || l.patience < -1) {
      l.gone = true;
      l.sellerLine = '„Wir kommen nicht zusammen. Ich verkaufe an jemand anderen – auf Wiedersehen.“';
    } else {
      l.sellerLine = `„Ich sagte doch: ${eur(l.current)} ist mein letztes Wort.“`;
    }
    return { accepted: false, price: l.current };
  }
  l.patience -= insulting ? 2 : 1;
  l.current = Math.max(floor, round50(l.current - (l.current - floor) * (insulting ? profile.step * 0.3 : profile.step)));
  if (l.patience <= 0) {
    l.closed = true;
    l.sellerLine = `${argLine}„Jetzt reicht's. ${eur(l.current)} – letztes Wort, nehmen oder gehen.“`;
  } else if (insulting) {
    l.sellerLine = `${argLine}„${eur(amount)}? Das ist eine Frechheit. ${eur(l.current)}, mehr geht nicht runter.“`;
  } else {
    l.sellerLine = `${argLine}„${eur(amount)} ist mir zu wenig. Sagen wir ${eur(l.current)}.“`;
  }
  return { accepted: false, price: l.current };
}

/**
 * Scheunenfund: seltenes Modell, seit Jahren abgestellt. Verdreckt, rostig,
 * Batterie tot, Reifen und Flüssigkeiten am Ende, dazu fehlende Teile und
 * technische Schäden – ein Langzeitprojekt.
 */
export function createBarnFind(rng: Rng, index: number, day: number): Listing {
  const modelId = pick(RARE_MODELS, rng);
  const pool: DefectId[] = ['plugs', 'belt', 'brakes', 'discs', 'coolant_hose', 'gasket', 'water_pump', 'lifters', 'chain', 'thermostat', 'oil_pan'];
  const defects: DefectId[] = ['battery', 'tires', ...pool.sort(() => rng() - 0.5).slice(0, 2 + Math.floor(rng() * 3))];
  const rarity = rng() < 0.3 ? 2 : 1;
  const car = createCar(modelId, defects, rng, { km: round50(60000 + rng() * 110000), rarity, origin: 'barn' });
  // Sehr seltene Exemplare (wenig gelaufen, Erstbesitz) sind deutlich mehr wert.
  car.cleanValue = round50(car.cleanValue * (rarity === 2 ? 1.45 : 1.1));
  car.zones = createZones(1, 0.1, 0.35 + rng() * 0.45, rng);
  car.interior = { seats: 0.9, dash: 1, floor: 1 };
  // Über die Jahre sind Teile abhandengekommen.
  for (const id of pick([['alternator'], ['intake_hose'], ['alternator', 'intake_hose'], ['belt']], rng)) {
    car.components[id] = { installed: false, bolts: car.components[id].bolts.map(() => 0 as const), connected: false, condition: 'defect', known: true };
  }
  const l = createListing(car, rng, index, SELLERS.heir, pick(SELLER_NAMES, rng));
  const years = 8 + Math.floor(rng() * 14);
  l.barn = true;
  l.expiresDay = day + 3;
  l.asking = l.current = Math.max(1500, round50(car.cleanValue * (0.16 + rng() * 0.1)));
  l.minPrice = round50(l.asking * 0.78);
  l.sellerLine = `„Der stand ${years} Jahre in Opas Scheune. Für ${eur(l.asking)} gehört er Ihnen – Hauptsache, er kommt weg.“`;
  return l;
}

export const BARN_TRANSPORT = 180;
export const RARITY_NAMES = ['gewöhnlich', 'selten', 'sehr selten'];

export interface Valuation {
  cleanValue: number;
  deductions: { label: string; amount: number; defect?: DefectId }[];
  /** Zu- und Abschläge für Pflegezustand, Rost und Wartung. */
  extras: { label: string; amount: number }[];
  value: number;
  offer: number;
  haggleOffer: number;
}

/**
 * Bewertung beim Verkauf: Zustand, Laufleistung (steckt im Bestwert), offene
 * Schäden und Marktlage. Deterministisch, damit Neuladen nichts ändert.
 */
export function valuate(car: CarInstance, index = 1): Valuation {
  const cleanValue = round50(car.cleanValue * index);
  const deductions: Valuation['deductions'] = activeDefects(car).map((d) => ({ label: DEFECTS[d].name, amount: DEFECTS[d].penalty, defect: d }));
  if (!isAssembled(car)) deductions.push({ label: 'Nicht fahrbereit (Teile demontiert)', amount: 1500 });
  const clean = deductions.length === 0;
  if (!car.testDriven) deductions.push({ label: 'Keine Probefahrt nach Reparatur', amount: round50(cleanValue * 0.06) });
  // Wartungszustand der Flüssigkeiten
  const sv = serviceState(car);
  if (!sv.oilOk) deductions.push({ label: 'Motoröl alt, falsch oder zu wenig', amount: 150 });
  if (!sv.coolantOk) deductions.push({ label: 'Kühlsystem nicht in Ordnung', amount: 120 });
  if (!sv.brakeOk) deductions.push({ label: 'Bremsflüssigkeit überaltert', amount: 150 });
  let value = Math.max(500, cleanValue - deductions.reduce((s, d) => s + d.amount, 0));
  // Aufbereitung wirkt nur anteilig am tatsächlichen Zustand: ein defektes Auto wird durch Waschen nicht wertvoll.
  const condition = value / cleanValue;
  const extras: Valuation['extras'] = [];
  if (sv.oilChanged) extras.push({ label: 'Frischer Ölwechsel mit Filter', amount: 100 });
  for (const f of detailFactor(car)) extras.push({ label: f.label, amount: Math.round((cleanValue * f.pct * (f.pct > 0 ? condition : 1)) / 10) * 10 });
  value = Math.max(400, value + extras.reduce((s, e) => s + e.amount, 0));
  const offer = round50(value * (clean ? 0.97 : 0.93));
  // Nachverhandeln klappt nur, wenn das Auto überzeugt.
  const haggleOffer = round50(offer * (clean && car.testDriven ? 1.05 : 0.98));
  return { cleanValue, deductions, extras, value, offer, haggleOffer };
}
