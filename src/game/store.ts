import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { gatedStorage, saveGate } from './saveGate';
import { engineAudio, setMuted, sfx } from './audio';
import { advanceAuction, createAuction, heldMoney, MAX_AUCTIONS, placeBid, seeded } from './auctions';
import { COMPONENT_MAP, defOf, defsOf, engineOf } from './data/components';
import { ACHIEVEMENTS, countRepair, emptyCareer, newlyAchieved, type Career } from './career';
import { performance } from './performance';
import { createContest, createMeet, enterMeet, meetBlocker, resolveContest, type Contest, type ContestResult, type Meet } from './contests';
import { basePartPrice, fitOf, migrateInventory, partKey } from './fitment';
import { CAR_MODELS } from './data/cars';
import { DEFECTS } from './data/defects';
import { FLUID_PRODUCTS } from './data/fluids';
import { PARTS } from './data/parts';
import { availableSlots, isJunk, isLift, SHOWROOM_BONUS, SLOT_COUNT, SLOTS, STAND_SLOT, UPGRADES, type UpgradeId } from './data/workshop';
import { createZones, PAINT_COLORS, PAINT_TOOLS, paintAction, WASH_TOOLS, washAction } from './detail';
import { extraWorkEvent, rollEvents } from './events';
import * as fluids from './fluids';
import { MAX_CARRIED, TOOL_MAP } from './data/tools';
import { SYMPTOMS, type Channel } from './data/symptoms';
import { obdScan, observe, soundProfile, type Observation } from './diagnosis';
import { billJob, fillJobs, refreshJobs } from './jobs';
import { BARN_TRANSPORT, fillListings, freshComponents, inspectListing, makeOffer, nextMarketIndex, refreshListings, valuate } from './market';
import * as repair from './repair';
import type { ActionResult, Auction, BoltState, CarInstance, DefectId, EcuTune, FluidId, FluidProduct, FluidStock, GameEvent, Inventory, JobOffer, Listing, PartId, Screen, ToolId, VisualTune, ZoneId } from './types';
import { tuningDamage, asStand, engineTest, engineValue, extractEngine, fromStand, insertEngine, junkEnginePrice, junkPartPrice, motorLabel, removalSteps, swapPlan, unitComplete, type EngineUnit, type UsedPart } from './motor';
import { refreshJunk } from './junkyard';
import { VISUAL_MAP, mountedId } from './data/visual';
import { ENGINES } from './data/engines';

export const START_MONEY = 6000;
const noSlots = (): boolean[] => Array(SLOT_COUNT).fill(false);
/** Sekunden, bis der Motor im Stand warm ist. */
export const WARM_AFTER = 9;
export type Panel = 'crane' | 'engines' | 'junk' | 'tuning' | 'enginetest' | 'coop' | 'dyno' | 'cabinet' | 'computer' | 'shop' | 'bench' | 'obd' | 'drive' | 'report' | 'help' | 'file' | 'fluids' | 'move' | null;

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
  /** Motorlager: ausgebaute Motoren als eigenständige Objekte. */
  engines: EngineUnit[];
  /** Motor, der gerade am Motorkran hängt. */
  crane: EngineUnit | null;
  /** Gebrauchtteile mit eigener Kennung (Schrottplatz, Umbauten). */
  used: UsedPart[];
  /** Optik-Lager: Anzahl je optischem Tuningteil. */
  visualStock: Record<string, number>;
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
  /** Laufender Händler-Wettbewerb und heutiges Fahrzeugtreffen. */
  contest: Contest | null;
  meet: Meet | null;
  contestResult: ContestResult | null;
  joinContest(): void;
  enterMeet(slot: number): void;
  dismissContestResult(): void;
  /** Karrierezähler und bereits belohnte Erfolge. */
  career: Career;
  achieved: string[];
  /** Gerade erreichter Erfolg (Einblendung). */
  unlocked: { title: string; reward: number }[];
  dismissUnlocked(): void;
  /** Auto auf den Leistungsprüfstand stellen und messen. */
  runDyno(slot: number): void;
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
  partPrompt: { bay: number; compId: string; partId: PartId; choose?: boolean } | null;
  /** Letzte Messung am Motorprüfstand. */
  engineReport: { title: string; compression: number[]; nominal: number; oilPressure: number; findings: string[] } | null;
  /** Für welches Auto der Teileshop gerade Teile anzeigt (Stellplatz). */
  shopSlot: number;
  setShopSlot(slot: number): void;
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
  /** Vordertür öffnen/schließen (0 = links, 1 = rechts). */
  toggleDoor(slot: number, side: number): void;
  tapLift(bay: number): void;
  tapBody(bay: number, zone?: ZoneId): void;
  tapBolt(bay: number, compId: string, index: number): void;
  tapConnector(bay: number, compId: string): void;
  tapComponent(bay: number, compId: string, useOldPart?: boolean): void;
  closePartPrompt(): void;
  /** Bestellt ein Teil in der Passform des Autos auf diesem Stellplatz. */
  buyPart(id: PartId, slot?: number): void;
  /** Umbauteil für einen bestimmten Motor bestellen (Lagerschlüssel aus dem Umbauplan). */
  buySwapPart(id: PartId, key: string): void;
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
  /** Bauteil mit einem bestimmten Teil einbauen (Neu-, Tuning-, Gebraucht- oder Altteil). */
  installWith(bay: number, compId: string, choice: InstallChoice): void;
  /** Motor mit dem Kran aus dem Auto heben (Werkstatt) bzw. am Schrottplatz kaufen und ausbauen. */
  liftEngine(slot: number): void;
  craneToStand(): void;
  standToCrane(): void;
  craneToStorage(): void;
  storageToCrane(uid: string): void;
  /** Motor vom Kran in das Auto auf dieser Hebebühne einsetzen (Motorumbau). */
  installEngine(slot: number): void;
  flipEngine(): void;
  testEngine(): void;
  sellEngine(uid: string): void;
  sellUsed(id: string): void;
  /** Gebrauchtteil an der Werkbank prüfen (zeigt versteckte Defekte). */
  checkUsed(id: string): void;
  buyJunkCar(slot: number): void;
  /** Optisches Teil an einem Schrottauto abbauen und kaufen. */
  junkVisual(slot: number, field: keyof VisualTune): void;
  fitTurboKit(slot: number): void;
  setEcu(slot: number, ecu: Partial<EcuTune>, buyMap?: number): void;
  buyVisual(id: string): void;
  mountVisual(slot: number, id: string): void;
  unmountVisual(slot: number, field: keyof VisualTune): void;
  setDrop(slot: number, cm: number): void;
  claimWaiting(): void;
  acceptEvent(id: string): void;
  dismissEvent(id: string): void;
}

/** Aktueller Preis eines Ersatzteils inklusive Sonderangebot und Großhandelsrabatt. */
export type InstallChoice = { kind: 'new' } | { kind: 'variant'; part: PartId } | { kind: 'used'; id: string } | { kind: 'old' };

/** Was zum Einbau eines Bauteils gerade bereitliegt (Neuteil, Tuningteile, passende Gebrauchtteile). */
export function installOptions(s: Pick<GameState, 'inventory' | 'used'>, car: CarInstance, compId: string) {
  const def = defOf(car, compId);
  const st = car.components[compId];
  if (!def.partId || !st || st.installed) return null;
  const parts = [def.partId, ...(def.variants ?? [])];
  return {
    newStock: s.inventory[partKey(car, def.partId)] ?? 0,
    variants: (def.variants ?? []).map((v) => ({ part: v, stock: s.inventory[partKey(car, v)] ?? 0 })).filter((v) => v.stock > 0),
    used: s.used.filter((u) => parts.includes(u.part) && u.fit === fitOf(car, u.part)),
    old: !st.missing,
  };
}

export function partPrice(s: Pick<GameState, 'events' | 'upgrades' | 'day'>, id: PartId, car?: CarInstance | null): number {
  const sale = s.events.find((e) => e.type === 'parts_sale' && e.sale?.partId === id && e.expiresDay >= s.day);
  const factor = (sale ? 1 - sale.sale!.pct / 100 : 1) * (s.upgrades.includes('expansion') ? 0.9 : 1);
  return Math.round((car ? basePartPrice(car, id) : PARTS[id].price) * factor);
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
const emptyInventory = (): Inventory => ({});
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
let toastId = 0;

/**
 * Bringt ein Auto aus einem älteren Spielstand auf den aktuellen Stand:
 * fehlende Bauteile und Felder bekommen sichere Standardwerte, Schrauben
 * aus der Zeit mit nur zwei Zuständen werden umgerechnet.
 */
export function normalizeCar(car: CarInstance | null): CarInstance | null {
  if (!car) return null;
  const modelId = CAR_MODELS[car.modelId] ? car.modelId : 'bavaria_320';
  // Fehlende Felder bekommen feste, aus der Fahrzeug-ID abgeleitete Standardwerte (kein Würfeln bei jedem Laden).
  const rng = seeded(hash(car.uid ?? 'auto'));
  const shape = { modelId, motor: car.motor, bare: car.bare };
  const fresh = freshComponents(shape);
  const defs = defsOf(shape);
  const components: CarInstance['components'] = {};
  const added: string[] = [];
  for (const id of Object.keys(fresh)) {
    const old = car.components?.[id] as any;
    const health = fresh[id].health === undefined ? undefined : typeof old?.health === 'number' ? old.health : old?.condition === 'defect' ? Math.round(rng() * 22) : Math.round(60 + rng() * 38);
    if (!old) {
      // Bauteil gab es früher nicht (z. B. Zylinder 5 und 6 am Sechszylinder): heil und eingebaut.
      components[id] = { ...fresh[id], ...(health === undefined ? {} : { health }) };
      added.push(id);
      continue;
    }
    const bolts = fresh[id].bolts.map((_, i): BoltState => {
      const b = old.bolts?.[i];
      return b === true || b === 2 || b === undefined ? 2 : b === 1 ? 1 : 0;
    });
    components[id] = {
      installed: !!old.installed, bolts, connected: old.connected ?? true, condition: old.condition === 'defect' ? 'defect' : 'ok', known: !!old.known,
      ...(health === undefined ? {} : { health }), ...(old.variant ? { variant: old.variant } : {}), ...(old.missing ? { missing: true } : {}),
    };
  }
  // Ein neu hinzugekommenes Teil darf nichts versperren, was der Spieler schon ausgebaut hat:
  // liegt ein Teil darunter draußen, liegt auch das neue ausgebaut (und heil) daneben.
  for (let again = true; again; ) {
    again = false;
    for (const id of added) {
      if (components[id].installed && defs.some((d) => d.blockedBy.includes(id) && components[d.id] && !components[d.id].installed)) {
        components[id] = { ...components[id], installed: false, bolts: components[id].bolts.map(() => 0 as BoltState), connected: false };
        again = true;
      }
    }
  }
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
      const tools = () => ({ active: get().tool, carried: get().carried, equipment: get().upgrades as string[] });

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
          liftUp[bay] = isLift(bay) ? car.lifted : false;
          // Zusatzbefund am Kundenauto: Der Kunde wird gefragt, statt dass ungefragt repariert und berechnet wird.
          let events = s.events;
          if (car.job) {
            for (const d of repair.knownDefects(car)) {
              if (car.job.required.includes(d) || car.job.asked?.includes(d)) continue;
              car.job.asked = [...(car.job.asked ?? []), d];
              events = [...events, extraWorkEvent(car.uid, car.job.customer, d, DEFECTS[d].name, s.day)];
            }
          }
          // Kapitaler Schaden behoben? (Kopfdichtung oder Getriebe gegen ein Neuteil getauscht)
          const severe = ['head_gasket', 'gearbox'].filter((id) => current.components[id]?.condition === 'defect' && car.components[id]?.condition === 'ok').length;
          set({ cars, inventory, liftUp, events, ...(severe ? { career: { ...s.career, severeFixed: s.career.severeFixed + severe } } : {}) });
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

      /** Schrottplatz: Was man ausbaut, kauft man – als Gebrauchtteil mit eigener Kennung. Eingebaut wird hier nichts. */
      const junkComponent = (bay: number, compId: string) => {
        const s = get();
        const cur = s.cars[bay];
        if (!cur) return;
        const was = cur.components[compId];
        if (!was) return;
        if (!was.installed && s.tool !== 'lamp') {
          sfx.error();
          return s.say(was.missing ? 'Dieses Teil fehlt schon – das hat jemand anderes ausgebaut.' : 'Am Schrottauto wird nichts eingebaut.', true);
        }
        const car = clone(cur);
        const r = repair.componentAction(car, clone(s.inventory), compId, tools());
        if (!r.ok || car.components[compId].installed) {
          if (!r.ok) sfx.error();
          return void (r.message && s.say(r.message, !r.ok));
        }
        const def = defOf(cur, compId);
        if (!def.partId) {
          const cars = [...s.cars];
          cars[bay] = car;
          sfx.clunk();
          set({ cars });
          return s.say(`${def.name} abgebaut und zur Seite gelegt.`);
        }
        const price = junkPartPrice(cur, compId);
        if (s.money - heldMoney(s.auctions) < price) {
          sfx.error();
          return s.say(`${def.name} kostet ${price} € – dafür reicht das Geld nicht.`, true);
        }
        const st = car.components[compId];
        const part = was.variant ?? def.partId;
        const item: UsedPart = {
          id: `u-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
          part,
          fit: fitOf(cur, part),
          condition: was.condition,
          known: was.known,
          ...(was.health !== undefined ? { health: was.health } : {}),
          km: cur.motor?.km ?? cur.km,
          from: `${CAR_MODELS[cur.modelId].name} (Schrottplatz)`,
          price,
        };
        Object.assign(st, { missing: true, known: was.known });
        const cars = [...s.cars];
        cars[bay] = car;
        sfx.cash();
        set({ cars, money: s.money - price, used: [...s.used, item] });
        s.say(`Ausgebaut und gekauft: ${PARTS[part].name} für ${price} €${was.known ? '' : ' – Zustand ungeprüft'}. Liegt im Gebrauchtteile-Lager.`);
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
        drainPan: noSlots(),
        auctions: [],
        waiting: [],
        events: [],
        liftUp: noSlots(),
        engines: [],
        crane: null,
        used: [],
        visualStock: {},
        engineReport: null,
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
        contest: null,
        meet: null,
        contestResult: null,
        dismissContestResult: () => set({ contestResult: null }),
        joinContest: () => {
          const s = get();
          const c = s.contest;
          if (!c || c.joined) return;
          if (s.money - heldMoney(s.auctions) < c.fee) return s.say('Für das Startgeld reicht das freie Geld nicht.', true);
          sfx.cash();
          set({ money: s.money - c.fee, contest: { ...c, joined: true, baseline: s.totalProfit } });
          s.say(`Angemeldet: ${c.title}. Ausgewertet wird am Morgen nach Tag ${c.endDay}.`);
        },
        enterMeet: (slot) => {
          const s = get();
          const m = s.meet;
          const car = s.cars[slot];
          if (!m || m.result || !car) return;
          const blocker = meetBlocker(car);
          if (blocker) return s.say(blocker, true);
          if (s.money - heldMoney(s.auctions) < m.fee) return s.say('Für das Startgeld reicht das freie Geld nicht.', true);
          const result = enterMeet(m, car, s.day);
          sfx.cash();
          set({
            money: s.money - m.fee + result.payout,
            meet: { ...m, result },
            contestResult: result,
            career: result.place === 1 ? { ...s.career, meetsWon: s.career.meetsWon + 1 } : s.career,
          });
        },
        career: emptyCareer(),
        achieved: [],
        unlocked: [],
        dismissUnlocked: () => set({ unlocked: [] }),
        runDyno: (slot) => {
          const s = get();
          const car = s.cars[slot];
          if (!car) return;
          if (!s.upgrades.includes('dyno')) return s.say('Dafür brauchst du den Leistungsprüfstand (Werkstatt-Computer → Ausbau).', true);
          const blocker = repair.driveBlocker(car);
          if (blocker) return s.say(`Prüfstand: ${blocker}`, true);
          if (s.engineBay !== null) stopEngine();
          const p = performance(car);
          const cars = [...s.cars];
          const measured = clone(car);
          const damage = tuningDamage(measured, p.output.risks, Math.random);
          cars[slot] = { ...measured, dyno: { ps: p.ps, nm: p.nm, ratedPs: p.ratedPs, day: s.day } };
          if (damage.length) setTimeout(() => get().say(`Prüfstand: ${damage.join(' ')}`, true), 300);
          set({ cars, career: { ...s.career, dynoRuns: s.career.dynoRuns + 1 }, panel: 'dyno', panelBay: slot });
          // Volllast auf der Rolle ist wie eine Probefahrt: man hört und sieht, was der Motor macht.
          engineAudio.demo(soundProfile(car), true);
          perceive(slot, ['idle', 'sound', 'dash', 'rev', 'drive'], true, 'Messung abgeschlossen – beim Lauf auf der Rolle fällt dir nichts weiter auf.');
        },
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
        shopSlot: 0,
        marketNote: null,
        marketSource: 'listings',
        paintColor: PAINT_COLORS[0],
        lastSale: null,
        driveReport: null,

        newGame: () => {
          stopEngine();
          set({
            money: START_MONEY,
            cars: refreshJunk(Array(SLOT_COUNT).fill(null), Math.random, 1),
            engines: [],
            crane: null,
            used: [],
            visualStock: {},
            upgrades: [],
            fluidStock: emptyStock(),
            drainPan: noSlots(),
            auctions: [createAuction(Math.random, 1, Date.now())],
            waiting: [],
            events: [],
            liftUp: noSlots(),
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
            career: emptyCareer(),
            achieved: [],
            unlocked: [],
            contest: null,
            meet: null,
            contestResult: null,
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
          if (isLift(bay)) liftUp[bay] = false;
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
            if (!c || c.bare || c.junk) return c;
            const car = clone(c);
            fluids.dailyLeaks(car);
            return car;
          });
          const events = rollEvents(s.events, Math.random, { day, marketIndex, deals: s.carsSold + s.jobsDone, now: Date.now() });
          const fresh = events.filter((e) => !s.events.includes(e));
          const auctions = s.auctions.filter((a) => !a.result);
          while (auctions.length < MAX_AUCTIONS) auctions.push(createAuction(Math.random, marketIndex, Date.now()));
          // Wettbewerb auswerten, wenn sein letzter Tag vorbei ist; alle paar Tage wird ein neuer ausgeschrieben.
          const view = { cars, totalProfit: s.totalProfit, money: s.money, marketIndex };
          let { contest, career, money } = s;
          let contestResult = s.contestResult;
          if (contest && day > contest.endDay) {
            if (contest.joined) {
              contestResult = resolveContest(contest, view);
              money += contestResult.payout;
              if (contestResult.place === 1) career = { ...career, competitionsWon: career.competitionsWon + 1 };
            }
            contest = null;
          }
          if (!contest && day >= 3 && day % 2 === 1) contest = createContest(Math.random, day, view);
          // Treffen finden an jedem dritten Tag statt und gelten nur für diesen Tag.
          const meet = day % 3 === 0 ? createMeet(Math.random, day, s.money) : null;
          set({
            contest,
            contestResult,
            career,
            money,
            meet,
            day,
            marketIndex,
            cars: refreshJunk(cars, Math.random, day),
            events,
            auctions,
            listings: refreshListings(s.listings, money, Math.random, marketIndex, day),
            jobs: refreshJobs(s.jobs, Math.random),
            selected: 0,
          });
          get().say(`Tag ${day}: neue Angebote, Auktionen und Kundenanfragen.${fresh.length ? ` Neuigkeit: ${fresh[0].title}.` : ''}${meet ? ` Heute: ${meet.title}.` : ''}`);
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
          if (isLift(bay)) liftUp[bay] = false;
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
            career: bill.done ? countRepair(s.career, car) : s.career,
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
        toggleDoor: (slot, side) => {
          const s = get();
          const car = s.cars[slot];
          if (!car) return;
          const doors = [!!car.doors?.[0], !!car.doors?.[1]];
          doors[side] = !doors[side];
          const cars = [...s.cars];
          cars[slot] = { ...car, doors };
          sfx.clunk();
          set({ cars });
        },
        tapLift: (bay) => {
          const s = get();
          if (!isLift(bay)) return;
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
          if (isJunk(bay)) return junkComponent(bay, compId);
          {
            // Einbau: liegen Tuning- oder Gebrauchtteile bereit, darf der Spieler wählen.
            const s0 = get();
            const car0 = s0.cars[bay];
            const opt = car0 && s0.tool === 'hand' && !useOldPart ? installOptions(s0, car0, compId) : null;
            if (opt && (opt.variants.length || opt.used.length) && repair.blockersRemoved(car0!, compId)) {
              return set({ partPrompt: { bay, compId, partId: defOf(car0!, compId).partId!, choose: true }, shopSlot: bay });
            }
          }
          const before = get().cars[bay];
          if (compId === 'drain_plug' && before?.components.drain_plug?.installed && !get().drainPan[bay] && get().tool !== 'lamp') {
            sfx.error();
            return get().say('Erst die Auffangwanne unter den Motor stellen – sonst läuft das Altöl auf den Boden.', true);
          }
          const r = act(bay, (car, inv) => repair.componentAction(car, inv, compId, tools(), { useOldPart }), 'clunk');
          set(r?.needsPart ? { partPrompt: { bay, compId, partId: r.needsPart }, shopSlot: bay } : { partPrompt: null });
        },
        closePartPrompt: () => set({ partPrompt: null }),
        setShopSlot: (shopSlot) => set({ shopSlot }),

        buyPart: (id, slot) => {
          const s = get();
          // Ohne Angabe: das im Shop gewählte Auto, sonst das erste vorhandene.
          const at = slot ?? (s.cars[s.shopSlot] ? s.shopSlot : s.cars.findIndex(Boolean));
          const car = at >= 0 ? s.cars[at] : null;
          if (!car) return s.say('Wähle zuerst das Auto, für das du bestellst.', true);
          const p = PARTS[id];
          const price = partPrice(s, id, car);
          const key = partKey(car, id);
          if (s.money - heldMoney(s.auctions) < price) return s.say('Dafür reicht das freie Geld nicht.', true);
          sfx.cash();
          set({ money: s.money - price, inventory: { ...s.inventory, [key]: (s.inventory[key] ?? 0) + p.units } });
          s.say(`Bestellt: ${p.name} für ${fitOf(car, id)} (−${price.toLocaleString('de-DE')} €). Liegt im Ersatzteilregal.`);
        },

        buySwapPart: (id, key) => {
          const s = get();
          const price = Math.round(PARTS[id].price * (s.upgrades.includes('expansion') ? 0.9 : 1));
          if (s.money - heldMoney(s.auctions) < price) return s.say('Dafür reicht das freie Geld nicht.', true);
          sfx.cash();
          set({ money: s.money - price, inventory: { ...s.inventory, [key]: (s.inventory[key] ?? 0) + 1 } });
          s.say(`Bestellt: ${PARTS[id].name} (−${price.toLocaleString('de-DE')} €). Liegt im Ersatzteilregal.`);
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
          const tuning = tuningDamage(car, performance(current).output.risks, Math.random);
          if (car.motor) car.motor = { ...car.motor, km: car.motor.km + 12 };
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
            driveReport: [...report.map((id) => SYMPTOMS[id].text), ...(oilDamage ? ['Mit viel zu wenig Öl gefahren: Unter Last klackert es jetzt aus dem Motor.'] : []), ...tuning],
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
          // Aus dem Showroom heraus verkauft sich ein Auto teurer.
          const price = Math.round(((car.haggled ? v.haggleOffer : v.offer) * (SLOTS[bay].kind === 'show' ? 1 + SHOWROOM_BONUS : 1)) / 50) * 50;
          const profit = price - car.purchasePrice - car.partsSpent;
          const cars = [...s.cars];
          cars[bay] = null;
          const liftUp = [...s.liftUp];
          if (isLift(bay)) liftUp[bay] = false;
          sfx.cash();
          const c0 = countRepair(s.career, car);
          set({
            career: {
              ...c0,
              bestSale: Math.max(c0.bestSale, price),
              bestProfit: Math.max(c0.bestProfit, profit),
              barnSold: c0.barnSold + (car.origin === 'barn' ? 1 : 0),
              cleanSales: c0.cleanSales + (v.deductions.length === 0 ? 1 : 0),
            },
            money: s.money + price,
            cars,
            liftUp,
            carsSold: s.carsSold + 1,
            totalProfit: s.totalProfit + profit,
            listings: fillListings(s.listings, s.money + price, Math.random, s.marketIndex, false, s.day),
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
          const upgrades = [...new Set([...s.upgrades, id, ...(u.grants ?? [])])];
          set({ money: s.money - u.price, upgrades });
          s.say(u.equipment ? `Geliefert: ${u.name}.` : u.location ? `Eröffnet: ${u.name}. Der Durchgang ist in der Hallenwand – sieh dich um.` : `Ausbau fertig: ${u.name}. Sieh es dir draußen im Hof an.`);
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
          if (s.drainPan[bay] && car && car.components.drain_plug?.installed === false) return s.say('Die Wanne bleibt stehen, solange die Ablassschraube draußen ist.', true);
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
        installWith: (bay, compId, choice) => {
          const s = get();
          const cur = s.cars[bay];
          if (!cur) return;
          const car = clone(cur);
          const def = defOf(car, compId);
          const inventory = { ...s.inventory };
          let used = s.used;
          let source: Parameters<typeof repair.componentAction>[4] = {};
          if (choice.kind === 'old') source = { useOldPart: true };
          else if (choice.kind === 'variant') {
            const key = partKey(car, choice.part);
            if (!(inventory[key] > 0)) return s.say('Dieses Tuningteil liegt nicht im Lager.', true);
            inventory[key] -= 1;
            source = { source: { condition: 'ok', known: true, health: 100, variant: choice.part, cost: basePartPrice(car, choice.part), label: `${PARTS[choice.part].name} (Tuning)` } };
          } else if (choice.kind === 'used') {
            const u = s.used.find((x) => x.id === choice.id);
            if (!u) return s.say('Das Gebrauchtteil ist nicht mehr da.', true);
            used = s.used.filter((x) => x.id !== u.id);
            source = { source: { condition: u.condition, known: u.known, health: u.health, variant: u.part !== def.partId ? u.part : undefined, cost: u.price, label: `${PARTS[u.part].name} (gebraucht, ${u.km.toLocaleString('de-DE')} km, aus ${u.from})` } };
          }
          const r = repair.componentAction(car, inventory, compId, tools(), source);
          if (!r.ok) {
            set({ partPrompt: r.needsPart ? { bay, compId, partId: r.needsPart } : null });
            sfx.error();
            return s.say(r.message ?? 'Geht so nicht.', true);
          }
          sfx.clunk();
          const cars = [...s.cars];
          cars[bay] = car;
          set({ cars, inventory, used, partPrompt: null });
          if (r.message) s.say(r.message);
        },

        liftEngine: (slot) => {
          const s = get();
          const cur = s.cars[slot];
          if (!cur || cur.bare) return;
          if (cur.motor === null) return s.say('In diesem Auto ist kein Motor.', true);
          const junk = isJunk(slot);
          if (!junk && !isLift(slot)) return s.say('Motoren baust du auf einer Hebebühne aus.', true);
          if (!junk && !s.upgrades.includes('hoist')) return s.say('Dafür brauchst du den Motorkran (Werkstatt-Computer → Ausbau: Motor- und Getriebeheber).', true);
          if (!junk && s.crane) return s.say('Am Kran hängt schon ein Motor – erst absetzen.', true);
          if (s.engineBay === slot) return s.say('Erst den Motor abstellen.', true);
          const open = removalSteps(cur).find((x) => !x.done);
          if (open) return s.say(`Noch nicht bereit zum Herausheben: ${open.label}.`, true);
          const car = clone(cur);
          const unit = extractEngine(car);
          unit.motor.history = [...unit.motor.history, `Tag ${s.day}: ausgebaut aus ${CAR_MODELS[car.modelId].name}${junk ? ' (Schrottplatz)' : ''}`];
          const cars = [...s.cars];
          cars[slot] = car;
          sfx.clunk();
          if (junk) {
            const price = junkEnginePrice(unit) + 40;
            if (s.money - heldMoney(s.auctions) < price) return s.say(`Motor kostet ${price.toLocaleString('de-DE')} € (inkl. Kranmiete) – dafür reicht das Geld nicht.`, true);
            set({ cars, money: s.money - price, engines: [...s.engines, unit] });
            return s.say(`Motor gekauft und ausgebaut: ${motorLabel(unit.motor)} für ${price.toLocaleString('de-DE')} € (inkl. 40 € Kranmiete). Er wird ins Motorlager der Werkstatt geliefert.`);
          }
          set({ cars, crane: unit });
          s.say(`Motor hängt am Kran: ${motorLabel(unit.motor)}. Jetzt auf den Motorständer setzen oder ins Lager stellen.`);
        },

        craneToStand: () => {
          const s = get();
          if (!s.crane) return s.say('Am Kran hängt kein Motor.', true);
          if (s.cars[STAND_SLOT]) return s.say('Auf dem Motorständer sitzt schon ein Motor.', true);
          const cars = [...s.cars];
          cars[STAND_SLOT] = asStand(s.crane, 'bavaria_320');
          sfx.clunk();
          set({ cars, crane: null });
          s.say('Motor sitzt auf dem Motorständer. Mit „Motor drehen“ kommst du an die Unterseite.');
        },
        standToCrane: () => {
          const s = get();
          const car = s.cars[STAND_SLOT];
          if (!car) return s.say('Auf dem Motorständer sitzt kein Motor.', true);
          if (s.crane) return s.say('Am Kran hängt schon ein Motor.', true);
          const cars = [...s.cars];
          cars[STAND_SLOT] = null;
          sfx.clunk();
          set({ cars, crane: fromStand(clone(car)) });
          s.say('Motor hängt am Kran.');
        },
        craneToStorage: () => {
          const s = get();
          if (!s.crane) return s.say('Am Kran hängt kein Motor.', true);
          if (s.engines.length >= 8) return s.say('Das Motorlager ist voll (8 Paletten) – erst einen Motor verkaufen.', true);
          sfx.clunk();
          set({ engines: [...s.engines, s.crane], crane: null });
          s.say('Motor auf einer Palette im Motorlager abgestellt.');
        },
        storageToCrane: (uid) => {
          const s = get();
          const unit = s.engines.find((u) => u.motor.uid === uid);
          if (!unit) return;
          if (s.crane) return s.say('Am Kran hängt schon ein Motor.', true);
          sfx.clunk();
          set({ engines: s.engines.filter((u) => u.motor.uid !== uid), crane: unit });
          s.say(`Motor am Kran: ${motorLabel(unit.motor)}.`);
        },
        installEngine: (slot) => {
          const s = get();
          const cur = s.cars[slot];
          const unit = s.crane;
          if (!unit) return s.say('Erst einen Motor an den Kran hängen.', true);
          if (!cur || !isLift(slot)) return s.say('Motoren setzt du in ein Auto auf einer Hebebühne ein.', true);
          if (cur.motor !== null) return s.say('In diesem Auto ist noch ein Motor – erst ausbauen.', true);
          if (cur.lifted || !cur.hoodOpen) return s.say('Auto ablassen und Motorhaube öffnen.', true);
          if (!unitComplete(unit)) return s.say('Der Motor ist nicht komplett montiert – erst auf dem Ständer fertig zusammenbauen.', true);
          const plan = swapPlan(cur, unit.motor.engineId);
          if (!plan.possible) return s.say(plan.reasons.join(' '), true);
          const missing = plan.needs.filter((n) => !(s.inventory[n.key] > 0));
          if (missing.length) return s.say(`Für diesen Umbau fehlen: ${missing.map((n) => PARTS[n.part].name).join(', ')} (Teileshop → Umbau).`, true);
          const inventory = { ...s.inventory };
          for (const n of plan.needs) inventory[n.key] -= 1;
          const car = clone(cur);
          insertEngine(car, unit, plan.needs.map((n) => n.part), s.day);
          car.partsSpent += plan.needs.reduce((sum, n) => sum + PARTS[n.part].price, 0);
          const cars = [...s.cars];
          cars[slot] = car;
          sfx.clunk();
          set({ cars, inventory, crane: null });
          s.say(`${motorLabel(unit.motor)} eingesetzt (${plan.label}). Jetzt Motorlager, Kabelbaum, Hosenrohr, Schläuche und Batterie wieder anschließen, Öl und Kühlmittel auffüllen.`);
        },
        flipEngine: () => {
          const s = get();
          const car = s.cars[STAND_SLOT];
          if (!car) return;
          const cars = [...s.cars];
          cars[STAND_SLOT] = { ...car, lifted: !car.lifted };
          sfx.clunk();
          set({ cars });
          s.say(car.lifted ? 'Motor zurückgedreht – Oberseite oben.' : 'Motor gedreht – die Unterseite (Ölwanne, Lager, Kurbelwelle) liegt jetzt oben.');
        },
        testEngine: () => {
          const s = get();
          const car = s.cars[STAND_SLOT];
          if (!car) return;
          if (!repair.isAssembled(car)) return s.say('Für Kompressions- und Öldruckprüfung muss der Motor komplett montiert sein.', true);
          const t = engineTest(fromStand(car));
          const cars = [...s.cars];
          cars[STAND_SLOT] = { ...car, motor: { ...car.motor!, history: [...car.motor!.history, `Tag ${s.day}: Prüfstand – Kompression ${t.compression.join('/')} bar, Öldruck ${t.oilPressure} bar`] } };
          set({ cars, engineReport: { title: motorLabel(car.motor!), ...t }, panel: 'enginetest' });
        },
        sellEngine: (uid) => {
          const s = get();
          const unit = s.engines.find((u) => u.motor.uid === uid);
          if (!unit) return;
          const price = engineValue(unit);
          sfx.cash();
          set({ engines: s.engines.filter((u) => u.motor.uid !== uid), money: s.money + price });
          s.say(`Motor verkauft: ${motorLabel(unit.motor)} für ${price.toLocaleString('de-DE')} €.`);
        },
        sellUsed: (id) => {
          const s = get();
          const u = s.used.find((x) => x.id === id);
          if (!u) return;
          const price = Math.max(5, Math.round((u.condition === 'defect' ? 0.05 : 0.3) * PARTS[u.part].price / 5) * 5);
          sfx.cash();
          set({ used: s.used.filter((x) => x.id !== id), money: s.money + price });
          s.say(`Gebrauchtteil verkauft: ${PARTS[u.part].name} für ${price} €.`);
        },
        checkUsed: (id) => {
          const s = get();
          const u = s.used.find((x) => x.id === id);
          if (!u) return;
          set({ used: s.used.map((x) => (x.id === id ? { ...x, known: true } : x)) });
          s.say(`${PARTS[u.part].name} geprüft: ${u.condition === 'defect' ? 'defekt – so nicht einbauen!' : `in Ordnung${u.health !== undefined ? `, Restzustand ${u.health} %` : ''}.`}`, u.condition === 'defect');
        },
        buyJunkCar: (slot) => {
          const s = get();
          const car = s.cars[slot];
          if (!car?.junk) return;
          const to = freeSlot(s, 'park');
          if (to < 0) return s.say('Kein freier Stellplatz in der Werkstatt für das Schrottauto.', true);
          const price = car.junk.price + 150;
          if (s.money - heldMoney(s.auctions) < price) return s.say('Dafür reicht das Geld nicht.', true);
          const cars = [...s.cars];
          const mine: CarInstance = { ...clone(car), purchasePrice: price, hoodOpen: false, lifted: false, origin: 'market' };
          delete mine.junk;
          cars[to] = mine;
          cars[slot] = null;
          sfx.cash();
          set({ cars, money: s.money - price });
          s.say(`Schrottauto gekauft und abgeschleppt (${car.junk.price.toLocaleString('de-DE')} € + 150 € Abschleppen) – steht auf ${SLOTS[to].label}.`);
        },
        junkVisual: (slot, field) => {
          const s = get();
          const car = s.cars[slot];
          const id = car?.junk ? mountedId(car.visual, field) : null;
          if (!car || !id) return;
          if (s.tool !== 'ratchet') return s.say('Anbauteile schraubst du mit der Ratsche ab.', true);
          const price = Math.round((VISUAL_MAP[id].price * 0.35) / 10) * 10;
          if (s.money - heldMoney(s.auctions) < price) return s.say('Dafür reicht das Geld nicht.', true);
          const cars = [...s.cars];
          cars[slot] = { ...car, visual: { ...car.visual, [field]: undefined } };
          sfx.cash();
          set({ cars, money: s.money - price, visualStock: { ...s.visualStock, [id]: (s.visualStock[id] ?? 0) + 1 } });
          s.say(`Abgebaut und gekauft: ${VISUAL_MAP[id].name} für ${price} € – liegt im Optik-Lager.`);
        },
        fitTurboKit: (slot) => {
          const s = get();
          const cur = s.cars[slot];
          if (!cur || cur.motor === null) return;
          const e = engineOf(cur);
          if (e.turbo || cur.motor?.turboKit) return s.say('Dieser Motor hat schon einen Turbolader.', true);
          const key = 'turbo_kit@alle';
          if (!(s.inventory[key] > 0)) return s.say('Erst den Turbo-Nachrüstsatz bestellen (Teileshop → Tuning).', true);
          if (!cur.bare && (!cur.hoodOpen || cur.lifted)) return s.say('Motorhaube öffnen, Auto ablassen.', true);
          const car = clone(cur);
          const motor = { ...(car.motor ?? { uid: `${car.uid}-m`, engineId: e.id, km: car.km, donor: car.modelId, history: [] }) };
          motor.turboKit = true;
          motor.history = [...motor.history, `Tag ${s.day}: Turbo-Nachrüstsatz vorbereitet`];
          car.motor = motor;
          // Neue Bauteile liegen eingebaut bereit? Nein: sie werden einzeln montiert (Lader und Ladeluftrohr).
          for (const id of ['turbo', 'charge_pipe']) {
            const d = defOf(car, id);
            car.components[id] = { installed: false, bolts: Array(d.bolts).fill(0), connected: false, condition: 'ok', known: true };
          }
          car.partsSpent += PARTS.turbo_kit.price;
          const cars = [...s.cars];
          cars[slot] = car;
          sfx.clunk();
          set({ cars, inventory: { ...s.inventory, [key]: s.inventory[key] - 1 } });
          s.say('Halter und Ölleitungen für den Turbo montiert. Jetzt Turbolader und Ladeluftrohr einbauen – und das Steuergerät abstimmen.');
        },
        setEcu: (slot, ecu, buyMap) => {
          const s = get();
          const cur = s.cars[slot];
          if (!cur || cur.bare || cur.junk) return;
          const now = cur.ecu ?? { map: 0, boost: 0, limiter: 0 };
          let cost = 0;
          if (buyMap !== undefined && buyMap > now.map) cost = buyMap === 1 ? 450 : 950;
          if (cost && s.money - heldMoney(s.auctions) < cost) return s.say('Dafür reicht das Geld nicht.', true);
          const cars = [...s.cars];
          cars[slot] = { ...cur, ecu: { ...now, ...ecu, ...(cost ? { map: buyMap! } : {}) }, dyno: undefined, testDriven: false };
          set({ cars, money: s.money - cost });
          s.say(cost ? `Kennfeld Stufe ${buyMap} aufgespielt (${cost} €).` : 'Abstimmung gespeichert.');
        },
        buyVisual: (id) => {
          const s = get();
          const v = VISUAL_MAP[id];
          if (!v) return;
          if (s.money - heldMoney(s.auctions) < v.price) return s.say('Dafür reicht das Geld nicht.', true);
          sfx.cash();
          set({ money: s.money - v.price, visualStock: { ...s.visualStock, [id]: (s.visualStock[id] ?? 0) + 1 } });
          s.say(`Bestellt: ${v.name} (−${v.price.toLocaleString('de-DE')} €). Liegt im Optik-Lager – montieren an der Tuning-Werkbank.`);
        },
        mountVisual: (slot, id) => {
          const s = get();
          const cur = s.cars[slot];
          const v = VISUAL_MAP[id];
          if (!cur || !v || cur.bare || cur.junk) return;
          if (!(s.visualStock[id] > 0)) return s.say('Dieses Teil liegt nicht im Optik-Lager.', true);
          const stock = { ...s.visualStock, [id]: s.visualStock[id] - 1 };
          const old = mountedId(cur.visual, v.field);
          if (old) stock[old] = (stock[old] ?? 0) + 1;
          const cars = [...s.cars];
          cars[slot] = { ...cur, visual: { ...cur.visual, [v.field]: v.value }, partsSpent: cur.partsSpent + Math.round(v.price * 0.5), dyno: undefined };
          sfx.clunk();
          set({ cars, visualStock: stock });
          s.say(`Montiert: ${v.name}${old ? ` – ${VISUAL_MAP[old].name} liegt im Optik-Lager` : ''}.`);
        },
        unmountVisual: (slot, field) => {
          const s = get();
          const cur = s.cars[slot];
          const old = cur ? mountedId(cur.visual, field) : null;
          if (!cur || !old) return;
          const cars = [...s.cars];
          cars[slot] = { ...cur, visual: { ...cur.visual, [field]: undefined } };
          sfx.clunk();
          set({ cars, visualStock: { ...s.visualStock, [old]: (s.visualStock[old] ?? 0) + 1 } });
          s.say(`Serienteil wieder montiert, ${VISUAL_MAP[old].name} liegt im Optik-Lager.`);
        },
        setDrop: (slot, cm) => {
          const s = get();
          const cur = s.cars[slot];
          if (!cur || cur.visual?.suspension !== 'coilover') return;
          const cars = [...s.cars];
          cars[slot] = { ...cur, visual: { ...cur.visual, drop: Math.min(7, Math.max(2, Math.round(cm))) } };
          set({ cars });
        },

        tickAuctions: (now) => {
          const s = get();
          if (!s.auctions.some((a) => !a.settled && (a.result || now >= a.simulatedTo + 8000))) return;
          const auctions = clone(s.auctions).map((a) => advanceAuction(a, now));
          let { money } = s;
          const cars = [...s.cars];
          let won = 0;
          const waiting = [...s.waiting];
          let note = '';
          for (const a of auctions) {
            if (!a.result || a.settled) continue;
            a.settled = true; // Abwicklung genau einmal – auch über Neustarts hinweg
            if (a.result === 'won') {
              won++;
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
          set({ auctions, money, cars, waiting, ...(won ? { career: { ...s.career, auctionsWon: s.career.auctionsWon + won } } : {}) });
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
      // Im Koop wird nicht in den lokalen Einzelspielstand geschrieben (siehe saveGate.ts).
      storage: createJSONStorage(() => gatedStorage),
      version: 5,
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
        // Version 5: Motoren je Modell (Sechszylinder bekommen Zylinder 5 und 6 – `normalizeCar`), Lager nach Passform
        // (`migrateInventory`), großer Markt mit Laufzeiten. Autos, Reparaturstand, Geld und Lager bleiben erhalten.
        return s;
      },
      merge: (persisted: any, current) => {
        const p = persisted ?? {};
        const merged = { ...current, ...p } as GameState;
        merged.cars = Array.from({ length: SLOT_COUNT }, (_, i) => normalizeCar(p.cars?.[i] ?? null));
        merged.liftUp = SLOTS.map((x) => isLift(x.id) && (merged.cars[x.id] ? merged.cars[x.id]!.lifted : !!p.liftUp?.[x.id]));
        merged.upgrades = (p.upgrades ?? []).filter((u: UpgradeId) => UPGRADES.some((x) => x.id === u));
        merged.fluidStock = { ...emptyStock(), ...(p.fluidStock ?? {}) };
        merged.drainPan = SLOTS.map((x) => isLift(x.id) && !!p.drainPan?.[x.id]);
        merged.waiting = (p.waiting ?? []).map((c: CarInstance) => normalizeCar(c)!);
        merged.events = (p.events ?? []).filter((e: GameEvent) => e && e.id && e.type);
        merged.auctions = (p.auctions ?? []).filter((a: Auction) => a && a.car && a.bidders).map((a: Auction) => ({ ...a, car: normalizeCar(a.car)! }));
        merged.inventory = migrateInventory(p.inventory);
        merged.engines = (p.engines ?? []).filter((u: EngineUnit) => u?.motor?.uid && ENGINES[u.motor.engineId]);
        merged.crane = p.crane?.motor?.uid ? p.crane : null;
        merged.used = (p.used ?? []).filter((u: UsedPart) => u?.id && PARTS[u.part]);
        merged.visualStock = { ...(p.visualStock ?? {}) };
        // Schrottplatz beim ersten Laden eines älteren Spielstands füllen
        if (merged.started && SLOTS.some((x) => x.kind === 'junk' && !merged.cars[x.id])) merged.cars = refreshJunk(merged.cars, Math.random, merged.day ?? 1);
        merged.carried = (p.carried ?? []).filter((t: ToolId) => TOOL_MAP[t] && ['driver', 'socket', 'device'].includes(TOOL_MAP[t].kind)).slice(0, MAX_CARRIED);
        if (!TOOL_MAP[merged.tool] || (TOOL_MAP[merged.tool].kind !== 'builtin' && !merged.carried.includes(merged.tool))) merged.tool = 'hand';
        merged.listings = (p.listings ?? [])
          .filter((l: Listing) => l && l.profile && l.car)
          .map((l: Listing) => ({ ...l, usedArgs: l.usedArgs ?? [], gone: !!l.gone, car: normalizeCar(l.car)! }));
        merged.jobs = (p.jobs ?? []).filter((j: JobOffer) => j?.car?.job).map((j: JobOffer) => ({ ...j, car: normalizeCar(j.car)! }));
        merged.sound = p.sound ?? true;
        merged.career = { ...emptyCareer(), ...(p.career ?? {}) };
        merged.achieved = Array.isArray(p.achieved) ? p.achieved : [];
        merged.unlocked = [];
        merged.contest = p.contest?.rivals ? p.contest : null;
        merged.meet = p.meet?.rivals ? p.meet : null;
        merged.contestResult = null;
        if (merged.started) {
          // Füllt auch einen alten, kleinen Markt auf die neue Größe auf; vorhandene Inserate bleiben.
          merged.listings = fillListings(merged.listings, merged.money, Math.random, merged.marketIndex, false, merged.day);
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
        engines: s.engines,
        crane: s.crane,
        used: s.used,
        visualStock: s.visualStock,
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
        career: s.career,
        achieved: s.achieved,
        contest: s.contest,
        meet: s.meet,
        jobEarnings: s.jobEarnings,
        sound: s.sound,
        started: s.started,
      }),
    },
  ),
);

// Erfolge: nach jeder Änderung prüfen, ob etwas neu erreicht ist – Belohnung gibt es genau einmal.
function checkAchievements(s: GameState) {
  // Stände, die gerade vom Koop-Server eingespielt werden, lösen keine eigene Belohnung aus (sonst doppelt).
  if (!s.started || saveGate.remote) return;
  const fresh = newlyAchieved(s, s.achieved);
  if (!fresh.length) return;
  sfx.cash();
  useGame.setState({
    achieved: [...s.achieved, ...fresh.map((a) => a.id)],
    money: s.money + fresh.reduce((sum, a) => sum + a.reward, 0),
    unlocked: [...s.unlocked, ...fresh.map((a) => ({ title: a.title, reward: a.reward }))],
  });
}
useGame.subscribe(checkAchievements);
// Ältere Spielstände: was dort schon erreicht ist, wird direkt nach dem Laden einmalig nachgetragen.
useGame.persist?.onFinishHydration?.((s) => checkAchievements(s));
if (useGame.persist?.hasHydrated?.()) checkAchievements(useGame.getState());
export { ACHIEVEMENTS };
