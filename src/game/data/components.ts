import type { ComponentDef } from '../types';

// Bauteile der Fahrzeugplattform. Neue Reparaturen = neue Einträge hier
// (+ Defekt in defects.ts + 3D-Darstellung in CarModel.tsx).
const coil = (n: number): ComponentDef => ({
  id: `coil${n}`,
  name: `Zündspule Zyl. ${n}`,
  bolts: 1,
  boltTool: 'ratchet',
  blockedBy: [],
  access: 'hood',
  partId: 'ignition_coil',
  okText: 'Kein Riss, Kontakte sauber – in Ordnung.',
  defectText: 'Haarriss im Gehäuse und Schmauchspuren – defekt!',
});

const side = (s: 'fl' | 'fr', label: string): ComponentDef[] => [
  {
    id: `wheel_${s}`,
    name: `Rad vorne ${label}`,
    bolts: 5,
    boltTool: 'wheelWrench',
    blockedBy: [],
    access: 'lifted',
    okText: 'Reifen und Felge in Ordnung. Bremsbeläge sehen gut aus.',
    defectText: '',
    inspectReveals: `pads_${s}`,
  },
  {
    id: `caliper_${s}`,
    name: `Bremssattel vorne ${label}`,
    bolts: 2,
    boltTool: 'ratchet',
    blockedBy: [`wheel_${s}`],
    access: 'lifted',
    okText: 'Bremssattel gängig und dicht.',
    defectText: '',
    inspectReveals: `pads_${s}`,
  },
  {
    id: `pads_${s}`,
    name: `Bremsbeläge vorne ${label}`,
    bolts: 0,
    boltTool: 'hand',
    blockedBy: [`caliper_${s}`],
    access: 'lifted',
    partId: 'brake_pads',
    okText: 'Belagstärke 9 mm – in Ordnung.',
    defectText: 'Belagstärke nur noch 1,5 mm – verschlissen!',
  },
];

export const COMPONENTS: ComponentDef[] = [
  coil(1),
  coil(2),
  coil(3),
  coil(4),
  {
    id: 'valve_cover',
    name: 'Ventildeckel',
    bolts: 6,
    boltTool: 'ratchet',
    blockedBy: ['coil1', 'coil2', 'coil3', 'coil4'],
    access: 'hood',
    okText: 'Ventildeckel trocken, keine Ölspuren.',
    defectText: '',
    inspectReveals: 'gasket',
  },
  {
    id: 'gasket',
    name: 'Ventildeckeldichtung',
    bolts: 0,
    boltTool: 'hand',
    blockedBy: ['valve_cover'],
    access: 'hood',
    partId: 'valve_cover_gasket',
    okText: 'Dichtung elastisch und dicht.',
    defectText: 'Ölspuren am Deckelrand – Dichtung hart und undicht!',
  },
  ...side('fl', 'links'),
  ...side('fr', 'rechts'),
];

export const COMPONENT_MAP: Record<string, ComponentDef> = Object.fromEntries(COMPONENTS.map((c) => [c.id, c]));
