// Zentrale Typen. Die gesamte Spiellogik arbeitet auf reinen, serialisierbaren
// Daten (kein Three.js, kein React) – dadurch lässt sie sich später 1:1 auf
// einem Server für Online-Multiplayer ausführen.

/** Immer dabei: Hand und Prüflampe. Alles andere liegt im Werkzeugschrank. */
export type ToolId =
  | 'hand'
  | 'lamp'
  | 'ratchet'
  | 'torque'
  | 'wrench'
  | 'screwdriver'
  | 'obd'
  | 'socket10'
  | 'socket13'
  | 'socket16'
  | 'socket17'
  // Geräte am Waschplatz und in der Lackierkabine (werden nicht getragen)
  | 'washer'
  | 'foam'
  | 'brush'
  | 'towel'
  | 'polisher'
  | 'vacuum'
  | 'upholstery'
  | 'cockpit'
  | 'sander'
  | 'spraygun';

export type PartId =
  | 'ignition_coil'
  | 'spark_plug'
  | 'brake_pads'
  | 'brake_disc'
  | 'valve_cover_gasket'
  | 'belt'
  | 'water_pump'
  | 'thermostat'
  | 'alternator'
  | 'oil_pan_gasket'
  | 'intake_hose'
  | 'coolant_hose'
  | 'rod_bearing'
  | 'lifters'
  | 'chain_tensioner'
  | 'oil_filter'
  | 'battery'
  | 'tire'
  | 'injector'
  | 'glow_plug'
  | 'turbo'
  | 'charge_pipe'
  | 'egr'
  | 'dpf'
  | 'head_gasket'
  | 'gearbox'
  // Motorrevision (nur am ausgebauten Motor)
  | 'piston_kit'
  | 'main_bearing'
  | 'crankshaft'
  | 'oil_pump'
  | 'camshaft'
  | 'timing_chain'
  | 'exhaust_manifold'
  | 'intake_manifold'
  // Fahrzeugseite rund um den Motor
  | 'engine_mount'
  | 'downpipe'
  | 'fuel_pump'
  | 'harness'
  // Motorumbau
  | 'swap_mounts'
  | 'swap_adapter'
  | 'swap_harness'
  | 'swap_ecu'
  | 'swap_radiator'
  | 'swap_fuel'
  | 'swap_exhaust'
  | 'clutch_hd'
  // Leistungstuning (Teile mit eigenem Einbau)
  | 'turbo_kit'
  | 'turbo_big'
  | 'injector_hp'
  | 'piston_forged'
  | 'camshaft_sport'
  | 'intake_sport'
  | 'exhaust_sport'
  | 'manifold_sport'
  | 'intercooler'
  | 'fuelpump_hp';

export type DefectId =
  | 'coil'
  | 'tires_rear'
  | 'brakes_rear'
  | 'discs_rear'
  | 'plugs'
  | 'brakes'
  | 'discs'
  | 'gasket'
  | 'belt'
  | 'water_pump'
  | 'thermostat'
  | 'alternator'
  | 'oil_pan'
  | 'vacuum'
  | 'coolant_hose'
  | 'bearing'
  | 'lifters'
  | 'chain'
  | 'battery'
  | 'tires'
  | 'glow'
  | 'injector'
  | 'turbo'
  | 'boost_leak'
  | 'egr'
  | 'dpf'
  | 'head_gasket'
  | 'gearbox'
  | 'rings'
  | 'main_bearing'
  | 'oil_pump'
  | 'camshaft'
  | 'timing_chain';

/** hood = Motorraum (Auto unten), lifted = von unten (Auto angehoben), stand = nur am ausgebauten Motor auf dem Motorständer. */
export type Access = 'hood' | 'lifted' | 'stand';
/**
 * Karosserieformen; `mono` = rundlicher Kleinstwagen in Monospace-Form (kurze, steile Haube, weit vorn liegende Scheibe),
 * `box` = kantige Stufenheck-Limousine der 80er (zweitürig, schmale Säulen, flache Haube, Frontband mit vier Rundscheinwerfern),
 * `tub` = rundliches Sportcoupé der 50er mit Heckmotor (Badewannenform, abfallendes Fließheck).
 */
export type BodyStyle = 'sedan' | 'wagon' | 'coupe' | 'hatch' | 'sport' | 'luxury' | 'classic' | 'mono' | 'box' | 'tub';
export type CarClass = 'budget' | 'mid' | 'sport' | 'luxury' | 'collector';
export type Screen = 'menu' | 'market' | 'garage' | 'track';

/** Welches Werkzeug eine Schraube bzw. ein Bauteil verlangt. */
export interface ToolNeed {
  driver: 'ratchet' | 'wrench' | 'screwdriver';
  socket?: ToolId;
  /** Muss mit dem Drehmomentschlüssel angezogen werden (z. B. Radschrauben). */
  torque?: boolean;
}

export interface ComponentDef {
  id: string;
  name: string;
  bolts: number;
  /** Werkzeug für die Schrauben dieses Bauteils. */
  fastener?: ToolNeed;
  /** Werkzeug zum Herausnehmen/Einsetzen (Standard: Hand). */
  removeWith?: ToolNeed;
  /** Diese Bauteile müssen ausgebaut sein, bevor dieses gelöst/ausgebaut werden kann. */
  blockedBy: string[];
  access: Access;
  /** Ersatzteil-Typ, falls das Bauteil getauscht werden kann. */
  partId?: PartId;
  okText: string;
  defectText: string;
  /** Elektrischer Stecker, der vor dem Ausbau gelöst und danach wieder verbunden werden muss. */
  connector?: boolean;
  /** Verschleißteil: einmal ausgebaut, kommt immer ein neues hinein (z. B. Ölfilter). */
  consumable?: boolean;
  /** Defekt ist von außen nicht zu sehen (nur Diagnose oder Ausbau). */
  hidden?: boolean;
  /** Beim Prüfen dieses Bauteils wird (zusätzlich) der Zustand anderer sichtbar. */
  inspectReveals?: string[];
  /** Spezialgerät, ohne das dieses Bauteil weder aus- noch eingebaut werden kann (z. B. Motor- und Getriebeheber). */
  equipment?: string;
  /** Am Motorständer: liegt an der Unterseite (Motor muss gedreht sein). */
  under?: boolean;
  /** Gehört zum Motor (wandert mit ihm beim Ausbau) – sonst zur Karosserie. */
  engine?: boolean;
  /** Tuning-Ausführungen, die statt des Serienteils eingebaut werden können. */
  variants?: PartId[];
}

/** Schraubenzustand: 0 = entfernt, 1 = gelöst/angesetzt, 2 = fest. */
export type BoltState = 0 | 1 | 2;
export const TIGHT: BoltState = 2;

export interface ComponentState {
  installed: boolean;
  bolts: BoltState[];
  /** Stecker verbunden (nur relevant bei Bauteilen mit Stecker). */
  connected: boolean;
  condition: 'ok' | 'defect';
  /** Hat der Spieler den Zustand bereits festgestellt? */
  known: boolean;
  /** Restzustand in Prozent (bei Zünd- und Einspritzteilen). */
  health?: number;
  /** Eingebaute Tuning-Ausführung (Teilenummer), sonst Serie. */
  variant?: PartId;
  /** Am Schrottauto: fehlt ganz (bereits ausgebaut oder nie vorhanden). */
  missing?: boolean;
}

/** Ein Motor mit eigener Identität: bleibt beim Ausbau erhalten und kann in ein anderes Auto wandern. */
export interface MotorMeta {
  uid: string;
  engineId: string;
  km: number;
  /** Aus welchem Fahrzeug er stammt. */
  donor: string;
  /** Turbo-Nachrüstsatz montiert (Saugmotor bekommt Turbolader und Ladeluftrohr). */
  turboKit?: boolean;
  history: string[];
}

/** Abstimmung des Motorsteuergeräts (gehört zum Auto). */
export interface EcuTune {
  /** 0 = Serie, 1 = Stufe 1, 2 = Stufe 2. */
  map: number;
  /** Ladedruck-Zielwert in bar (nur mit Turbolader). */
  boost: number;
  /** Drehzahlbegrenzer. */
  limiter: number;
}

/** Optisches Tuning – alles davon ist am 3D-Modell zu sehen. */
export interface VisualTune {
  rim?: string;
  /** 0 = Serie, 1 = +1 Zoll, 2 = +2 Zoll. */
  rimSize?: number;
  rimColor?: string;
  /** Tieferlegung in Zentimetern (0 = Serie). */
  drop?: number;
  /** Fahrwerk: Serie, Tieferlegungsfedern, Sportfahrwerk, Gewindefahrwerk. */
  suspension?: 'stock' | 'springs' | 'sport' | 'coilover';
  front?: number;
  rear?: number;
  skirts?: boolean;
  spoiler?: number;
  hood?: number;
  flares?: boolean;
  finish?: 'metallic' | 'solid' | 'matte';
  wrap?: 'none' | 'stripes' | 'twotone' | 'side';
  wrapColor?: string;
  lamps?: 'stock' | 'smoked' | 'clear';
  tips?: 'stock' | 'dual' | 'quad' | 'oval';
  seats?: 'stock' | 'sport';
  wheel?: 'stock' | 'sport';
}

/** Am Schrottplatz: Preise und Zustand des Spenderfahrzeugs. */
export interface JunkInfo {
  /** Preis des ganzen Autos (zum Abschleppen). */
  price: number;
  /** Unfall- bzw. Zustandsbeschreibung. */
  story: string;
  /** Tag, bis zu dem es auf dem Platz steht. */
  until: number;
}

export interface CarInstance {
  /** Geöffnete Vordertüren [links, rechts]. */
  doors?: boolean[];
  /** Eingebauter Motor; undefined = Werksmotor des Modells, null = kein Motor eingebaut. */
  motor?: MotorMeta | null;
  /** Nur der Motor (auf dem Motorständer), ohne Fahrzeug. `lifted` heißt dort: gedreht, Unterseite oben. */
  bare?: boolean;
  /** Schrottplatzfahrzeug. */
  junk?: JunkInfo;
  /** Verbaute Umbauteile eines Motorumbaus. */
  swap?: { from: string; parts: PartId[] };
  /** Kennung des ausgebauten Motors (Kran, Ständer oder Lager), damit Akte und Teileshop ihn weiter kennen. */
  motorOut?: string;
  ecu?: EcuTune;
  visual?: VisualTune;
  uid: string;
  modelId: string;
  color: string;
  year: number;
  km: number;
  /** Marktwert in einwandfreiem Zustand bei neutraler Marktlage. */
  cleanValue: number;
  components: Record<string, ComponentState>;
  hoodOpen: boolean;
  lifted: boolean;
  purchasePrice: number;
  partsSpent: number;
  testDriven: boolean;
  haggled: boolean;
  obdCodes: string[] | null;
  /** Symptome, die der Spieler an diesem Auto bisher wahrgenommen hat. */
  observed: string[];
  /** Letzte Messung auf dem Leistungsprüfstand. */
  dyno?: { ps: number; nm: number; ratedPs: number; day: number };
  /** Kundenauftrag, falls das Auto einem Kunden gehört. */
  job?: JobInfo;
  /** Betriebsflüssigkeiten – tatsächlicher Zustand. */
  fluids: Fluids;
  /** Was der Spieler zuletzt selbst abgelesen hat. */
  checked: Partial<Record<FluidId, { level: number; quality: number; day: number }>>;
  /** Zustand der Karosserie je Bereich (Schmutz, Glanz, Rost, Lack). */
  zones: Record<ZoneId, ZoneState>;
  /** Innenraum: 0 = sauber … 1 = stark verschmutzt. */
  interior: { seats: number; dash: number; floor: number };
  /** 0 = gewöhnlich, 1 = selten, 2 = sehr selten. */
  rarity: number;
  origin: 'market' | 'barn' | 'auction' | 'job';
  /** Privatfahrzeug: wird behalten und ist vor versehentlichem Verkauf geschützt. */
  keep: boolean;
}

export type FluidId = 'oil' | 'coolant' | 'brake';
export type FluidProduct = 'oil_5w30' | 'oil_5w40' | 'coolant' | 'brake_fluid';
export type FluidStock = Record<FluidProduct, number>;

export interface Fluids {
  oil: { level: number; quality: number; product: FluidProduct | 'mixed'; filterFresh: boolean };
  coolant: { level: number; quality: number; air: boolean };
  brake: { level: number; quality: number; air: boolean; bled: { fl: boolean; fr: boolean } };
}

export type ZoneId = 'front' | 'rear' | 'left' | 'right' | 'top' | 'wheels';
export interface ZoneState {
  /** 0 = sauber … 1 = stark verschmutzt. */
  dirt: number;
  /** Waschfortschritt: 0 schmutzig, 1 vorgespült, 2 eingeschäumt/gebürstet, 3 abgespült (4 = trocken → sauber). */
  step: number;
  /** Lackglanz 0 … 1. */
  shine: number;
  /** Rost 0 … 1. */
  rust: number;
  /** Neue Lackfarbe dieses Bereichs, solange nicht das ganze Auto lackiert ist. */
  paint?: string;
}

export interface JobInfo {
  id: string;
  customer: string;
  complaint: string;
  category: string;
  /** Vereinbarter Arbeitslohn für die Behebung der Beanstandung. */
  fee: number;
  /** Ursache(n) der Beanstandung – müssen behoben sein, damit der Auftrag erledigt ist. */
  required: DefectId[];
  /** Alle Defekte bei Annahme (für die Abrechnung von Zusatzarbeiten). */
  initial: DefectId[];
  /** Beauftragte Wartung statt/zusätzlich zur Fehlersuche. */
  service?: 'oil_change';
  /** Vom Kunden freigegebene Zusatzarbeiten. */
  approved?: DefectId[];
  /** Zusatzarbeiten, zu denen der Kunde schon gefragt wurde. */
  asked?: DefectId[];
  /** Eilauftrag: muss bis zu diesem Tag fertig sein. */
  dueDay?: number;
}

export interface JobOffer {
  id: string;
  car: CarInstance;
}

export interface Listing {
  id: string;
  car: CarInstance;
  seller: string;
  asking: number;
  minPrice: number;
  patience: number;
  /** Aktueller Preis, zu dem der Verkäufer sofort verkauft. */
  current: number;
  /** Bei der Besichtigung wahrgenommene Symptome (mögliche Verhandlungsargumente). */
  hints: string[];
  checks: string[];
  /** Verkäufertyp – bestimmt Spielraum, Geduld und Reaktion. */
  profile: string;
  /** Bereits vorgebrachte Argumente (wirken nur einmal). */
  usedArgs: string[];
  /** Verkäufer nennt nur noch seinen letzten Preis. */
  closed: boolean;
  /** Verkäufer hat die Verhandlung abgebrochen – kein Kauf mehr möglich. */
  gone: boolean;
  /** Scheunenfund: steht seit Jahren, springt nicht an, muss transportiert werden. */
  barn?: boolean;
  /** Angebot verschwindet nach diesem Tag. */
  expiresDay?: number;
  /** Normales Inserat: bleibt bis zu diesem Tag am Markt. */
  until?: number;
  sellerLine: string;
}

/** Lagerbestand je Teil und Passform, Schlüssel `teil@passform` (siehe fitment.ts). */
export type Inventory = Record<string, number>;

/** Was der Spieler gerade benutzt und bei sich trägt. */
export interface Toolset {
  active: ToolId;
  carried: ToolId[];
  /** Vorhandene Spezialgeräte der Werkstatt. */
  equipment?: string[];
}

export interface ActionResult {
  ok: boolean;
  message?: string;
  /** Kein Neuteil vorhanden – UI soll Shop / Altteil-Einbau anbieten. */
  needsPart?: PartId;
}

export interface Auction {
  id: string;
  car: CarInstance;
  title: string;
  /** Zustandsbericht des Auktionshauses: ein Teil der Symptome, nie die Ursache. */
  report: string[];
  startBid: number;
  increment: number;
  current: number;
  /** 'player', Name eines Händlers oder null (noch kein Gebot). */
  leader: string | null;
  /** Echtzeit in ms – so bleibt die Auktion über Neustarts hinweg konsistent. */
  startsAt: number;
  endsAt: number;
  /** Bis hierhin sind die Gebote der Händler bereits ausgewertet. */
  simulatedTo: number;
  seed: number;
  bidders: { name: string; limit: number; style: 'früh' | 'stetig' | 'spät' }[];
  log: string[];
  /** won = an den Spieler, lost = an einen Händler, unsold = ohne Gebot beendet. */
  result?: 'won' | 'lost' | 'unsold';
  /** Kaufpreis abgebucht und Auto übergeben – verhindert doppelte Abwicklung nach Neustart. */
  settled?: boolean;
}

export interface GameEvent {
  id: string;
  type: 'urgent_job' | 'special_listing' | 'barn_hint' | 'parts_sale' | 'rare_auction' | 'extra_work';
  title: string;
  text: string;
  /** Letzter Tag, an dem das Ereignis angenommen werden kann. */
  expiresDay: number;
  /** Mitgelieferte Daten – einmalig, damit nichts doppelt ausgelöst wird. */
  job?: JobOffer;
  listing?: Listing;
  auction?: Auction;
  sale?: { partId: PartId; pct: number };
  extra?: { uid: string; defect: DefectId };
}
