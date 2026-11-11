import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFECTS } from './data/defects';
import { PARTS, PART_LIST } from './data/parts';
import { MAX_CARRIED, TOOL_MAP } from './data/tools';
import { fillListings, freshComponents, inspectListing, makeOffer, nextMarketIndex, refreshListings, valuate } from './market';
import * as repair from './repair';
import { sfx } from './sfx';
import type { ActionResult, CarInstance, Inventory, Listing, PartId, Screen, ToolId } from './types';

export const START_MONEY = 6000;
export const BAYS = 2;
export type Panel = 'cabinet' | 'computer' | 'shop' | 'bench' | 'obd' | 'drive' | 'report' | 'help' | null;

interface Toast {
  id: number;
  text: string;
  bad: boolean;
}

export interface GameState {
  // --- gespeicherter Spielstand ---
  money: number;
  screen: Screen;
  /** Ein Stellplatz je Hebebühne; null = frei. */
  cars: (CarInstance | null)[];
  /** Höhe der Hebebühnen ohne Auto. Mit Auto zählt car.lifted. */
  liftUp: boolean[];
  /** Werkzeuge am Mann (max. 3). */
  carried: ToolId[];
  tool: ToolId;
  inventory: Inventory;
  listings: Listing[];
  selected: number;
  day: number;
  marketIndex: number;
  carsSold: number;
  totalProfit: number;
  started: boolean;
  // --- flüchtiger UI-Zustand ---
  panel: Panel;
  /** Auf welchen Stellplatz sich OBD-/Bericht-Fenster beziehen. */
  panelBay: number;
  driveBay: number;
  toast: Toast | null;
  partPrompt: { bay: number; compId: string; partId: PartId } | null;
  marketNote: string | null;
  lastSale: { price: number; profit: number; name: string } | null;
  driveReport: string[] | null;

  newGame(): void;
  goto(screen: Screen): void;
  say(text: string, bad?: boolean): void;
  setTool(tool: ToolId): void;
  setPanel(panel: Panel, bay?: number): void;
  takeTool(id: ToolId): void;
  returnTool(id: ToolId): void;
  viewListing(i: number): void;
  selectListing(i: number): void;
  checkListing(check: string): void;
  offer(amount: number): void;
  nextDay(): void;
  tapHood(bay: number): void;
  tapLift(bay: number): void;
  tapBody(bay: number): void;
  tapBolt(bay: number, compId: string, index: number): void;
  tapComponent(bay: number, compId: string, useOldPart?: boolean): void;
  closePartPrompt(): void;
  buyPart(id: PartId): void;
  scanObd(bay: number): void;
  startDrive(bay: number): void;
  finishDrive(completed: boolean): void;
  haggle(bay: number): void;
  sell(bay: number): void;
  dismissSale(): void;
}

const emptyInventory = (): Inventory =>
  Object.fromEntries(PART_LIST.map((p) => [p.id, 0])) as Inventory;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
let toastId = 0;

/** Ergänzt Bauteile, die es in älteren Spielständen noch nicht gab. */
function normalizeCar(car: CarInstance | null): CarInstance | null {
  if (!car) return null;
  return { ...car, partsSpent: car.partsSpent ?? 0, components: { ...freshComponents(), ...car.components } };
}

export const useGame = create<GameState>()(
  persist(
    (set, get) => {
      const tools = () => ({ active: get().tool, carried: get().carried });

      /** Führt eine Reparaturaktion auf einer Kopie des Autos aus und übernimmt das Ergebnis. */
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
          set({ cars, inventory, liftUp });
        } else if (!r.needsPart) sfx.error();
        if (r.message) get().say(r.message, !r.ok);
        return r;
      };

      return {
        money: START_MONEY,
        screen: 'menu',
        cars: [null, null],
        liftUp: [false, false],
        carried: [],
        tool: 'hand',
        inventory: emptyInventory(),
        listings: [],
        selected: 0,
        day: 1,
        marketIndex: 1,
        carsSold: 0,
        totalProfit: 0,
        started: false,
        panel: null,
        panelBay: 0,
        driveBay: 0,
        toast: null,
        partPrompt: null,
        marketNote: null,
        lastSale: null,
        driveReport: null,

        newGame: () =>
          set({
            money: START_MONEY,
            cars: [null, null],
            liftUp: [false, false],
            carried: [],
            tool: 'hand',
            inventory: emptyInventory(),
            listings: fillListings([], START_MONEY, Math.random, 1, true),
            selected: 0,
            day: 1,
            marketIndex: 1,
            carsSold: 0,
            totalProfit: 0,
            started: true,
            screen: 'garage',
            panel: 'help',
            marketNote: null,
            lastSale: null,
            driveReport: null,
          }),

        goto: (screen) => set({ screen, panel: null, partPrompt: null }),
        say: (text, bad = false) => set({ toast: { id: ++toastId, text, bad } }),
        setTool: (tool) => set({ tool }),
        setPanel: (panel, bay) => set({ panel, panelBay: bay ?? get().panelBay }),

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

        viewListing: (i) => set({ selected: i, screen: 'market', panel: null, marketNote: null }),
        selectListing: (selected) => set({ selected, marketNote: null }),

        checkListing: (check) => {
          const listings = clone(get().listings);
          const note = inspectListing(listings[get().selected], check);
          sfx.click();
          set({ listings, marketNote: note });
        },

        offer: (amount) => {
          const s = get();
          const bay = s.cars.findIndex((c) => !c);
          if (bay < 0) return s.say('Beide Hebebühnen sind belegt – verkaufe erst ein Auto.', true);
          if (amount > s.money) return s.say('So viel Geld hast du nicht.', true);
          const listings = clone(s.listings);
          const l = listings[s.selected];
          const r = makeOffer(l, amount);
          if (!r.accepted) {
            sfx.error();
            return set({ listings });
          }
          sfx.cash();
          const car: CarInstance = { ...l.car, purchasePrice: r.price, lifted: false, hoodOpen: false };
          // Auf dem Markt eindeutig entdeckte Mängel sind in der Werkstatt bereits bekannt.
          l.hints.forEach((h) => {
            if (DEFECTS[h].pick !== 'all') return;
            DEFECTS[h].components.forEach((c) => {
              if (car.components[c].condition === 'defect') car.components[c].known = true;
            });
          });
          const cars = [...s.cars];
          cars[bay] = car;
          const liftUp = [...s.liftUp];
          liftUp[bay] = false;
          listings.splice(s.selected, 1);
          set({ money: s.money - r.price, cars, liftUp, listings, selected: 0, screen: 'garage', panel: null, marketNote: null });
          get().say(`${l.seller}: ${l.sellerLine} – Gekauft für ${r.price.toLocaleString('de-DE')} €. Das Auto steht auf Hebebühne ${bay + 1}.`);
        },

        nextDay: () => {
          const s = get();
          const marketIndex = nextMarketIndex(s.marketIndex, Math.random);
          sfx.click();
          set({
            day: s.day + 1,
            marketIndex,
            listings: refreshListings(s.listings, s.money, Math.random, marketIndex),
            selected: 0,
          });
          get().say(`Tag ${s.day + 1}: Neue Angebote auf dem Markt.`);
        },

        tapHood: (bay) => {
          const s = get();
          if (s.tool === 'lamp') return s.say('Motorhaube: ein paar Steinschläge, sonst in Ordnung.');
          if (s.tool === 'obd') return get().tapBody(bay);
          if (s.tool !== 'hand') return s.say('Die Haube öffnest du mit der Hand.', true);
          act(bay, (car) => repair.toggleHood(car), 'clunk');
        },
        tapLift: (bay) => {
          const s = get();
          if (s.cars[bay]) return void act(bay, (car) => repair.toggleLift(car), 'clunk');
          const liftUp = [...s.liftUp];
          liftUp[bay] = !liftUp[bay];
          sfx.clunk();
          set({ liftUp });
        },
        tapBody: (bay) => {
          const s = get();
          if (s.tool !== 'obd' || !s.cars[bay]) return;
          set({ panel: 'obd', panelBay: bay });
        },
        tapBolt: (bay, compId, index) => void act(bay, (car) => repair.boltAction(car, compId, index, tools()), 'ratchet'),
        tapComponent: (bay, compId, useOldPart) => {
          const r = act(bay, (car, inv) => repair.componentAction(car, inv, compId, tools(), { useOldPart }), 'clunk');
          set({ partPrompt: r?.needsPart ? { bay, compId, partId: r.needsPart } : null });
        },
        closePartPrompt: () => set({ partPrompt: null }),

        buyPart: (id) => {
          const s = get();
          const p = PARTS[id];
          if (s.money < p.price) return s.say('Dafür reicht das Geld nicht.', true);
          sfx.cash();
          set({ money: s.money - p.price, inventory: { ...s.inventory, [id]: s.inventory[id] + p.units } });
          s.say(`Bestellt: ${p.name} (−${p.price} €). Liegt im Ersatzteilregal.`);
        },

        scanObd: (bay) =>
          void act(bay, (car) => ({ ok: true, message: repair.obdScan(car).length ? undefined : 'OBD: keine Fehler gespeichert.' })),

        startDrive: (bay) => {
          const s = get();
          const car = s.cars[bay];
          if (!car) return;
          const blocker = repair.driveBlocker(car);
          if (blocker) {
            sfx.error();
            return s.say(blocker, true);
          }
          const cars = [...s.cars];
          cars[bay] = { ...car, hoodOpen: false };
          set({ cars, driveBay: bay, screen: 'track', panel: null, driveReport: null });
        },

        finishDrive: (completed) => {
          const s = get();
          const car = s.cars[s.driveBay];
          if (!car || !completed) return set({ screen: 'garage' });
          const symptoms = repair.activeDefects(car).map((d) => DEFECTS[d].driveSymptom);
          sfx.cash();
          const cars = [...s.cars];
          cars[s.driveBay] = { ...car, testDriven: true };
          set({ cars, screen: 'garage', panel: 'report', panelBay: s.driveBay, driveReport: symptoms });
        },

        haggle: (bay) => {
          const s = get();
          const car = s.cars[bay];
          if (!car || car.haggled) return;
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
          const v = valuate(car, s.marketIndex);
          const price = car.haggled ? v.haggleOffer : v.offer;
          const profit = price - car.purchasePrice - car.partsSpent;
          const cars = [...s.cars];
          cars[bay] = null;
          const liftUp = [...s.liftUp];
          liftUp[bay] = false;
          sfx.cash();
          set({
            money: s.money + price,
            cars,
            liftUp,
            carsSold: s.carsSold + 1,
            totalProfit: s.totalProfit + profit,
            listings: fillListings(s.listings, s.money + price, Math.random, s.marketIndex),
            lastSale: { price, profit, name: '' },
          });
        },
        dismissSale: () => set({ lastSale: null }),
      };
    },
    {
      name: 'garage-kings-save-v1',
      version: 2,
      migrate: (old: any, version) => {
        if (version >= 2 || !old) return old;
        // Spielstand der ersten Version: ein Auto, alter Werkzeugsatz, Marktbildschirm als Start.
        const money = old.money ?? START_MONEY;
        return {
          money,
          screen: old.screen === 'menu' ? 'menu' : 'garage',
          cars: [old.car ?? null, null],
          liftUp: [!!old.car?.lifted, false],
          carried: [],
          tool: 'hand',
          inventory: { ...emptyInventory(), ...(old.inventory ?? {}) },
          listings: old.listings ?? [],
          selected: 0,
          day: 1,
          marketIndex: 1,
          carsSold: old.carsSold ?? 0,
          totalProfit: old.totalProfit ?? 0,
          started: !!old.started,
        };
      },
      merge: (persisted: any, current) => {
        const p = persisted ?? {};
        const merged = { ...current, ...p } as GameState;
        merged.cars = Array.from({ length: BAYS }, (_, i) => normalizeCar(p.cars?.[i] ?? null));
        merged.liftUp = merged.cars.map((c, i) => (c ? c.lifted : !!p.liftUp?.[i]));
        merged.inventory = { ...emptyInventory(), ...(p.inventory ?? {}) };
        merged.carried = (p.carried ?? []).filter((t: ToolId) => TOOL_MAP[t] && TOOL_MAP[t].kind !== 'builtin').slice(0, MAX_CARRIED);
        if (!TOOL_MAP[merged.tool] || (TOOL_MAP[merged.tool].kind !== 'builtin' && !merged.carried.includes(merged.tool))) merged.tool = 'hand';
        merged.listings = (p.listings ?? []).map((l: Listing) => ({ ...l, car: normalizeCar(l.car)! }));
        if (merged.started && merged.listings.length === 0) {
          merged.listings = fillListings([], merged.money, Math.random, merged.marketIndex);
        }
        return merged;
      },
      partialize: (s) => ({
        money: s.money,
        screen: s.screen === 'track' || s.screen === 'market' ? 'garage' : s.screen,
        cars: s.cars,
        liftUp: s.liftUp,
        carried: s.carried,
        tool: s.tool,
        inventory: s.inventory,
        listings: s.listings,
        selected: s.selected,
        day: s.day,
        marketIndex: s.marketIndex,
        carsSold: s.carsSold,
        totalProfit: s.totalProfit,
        started: s.started,
      }),
    },
  ),
);
