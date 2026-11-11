// Zentrale Typen. Die gesamte Spiellogik arbeitet auf reinen, serialisierbaren
// Daten (kein Three.js, kein React) – dadurch lässt sie sich später 1:1 auf
// einem Server für Online-Multiplayer ausführen.

export type ToolId = 'hand' | 'ratchet' | 'wheelWrench' | 'inspect';
export type PartId = 'ignition_coil' | 'brake_pads' | 'valve_cover_gasket';
export type DefectId = 'coil' | 'brakes' | 'gasket';
export type Access = 'hood' | 'lifted';
export type BodyStyle = 'sedan' | 'wagon';
export type Screen = 'menu' | 'market' | 'garage' | 'track';

export interface ComponentDef {
  id: string;
  name: string;
  bolts: number;
  boltTool: ToolId;
  /** Diese Bauteile müssen ausgebaut sein, bevor dieses gelöst/ausgebaut werden kann. */
  blockedBy: string[];
  access: Access;
  /** Ersatzteil-Typ, falls das Bauteil getauscht werden kann. */
  partId?: PartId;
  okText: string;
  defectText: string;
  /** Beim Prüfen dieses Bauteils wird (zusätzlich) der Zustand eines anderen sichtbar. */
  inspectReveals?: string;
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
  /** Marktwert in einwandfreiem Zustand. */
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

export interface ActionResult {
  ok: boolean;
  message?: string;
  /** Kein Neuteil vorhanden – UI soll Shop / Altteil-Einbau anbieten. */
  needsPart?: PartId;
}
