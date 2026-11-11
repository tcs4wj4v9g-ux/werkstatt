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
  | 'oil_pan_gasket';

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
  | 'oil_pan';

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
  /** Defekt ist von außen nicht zu sehen (nur Diagnose oder Ausbau). */
  hidden?: boolean;
  /** Beim Prüfen dieses Bauteils wird (zusätzlich) der Zustand anderer sichtbar. */
  inspectReveals?: string[];
}

export interface ComponentState {
  installed: boolean;
  bolts: boolean[];
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
  /** Beim Untersuchen entdeckte Mängel (Verhandlungsargumente). */
  hints: DefectId[];
  checks: string[];
  closed: boolean;
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
