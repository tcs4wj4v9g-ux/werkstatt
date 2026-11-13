// Stellplätze und Ausbaustufen der Werkstatt. Positionen in Weltkoordinaten
// (Halle: x von -4,8 bis 6,4; der Hof liegt davor in Richtung -x).

export type SlotKind = 'lift' | 'wash' | 'paint' | 'park' | 'show';
export interface SlotDef {
  id: number;
  kind: SlotKind;
  label: string;
  x: number;
  z: number;
  /** Drehung um die Hochachse (0 = Front zeigt in +x). */
  rot: number;
  /** Ausbau, der diesen Platz freischaltet; ohne Angabe von Anfang an da. */
  needs?: UpgradeId;
}

export type UpgradeId = 'parking' | 'wash' | 'paint' | 'expansion' | 'hoist' | 'dyno' | 'loc_pro' | 'loc_center' | 'loc_hq';

const R = Math.PI / 2;
export const SLOTS: SlotDef[] = [
  { id: 0, kind: 'lift', label: 'Hebebühne 1', x: 0, z: -2.7, rot: 0 },
  { id: 1, kind: 'lift', label: 'Hebebühne 2', x: 0, z: 2.7, rot: 0 },
  { id: 2, kind: 'wash', label: 'Waschplatz', x: -8.6, z: 6.6, rot: 0, needs: 'wash' },
  { id: 3, kind: 'paint', label: 'Lackierkabine', x: -19.4, z: 6.4, rot: 0, needs: 'paint' },
  { id: 4, kind: 'park', label: 'Stellplatz 1', x: -7.4, z: -6.5, rot: R },
  { id: 5, kind: 'park', label: 'Stellplatz 2', x: -10.6, z: -6.5, rot: R, needs: 'parking' },
  { id: 6, kind: 'park', label: 'Stellplatz 3', x: -13.8, z: -6.5, rot: R, needs: 'parking' },
  { id: 7, kind: 'park', label: 'Stellplatz 4', x: -17.0, z: -6.5, rot: R, needs: 'parking' },
  { id: 8, kind: 'park', label: 'Stellplatz 5', x: -13.2, z: 6.5, rot: -R, needs: 'expansion' },
  { id: 9, kind: 'park', label: 'Stellplatz 6', x: -20.2, z: -6.5, rot: R, needs: 'expansion' },
  // Größere Standorte: Halle 2 schließt seitlich an die Stammhalle an, der Showroom auf der anderen Seite.
  { id: 10, kind: 'lift', label: 'Hebebühne 3', x: 0, z: -8.1, rot: 0, needs: 'loc_pro' },
  { id: 11, kind: 'lift', label: 'Hebebühne 4', x: 0, z: -13.5, rot: 0, needs: 'loc_center' },
  { id: 12, kind: 'show', label: 'Showroom 1', x: 4.2, z: 10.1, rot: R, needs: 'loc_hq' },
  { id: 13, kind: 'show', label: 'Showroom 2', x: 1.0, z: 10.1, rot: R, needs: 'loc_hq' },
  { id: 14, kind: 'show', label: 'Showroom 3', x: -2.2, z: 10.1, rot: R, needs: 'loc_hq' },
];
export const SLOT_COUNT = SLOTS.length;
export const isLift = (slot: number) => SLOTS[slot]?.kind === 'lift';
/** Aufschlag beim Verkauf aus dem Showroom heraus. */
export const SHOWROOM_BONUS = 0.04;

export interface UpgradeDef {
  id: UpgradeId;
  stage: number;
  name: string;
  price: number;
  desc: string;
  requires?: UpgradeId;
  /** Spezialgerät statt Ausbaustufe. */
  equipment?: boolean;
  /** Größerer Standort: neue begehbare Gebäudeteile. */
  location?: boolean;
  /** Was mit diesem Kauf ohne Aufpreis dazukommt. */
  grants?: UpgradeId[];
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'parking', stage: 2, name: 'Erweiterter Außenbereich', price: 2500, desc: 'Drei zusätzliche Stellplätze im Hof und Flutlicht – Platz für Projekt- und Privatfahrzeuge.' },
  { id: 'wash', stage: 3, name: 'Fahrzeugaufbereitung', price: 4000, desc: 'Waschplatz mit Hochdruckreiniger, Schaumlanze, Poliermaschine und Innenraumreinigung.' },
  { id: 'paint', stage: 4, name: 'Lackierkabine', price: 9000, desc: 'Rost abschleifen, grundieren und Bereich für Bereich neu lackieren – in neun Farben.', requires: 'wash' },
  { id: 'hoist', stage: 0, equipment: true, name: 'Motor- und Getriebeheber', price: 6500, desc: 'Hydraulischer Heber für schwere Aggregate. Ohne ihn lässt sich kein Getriebe aus- oder einbauen – damit werden kapitale Schäden reparierbar.' },
  { id: 'dyno', stage: 0, equipment: true, name: 'Leistungsprüfstand', price: 28000, desc: 'Rollenprüfstand: misst Leistung und Drehmoment im aktuellen Zustand, zeigt die Kurve und Abweichungen vom Werkswert. Ein Messprotokoll steigert den Verkaufswert.', requires: 'expansion' },
  { id: 'expansion', stage: 5, name: 'Größere Werkstatt', price: 15000, desc: 'Lageranbau mit Großhandelskonditionen (Teile und Flüssigkeiten 10 % günstiger) und zwei weitere Stellplätze.', requires: 'parking' },
  { id: 'loc_pro', stage: 6, location: true, name: 'Profi-Werkstatt (Halle 2)', price: 75000, desc: 'Anbau mit dritter Hebebühne – drei Autos gleichzeitig in Arbeit. Durchgang von der Stammhalle.', requires: 'expansion' },
  { id: 'loc_center', stage: 7, location: true, name: 'Performance-Center', price: 200000, desc: 'Halle 2 wird verlängert: vierte Hebebühne. Leistungsprüfstand, Waschplatz und Lackierkabine sind im Preis enthalten.', requires: 'loc_pro', grants: ['wash', 'paint', 'dyno'] },
  { id: 'loc_hq', stage: 8, location: true, name: 'Headquarters mit Showroom', price: 500000, desc: 'Verglaster Showroom mit drei Ausstellungsplätzen. Ausgestellte Autos verkaufen sich 4 % teurer und bringen der Sammlung mehr Ansehen.', requires: 'loc_center' },
];

export const slotAvailable = (slot: SlotDef, upgrades: string[]) => !slot.needs || upgrades.includes(slot.needs);
export const availableSlots = (upgrades: string[]) => SLOTS.filter((s) => slotAvailable(s, upgrades));
