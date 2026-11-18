// Stellplätze und Ausbaustufen der Werkstatt. Positionen in Weltkoordinaten
// (Halle: x von -4,8 bis 6,4; der Hof liegt davor in Richtung -x).

export type SlotKind = 'lift' | 'wash' | 'paint' | 'park' | 'show' | 'stand' | 'junk' | 'garage' | 'expo';
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
  /** Ort, an dem der Platz liegt (ohne Angabe: Werkstatt mit Hof). */
  place?: string;
}

export type GarageId = 'tg_klein' | 'tg_mittel' | 'tg_gross' | 'tg_luxus';
export type ExpoId = 'expo3' | 'expo4' | 'expo5' | 'expo6' | 'expo7' | 'expo8';
export type UpgradeId = ExpoId | 'parking' | 'wash' | 'paint' | 'expansion' | 'hoist' | 'dyno' | 'loc_pro' | 'loc_center' | 'loc_hq' | GarageId;

// ---------------------------------------------------------------- Tiefgaragen
// Vier kaufbare, begehbare Tiefgaragen als Fahrzeuglager und private Sammlung. Jede ist ein eigener Ort
// (Einfahrt über die Rampe am Hofrand) mit eigenem Koordinatenbereich, damit sich nichts überschneidet.
export interface GarageDef {
  id: GarageId;
  name: string;
  slots: number;
  price: number;
  /** Nullpunkt in Weltkoordinaten (Fuß der Rampe, Mitte der ersten Fahrgasse). */
  ox: number;
}
export const GARAGES: GarageDef[] = [
  { id: 'tg_klein', name: 'Tiefgarage Klein', slots: 6, price: 25000, ox: 200 },
  { id: 'tg_mittel', name: 'Tiefgarage Mittel', slots: 15, price: 65000, ox: 350 },
  { id: 'tg_gross', name: 'Tiefgarage Groß', slots: 30, price: 150000, ox: 500 },
  { id: 'tg_luxus', name: 'Tiefgarage Luxus', slots: 50, price: 350000, ox: 650 },
];
export const GARAGE_MAP = Object.fromEntries(GARAGES.map((g) => [g.id, g])) as Record<GarageId, GarageDef>;
/** Maße einer Parkbucht (Breite längs der Fahrgasse, Tiefe), Breite der Fahrgasse, Abstand der ersten Bucht vom Rampenfuß. */
export const BAY = { w: 2.7, depth: 5.4, aisle: 6.4, x0: 2.2 };
export interface GarageRow {
  /** Mitte der Buchtenreihe (z). */
  z: number;
  /** Drehung der Autos: Front von der Fahrgasse weg. */
  rot: number;
  count: number;
}
/** Aufteilung: bis 15 Plätze eine Fahrgasse mit zwei Reihen, darüber zwei Fahrgassen mit vier Reihen. */
export function garageLayout(g: GarageDef) {
  const R = Math.PI / 2;
  const half = BAY.aisle / 2 + BAY.depth / 2;
  const zs = g.slots <= 15 ? [[-half, R], [half, -R]] : [[-half, R], [half, -R], [half + BAY.depth, R], [2 * half + BAY.depth + half, -R]];
  const per = Math.ceil(g.slots / zs.length);
  let left = g.slots;
  const rows: GarageRow[] = zs.map(([z, rot], i) => {
    const count = Math.min(left, Math.ceil(left / (zs.length - i)));
    left -= count;
    return { z, rot, count };
  });
  const aisles = zs.length === 2 ? [0] : [0, 2 * half + BAY.depth];
  const length = BAY.x0 + per * BAY.w + 1.2;
  const bounds = { minX: g.ox - 1.8, maxX: g.ox + length, minZ: rows[0].z - BAY.depth / 2, maxZ: rows[rows.length - 1].z + BAY.depth / 2 };
  return { rows, aisles, per, length, bounds };
}
function garageSlots(first: number): SlotDef[] {
  const out: SlotDef[] = [];
  for (const g of GARAGES) {
    const { rows } = garageLayout(g);
    let n = 0;
    for (const row of rows) {
      for (let i = 0; i < row.count; i++) {
        n++;
        out.push({ id: first + out.length, kind: 'garage', label: `${g.name} · Platz ${n}`, x: g.ox + BAY.x0 + BAY.w / 2 + i * BAY.w, z: row.z, rot: row.rot, needs: g.id, place: g.id });
      }
    }
  }
  return out;
}

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
  // Motorständer in der Stammhalle: hier sitzt ein ausgebauter Motor zur Revision.
  { id: 15, kind: 'stand', label: 'Motorständer', x: 3.1, z: -0.55, rot: 0 },
  // Schrottplatz: eigener Ort, mit dem Lieferwagen erreichbar. Die Fahrzeuge gehören dem Platz, nicht der Werkstatt.
  { id: 16, kind: 'junk', label: 'Schrottplatz Reihe A1', x: -60, z: -5.5, rot: R },
  { id: 17, kind: 'junk', label: 'Schrottplatz Reihe A2', x: -65, z: -5.5, rot: R },
  { id: 18, kind: 'junk', label: 'Schrottplatz Reihe A3', x: -70, z: -5.5, rot: R },
  { id: 19, kind: 'junk', label: 'Schrottplatz Reihe B1', x: -60, z: 5.5, rot: -R },
  { id: 20, kind: 'junk', label: 'Schrottplatz Reihe B2', x: -65, z: 5.5, rot: -R },
  { id: 21, kind: 'junk', label: 'Schrottplatz Reihe B3', x: -70, z: 5.5, rot: -R },
];
for (const s of SLOTS) if (s.kind === 'junk') s.place = 'schrott';
// Tiefgaragen ab Platz 22: 6 + 15 + 30 + 50 Stellplätze
SLOTS.push(...garageSlots(SLOTS.length));

// ---------------------------------------------------------------- Autohaus
// Ausstellungsraum als eigener Ort: zwei Plätze von Anfang an, jeder weitere einzeln kaufbar (bis acht).
// Je Platz ein Drehteller; ausgestellte Autos verkaufen sich wie im Showroom etwas teurer.
export const EXPO = { ox: 800, maxPlaces: 8, bounds: { minX: 799.6, maxX: 825, minZ: -7.6, maxZ: 7.6 } };
const EXPO_POS: [number, number][] = [804, 809.5, 815, 820.5].flatMap((x) => [[x, -3.8], [x, 3.8]] as [number, number][]);
export const EXPO_PRICES = [8000, 12000, 18000, 26000, 36000, 50000];
SLOTS.push(
  ...EXPO_POS.map(([x, z], i): SlotDef => ({
    id: SLOTS.length + i,
    kind: 'expo',
    label: `Autohaus · Platz ${i + 1}`,
    x,
    z,
    rot: 0,
    place: 'autohaus',
    ...(i >= 2 ? { needs: `expo${i + 1}` as ExpoId } : {}),
  })),
);
// Zweiter Motorständer in Halle 2 (mit der Profi-Werkstatt): hinten angehängt, damit alte Spielstände gültig bleiben
SLOTS.push({ id: SLOTS.length, kind: 'stand', label: 'Motorständer Halle 2', x: 3.1, z: -10.0, rot: 0, needs: 'loc_pro' });
export const STAND2_SLOT = SLOTS.length - 1;
export const isExpo = (slot: number) => SLOTS[slot]?.kind === 'expo';
/** Ausstellungsfläche mit Verkaufsbonus (Showroom im Headquarters oder Autohaus). */
export const isShowcase = (slot: number) => SLOTS[slot]?.kind === 'show' || SLOTS[slot]?.kind === 'expo';
/** Ort eines Stellplatzes: Werkstatt, Schrottplatz oder eine Tiefgarage. */
export const slotPlace = (slot: number) => SLOTS[slot]?.place ?? 'werkstatt';
export const isGarage = (slot: number) => SLOTS[slot]?.kind === 'garage';
/** Garage, zu der ein Platz gehört. */
export const garageOf = (slot: number) => (isGarage(slot) ? GARAGE_MAP[SLOTS[slot].place as GarageId] : null);
export const SLOT_COUNT = SLOTS.length;
export const isLift = (slot: number) => SLOTS[slot]?.kind === 'lift';
/** Platz für eigene Fahrzeuge (nicht Motorständer, nicht Schrottplatz). */
export const isFleet = (slot: number) => !!SLOTS[slot] && SLOTS[slot].kind !== 'stand' && SLOTS[slot].kind !== 'junk';
export const STAND_SLOT = 15;
/** Alle Motorständer (Stammhalle, Halle 2). */
export const STAND_SLOTS = SLOTS.filter((s) => s.kind === 'stand').map((s) => s.id);
export const isStand = (slot: number) => SLOTS[slot]?.kind === 'stand';
/** Zu welchem Motorständer (und Kran) ein Platz gehört: der Ständer selbst, sonst der in derselben Halle. */
export const standFor = (slot: number, upgrades: string[]) =>
  isStand(slot) ? slot : SLOTS[slot] && SLOTS[slot].z < -5.6 && upgrades.includes('loc_pro') && slotPlace(slot) === 'werkstatt' ? STAND2_SLOT : STAND_SLOT;
export const JUNK_SLOTS = SLOTS.filter((s) => s.kind === 'junk').map((s) => s.id);
export const isJunk = (slot: number) => SLOTS[slot]?.kind === 'junk';
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
  /** Tiefgarage (Fahrzeuglager). */
  garage?: boolean;
  /** Weiterer Ausstellungsplatz im Autohaus. */
  expo?: boolean;
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'parking', stage: 2, name: 'Erweiterter Außenbereich', price: 2500, desc: 'Drei zusätzliche Stellplätze im Hof und Flutlicht – Platz für Projekt- und Privatfahrzeuge.' },
  { id: 'wash', stage: 3, name: 'Fahrzeugaufbereitung', price: 4000, desc: 'Waschplatz mit Hochdruckreiniger, Schaumlanze, Poliermaschine und Innenraumreinigung.' },
  { id: 'paint', stage: 4, name: 'Lackierkabine', price: 9000, desc: 'Rost abschleifen, grundieren und Bereich für Bereich neu lackieren – in neun Farben.', requires: 'wash' },
  { id: 'hoist', stage: 0, equipment: true, name: 'Motor- und Getriebeheber', price: 6500, desc: 'Hydraulischer Heber für schwere Aggregate. Ohne ihn lässt sich kein Getriebe aus- oder einbauen – damit werden kapitale Schäden reparierbar.' },
  { id: 'dyno', stage: 0, equipment: true, name: 'Leistungsprüfstand', price: 28000, desc: 'Rollenprüfstand: misst Leistung und Drehmoment im aktuellen Zustand, zeigt die Kurve und Abweichungen vom Werkswert. Ein Messprotokoll steigert den Verkaufswert.', requires: 'expansion' },
  { id: 'expansion', stage: 5, name: 'Größere Werkstatt', price: 15000, desc: 'Lageranbau mit Großhandelskonditionen (Teile und Flüssigkeiten 10 % günstiger) und zwei weitere Stellplätze.', requires: 'parking' },
  { id: 'loc_pro', stage: 6, location: true, name: 'Profi-Werkstatt (Halle 2)', price: 75000, desc: 'Anbau mit dritter Hebebühne – drei Autos gleichzeitig in Arbeit. Eigene Ausstattung: Werkzeugwagen, Spezialwerkzeugschrank, Motorständer und (mit Motorheber) ein zweiter Kran. Durchgang von der Stammhalle.', requires: 'expansion' },
  { id: 'loc_center', stage: 7, location: true, name: 'Performance-Center', price: 200000, desc: 'Halle 2 wird verlängert: vierte Hebebühne. Leistungsprüfstand, Waschplatz und Lackierkabine sind im Preis enthalten.', requires: 'loc_pro', grants: ['wash', 'paint', 'dyno'] },
  { id: 'loc_hq', stage: 8, location: true, name: 'Headquarters mit Showroom', price: 500000, desc: 'Verglaster Showroom mit drei Ausstellungsplätzen. Ausgestellte Autos verkaufen sich 4 % teurer und bringen der Sammlung mehr Ansehen.', requires: 'loc_center' },
  ...GARAGES.map((g): UpgradeDef => ({
    id: g.id,
    stage: 0,
    garage: true,
    name: g.name,
    price: g.price,
    desc: `Begehbare Tiefgarage mit ${g.slots} Stellplätzen: Rampe am Hofrand, Beleuchtung, nummerierte Buchten. Lager und private Sammlung – jedes Auto lässt sich jederzeit wieder herausholen.`,
  })),
  ...EXPO_PRICES.map((price, i): UpgradeDef => ({
    id: `expo${i + 3}` as ExpoId,
    stage: 0,
    expo: true,
    name: `Autohaus: Ausstellungsplatz ${i + 3}`,
    price,
    desc: 'Weiterer Drehteller mit Licht im Autohaus. Ausgestellte Autos verkaufen sich 4 % teurer und bringen der Sammlung mehr Ansehen.',
    ...(i > 0 ? { requires: `expo${i + 2}` as ExpoId } : {}),
  })),
];

export const slotAvailable = (slot: SlotDef, upgrades: string[]) => !slot.needs || upgrades.includes(slot.needs);
/** Gekaufte Stellplätze für eigene Fahrzeuge (ohne Motorständer und Schrottplatz). */
export const availableSlots = (upgrades: string[]) => SLOTS.filter((s) => isFleet(s.id) && slotAvailable(s, upgrades));
