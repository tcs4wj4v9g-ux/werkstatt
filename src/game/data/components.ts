import type { CarInstance, ComponentDef, MotorMeta, ToolNeed } from '../types';
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
    variants: ['injector_hp'],
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

const corner = (s: 'fl' | 'fr' | 'rl' | 'rr', label: string, axle = s[0] === 'r' ? 'hinten' : 'vorne'): ComponentDef[] => [
  {
    id: `wheel_${s}`,
    name: `Rad ${axle} ${label}`,
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
    name: `Bremssattel ${axle} ${label}`,
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
    name: `Bremsbeläge ${axle} ${label}`,
    bolts: 0,
    blockedBy: [`caliper_${s}`],
    access: 'lifted',
    partId: 'brake_pads',
    okText: 'Belagstärke 9 mm – in Ordnung.',
    defectText: 'Belagstärke nur noch 1,5 mm – verschlissen!',
  },
  {
    id: `disc_${s}`,
    name: `Bremsscheibe ${axle} ${label}`,
    bolts: 1,
    fastener: { driver: 'screwdriver' },
    blockedBy: [`pads_${s}`],
    access: 'lifted',
    partId: 'brake_disc',
    okText: 'Scheibe glatt, Stärke im Soll – in Ordnung.',
    defectText: 'Tiefe Riefen und deutlicher Grat am Rand – verschlissen!',
  },
];

function build(engine: EngineDef, turboKit = false): ComponentDef[] {
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
    id: 'cyl_head',
    name: v ? 'Zylinderkopf Bank 1' : 'Zylinderkopf',
    bolts: 6,
    fastener: S13,
    blockedBy: ['rocker', 'gasket'],
    access: 'hood',
    okText: 'Kopf plan, keine Risse zwischen den Ventilsitzen.',
    defectText: '',
    inspectReveals: ['head_gasket'],
  },
  {
    id: 'head_gasket',
    name: 'Zylinderkopfdichtung',
    bolts: 0,
    blockedBy: ['cyl_head'],
    access: 'hood',
    partId: 'head_gasket',
    hidden: true,
    okText: 'Dichtung rundum sauber abgedichtet – in Ordnung.',
    defectText: 'Zwischen zwei Zylindern durchgebrannt, Kühlmittelspuren im Brennraum – defekt!',
  },
  {
    id: 'gearbox',
    name: 'Getriebe',
    bolts: 4,
    fastener: S17,
    blockedBy: [],
    access: 'lifted',
    partId: 'gearbox',
    hidden: true,
    equipment: 'hoist',
    okText: 'Wellen spielfrei, Öl sauber – in Ordnung.',
    defectText: 'Späne im Öl, Synchronringe verschlissen, Lagerspiel – defekt!',
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
    variants: ['intake_sport'],
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
  ...corner('rl', 'links'),
  ...corner('rr', 'rechts'),
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
  if (engine.turbo || turboKit) {
    out.push(
      {
        id: 'charge_pipe', name: turboKit && !engine.turbo ? 'Ladeluftrohr (Nachrüstsatz)' : 'Ladeluftrohr', bolts: 1, fastener: { driver: 'screwdriver' }, blockedBy: [], access: 'hood', partId: 'charge_pipe', variants: ['intercooler'],
        okText: 'Rohr und Muffen dicht, Schelle fest.', defectText: 'Muffe eingerissen und ölig – hier entweicht Ladedruck!',
      },
      {
        id: 'turbo', name: 'Turbolader', bolts: 3, fastener: S13, blockedBy: ['charge_pipe'], access: 'hood', partId: 'turbo', hidden: true, variants: ['turbo_big'],
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
  // ---------- Fahrzeugseite rund um den Motor: muss für einen Motorausbau gelöst werden ----------
  out.push(
    {
      id: 'harness', name: 'Motorkabelbaum (Hauptstecker)', bolts: 0, connector: true, blockedBy: [], access: 'hood', partId: 'harness',
      okText: 'Steckverbindung sauber, Verriegelung intakt.', defectText: 'Kontakte korrodiert – Wackelkontakt!',
    },
    {
      id: 'mounts', name: 'Motorlager und Getriebeglocke', bolts: 4, fastener: S17, blockedBy: [], access: 'hood', partId: 'engine_mount',
      okText: 'Gummilager ohne Risse.', defectText: 'Gummilager gerissen – der Motor schlägt beim Lastwechsel!',
    },
    {
      id: 'downpipe', name: 'Hosenrohr (Abgasanlage)', bolts: 2, fastener: S13, blockedBy: [], access: 'lifted', partId: 'downpipe', variants: ['exhaust_sport'],
      okText: 'Flansch dicht, Rohr ohne Durchrostung.', defectText: 'Durchgerostet – die Abgasanlage bläst ab!',
    },
    {
      id: 'fuel_pump', name: 'Kraftstoffpumpe', bolts: 2, fastener: S10, connector: true, blockedBy: [], access: 'lifted', partId: 'fuel_pump', variants: ['fuelpump_hp'],
      okText: 'Fördermenge im Soll.', defectText: 'Pumpe singt und fördert zu wenig – defekt!',
    },
  );

  // ---------- Motorinneres: nur am ausgebauten Motor auf dem Motorständer zugänglich ----------
  const mains = Math.min(10, (engine.cylinders / (v ? 2 : 1) + 1) * 2);
  out.push(
    {
      id: 'intake_manifold', name: 'Ansaugkrümmer', bolts: 4, fastener: S13, blockedBy: [], access: 'stand', partId: 'intake_manifold',
      okText: 'Flansch plan, Dichtungen sauber.', defectText: 'Dichtflansch verzogen – zieht Falschluft!',
    },
    {
      id: 'exhaust_manifold', name: 'Abgaskrümmer', bolts: 4, fastener: S13, blockedBy: engine.turbo || turboKit ? ['turbo'] : [], access: 'stand', partId: 'exhaust_manifold', variants: ['manifold_sport'],
      okText: 'Krümmer ohne Risse.', defectText: 'Haarriss am Sammelrohr – bläst ab!',
    },
    {
      id: 'timing_chain', name: 'Steuerkette mit Rädern', bolts: 0, blockedBy: ['chain_tensioner', ...(v ? ['valve_cover', 'valve_cover_b'] : ['valve_cover'])], access: 'stand', partId: 'timing_chain', hidden: true,
      okText: 'Kette ohne Längung, Gleitschienen glatt.', defectText: 'Kette deutlich gelängt, Gleitschiene eingelaufen – verschlissen!',
    },
    {
      id: 'camshaft', name: v ? 'Nockenwellen Bank 1' : 'Nockenwellen', bolts: 4, fastener: S10, blockedBy: ['timing_chain', 'rocker'], access: 'stand', partId: 'camshaft', hidden: true, variants: ['camshaft_sport'],
      okText: 'Nocken glatt, Lagerstellen ohne Riefen.', defectText: 'Nocken eingelaufen, Laufbahnen mit Pittings – verschlissen!',
    },
    ...(v
      ? [
          {
            id: 'camshaft_b', name: 'Nockenwellen Bank 2', bolts: 4, fastener: S10, blockedBy: ['timing_chain', 'gasket_b'], access: 'stand' as const, partId: 'camshaft' as const, hidden: true, variants: ['camshaft_sport' as const],
            okText: 'Nocken glatt, Lagerstellen ohne Riefen.', defectText: 'Nocken eingelaufen – verschlissen!',
          },
          {
            id: 'cyl_head_b', name: 'Zylinderkopf Bank 2', bolts: 6, fastener: S13, blockedBy: ['camshaft_b', 'intake_manifold', 'exhaust_manifold'], access: 'stand' as const,
            okText: 'Kopf plan, keine Risse.', defectText: '',
          },
          {
            id: 'head_gasket_b', name: 'Zylinderkopfdichtung Bank 2', bolts: 0, blockedBy: ['cyl_head_b'], access: 'stand' as const, partId: 'head_gasket' as const, hidden: true,
            okText: 'Dichtung sauber – in Ordnung.', defectText: 'Durchgebrannt – defekt!',
          },
        ]
      : []),
    {
      id: 'oil_pump', name: 'Ölpumpe', bolts: 3, fastener: S10, blockedBy: ['oil_pan'], access: 'stand', under: true, partId: 'oil_pump', hidden: true,
      okText: 'Zahnräder ohne Laufspuren, Druckventil gängig.', defectText: 'Zahnräder eingelaufen, Spiel viel zu groß – fördert zu wenig Druck!',
    },
    {
      id: 'mainbrg', name: 'Hauptlager (Lagerdeckel)', bolts: mains, fastener: S17, blockedBy: ['oil_pump', 'bearing'], access: 'stand', under: true, partId: 'main_bearing', hidden: true,
      okText: 'Lagerschalen gleichmäßig tragend – in Ordnung.', defectText: 'Lagerschalen bis aufs Kupfer durchgelaufen – verschlissen!',
    },
    ...slots.map((c) => ({
      id: `piston${c.n}`,
      name: `Kolben mit Pleuel Zyl. ${c.n}`,
      bolts: 0,
      blockedBy: [v && c.bank > 0 ? 'head_gasket_b' : 'head_gasket', 'bearing'],
      access: 'stand' as const,
      partId: 'piston_kit' as const,
      hidden: true,
      variants: ['piston_forged' as const],
      okText: 'Kolbenringe mit Spannung, Laufbild sauber.',
      defectText: 'Kolbenringe verkokt und ohne Spannung, Riefen am Kolbenhemd – Ölverbrauch und Kompressionsverlust!',
    })),
    {
      id: 'crank', name: 'Kurbelwelle', bolts: 0, blockedBy: ['mainbrg', 'timing_chain'], access: 'stand', under: true, partId: 'crankshaft', hidden: true,
      okText: 'Lagerzapfen glatt und rund – in Ordnung.', defectText: 'Riefen an den Lagerzapfen – muss getauscht werden!',
    },
  );
  // Was gehört zum Motor? Alles außer Rädern, Bremsen, Batterie, Getriebe, Abgasanlage und den Anschlüssen am Fahrzeug.
  for (const d of out) d.engine = !CAR_SIDE.test(d.id);
  // Luftgekühlt: kein Kühlmittelkreislauf
  if (engine.air) {
    const water = new Set(['water_pump', 'hose', 'thermostat']);
    return out.filter((d) => !water.has(d.id)).map((d) => ({ ...d, blockedBy: d.blockedBy.filter((b) => !water.has(b)) }));
  }
  return out;
}

/** Bauteile der Karosserie bzw. des Fahrwerks: bleiben beim Motorausbau im Auto. */
const CAR_SIDE = /^(wheel_|caliper_|pads_|disc_|battery$|gearbox$|dpf$|intake_hose$|hose$|harness$|mounts$|downpipe$|fuel_pump$)/;

const cache = new Map<string, { list: ComponentDef[]; map: Record<string, ComponentDef> }>();
function forEngine(engineId: string, turboKit = false) {
  const key = engineId + (turboKit ? '+t' : '');
  let c = cache.get(key);
  if (!c) {
    const list = build(ENGINES[engineId] ?? ENGINES.r4_20, turboKit && !ENGINES[engineId]?.turbo);
    c = { list, map: Object.fromEntries(list.map((d) => [d.id, d])) };
    cache.set(key, c);
  }
  return c;
}

type CarLike = Pick<CarInstance, 'modelId'> & Partial<Pick<CarInstance, 'motor' | 'bare'>>;

/** Werksmotor des Modells. */
export const modelEngine = (car: Pick<CarInstance, 'modelId'>): EngineDef => ENGINES[CAR_MODELS[car.modelId]?.engineId] ?? ENGINES.r4_20;
/** Eingebauter (bzw. am Motorständer liegender) Motor. Ohne Motor: der Werksmotor (für Anzeigen). */
export const engineOf = (car: CarLike): EngineDef => (car.motor ? ENGINES[car.motor.engineId] ?? modelEngine(car) : modelEngine(car));
/** Hat das Auto einen Motor? */
export const hasEngine = (car: CarLike) => car.motor !== null;
/** Motordaten des Autos – beim Werksmotor aus Modell und Fahrzeug abgeleitet. */
export const motorOf = (car: Pick<CarInstance, 'modelId' | 'uid' | 'km'> & Partial<Pick<CarInstance, 'motor'>>): MotorMeta | null =>
  car.motor === null ? null : car.motor ?? { uid: `${car.uid}-m`, engineId: modelEngine(car).id, km: car.km, donor: car.modelId, history: [] };

function defsFor(car: CarLike) {
  const e = engineOf(car);
  const all = forEngine(e.id, !!car.motor?.turboKit);
  // Nur der Motor: Fahrzeugteile gibt es nicht. Auto ohne Motor: nur die Fahrzeugteile (vom Werksmotor abgeleitet).
  if (car.bare) return { list: all.list.filter((d) => d.engine), map: all.map };
  if (car.motor === null) {
    const base = forEngine(modelEngine(car).id);
    return { list: base.list.filter((d) => !d.engine), map: base.map };
  }
  return all;
}
/** Alle Bauteile, die es an diesem Auto bzw. Motor gibt. */
export const defsOf = (car: CarLike): ComponentDef[] => defsFor(car).list;
export const defOf = (car: CarLike, id: string): ComponentDef => defsFor(car).map[id] ?? COMPONENT_MAP[id];
export const engineComponents = (engineId: string, turboKit = false): ComponentDef[] => forEngine(engineId, turboKit).list;

/**
 * Alle Bauteile über alle Motoren hinweg – nur für Namen und feste
 * Eigenschaften. Was vor einem Bauteil sitzt, hängt vom Motor ab: dafür `defOf`.
 */
export const COMPONENT_MAP: Record<string, ComponentDef> = Object.fromEntries(
  Object.keys(ENGINES).flatMap((id) => [...forEngine(id).list, ...forEngine(id, true).list].map((d) => [d.id, d] as const)).reverse(),
);
