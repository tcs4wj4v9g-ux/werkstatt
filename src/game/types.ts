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
  | 'socket17';

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
  | 'chain_tensioner';

export type DefectId =
  | 'coil'
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
  | 'chain';

export type Access = 'hood' | 'lifted';
export type BodyStyle = 'sedan' | 'wagon';
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
  /** Defekt ist von außen nicht zu sehen (nur Diagnose oder Ausbau). */
  hidden?: boolean;
  /** Beim Prüfen dieses Bauteils wird (zusätzlich) der Zustand anderer sichtbar. */
  inspectReveals?: string[];
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
}

export interface CarInstance {
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
  /** Kundenauftrag, falls das Auto einem Kunden gehört. */
  job?: JobInfo;
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
  sellerLine: string;
}

export type Inventory = Record<PartId, number>;

/** Was der Spieler gerade benutzt und bei sich trägt. */
export interface Toolset {
  active: ToolId;
  carried: ToolId[];
}

export interface ActionResult {
  ok: boolean;
  message?: string;
  /** Kein Neuteil vorhanden – UI soll Shop / Altteil-Einbau anbieten. */
  needsPart?: PartId;
}
