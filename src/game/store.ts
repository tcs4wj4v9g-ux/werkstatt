import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { engineAudio, setMuted, sfx } from './audio';
import { COMPONENT_MAP } from './data/components';
import { PARTS, PART_LIST } from './data/parts';
import { MAX_CARRIED, TOOL_MAP } from './data/tools';
import { SYMPTOMS, type Channel } from './data/symptoms';
import { obdScan, observe, soundProfile, type Observation } from './diagnosis';
import { billJob, fillJobs, refreshJobs } from './jobs';
import { fillListings, freshComponents, inspectListing, makeOffer, nextMarketIndex, refreshListings, valuate } from './market';
import * as repair from './repair';
import type { ActionResult, BoltState, CarInstance, Inventory, JobOffer, Listing, PartId, Screen, ToolId } from './types';

export const START_MONEY = 6000;
export const BAYS = 2;
/** Sekunden, bis der Motor im Stand warm ist. */
export const WARM_AFTER = 9;
export type Panel = 'cabinet' | 'computer' | 'shop' | 'bench' | 'obd' | 'drive' | 'report' | 'help' | 'file' | null;

interface Toast {
  id: number;
  text: string;
  bad: boolean;
}

export interface GameState {
  // --- gespeicherter Spielstand ---
  money: number;
  screen: Screen;
  /** Ein Stellplatz je Hebebühne; null = frei. Kundenautos tragen `job`. */
  cars: (CarInstance | null)[];
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
  tapBody(bay: number): void;
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
}

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
  return { ...car, partsSpent: car.partsSpent ?? 0, observed: car.observed ?? [], components };
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
          set({ cars, inventory, liftUp });
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
        cars: [null, null],
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
        lastSale: null,
        driveReport: null,

        newGame: () => {
          stopEngine();
          set({
            money: START_MONEY,
            cars: [null, null],
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
          set({ selected: i, screen: 'market', panel: null, marketNote: null });
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
          const bay = s.cars.findIndex((c) => !c);
          if (bay < 0) return s.say('Beide Hebebühnen sind belegt.', true);
          if (amount > s.money) return s.say('So viel Geld hast du nicht.', true);
          const listings = clone(s.listings);
          const l = listings[s.selected];
          if (l.gone) return;
          const r = makeOffer(l, amount, args);
          if (!r.accepted) {
            sfx.error();
            return set({ listings });
          }
          sfx.cash();
          engineAudio.stop();
          // Was bei der Besichtigung aufgefallen ist, steht schon in der Fahrzeugakte.
          const car: CarInstance = { ...l.car, purchasePrice: r.price, lifted: false, hoodOpen: false, observed: [...l.hints] };
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
            jobs: refreshJobs(s.jobs, Math.random),
            selected: 0,
          });
          get().say(`Tag ${s.day + 1}: neue Angebote auf dem Markt und neue Kundenanfragen.`);
        },

        acceptJob: (i) => {
          const s = get();
          const bay = s.cars.findIndex((c) => !c);
          if (bay < 0) return s.say('Keine Hebebühne frei – erst ein Auto verkaufen oder einen Auftrag abschließen.', true);
          const offer = s.jobs[i];
          if (!offer) return;
          sfx.clunk();
          const cars = [...s.cars];
          cars[bay] = { ...offer.car, lifted: false, hoodOpen: false };
          const liftUp = [...s.liftUp];
          liftUp[bay] = false;
          set({ cars, liftUp, jobs: s.jobs.filter((_, k) => k !== i) });
          s.say(`Auftrag angenommen: ${offer.car.job!.customer} hat den Wagen auf Hebebühne ${bay + 1} abgestellt.`);
        },

        returnJob: (bay, unrepaired = false) => {
          const s = get();
          const car = s.cars[bay];
          if (!car?.job) return;
          const bill = billJob(car);
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
          if (s.cars[bay]) return void act(bay, (car) => repair.toggleLift(car), 'clunk');
          const liftUp = [...s.liftUp];
          liftUp[bay] = !liftUp[bay];
          sfx.clunk();
          set({ liftUp });
        },
        /** Tipp auf Karosserie oder Motorblock: OBD anschließen bzw. Sichtprüfung mit der Lampe. */
        tapBody: (bay) => {
          const s = get();
          const car = s.cars[bay];
          if (!car) return;
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
          const drove: Channel[] = ['idle', 'sound', 'dash', 'rev', 'drive'];
          observe(car, drove, true);
          // Bericht: alles, was bei dieser Fahrt zu spüren oder zu hören war.
          const report = car.observed.filter((id) => SYMPTOMS[id] && drove.includes(SYMPTOMS[id].channel));
          sfx.cash();
          const cars = [...s.cars];
          cars[s.driveBay] = car;
          set({ cars, screen: 'garage', panel: 'report', panelBay: s.driveBay, driveReport: report.map((id) => SYMPTOMS[id].text) });
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
          if (s.engineBay === bay) stopEngine();
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
            lastSale: { title: 'Verkauft!', price, profit },
          });
        },
        dismissSale: () => set({ lastSale: null }),
      };
    },
    {
      name: 'garage-kings-save-v1',
      version: 3,
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
        return s;
      },
      merge: (persisted: any, current) => {
        const p = persisted ?? {};
        const merged = { ...current, ...p } as GameState;
        merged.cars = Array.from({ length: BAYS }, (_, i) => normalizeCar(p.cars?.[i] ?? null));
        merged.liftUp = merged.cars.map((c, i) => (c ? c.lifted : !!p.liftUp?.[i]));
        merged.inventory = { ...emptyInventory(), ...(p.inventory ?? {}) };
        merged.carried = (p.carried ?? []).filter((t: ToolId) => TOOL_MAP[t] && TOOL_MAP[t].kind !== 'builtin').slice(0, MAX_CARRIED);
        if (!TOOL_MAP[merged.tool] || (TOOL_MAP[merged.tool].kind !== 'builtin' && !merged.carried.includes(merged.tool))) merged.tool = 'hand';
        merged.listings = (p.listings ?? [])
          .filter((l: Listing) => l && l.profile && l.car)
          .map((l: Listing) => ({ ...l, usedArgs: l.usedArgs ?? [], gone: !!l.gone, car: normalizeCar(l.car)! }));
        merged.jobs = (p.jobs ?? []).filter((j: JobOffer) => j?.car?.job).map((j: JobOffer) => ({ ...j, car: normalizeCar(j.car)! }));
        merged.sound = p.sound ?? true;
        if (merged.started) {
          if (merged.listings.length === 0) merged.listings = fillListings([], merged.money, Math.random, merged.marketIndex);
          if (merged.jobs.length === 0) merged.jobs = fillJobs([], Math.random);
        }
        setMuted(!merged.sound);
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
