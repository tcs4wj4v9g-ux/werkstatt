// Stellplätze und Ausbaustufen der Werkstatt. Positionen in Weltkoordinaten
// (Halle: x von -4,8 bis 6,4; der Hof liegt davor in Richtung -x).

export type SlotKind = 'lift' | 'wash' | 'paint' | 'park';
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

export type UpgradeId = 'parking' | 'wash' | 'paint' | 'expansion';

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
];
export const SLOT_COUNT = SLOTS.length;
export const LIFTS = 2;

export interface UpgradeDef {
  id: UpgradeId;
  stage: number;
  name: string;
  price: number;
  desc: string;
  requires?: UpgradeId;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'parking', stage: 2, name: 'Erweiterter Außenbereich', price: 2500, desc: 'Drei zusätzliche Stellplätze im Hof und Flutlicht – Platz für Projekt- und Privatfahrzeuge.' },
  { id: 'wash', stage: 3, name: 'Fahrzeugaufbereitung', price: 4000, desc: 'Waschplatz mit Hochdruckreiniger, Schaumlanze, Poliermaschine und Innenraumreinigung.' },
  { id: 'paint', stage: 4, name: 'Lackierkabine', price: 9000, desc: 'Rost abschleifen, grundieren und Bereich für Bereich neu lackieren – in neun Farben.', requires: 'wash' },
  { id: 'expansion', stage: 5, name: 'Größere Werkstatt', price: 15000, desc: 'Lageranbau mit Großhandelskonditionen (Teile und Flüssigkeiten 10 % günstiger) und zwei weitere Stellplätze.', requires: 'parking' },
];

export const slotAvailable = (slot: SlotDef, upgrades: string[]) => !slot.needs || upgrades.includes(slot.needs);
export const availableSlots = (upgrades: string[]) => SLOTS.filter((s) => slotAvailable(s, upgrades));
