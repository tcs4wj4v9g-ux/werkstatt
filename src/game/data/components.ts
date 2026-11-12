import type { CarInstance, ComponentDef, ToolNeed } from '../types';
import { CAR_MODELS } from './cars';
import { cylinderSlots, ENGINES, isV, type EngineDef } from './engines';

// Bauteile der Fahrzeugplattform. Neue Reparaturen = neue Einträge hier
// (+ Defekt in defects.ts + 3D-Darstellung in CarModel.tsx).
const S10: ToolNeed = { driver: 'ratchet', socket: 'socket10' };
const S13: ToolNeed = { driver: 'ratchet', socket: 'socket13' };
const S17: ToolNeed = { driver: 'ratchet', socket: 'socket17' };

/** Je Zylinder zwei Bauteile: Benziner Zündspule + Zündkerze, Diesel Einspritzdüse + Glühkerze. */
const cylinder = (n: number, diesel: boolean): ComponentDef[] =>
  diesel
    ? [
  {
    id: `inj${n}`,
    name: `Einspritzdüse Zyl. ${n}`,
    bolts: 1,
    fastener: S10,
    connector: true,
    hidden: true,
    blockedBy: ['engine_cover'],
    access: 'hood',
    partId: 'injector',
    okText: 'Spritzbild sauber, Düse dicht – in Ordnung.',
    defectText: 'Düsennadel hängt, verkokt und tropft nach – defekt!',
  },
  {
    id: `glow${n}`,
    name: `Glühkerze Zyl. ${n}`,
    bolts: 0,
    removeWith: S10,
    blockedBy: [`inj${n}`],
    access: 'hood',
    partId: 'glow_plug',
    okText: 'Glühstift unbeschädigt, Widerstand im Soll – in Ordnung.',
    defectText: 'Glühstift aufgebläht und durchgebrannt – defekt!',
  },
      ]
    : [
  {
    id: `coil${n}`,
    name: `Zündspule Zyl. ${n}`,
    bolts: 1,
    fastener: S10,
    connector: true,
    hidden: true,
    blockedBy: ['engine_cover'],
    access: 'hood',
    partId: 'ignition_coil',
    okText: 'Kein Riss, Kontakte sauber – in Ordnung.',
    defectText: 'Haarriss im Gehäuse und Schmauchspuren – defekt!',
  },
  {
    id: `plug${n}`,
    name: `Zündkerze Zyl. ${n}`,
    bolts: 0,
    removeWith: { driver: 'ratchet', socket: 'socket16' },
    blockedBy: [`coil${n}`],
    access: 'hood',
    partId: 'spark_plug',
    okText: 'Elektrode rehbraun, Abstand passt – in Ordnung.',
    defectText: 'Elektrode abgebrannt und verrußt – verschlissen!',
  },
      ];

/** Oberes Bauteil eines Zylinders (Spule bzw. Einspritzdüse) und das darunter (Kerze bzw. Glühkerze). */
export const topId = (engine: EngineDef, n: number) => `${engine.fuel === 'diesel' ? 'inj' : 'coil'}${n}`;
export const plugId = (engine: EngineDef, n: number) => `${engine.fuel === 'diesel' ? 'glow' : 'plug'}${n}`;

const corner = (s: 'fl' | 'fr', label: string): ComponentDef[] => [
  {
    id: `wheel_${s}`,
    name: `Rad vorne ${label}`,
    bolts: 5,
    fastener: { ...S17, torque: true },
    blockedBy: [],
    access: 'lifted',
    partId: 'tire',
    okText: 'Reifen mit gutem Profil, Felge in Ordnung.',
    defectText: 'Reifen porös, rissig und völlig überaltert – so nicht fahrbar!',
    inspectReveals: [`pads_${s}`, `disc_${s}`],
  },
  {
    id: `caliper_${s}`,
    name: `Bremssattel vorne ${label}`,
    bolts: 2,
    fastener: S17,
    blockedBy: [`wheel_${s}`],
    access: 'lifted',
    okText: 'Bremssattel gängig und dicht.',
    defectText: '',
    inspectReveals: [`pads_${s}`],
  },
  {
    id: `pads_${s}`,
    name: `Bremsbeläge vorne ${label}`,
    bolts: 0,
    blockedBy: [`caliper_${s}`],
    access: 'lifted',
    partId: 'brake_pads',
    okText: 'Belagstärke 9 mm – in Ordnung.',
    defectText: 'Belagstärke nur noch 1,5 mm – verschlissen!',
  },
  {
    id: `disc_${s}`,
    name: `Bremsscheibe vorne ${label}`,
    bolts: 1,
    fastener: { driver: 'screwdriver' },
    blockedBy: [`pads_${s}`],
    access: 'lifted',
    partId: 'brake_disc',
    okText: 'Scheibe glatt, Stärke im Soll – in Ordnung.',
    defectText: 'Tiefe Riefen und deutlicher Grat am Rand – verschlissen!',
  },
];

function build(engine: EngineDef): ComponentDef[] {
  const slots = cylinderSlots(engine);
  const diesel = engine.fuel === 'diesel';
  const v = isV(engine);
  const tops = (bank: number) => slots.filter((c) => !v || c.bank === bank).map((c) => topId(engine, c.n));
  const out: ComponentDef[] = [
  {
    id: 'engine_cover',
    name: 'Motorabdeckung',
    bolts: 0,
    blockedBy: [],
    access: 'hood',
    okText: 'Kunststoffabdeckung, nur geclipst.',
    defectText: '',
  },
  ...slots.flatMap((c) => cylinder(c.n, diesel)),
  {
    id: 'valve_cover',
    name: v ? 'Ventildeckel Bank 1' : 'Ventildeckel',
    bolts: v ? 4 : 6,
    fastener: S10,
    blockedBy: tops(-1),
    access: 'hood',
    okText: 'Ventildeckel trocken, keine Ölspuren.',
    defectText: '',
    inspectReveals: ['gasket'],
  },
  {
    id: 'gasket',
    name: 'Ventildeckeldichtung',
    bolts: 0,
    blockedBy: ['valve_cover'],
    access: 'hood',
    partId: 'valve_cover_gasket',
    okText: 'Dichtung elastisch und dicht.',
    defectText: 'Ölspuren am Deckelrand – Dichtung hart und undicht!',
  },
  {
    id: 'rocker',
    name: 'Hydrostößel (Ventiltrieb)',
    bolts: 2,
    fastener: S10,
    blockedBy: ['valve_cover'],
    access: 'hood',
    partId: 'lifters',
    okText: 'Stößel fest und ölgefüllt, Nocken ohne Laufspuren.',
    defectText: 'Stößel lassen sich eindrücken, Laufspuren an den Nocken – verschlissen!',
  },
  {
    id: 'oil_filter',
    name: 'Ölfilter',
    bolts: 0,
    removeWith: { driver: 'wrench' },
    blockedBy: [],
    access: 'hood',
    partId: 'oil_filter',
    consumable: true,
    okText: 'Filtergehäuse dicht.',
    defectText: 'Gebrauchter Filtereinsatz – gehört in den Müll.',
  },
  {
    id: 'battery',
    name: 'Batterie',
    bolts: 1,
    fastener: S10,
    blockedBy: [],
    access: 'hood',
    partId: 'battery',
    hidden: true,
    okText: 'Ruhespannung 12,6 V – in Ordnung.',
    defectText: 'Tiefentladen und sulfatiert – hält keine Ladung mehr!',
  },
  {
    id: 'intake_hose',
    name: 'Ansaugschlauch',
    bolts: 1,
    fastener: { driver: 'screwdriver' },
    blockedBy: [],
    access: 'hood',
    partId: 'intake_hose',
    okText: 'Gummi elastisch, keine Risse.',
    defectText: 'Tiefer Riss in der Falte – hier zieht der Motor Falschluft!',
  },
  {
    id: 'chain_tensioner',
    name: 'Steuerkettenspanner',
    bolts: 0,
    removeWith: S17,
    blockedBy: [],
    access: 'hood',
    partId: 'chain_tensioner',
    hidden: true,
    okText: 'Spannkolben hält den Druck – in Ordnung.',
    defectText: 'Spannkolben fällt ohne Widerstand zusammen – defekt!',
  },
  {
    id: 'belt',
    name: 'Keilrippenriemen',
    bolts: 0,
    removeWith: { driver: 'wrench' },
    blockedBy: [],
    access: 'hood',
    partId: 'belt',
    okText: 'Rippen sauber, keine Risse – in Ordnung.',
    defectText: 'Querrisse und ausgefranste Kante – kurz vor dem Reißen!',
  },
  {
    id: 'alternator',
    name: 'Lichtmaschine',
    bolts: 2,
    fastener: S13,
    connector: true,
    blockedBy: ['belt'],
    access: 'hood',
    partId: 'alternator',
    hidden: true,
    okText: 'Lädt mit 14,2 V – in Ordnung.',
    defectText: 'Lädt nicht mehr, Regler durchgebrannt – defekt!',
  },
  {
    id: 'water_pump',
    name: 'Wasserpumpe',
    bolts: 4,
    fastener: S10,
    blockedBy: ['belt'],
    access: 'hood',
    partId: 'water_pump',
    okText: 'Trocken, Lager spielfrei – in Ordnung.',
    defectText: 'Kühlmittelspuren an der Welle – Pumpe undicht!',
  },
  {
    id: 'hose',
    name: 'Kühlmittelschlauch',
    bolts: 1,
    fastener: { driver: 'screwdriver' },
    blockedBy: [],
    access: 'hood',
    partId: 'coolant_hose',
    okText: 'Schlauch elastisch und dicht.',
    defectText: 'Schlauch aufgequollen und an der Schelle feucht – undicht!',
  },
  {
    id: 'thermostat',
    name: 'Thermostat',
    bolts: 2,
    fastener: S10,
    blockedBy: ['hose'],
    access: 'hood',
    partId: 'thermostat',
    hidden: true,
    okText: 'Öffnet bei 88 °C – in Ordnung.',
    defectText: 'Hängt offen fest, Motor wird nicht warm – defekt!',
  },
  {
    id: 'oil_pan',
    name: 'Ölwanne',
    bolts: 4,
    fastener: S10,
    blockedBy: [],
    access: 'lifted',
    okText: 'Ölwanne trocken.',
    defectText: '',
    inspectReveals: ['oil_pan_gasket'],
  },
  {
    id: 'drain_plug',
    name: 'Ölablassschraube',
    bolts: 0,
    removeWith: S17,
    blockedBy: [],
    access: 'lifted',
    okText: 'Ablassschraube fest und trocken.',
    defectText: '',
  },
  {
    id: 'oil_pan_gasket',
    name: 'Ölwannendichtung',
    bolts: 0,
    blockedBy: ['oil_pan'],
    access: 'lifted',
    partId: 'oil_pan_gasket',
    okText: 'Dichtung sitzt sauber und ist dicht.',
    defectText: 'Öl tropft am Wannenrand – Dichtung undicht!',
  },
  {
    id: 'bearing',
    name: 'Pleuellager',
    bolts: 2,
    fastener: S13,
    blockedBy: ['oil_pan'],
    access: 'lifted',
    partId: 'rod_bearing',
    okText: 'Lagerschale glatt und gleichmäßig grau – in Ordnung.',
    defectText: 'Lagerschale eingelaufen, Kupfer scheint durch – Lagerschaden!',
  },
  ...corner('fl', 'links'),
  ...corner('fr', 'rechts'),
  ];
  if (v) {
    out.push(
      {
        id: 'valve_cover_b', name: 'Ventildeckel Bank 2', bolts: 4, fastener: S10, blockedBy: tops(1), access: 'hood',
        okText: 'Ventildeckel trocken, keine Ölspuren.', defectText: '', inspectReveals: ['gasket_b'],
      },
      {
        id: 'gasket_b', name: 'Ventildeckeldichtung Bank 2', bolts: 0, blockedBy: ['valve_cover_b'], access: 'hood', partId: 'valve_cover_gasket',
        okText: 'Dichtung elastisch und dicht.', defectText: 'Ölspuren am Deckelrand – Dichtung hart und undicht!',
      },
    );
  }
  if (engine.turbo) {
    out.push(
      {
        id: 'charge_pipe', name: 'Ladeluftrohr', bolts: 1, fastener: { driver: 'screwdriver' }, blockedBy: [], access: 'hood', partId: 'charge_pipe',
        okText: 'Rohr und Muffen dicht, Schelle fest.', defectText: 'Muffe eingerissen und ölig – hier entweicht Ladedruck!',
      },
      {
        id: 'turbo', name: 'Turbolader', bolts: 3, fastener: S13, blockedBy: ['charge_pipe'], access: 'hood', partId: 'turbo', hidden: true,
        okText: 'Welle spielfrei, Verdichterrad sauber – in Ordnung.', defectText: 'Welle hat fühlbares Spiel, Verdichterrad schleift am Gehäuse – defekt!',
      },
    );
  }
  if (diesel) {
    out.push(
      {
        id: 'egr', name: 'AGR-Ventil', bolts: 2, fastener: S10, connector: true, blockedBy: [], access: 'hood', partId: 'egr', hidden: true,
        okText: 'Ventil gängig, kaum Ruß – in Ordnung.', defectText: 'Ventil völlig verkokt und klemmt offen – defekt!',
      },
      {
        id: 'dpf', name: 'Partikelfilter', bolts: 2, fastener: S13, blockedBy: [], access: 'lifted', partId: 'dpf', hidden: true,
        okText: 'Differenzdruck im Soll – in Ordnung.', defectText: 'Filter restlos zugesetzt, lässt kaum noch Abgas durch – defekt!',
      },
    );
  }
  return out;
}

const cache = new Map<string, { list: ComponentDef[]; map: Record<string, ComponentDef> }>();
function forEngine(engineId: string) {
  let c = cache.get(engineId);
  if (!c) {
    const list = build(ENGINES[engineId] ?? ENGINES.r4_20);
    c = { list, map: Object.fromEntries(list.map((d) => [d.id, d])) };
    cache.set(engineId, c);
  }
  return c;
}

export const engineOf = (car: Pick<CarInstance, 'modelId'>): EngineDef => ENGINES[CAR_MODELS[car.modelId]?.engineId] ?? ENGINES.r4_20;
/** Alle Bauteile, die es an diesem Auto gibt. */
export const defsOf = (car: Pick<CarInstance, 'modelId'>): ComponentDef[] => forEngine(engineOf(car).id).list;
export const defOf = (car: Pick<CarInstance, 'modelId'>, id: string): ComponentDef => forEngine(engineOf(car).id).map[id] ?? COMPONENT_MAP[id];
export const engineComponents = (engineId: string): ComponentDef[] => forEngine(engineId).list;

/**
 * Alle Bauteile über alle Motoren hinweg – nur für Namen und feste
 * Eigenschaften. Was vor einem Bauteil sitzt, hängt vom Motor ab: dafür `defOf`.
 */
export const COMPONENT_MAP: Record<string, ComponentDef> = Object.fromEntries(
  Object.keys(ENGINES).flatMap((id) => forEngine(id).list.map((d) => [d.id, d] as const)).reverse(),
);
