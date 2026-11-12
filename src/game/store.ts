import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { engineAudio, setMuted, sfx } from './audio';
import { advanceAuction, createAuction, heldMoney, MAX_AUCTIONS, placeBid, seeded } from './auctions';
import { COMPONENT_MAP } from './data/components';
import { CAR_MODELS } from './data/cars';
import { DEFECTS } from './data/defects';
import { FLUID_PRODUCTS } from './data/fluids';
import { PARTS, PART_LIST } from './data/parts';
import { availableSlots, LIFTS, SLOT_COUNT, SLOTS, UPGRADES, type UpgradeId } from './data/workshop';
import { createZones, PAINT_COLORS, PAINT_TOOLS, paintAction, WASH_TOOLS, washAction } from './detail';
import { extraWorkEvent, rollEvents } from './events';
import * as fluids from './fluids';
import { MAX_CARRIED, TOOL_MAP } from './data/tools';
import { SYMPTOMS, type Channel } from './data/symptoms';
import { obdScan, observe, soundProfile, type Observation } from './diagnosis';
import { billJob, fillJobs, refreshJobs } from './jobs';
import { BARN_TRANSPORT, fillListings, freshComponents, inspectListing, makeOffer, nextMarketIndex, refreshListings, valuate } from './market';
import * as repair from './repair';
import type { ActionResult, Auction, BoltState, CarInstance, DefectId, FluidId, FluidProduct, FluidStock, GameEvent, Inventory, JobOffer, Listing, PartId, Screen, ToolId, ZoneId } from './types';

export const START_MONEY = 6000;
export const BAYS = LIFTS;
/** Sekunden, bis der Motor im Stand warm ist. */
export const WARM_AFTER = 9;
export type Panel = 'cabinet' | 'computer' | 'shop' | 'bench' | 'obd' | 'drive' | 'report' | 'help' | 'file' | 'fluids' | 'move' | null;

interface Toast {
  id: number;
  text: string;
  bad: boolean;
}

export interface GameState {
  // --- gespeicherter Spielstand ---
  money: number;
  screen: Screen;
  /** Ein Eintrag je Stellplatz (siehe data/workshop.ts): 0–1 Hebebühnen, dann Waschplatz, Lackierkabine, Hof. null = frei. */
  cars: (CarInstance | null)[];
  /** Gekaufte Ausbaustufen der Werkstatt. */
  upgrades: UpgradeId[];
  /** Vorrat an Betriebsflüssigkeiten in Litern. */
  fluidStock: FluidStock;
  /** Steht die Ölauffangwanne unter der Hebebühne? */
  drainPan: boolean[];
  auctions: Auction[];
  /** Ersteigerte Autos, für die noch kein Stellplatz frei war. */
  waiting: CarInstance[];
  events: GameEvent[];
  /** Höhe der Hebebühnen ohne Auto. Mit Auto zählt car.lifted. */
  liftUp: boolean[];
  /** Werkzeuge am Mann (max. 3). */
  carried: ToolId[];
  tool: ToolId;
  inventory: Inventory;
  listings: Listing[];
  selected: number;
  jobs: JobOffer[];
  day: number;
  marketIndex: number;
  carsSold: number;
  totalProfit: number;
  jobsDone: number;
  jobEarnings: number;
  sound: boolean;
  started: boolean;
  // --- flüchtiger UI-Zustand ---
  panel: Panel;
  /** Auf welchen Stellplatz sich Akte-/OBD-/Bericht-Fenster beziehen. */
  panelBay: number;
  driveBay: number;
  /** Stellplatz mit laufendem Motor, -1 = keiner. */
  engineBay: number;
  engineSince: number;
  engineWarm: boolean;
  toast: Toast | null;
  partPrompt: { bay: number; compId: string; partId: PartId } | null;
  marketNote: string | null;
  /** Was der Händlerhof gerade zeigt: Marktangebote oder Auktionsfahrzeuge. */
  marketSource: 'listings' | 'auctions';
  paintColor: string;
  lastSale: { title: string; price: number; profit: number; lines?: { label: string; amount: number }[] } | null;
  driveReport: string[] | null;

  newGame(): void;
  goto(screen: Screen): void;
  say(text: string, bad?: boolean): void;
  setTool(tool: ToolId): void;
  setPanel(panel: Panel, bay?: number): void;
  setSound(on: boolean): void;
  takeTool(id: ToolId): void;
  returnTool(id: ToolId): void;
  viewListing(i: number): void;
  selectListing(i: number): void;
  checkListing(check: string): void;
  offer(amount: number, args?: string[]): void;
  nextDay(): void;
  acceptJob(i: number): void;
  returnJob(bay: number, unrepaired?: boolean): void;
  tapHood(bay: number): void;
  tapLift(bay: number): void;
  tapBody(bay: number, zone?: ZoneId): void;
  tapBolt(bay: number, compId: string, index: number): void;
  tapConnector(bay: number, compId: string): void;
  tapComponent(bay: number, compId: string, useOldPart?: boolean): void;
  closePartPrompt(): void;
  buyPart(id: PartId): void;
  scanObd(bay: number): void;
  toggleEngine(bay: number): void;
  engineTick(): void;
  revEngine(): void;
  startDrive(bay: number): void;
  finishDrive(completed: boolean): void;
  haggle(bay: number): void;
  sell(bay: number): void;
  dismissSale(): void;
  buyUpgrade(id: UpgradeId): void;
  moveCar(from: number, to: number): void;
  toggleKeep(slot: number): void;
  buyFluid(product: FluidProduct): void;
  checkFluid(slot: number, id: FluidId): void;
  addFluid(slot: number, id: FluidId, product: FluidProduct, liters: number): void;
  bleedCoolant(slot: number): void;
  bleedBrake(slot: number, side: 'fl' | 'fr'): void;
  togglePan(bay: number): void;
  setPaintColor(color: string): void;
  viewAuction(i: number): void;
  bid(i: number, amount: number): void;
  tickAuctions(now: number): void;
  claimWaiting(): void;
  acceptEvent(id: string): void;
  dismissEvent(id: string): void;
}

/** Aktueller Preis eines Ersatzteils inklusive Sonderangebot und Großhandelsrabatt. */
export function partPrice(s: Pick<GameState, 'events' | 'upgrades' | 'day'>, id: PartId): number {
  const sale = s.events.find((e) => e.type === 'parts_sale' && e.sale?.partId === id && e.expiresDay >= s.day);
  const factor = (sale ? 1 - sale.sale!.pct / 100 : 1) * (s.upgrades.includes('expansion') ? 0.9 : 1);
  return Math.round(PARTS[id].price * factor);
}
export const fluidPrice = (s: Pick<GameState, 'upgrades'>, id: FluidProduct) => Math.round(FLUID_PRODUCTS[id].price * (s.upgrades.includes('expansion') ? 0.9 : 1));

/** Freier Stellplatz; Hebebühnen oder Hofplätze bevorzugt. Wasch- und Lackierplatz werden nie automatisch belegt. */
export function freeSlot(s: Pick<GameState, 'cars' | 'upgrades'>, prefer: 'lift' | 'park'): number {
  const free = availableSlots(s.upgrades).filter((x) => !s.cars[x.id] && (x.kind === 'lift' || x.kind === 'park'));
  const first = free.find((x) => x.kind === prefer) ?? free[0];
  return first ? first.id : -1;
}

const emptyStock = (): FluidStock => ({ oil_5w30: 0, oil_5w40: 0, coolant: 0, brake_fluid: 0 });
const hash = (str: string) => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const emptyInventory = (): Inventory => Object.fromEntries(PART_LIST.map((p) => [p.id, 0])) as Inventory;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
let toastId = 0;

/**
 * Bringt ein Auto aus einem älteren Spielstand auf den aktuellen Stand:
 * fehlende Bauteile und Felder bekommen sichere Standardwerte, Schrauben
 * aus der Zeit mit nur zwei Zuständen werden umgerechnet.
 */
export function normalizeCar(car: CarInstance | null): CarInstance | null {
  if (!car) return null;
  const fresh = freshComponents();
  const components: CarInstance['components'] = {};
  for (const id of Object.keys(fresh)) {
    const old = car.components?.[id] as any;
    if (!old) {
      components[id] = fresh[id];
      continue;
    }
    const bolts = fresh[id].bolts.map((_, i): BoltState => {
      const b = old.bolts?.[i];
      return b === true || b === 2 || b === undefined ? 2 : b === 1 ? 1 : 0;
    });
    components[id] = { installed: !!old.installed, bolts, connected: old.connected ?? true, condition: old.condition === 'defect' ? 'defect' : 'ok', known: !!old.known };
  }
  const modelId = CAR_MODELS[car.modelId] ? car.modelId : 'bavaria_320';
  // Fehlende Felder bekommen feste, aus der Fahrzeug-ID abgeleitete Standardwerte (kein Würfeln bei jedem Laden).
  const rng = seeded(hash(car.uid ?? 'auto'));
  const base = fluids.createFluids(modelId, 0.3, rng);
  const zones = car.zones ?? createZones(0.35, 0.55, 0, rng);
  return {
    ...car,
    modelId,
    partsSpent: car.partsSpent ?? 0,
    observed: car.observed ?? [],
    components,
    fluids: car.fluids ? { oil: { ...base.oil, ...car.fluids.oil }, coolant: { ...base.coolant, ...car.fluids.coolant }, brake: { ...base.brake, ...car.fluids.brake } } : base,
    checked: car.checked ?? {},
    zones,
    interior: car.interior ?? { seats: 0.4, dash: 0.3, floor: 0.5 },
    rarity: car.rarity ?? 0,
    origin: car.origin ?? (car.job ? 'job' : 'market'),
    keep: !!car.keep,
  };
}

const describe = (o: Observation, quiet: string) =>
  [
    o.added.length ? `Dir fällt auf: ${o.added.map((s) => s.text).join(' ')}` : '',
    o.gone.length ? `Nicht mehr vorhanden: ${o.gone.map((s) => s.argument).join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ') || quiet;

export const useGame = create<GameState>()(
  persist(
    (set, get) => {
      const tools = () => ({ active: get().tool, carried: get().carried });

      /** Führt eine Aktion auf einer Kopie des Autos aus und übernimmt das Ergebnis. */
      const act = (bay: number, fn: (car: CarInstance, inv: Inventory) => ActionResult, sound: keyof typeof sfx = 'click') => {
        const s = get();
        const current = s.cars[bay];
        if (!current) return;
        const car = clone(current);
        const inventory = clone(s.inventory);
        const r = fn(car, inventory);
        if (r.ok) {
          sfx[sound]();
          const cars = [...s.cars];
          cars[bay] = car;
          const liftUp = [...s.liftUp];
          liftUp[bay] = car.lifted;
          liftUp[bay] = bay < LIFTS ? car.lifted : false;
          // Zusatzbefund am Kundenauto: Der Kunde wird gefragt, statt dass ungefragt repariert und berechnet wird.
          let events = s.events;
          if (car.job) {
            for (const d of repair.knownDefects(car)) {
              if (car.job.required.includes(d) || car.job.asked?.includes(d)) continue;
              car.job.asked = [...(car.job.asked ?? []), d];
              events = [...events, extraWorkEvent(car.uid, car.job.customer, d, DEFECTS[d].name, s.day)];
            }
          }
          set({ cars, inventory, liftUp: liftUp.slice(0, LIFTS), events });
        } else if (!r.needsPart) sfx.error();
        if (r.message) get().say(r.message, !r.ok);
        return r;
      };

      /** Am laufenden Motor wird nicht geschraubt. */
      const engineGuard = (bay: number, compId: string) => {
        const s = get();
        if (s.engineBay !== bay || COMPONENT_MAP[compId].access !== 'hood' || s.tool === 'lamp') return false;
        sfx.error();
        s.say('Erst den Motor abstellen – am laufenden Motor wird nicht geschraubt.', true);
        return true;
      };

      const stopEngine = () => {
        if (get().engineBay < 0) return;
        engineAudio.stop();
        set({ engineBay: -1, engineWarm: false });
      };

      /** Spieler nimmt das Auto über bestimmte Kanäle wahr; Ergebnis landet in der Fahrzeugakte. */
      const perceive = (bay: number, channels: Channel[], warm: boolean, quiet: string) => {
        const s = get();
        const current = s.cars[bay];
        if (!current) return;
        const car = clone(current);
        const o = observe(car, channels, warm);
        const cars = [...s.cars];
        cars[bay] = car;
        set({ cars });
        get().say(describe(o, quiet), o.added.length > 0);
        return o;
      };

      return {
        money: START_MONEY,
        screen: 'menu',
        cars: Array(SLOT_COUNT).fill(null),
        upgrades: [],
        fluidStock: emptyStock(),
        drainPan: [false, false],
        auctions: [],
        waiting: [],
        events: [],
        liftUp: [false, false],
        carried: [],
        tool: 'hand',
        inventory: emptyInventory(),
        listings: [],
        selected: 0,
        jobs: [],
        day: 1,
        marketIndex: 1,
        carsSold: 0,
        totalProfit: 0,
        jobsDone: 0,
        jobEarnings: 0,
        sound: true,
        started: false,
        panel: null,
        panelBay: 0,
        driveBay: 0,
        engineBay: -1,
        engineSince: 0,
        engineWarm: false,
        toast: null,
        partPrompt: null,
        marketNote: null,
        marketSource: 'listings',
        paintColor: PAINT_COLORS[0],
        lastSale: null,
        driveReport: null,

        newGame: () => {
          stopEngine();
          set({
            money: START_MONEY,
            cars: Array(SLOT_COUNT).fill(null),
            upgrades: [],
            fluidStock: emptyStock(),
            drainPan: [false, false],
            auctions: [createAuction(Math.random, 1, Date.now())],
            waiting: [],
            events: [],
            liftUp: [false, false],
            carried: [],
            tool: 'hand',
            inventory: emptyInventory(),
            listings: fillListings([], START_MONEY, Math.random, 1, true),
            selected: 0,
            jobs: fillJobs([], Math.random),
            day: 1,
            marketIndex: 1,
            carsSold: 0,
            totalProfit: 0,
            jobsDone: 0,
            jobEarnings: 0,
            started: true,
            screen: 'garage',
            panel: 'help',
            marketNote: null,
            lastSale: null,
            driveReport: null,
          });
        },

        goto: (screen) => {
          if (screen !== 'garage') stopEngine();
          set({ screen, panel: null, partPrompt: null });
        },
        say: (text, bad = false) => set({ toast: { id: ++toastId, text, bad } }),
        setTool: (tool) => set({ tool }),
        setPanel: (panel, bay) => set({ panel, panelBay: bay ?? get().panelBay }),
        setSound: (on) => {
          setMuted(!on);
          set({ sound: on });
          if (on) sfx.click();
        },

        takeTool: (id) => {
          const s = get();
          if (s.carried.includes(id)) return;
          if (s.carried.length >= MAX_CARRIED) {
            sfx.error();
            return s.say(`Du kannst nur ${MAX_CARRIED} Werkzeuge tragen – leg erst eines zurück.`, true);
          }
          sfx.clunk();
          set({ carried: [...s.carried, id], tool: TOOL_MAP[id].kind === 'socket' ? s.tool : id });
        },
        returnTool: (id) => {
          const s = get();
          sfx.clunk();
          set({ carried: s.carried.filter((t) => t !== id), tool: s.tool === id ? 'hand' : s.tool });
        },

        viewListing: (i) => {
          stopEngine();
          set({ selected: i, screen: 'market', panel: null, marketNote: null, marketSource: 'listings' });
        },
        selectListing: (selected) => {
          engineAudio.stop();
          set({ selected, marketNote: null });
        },

        checkListing: (check) => {
          const listings = clone(get().listings);
          const l = listings[get().selected];
          const note = inspectListing(l, check);
          sfx.click();
          // Beim Anhören und bei der Probefahrt ist der Motor kurz wirklich zu hören.
          if (check === 'listen' || check === 'drive') engineAudio.demo(soundProfile(l.car), check === 'drive');
          set({ listings, marketNote: note });
        },

        offer: (amount, args = []) => {
          const s = get();
          const listings = clone(s.listings);
          const l = listings[s.selected];
          if (!l || l.gone) return;
          const bay = freeSlot(s, l.barn ? 'park' : 'lift');
          if (bay < 0) return s.say('Kein Stellplatz frei.', true);
          const transport = l.barn ? BARN_TRANSPORT : 0;
          if (amount + transport > s.money - heldMoney(s.auctions)) return s.say(transport ? `Dafür reicht das freie Geld nicht (Transport kostet ${BARN_TRANSPORT} € extra).` : 'So viel freies Geld hast du nicht.', true);
          const r = makeOffer(l, amount, args);
          if (!r.accepted) {
            sfx.error();
            return set({ listings });
          }
          sfx.cash();
          engineAudio.stop();
          // Was bei der Besichtigung aufgefallen ist, steht schon in der Fahrzeugakte.
          const car: CarInstance = { ...l.car, purchasePrice: r.price + transport, lifted: false, hoodOpen: false, observed: [...l.hints] };
          const cars = [...s.cars];
          cars[bay] = car;
          const liftUp = [...s.liftUp];
          if (bay < LIFTS) liftUp[bay] = false;
          listings.splice(s.selected, 1);
          set({ money: s.money - r.price - transport, cars, liftUp, listings, selected: 0, screen: 'garage', panel: null, marketNote: null });
          get().say(`${l.seller}: ${l.sellerLine} – Gekauft für ${r.price.toLocaleString('de-DE')} €${transport ? ` plus ${transport} € Transport` : ''}. Das Auto steht jetzt hier: ${SLOTS[bay].label}.`);
        },

        nextDay: () => {
          const s = get();
          const marketIndex = nextMarketIndex(s.marketIndex, Math.random);
          sfx.click();
          const day = s.day + 1;
          // Undichte Autos verlieren über Nacht Öl und Kühlmittel.
          const cars = s.cars.map((c) => {
            if (!c) return c;
            const car = clone(c);
            fluids.dailyLeaks(car);
            return car;
          });
          const events = rollEvents(s.events, Math.random, { day, marketIndex, deals: s.carsSold + s.jobsDone, now: Date.now() });
          const fresh = events.filter((e) => !s.events.includes(e));
          const auctions = s.auctions.filter((a) => !a.result);
          while (auctions.length < MAX_AUCTIONS) auctions.push(createAuction(Math.random, marketIndex, Date.now()));
          set({
            day,
            marketIndex,
            cars,
            events,
            auctions,
            listings: refreshListings(s.listings, s.money, Math.random, marketIndex, day),
            jobs: refreshJobs(s.jobs, Math.random),
            selected: 0,
          });
          get().say(`Tag ${day}: neue Angebote, Auktionen und Kundenanfragen.${fresh.length ? ` Neuigkeit: ${fresh[0].title}.` : ''}`);
        },

        acceptJob: (i) => {
          const s = get();
          const bay = freeSlot(s, 'lift');
          if (bay < 0) return s.say('Kein Stellplatz frei – erst ein Auto verkaufen, umparken oder einen Auftrag abschließen.', true);
          const offer = s.jobs[i];
          if (!offer) return;
          sfx.clunk();
          const cars = [...s.cars];
          cars[bay] = { ...offer.car, lifted: false, hoodOpen: false };
          const liftUp = [...s.liftUp];
          if (bay < LIFTS) liftUp[bay] = false;
          set({ cars, liftUp, jobs: s.jobs.filter((_, k) => k !== i) });
          s.say(`Auftrag angenommen: ${offer.car.job!.customer} hat den Wagen abgestellt – ${SLOTS[bay].label}.`);
        },

        returnJob: (bay, unrepaired = false) => {
          const s = get();
          const car = s.cars[bay];
          if (!car?.job) return;
          const bill = billJob(car, s.day);
          if (!bill.done && !unrepaired) {
            sfx.error();
            return s.say(bill.problems[0], true);
          }
          if (!repair.isAssembled(car) || car.lifted) {
            sfx.error();
            return s.say('So kann der Kunde nicht vom Hof fahren – erst alles montieren und ablassen.', true);
          }
          if (s.engineBay === bay) stopEngine();
          const paid = bill.done ? bill.total : 0;
          const profit = paid - car.partsSpent;
          const cars = [...s.cars];
          cars[bay] = null;
          sfx.cash();
          set({
            money: s.money + paid,
            cars,
            jobsDone: s.jobsDone + (bill.done ? 1 : 0),
            jobEarnings: s.jobEarnings + profit,
            jobs: fillJobs(s.jobs, Math.random),
            lastSale: {
              title: bill.done ? `Auftrag erledigt – ${car.job.customer} zahlt` : `${car.job.customer} holt das Auto unrepariert ab`,
              price: paid,
              profit,
              lines: bill.done ? bill.lines : [],
            },
          });
        },

        tapHood: (bay) => {
          const s = get();
          if (s.tool === 'lamp' || s.tool === 'obd') return get().tapBody(bay);
          if (s.tool !== 'hand') return s.say('Die Haube öffnest du mit der Hand.', true);
          act(bay, (car) => repair.toggleHood(car), 'clunk');
        },
        tapLift: (bay) => {
          const s = get();
          if (bay >= LIFTS) return;
          if (s.cars[bay]) return void act(bay, (car) => repair.toggleLift(car), 'clunk');
          const liftUp = [...s.liftUp];
          liftUp[bay] = !liftUp[bay];
          sfx.clunk();
          set({ liftUp });
        },
        /** Tipp auf Karosserie oder Motorblock: OBD anschließen bzw. Sichtprüfung mit der Lampe. */
        tapBody: (bay, zone) => {
          const s = get();
          const car = s.cars[bay];
          if (!car) return;
          const kind = SLOTS[bay].kind;
          if (WASH_TOOLS.includes(s.tool)) {
            if (kind !== 'wash') return s.say('Waschen, Polieren und Innenreinigung gehen nur am Waschplatz.', true);
            if (!zone) return;
            return void act(bay, (c) => washAction(c, zone, s.tool), 'click');
          }
          if (PAINT_TOOLS.includes(s.tool)) {
            if (kind !== 'paint') return s.say('Schleifen und Lackieren geht nur in der Lackierkabine.', true);
            if (!zone) return;
            if (car.job) return s.say('Ein Kundenauto lackierst du nicht einfach um.', true);
            let cost = 0;
            const r = act(bay, (c) => {
              const res = paintAction(c, zone, s.tool, s.paintColor, get().money);
              cost = res.cost ?? 0;
              if (cost) c.partsSpent += cost;
              return res;
            }, 'click');
            if (r?.ok && cost) set({ money: get().money - cost });
            return;
          }
          if (s.tool === 'obd') return set({ panel: 'obd', panelBay: bay });
          if (s.tool !== 'lamp') return;
          sfx.click();
          if (car.lifted) return void perceive(bay, ['under', 'wheels'], false, 'Sichtprüfung von unten: Unterboden trocken, Bremse unauffällig.');
          if (car.hoodOpen) return void perceive(bay, ['hood'], false, 'Sichtprüfung Motorraum: trocken, keine Auffälligkeiten.');
          perceive(bay, ['wheels'], false, 'Rundgang ums Auto: außen nichts Auffälliges. Für mehr Haube öffnen oder Auto anheben.');
        },
        tapBolt: (bay, compId, index) => {
          if (engineGuard(bay, compId)) return;
          act(bay, (car) => repair.boltAction(car, compId, index, tools()), 'ratchet');
        },
        tapConnector: (bay, compId) => {
          if (engineGuard(bay, compId)) return;
          act(bay, (car) => repair.connectorAction(car, compId, tools()), 'click');
        },
        tapComponent: (bay, compId, useOldPart) => {
          if (engineGuard(bay, compId)) return;
          const before = get().cars[bay];
          if (compId === 'drain_plug' && before?.components.drain_plug.installed && !get().drainPan[bay] && get().tool !== 'lamp') {
            sfx.error();
            return get().say('Erst die Auffangwanne unter den Motor stellen – sonst läuft das Altöl auf den Boden.', true);
          }
          const r = act(bay, (car, inv) => repair.componentAction(car, inv, compId, tools(), { useOldPart }), 'clunk');
          set({ partPrompt: r?.needsPart ? { bay, compId, partId: r.needsPart } : null });
        },
        closePartPrompt: () => set({ partPrompt: null }),

        buyPart: (id) => {
          const s = get();
          const p = PARTS[id];
          const price = partPrice(s, id);
          if (s.money - heldMoney(s.auctions) < price) return s.say('Dafür reicht das freie Geld nicht.', true);
          sfx.cash();
          set({ money: s.money - price, inventory: { ...s.inventory, [id]: s.inventory[id] + p.units } });
          s.say(`Bestellt: ${p.name} (−${price} €). Liegt im Ersatzteilregal.`);
        },

        scanObd: (bay) => void act(bay, (car) => ({ ok: true, message: obdScan(car).length ? undefined : 'OBD: keine Fehler gespeichert.' })),

        toggleEngine: (bay) => {
          const s = get();
          const car = s.cars[bay];
          if (!car) return;
          if (s.engineBay === bay) {
            stopEngine();
            return s.say('Motor abgestellt.');
          }
          const blocker = repair.engineBlocker(car);
          if (blocker) {
            sfx.error();
            // Ein Startversuch, bei dem nur das Relais klackt, ist selbst eine Beobachtung.
            if (car.components.battery.condition === 'defect' && !car.observed.includes('no_start')) {
              const cars = [...s.cars];
              cars[bay] = { ...car, observed: [...car.observed, 'no_start'] };
              set({ cars });
            }
            return s.say(blocker, true);
          }
          engineAudio.stop();
          engineAudio.start(soundProfile(car));
          set({ engineBay: bay, engineSince: Date.now(), engineWarm: false });
          perceive(bay, ['idle', 'sound', 'dash'], false, 'Der Motor springt an und läuft ruhig. Lass ihn warm werden und gib etwas Gas.');
        },
        engineTick: () => {
          const s = get();
          if (s.engineBay < 0 || s.engineWarm || Date.now() - s.engineSince < WARM_AFTER * 1000) return;
          set({ engineWarm: true });
          engineAudio.setWarm(true);
          perceive(s.engineBay, ['idle', 'sound', 'dash'], true, 'Der Motor ist jetzt warm und läuft weiter unauffällig.');
        },
        revEngine: () => {
          const s = get();
          if (s.engineBay < 0) return;
          perceive(s.engineBay, ['rev'], s.engineWarm, s.engineWarm ? 'Beim Gasgeben dreht der Motor sauber hoch.' : 'Dreht sauber hoch – manches hört man erst bei warmem Motor.');
        },

        startDrive: (bay) => {
          const s = get();
          const car = s.cars[bay];
          if (!car) return;
          const blocker = repair.driveBlocker(car);
          if (blocker) {
            sfx.error();
            return s.say(blocker, true);
          }
          stopEngine();
          const cars = [...s.cars];
          cars[bay] = { ...car, hoodOpen: false };
          set({ cars, driveBay: bay, screen: 'track', panel: null, driveReport: null });
        },

        finishDrive: (completed) => {
          const s = get();
          const current = s.cars[s.driveBay];
          if (!current || !completed) return set({ screen: 'garage' });
          const car = clone(current);
          car.testDriven = true;
          // Wer mit fast leerem Ölstand fährt, ruiniert die Lager.
          const oilDamage = fluids.fill(car, 'oil') < 0.3 && car.components.bearing.condition === 'ok';
          if (oilDamage) car.components.bearing.condition = 'defect';
          for (const z of Object.values(car.zones)) z.dirt = Math.min(1, z.dirt + 0.12);
          const drove: Channel[] = ['idle', 'sound', 'dash', 'rev', 'drive'];
          observe(car, drove, true);
          // Bericht: alles, was bei dieser Fahrt zu spüren oder zu hören war.
          const report = car.observed.filter((id) => SYMPTOMS[id] && drove.includes(SYMPTOMS[id].channel));
          sfx.cash();
          const cars = [...s.cars];
          cars[s.driveBay] = car;
          set({
            cars,
            screen: 'garage',
            panel: 'report',
            panelBay: s.driveBay,
            driveReport: [...report.map((id) => SYMPTOMS[id].text), ...(oilDamage ? ['Mit viel zu wenig Öl gefahren: Unter Last klackert es jetzt aus dem Motor.'] : [])],
          });
        },

        haggle: (bay) => {
          const s = get();
          const car = s.cars[bay];
          if (!car || car.haggled || car.job) return;
          const v = valuate(car, s.marketIndex);
          const better = v.haggleOffer > v.offer;
          better ? sfx.cash() : sfx.error();
          const cars = [...s.cars];
          cars[bay] = { ...car, haggled: true };
          set({ cars });
          s.say(
            better
              ? `Käufer: „Der Wagen ist wirklich sauber. ${v.haggleOffer.toLocaleString('de-DE')} €, letztes Angebot.“`
              : `Käufer: „Bei den Mängeln? Jetzt nur noch ${v.haggleOffer.toLocaleString('de-DE')} €.“`,
            !better,
          );
        },

        sell: (bay) => {
          const s = get();
          const car = s.cars[bay];
          if (!car) return;
          // Kundenfahrzeuge gehören nicht dir – sie können nie verkauft werden.
          if (car.job) return s.say('Das ist ein Kundenfahrzeug – das kannst du nicht verkaufen.', true);
          if (car.keep) return s.say('Das ist als Privatfahrzeug markiert – erst die Markierung entfernen.', true);
          if (s.engineBay === bay) stopEngine();
          const v = valuate(car, s.marketIndex);
          const price = car.haggled ? v.haggleOffer : v.offer;
          const profit = price - car.purchasePrice - car.partsSpent;
          const cars = [...s.cars];
          cars[bay] = null;
          const liftUp = [...s.liftUp];
          if (bay < LIFTS) liftUp[bay] = false;
          sfx.cash();
          set({
            money: s.money + price,
            cars,
            liftUp,
            carsSold: s.carsSold + 1,
            totalProfit: s.totalProfit + profit,
            listings: fillListings(s.listings, s.money + price, Math.random, s.marketIndex),
            lastSale: { title: 'Verkauft!', price, profit },
          });
        },
        dismissSale: () => set({ lastSale: null }),

        buyUpgrade: (id) => {
          const s = get();
          const u = UPGRADES.find((x) => x.id === id)!;
          if (s.upgrades.includes(id)) return;
          if (u.requires && !s.upgrades.includes(u.requires)) return s.say(`Dafür brauchst du zuerst: ${UPGRADES.find((x) => x.id === u.requires)!.name}.`, true);
          if (s.money - heldMoney(s.auctions) < u.price) return s.say('Dafür reicht das freie Geld nicht.', true);
          sfx.cash();
          set({ money: s.money - u.price, upgrades: [...s.upgrades, id] });
          s.say(`Ausbau fertig: ${u.name}. Sieh es dir draußen im Hof an.`);
        },

        moveCar: (from, to) => {
          const s = get();
          const car = s.cars[from];
          if (!car || s.cars[to] || !availableSlots(s.upgrades).some((x) => x.id === to)) return;
          if (car.lifted) return s.say('Erst das Auto von der Hebebühne ablassen.', true);
          if (['wheel_fl', 'wheel_fr'].some((w) => !repair.isComplete(car, w))) return s.say('Ohne festgezogene Räder lässt sich das Auto nicht bewegen.', true);
          if (s.engineBay === from) stopEngine();
          sfx.clunk();
          const cars = [...s.cars];
          cars[to] = { ...car, hoodOpen: false };
          cars[from] = null;
          set({ cars, panel: null });
          s.say(`Umgeparkt: ${SLOTS[to].label}.`);
        },
        toggleKeep: (slot) => {
          const s = get();
          const car = s.cars[slot];
          if (!car || car.job) return;
          const cars = [...s.cars];
          cars[slot] = { ...car, keep: !car.keep };
          set({ cars });
        },

        buyFluid: (product) => {
          const s = get();
          const p = FLUID_PRODUCTS[product];
          const price = fluidPrice(s, product);
          if (s.money - heldMoney(s.auctions) < price) return s.say('Dafür reicht das freie Geld nicht.', true);
          sfx.cash();
          set({ money: s.money - price, fluidStock: { ...s.fluidStock, [product]: Math.round((s.fluidStock[product] + p.liters) * 10) / 10 } });
          s.say(`Bestellt: ${p.name}, ${p.liters} l (−${price} €).`);
        },
        checkFluid: (slot, id) => void act(slot, (car) => fluids.checkFluid(car, id, get().day)),
        addFluid: (slot, id, product, liters) => {
          const stock = { ...get().fluidStock };
          const r = act(slot, (car) => fluids.addFluid(car, stock, id, product, liters), 'clunk');
          if (r?.ok) set({ fluidStock: stock });
        },
        bleedCoolant: (slot) => void act(slot, (car) => fluids.bleedCoolant(car, get().engineBay === slot), 'click'),
        bleedBrake: (slot, side) => {
          const stock = { ...get().fluidStock };
          const r = act(slot, (car) => fluids.bleedBrake(car, stock, side, tools()), 'ratchet');
          if (r?.ok) set({ fluidStock: stock });
        },
        togglePan: (bay) => {
          const s = get();
          const car = s.cars[bay];
          if (s.drainPan[bay] && car && !car.components.drain_plug.installed) return s.say('Die Wanne bleibt stehen, solange die Ablassschraube draußen ist.', true);
          sfx.clunk();
          const drainPan = [...s.drainPan];
          drainPan[bay] = !drainPan[bay];
          set({ drainPan });
          s.say(drainPan[bay] ? 'Auffangwanne unter den Motor geschoben.' : 'Auffangwanne weggeräumt, Altöl entsorgt.');
        },
        setPaintColor: (paintColor) => set({ paintColor }),

        viewAuction: (i) => {
          stopEngine();
          set({ selected: i, screen: 'market', panel: null, marketNote: null, marketSource: 'auctions' });
        },
        bid: (i, amount) => {
          const s = get();
          const auctions = clone(s.auctions);
          const a = auctions[i];
          if (!a) return;
          const r = placeBid(a, amount, s.money - heldMoney(s.auctions), Date.now());
          r.ok ? sfx.click() : sfx.error();
          set({ auctions });
          s.say(r.message, !r.ok);
        },
        tickAuctions: (now) => {
          const s = get();
          if (!s.auctions.some((a) => !a.settled && (a.result || now >= a.simulatedTo + 8000))) return;
          const auctions = clone(s.auctions).map((a) => advanceAuction(a, now));
          let { money } = s;
          const cars = [...s.cars];
          const waiting = [...s.waiting];
          let note = '';
          for (const a of auctions) {
            if (!a.result || a.settled) continue;
            a.settled = true; // Abwicklung genau einmal – auch über Neustarts hinweg
            if (a.result === 'won') {
              money -= a.current;
              const car: CarInstance = { ...a.car, purchasePrice: a.current, lifted: false, hoodOpen: false };
              const slot = freeSlot({ cars, upgrades: s.upgrades }, 'park');
              if (slot >= 0) cars[slot] = car;
              else waiting.push(car);
              note = `Auktion gewonnen: ${a.title} für ${a.current.toLocaleString('de-DE')} €. ${slot >= 0 ? `Geliefert: ${SLOTS[slot].label}.` : 'Kein Stellplatz frei – das Auto wartet beim Auktionshaus.'}`;
              sfx.cash();
            } else if (a.result === 'lost' && a.log.some((l) => l.startsWith('Du bietest'))) {
              note = `Auktion verloren: ${a.title} ging für ${a.current.toLocaleString('de-DE')} € an ${a.leader}.`;
            }
          }
          set({ auctions, money, cars, waiting });
          if (note) get().say(note, note.startsWith('Auktion verloren'));
        },
        claimWaiting: () => {
          const s = get();
          const slot = freeSlot(s, 'park');
          if (!s.waiting.length || slot < 0) return s.say('Kein Stellplatz frei.', true);
          const cars = [...s.cars];
          cars[slot] = s.waiting[0];
          sfx.clunk();
          set({ cars, waiting: s.waiting.slice(1) });
          s.say(`Geliefert: ${SLOTS[slot].label}.`);
        },

        acceptEvent: (id) => {
          const s = get();
          const e = s.events.find((x) => x.id === id);
          if (!e || e.expiresDay < s.day) return;
          const rest = s.events.filter((x) => x.id !== id);
          if (e.type === 'urgent_job' && e.job) {
            const slot = freeSlot(s, 'lift');
            if (slot < 0) return s.say('Kein Stellplatz frei für das Kundenauto.', true);
            const cars = [...s.cars];
            cars[slot] = { ...e.job.car, lifted: false, hoodOpen: false };
            sfx.clunk();
            set({ cars, events: rest });
            return s.say(`Eilauftrag angenommen: ${e.job.car.job!.customer} – ${SLOTS[slot].label}. Fertig bis morgen gibt es den Zuschlag.`);
          }
          if ((e.type === 'special_listing' || e.type === 'barn_hint') && e.listing) {
            sfx.click();
            const listings = [e.listing, ...s.listings];
            set({ listings, events: rest, selected: 0, screen: 'market', panel: null, marketNote: null, marketSource: 'listings' });
            return;
          }
          if (e.type === 'rare_auction' && e.auction) {
            sfx.click();
            // Die Uhr läuft ab jetzt, nicht ab dem Zeitpunkt des Hinweises.
            const now = Date.now();
            const a = { ...e.auction, endsAt: now + (e.auction.endsAt - e.auction.startsAt), startsAt: now, simulatedTo: now };
            set({ auctions: [a, ...s.auctions], events: rest });
            return s.say('Das Fahrzeug steht jetzt unter „Auktionen“.');
          }
          if (e.type === 'extra_work' && e.extra) {
            const slot = s.cars.findIndex((c) => c?.uid === e.extra!.uid);
            const car = slot >= 0 ? s.cars[slot] : null;
            if (!car?.job) return set({ events: rest });
            // Ob der Kunde zustimmt, steht mit dem Auftrag fest – wiederholtes Fragen ändert nichts.
            const yes = hash(car.job.id + e.extra.defect) % 10 < 7;
            const cars = [...s.cars];
            if (yes) cars[slot] = { ...car, job: { ...car.job, approved: [...(car.job.approved ?? []), e.extra.defect as DefectId] } };
            yes ? sfx.cash() : sfx.error();
            set({ cars, events: rest });
            return s.say(yes ? `${car.job.customer}: „Machen Sie das bitte gleich mit.“ Die Zusatzarbeit wird bezahlt.` : `${car.job.customer}: „Nein danke, nur das Beauftragte.“`, !yes);
          }
          // Teile-Sonderangebot gilt automatisch, solange es läuft.
          s.say('Der Rabatt gilt automatisch beim Bestellen.');
        },
        dismissEvent: (id) => set({ events: get().events.filter((x) => x.id !== id) }),
      };
    },
    {
      name: 'garage-kings-save-v1',
      version: 4,
      migrate: (old: any, version) => {
        if (!old) return old;
        let s = old;
        if (version < 2) {
          // Erste Version: ein Auto, alter Werkzeugsatz, Marktbildschirm als Start.
          s = {
            money: s.money ?? START_MONEY,
            screen: s.screen === 'menu' ? 'menu' : 'garage',
            cars: [s.car ?? null, null],
            liftUp: [!!s.car?.lifted, false],
            carried: [],
            tool: 'hand',
            inventory: s.inventory ?? {},
            listings: [],
            selected: 0,
            day: 1,
            marketIndex: 1,
            carsSold: s.carsSold ?? 0,
            totalProfit: s.totalProfit ?? 0,
            started: !!s.started,
          };
        }
        if (version < 3) {
          // Angebote hatten noch keine Verkäuferprofile und benannten Defekte direkt – der Markt wird neu gefüllt.
          // Autos, Geld, Werkzeuge und Lager bleiben; neue Felder ergänzt `merge` mit Standardwerten.
          s = { ...s, listings: [], selected: 0 };
        }
        // Version 4 ergänzt nur neue Felder (Flüssigkeiten, Stellplätze, Ausbau, Auktionen, Ereignisse) – das erledigt `merge`.
        return s;
      },
      merge: (persisted: any, current) => {
        const p = persisted ?? {};
        const merged = { ...current, ...p } as GameState;
        merged.cars = Array.from({ length: SLOT_COUNT }, (_, i) => normalizeCar(p.cars?.[i] ?? null));
        merged.liftUp = [0, 1].map((i) => (merged.cars[i] ? merged.cars[i]!.lifted : !!p.liftUp?.[i]));
        merged.upgrades = (p.upgrades ?? []).filter((u: UpgradeId) => UPGRADES.some((x) => x.id === u));
        merged.fluidStock = { ...emptyStock(), ...(p.fluidStock ?? {}) };
        merged.drainPan = [!!p.drainPan?.[0], !!p.drainPan?.[1]];
        merged.waiting = (p.waiting ?? []).map((c: CarInstance) => normalizeCar(c)!);
        merged.events = (p.events ?? []).filter((e: GameEvent) => e && e.id && e.type);
        merged.auctions = (p.auctions ?? []).filter((a: Auction) => a && a.car && a.bidders).map((a: Auction) => ({ ...a, car: normalizeCar(a.car)! }));
        merged.inventory = { ...emptyInventory(), ...(p.inventory ?? {}) };
        merged.carried = (p.carried ?? []).filter((t: ToolId) => TOOL_MAP[t] && ['driver', 'socket', 'device'].includes(TOOL_MAP[t].kind)).slice(0, MAX_CARRIED);
        if (!TOOL_MAP[merged.tool] || (TOOL_MAP[merged.tool].kind !== 'builtin' && !merged.carried.includes(merged.tool))) merged.tool = 'hand';
        merged.listings = (p.listings ?? [])
          .filter((l: Listing) => l && l.profile && l.car)
          .map((l: Listing) => ({ ...l, usedArgs: l.usedArgs ?? [], gone: !!l.gone, car: normalizeCar(l.car)! }));
        merged.jobs = (p.jobs ?? []).filter((j: JobOffer) => j?.car?.job).map((j: JobOffer) => ({ ...j, car: normalizeCar(j.car)! }));
        merged.sound = p.sound ?? true;
        if (merged.started) {
          if (merged.listings.length === 0) merged.listings = fillListings([], merged.money, Math.random, merged.marketIndex);
          if (merged.jobs.length === 0) merged.jobs = fillJobs([], Math.random);
          if (merged.auctions.length === 0) merged.auctions = [createAuction(Math.random, merged.marketIndex, Date.now())];
        }
        setMuted(!merged.sound);
        return merged;
      },
      partialize: (s) => ({
        money: s.money,
        screen: s.screen === 'track' || s.screen === 'market' ? 'garage' : s.screen,
        cars: s.cars,
        upgrades: s.upgrades,
        fluidStock: s.fluidStock,
        drainPan: s.drainPan,
        auctions: s.auctions,
        waiting: s.waiting,
        events: s.events,
        liftUp: s.liftUp,
        carried: s.carried,
        tool: s.tool,
        inventory: s.inventory,
        listings: s.listings,
        selected: s.selected,
        jobs: s.jobs,
        day: s.day,
        marketIndex: s.marketIndex,
        carsSold: s.carsSold,
        totalProfit: s.totalProfit,
        jobsDone: s.jobsDone,
        jobEarnings: s.jobEarnings,
        sound: s.sound,
        started: s.started,
      }),
    },
  ),
);
