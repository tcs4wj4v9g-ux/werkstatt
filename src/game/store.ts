import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFECTS } from './data/defects';
import { PARTS } from './data/parts';
import { generateListings, inspectListing, makeOffer, valuate } from './market';
import * as repair from './repair';
import { sfx } from './sfx';
import type { ActionResult, CarInstance, Inventory, Listing, PartId, Screen, ToolId } from './types';

export const START_MONEY = 6000;
export type Panel = 'shop' | 'obd' | 'sell' | 'report' | 'help' | null;
export type View = 'overview' | 'engine' | 'wheel_fl' | 'wheel_fr';

interface Toast {
  id: number;
  text: string;
  bad: boolean;
}

export interface GameState {
  // --- gespeicherter Spielstand ---
  money: number;
  screen: Screen;
  car: CarInstance | null;
  inventory: Inventory;
  listings: Listing[];
  selected: number;
  carsSold: number;
  totalProfit: number;
  started: boolean;
  // --- flüchtiger UI-Zustand ---
  tool: ToolId;
  panel: Panel;
  view: View;
  toast: Toast | null;
  partPrompt: { compId: string; partId: PartId } | null;
  marketNote: string | null;
  lastSale: { price: number; profit: number; name: string } | null;
  driveReport: string[] | null;

  newGame(): void;
  goto(screen: Screen): void;
  say(text: string, bad?: boolean): void;
  setTool(tool: ToolId): void;
  setPanel(panel: Panel): void;
  setView(view: View): void;
  selectListing(i: number): void;
  checkListing(check: string): void;
  offer(amount: number): void;
  tapHood(): void;
  tapLift(): void;
  tapBolt(compId: string, index: number): void;
  tapComponent(compId: string, useOldPart?: boolean): void;
  closePartPrompt(): void;
  buyPart(id: PartId): void;
  scanObd(): void;
  startDrive(): void;
  finishDrive(completed: boolean): void;
  haggle(): void;
  sell(): void;
  dismissSale(): void;
}

const emptyInventory = (): Inventory => ({ ignition_coil: 0, brake_pads: 0, valve_cover_gasket: 0 });
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
let toastId = 0;

export const useGame = create<GameState>()(
  persist(
    (set, get) => {
      /** Führt eine Reparaturaktion auf einer Kopie des Autos aus und übernimmt das Ergebnis. */
      const act = (fn: (car: CarInstance, inv: Inventory) => ActionResult, sound: keyof typeof sfx = 'click') => {
        const s = get();
        if (!s.car) return;
        const car = clone(s.car);
        const inventory = clone(s.inventory);
        const r = fn(car, inventory);
        if (r.ok) {
          sfx[sound]();
          set({ car, inventory });
        } else if (!r.needsPart) sfx.error();
        if (r.message) get().say(r.message, !r.ok);
        return r;
      };

      return {
        money: START_MONEY,
        screen: 'menu',
        car: null,
        inventory: emptyInventory(),
        listings: [],
        selected: 0,
        carsSold: 0,
        totalProfit: 0,
        started: false,
        tool: 'hand',
        panel: null,
        view: 'overview',
        toast: null,
        partPrompt: null,
        marketNote: null,
        lastSale: null,
        driveReport: null,

        newGame: () =>
          set({
            money: START_MONEY,
            car: null,
            inventory: emptyInventory(),
            listings: generateListings(START_MONEY, Math.random, true),
            selected: 0,
            carsSold: 0,
            totalProfit: 0,
            started: true,
            screen: 'market',
            panel: 'help',
            marketNote: null,
            lastSale: null,
            driveReport: null,
          }),

        goto: (screen) => set({ screen, panel: null, partPrompt: null }),
        say: (text, bad = false) => set({ toast: { id: ++toastId, text, bad } }),
        setTool: (tool) => set({ tool }),
        setPanel: (panel) => set({ panel }),
        setView: (view) => set({ view }),
        selectListing: (selected) => set({ selected, marketNote: null }),

        checkListing: (check) => {
          const listings = clone(get().listings);
          const note = inspectListing(listings[get().selected], check);
          sfx.click();
          set({ listings, marketNote: note });
        },

        offer: (amount) => {
          const s = get();
          if (amount > s.money) return s.say('So viel Geld hast du nicht.', true);
          const listings = clone(s.listings);
          const l = listings[s.selected];
          const r = makeOffer(l, amount);
          if (!r.accepted) {
            sfx.error();
            return set({ listings });
          }
          sfx.cash();
          const car: CarInstance = { ...l.car, purchasePrice: r.price };
          // Auf dem Markt entdeckte Mängel sind in der Werkstatt bereits bekannt.
          l.hints.forEach((h) => DEFECTS[h].components.forEach((c) => {
            if (car.components[c].condition === 'defect' && DEFECTS[h].pick === 'all') car.components[c].known = true;
          }));
          set({ money: s.money - r.price, car, listings: [], screen: 'garage', view: 'overview', tool: 'hand', panel: null, marketNote: null });
          get().say(`${l.seller}: ${l.sellerLine} – Gekauft für ${r.price.toLocaleString('de-DE')} €.`);
        },

        tapHood: () => {
          const s = get();
          if (s.tool === 'inspect') return s.say('Motorhaube: ein paar Steinschläge, sonst in Ordnung.');
          if (s.tool !== 'hand') return s.say('Die Haube öffnest du mit der Hand.', true);
          act((car) => repair.toggleHood(car), 'clunk');
          if (get().car?.hoodOpen) set({ view: 'engine' });
        },
        tapLift: () => void act((car) => repair.toggleLift(car), 'clunk'),
        tapBolt: (compId, index) => void act((car) => repair.boltAction(car, compId, index, get().tool), 'ratchet'),
        tapComponent: (compId, useOldPart) => {
          const r = act((car, inv) => repair.componentAction(car, inv, compId, get().tool, { useOldPart }), 'clunk');
          set({ partPrompt: r?.needsPart ? { compId, partId: r.needsPart } : null });
        },
        closePartPrompt: () => set({ partPrompt: null }),

        buyPart: (id) => {
          const s = get();
          const p = PARTS[id];
          if (s.money < p.price) return s.say('Dafür reicht das Geld nicht.', true);
          sfx.cash();
          set({
            money: s.money - p.price,
            inventory: { ...s.inventory, [id]: s.inventory[id] + p.units },
            car: s.car ? { ...s.car, partsSpent: s.car.partsSpent + p.price } : null,
          });
          s.say(`Gekauft: ${p.name} (−${p.price} €).`);
        },

        scanObd: () => void act((car) => ({ ok: true, message: repair.obdScan(car).length ? undefined : 'OBD: keine Fehler gespeichert.' })),

        startDrive: () => {
          const s = get();
          if (!s.car) return;
          const blocker = repair.driveBlocker(s.car);
          if (blocker) {
            sfx.error();
            return s.say(blocker, true);
          }
          set({ car: { ...s.car, hoodOpen: false }, screen: 'track', panel: null, driveReport: null });
        },

        finishDrive: (completed) => {
          const s = get();
          if (!s.car) return;
          if (!completed) return set({ screen: 'garage' });
          const symptoms = repair.activeDefects(s.car).map((d) => DEFECTS[d].driveSymptom);
          sfx.cash();
          set({
            car: { ...s.car, testDriven: true },
            screen: 'garage',
            view: 'overview',
            panel: 'report',
            driveReport: symptoms,
          });
        },

        haggle: () => {
          const s = get();
          if (!s.car || s.car.haggled) return;
          const v = valuate(s.car);
          const better = v.haggleOffer > v.offer;
          better ? sfx.cash() : sfx.error();
          set({ car: { ...s.car, haggled: true } });
          s.say(
            better
              ? `Käufer: „Der Wagen ist wirklich sauber. ${v.haggleOffer.toLocaleString('de-DE')} €, letztes Angebot.“`
              : `Käufer: „Bei den Mängeln? Jetzt nur noch ${v.haggleOffer.toLocaleString('de-DE')} €.“`,
            !better,
          );
        },

        sell: () => {
          const s = get();
          if (!s.car) return;
          const v = valuate(s.car);
          const price = s.car.haggled ? v.haggleOffer : v.offer;
          const profit = price - s.car.purchasePrice - s.car.partsSpent;
          const money = s.money + price;
          sfx.cash();
          set({
            money,
            car: null,
            carsSold: s.carsSold + 1,
            totalProfit: s.totalProfit + profit,
            listings: generateListings(money, Math.random),
            selected: 0,
            screen: 'market',
            panel: null,
            marketNote: null,
            lastSale: { price, profit, name: '' },
          });
        },
        dismissSale: () => set({ lastSale: null }),
      };
    },
    {
      name: 'garage-kings-save-v1',
      version: 1,
      partialize: (s) => ({
        money: s.money,
        screen: s.screen === 'track' ? 'garage' : s.screen,
        car: s.car,
        inventory: s.inventory,
        listings: s.listings,
        selected: s.selected,
        carsSold: s.carsSold,
        totalProfit: s.totalProfit,
        started: s.started,
      }),
    },
  ),
);
