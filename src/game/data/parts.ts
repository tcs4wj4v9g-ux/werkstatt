import type { PartId } from '../types';

export interface PartDef {
  id: PartId;
  name: string;
  price: number;
  /** Stückzahl pro Kauf (z. B. Bremsbeläge achsweise). */
  units: number;
  desc: string;
  /** Abteilung im Teileshop. */
  kind?: 'revision' | 'swap' | 'tuning';
  /** Tuningteil: ersetzt beim Einbau dieses Serienteil. */
  replaces?: PartId;
}

export const PARTS: Record<PartId, PartDef> = {
  ignition_coil: { id: 'ignition_coil', name: 'Zündspule', price: 49, units: 1, desc: 'Stabzündspule, 1 Stück' },
  spark_plug: { id: 'spark_plug', name: 'Zündkerze', price: 9, units: 1, desc: '1 Stück' },
  brake_pads: { id: 'brake_pads', name: 'Bremsbeläge Vorderachse', price: 79, units: 2, desc: 'Satz für links und rechts' },
  brake_disc: { id: 'brake_disc', name: 'Bremsscheiben Vorderachse', price: 128, units: 2, desc: 'Paar für links und rechts' },
  valve_cover_gasket: { id: 'valve_cover_gasket', name: 'Ventildeckeldichtung', price: 39, units: 1, desc: 'Dichtungssatz' },
  belt: { id: 'belt', name: 'Keilrippenriemen', price: 29, units: 1, desc: 'Antrieb für Lichtmaschine und Wasserpumpe' },
  water_pump: { id: 'water_pump', name: 'Wasserpumpe', price: 89, units: 1, desc: 'inkl. Dichtung' },
  thermostat: { id: 'thermostat', name: 'Thermostat', price: 45, units: 1, desc: 'mit Gehäuse' },
  alternator: { id: 'alternator', name: 'Lichtmaschine', price: 240, units: 1, desc: 'generalüberholt' },
  oil_pan_gasket: { id: 'oil_pan_gasket', name: 'Ölwannendichtung', price: 34, units: 1, desc: 'Dichtung Ölwanne' },
  intake_hose: { id: 'intake_hose', name: 'Ansaugschlauch', price: 28, units: 1, desc: 'Gummibalg zwischen Luftfilter und Drosselklappe' },
  coolant_hose: { id: 'coolant_hose', name: 'Kühlmittelschlauch', price: 24, units: 1, desc: 'Schlauch zum Thermostat' },
  rod_bearing: { id: 'rod_bearing', name: 'Pleuellager-Satz', price: 380, units: 1, desc: 'Lagerschalen inkl. Schrauben – teure Motorreparatur' },
  lifters: { id: 'lifters', name: 'Hydrostößel-Satz', price: 160, units: 1, desc: 'Ventilspielausgleich, kompletter Satz' },
  chain_tensioner: { id: 'chain_tensioner', name: 'Steuerkettenspanner', price: 95, units: 1, desc: 'hydraulischer Kettenspanner' },
  oil_filter: { id: 'oil_filter', name: 'Ölfilter', price: 14, units: 1, desc: 'Filtereinsatz mit Dichtring – bei jedem Ölwechsel neu' },
  battery: { id: 'battery', name: 'Starterbatterie', price: 115, units: 1, desc: '12 V, 70 Ah' },
  tire: { id: 'tire', name: 'Reifen (Paar Vorderachse)', price: 180, units: 2, desc: 'zwei neue Reifen, auf Felge montiert' },
  injector: { id: 'injector', name: 'Einspritzdüse', price: 190, units: 1, desc: 'Diesel-Injektor, 1 Stück' },
  glow_plug: { id: 'glow_plug', name: 'Glühkerze', price: 18, units: 1, desc: 'Stabglühkerze, 1 Stück' },
  turbo: { id: 'turbo', name: 'Turbolader', price: 780, units: 1, desc: 'generalüberholt, mit Dichtsatz' },
  charge_pipe: { id: 'charge_pipe', name: 'Ladeluftrohr', price: 85, units: 1, desc: 'Rohr mit Muffen und Schelle' },
  egr: { id: 'egr', name: 'AGR-Ventil', price: 210, units: 1, desc: 'Abgasrückführventil mit Stellmotor' },
  head_gasket: { id: 'head_gasket', name: 'Zylinderkopfdichtung', price: 240, units: 1, desc: 'Dichtsatz mit neuen Kopfschrauben' },
  gearbox: { id: 'gearbox', name: 'Austauschgetriebe', price: 1900, units: 1, desc: 'generalüberholt – nur mit Getriebeheber einzubauen' },
  dpf: { id: 'dpf', name: 'Partikelfilter', price: 950, units: 1, desc: 'Dieselpartikelfilter' },
  // Motorrevision
  piston_kit: { id: 'piston_kit', name: 'Kolben mit Ringen', price: 140, units: 1, desc: 'Kolben, Ringsatz, Bolzen – je Zylinder', kind: 'revision' },
  main_bearing: { id: 'main_bearing', name: 'Hauptlagersatz', price: 260, units: 1, desc: 'Lagerschalen und Anlaufscheiben', kind: 'revision' },
  crankshaft: { id: 'crankshaft', name: 'Kurbelwelle (geschliffen)', price: 690, units: 1, desc: 'Austausch, Lagerzapfen geschliffen', kind: 'revision' },
  oil_pump: { id: 'oil_pump', name: 'Ölpumpe', price: 170, units: 1, desc: 'mit Druckregelventil', kind: 'revision' },
  camshaft: { id: 'camshaft', name: 'Nockenwellensatz', price: 420, units: 1, desc: 'Einlass und Auslass', kind: 'revision' },
  timing_chain: { id: 'timing_chain', name: 'Steuerkettensatz', price: 230, units: 1, desc: 'Kette, Räder, Gleitschienen', kind: 'revision' },
  exhaust_manifold: { id: 'exhaust_manifold', name: 'Abgaskrümmer', price: 260, units: 1, desc: 'Gusskrümmer mit Dichtungen', kind: 'revision' },
  intake_manifold: { id: 'intake_manifold', name: 'Ansaugkrümmer', price: 190, units: 1, desc: 'mit Dichtungen', kind: 'revision' },
  engine_mount: { id: 'engine_mount', name: 'Motorlager-Satz', price: 120, units: 1, desc: 'Gummilager links und rechts' },
  downpipe: { id: 'downpipe', name: 'Hosenrohr', price: 160, units: 1, desc: 'mit Flanschdichtung' },
  fuel_pump: { id: 'fuel_pump', name: 'Kraftstoffpumpe', price: 180, units: 1, desc: 'Tankpumpe mit Sieb' },
  harness: { id: 'harness', name: 'Motorkabelbaum', price: 320, units: 1, desc: 'Hauptstecker mit Leitungen' },
  // Motorumbau
  swap_mounts: { id: 'swap_mounts', name: 'Angepasste Motorhalter', price: 380, units: 1, desc: 'Adapterkonsolen für den neuen Motor', kind: 'swap' },
  swap_adapter: { id: 'swap_adapter', name: 'Getriebeadapterplatte', price: 540, units: 1, desc: 'Verbindet Motor und vorhandenes Getriebe', kind: 'swap' },
  swap_harness: { id: 'swap_harness', name: 'Umbau-Kabelbaum', price: 460, units: 1, desc: 'Motorkabelbaum passend zum Fahrzeug', kind: 'swap' },
  swap_ecu: { id: 'swap_ecu', name: 'Motorsteuergerät für Umbau', price: 690, units: 1, desc: 'Steuergerät mit Wegfahrsperren-Anpassung', kind: 'swap' },
  swap_radiator: { id: 'swap_radiator', name: 'Größerer Kühler', price: 320, units: 1, desc: 'Mehr Kühlleistung für mehr Leistung', kind: 'swap' },
  swap_fuel: { id: 'swap_fuel', name: 'Umbau-Kraftstoffanlage', price: 420, units: 1, desc: 'Pumpe, Leitungen und Druckregler für die andere Kraftstoffart', kind: 'swap' },
  swap_exhaust: { id: 'swap_exhaust', name: 'Umbau-Abgasanlage', price: 480, units: 1, desc: 'Krümmeranschluss und Rohrführung für den neuen Motor', kind: 'swap' },
  clutch_hd: { id: 'clutch_hd', name: 'Verstärkte Kupplung', price: 560, units: 1, desc: 'Hält deutlich mehr Drehmoment', kind: 'swap' },
  // Leistungstuning – jedes Teil wird anstelle eines Serienteils eingebaut
  turbo_kit: { id: 'turbo_kit', name: 'Turbo-Nachrüstsatz', price: 2400, units: 1, desc: 'Turbolader, Ladeluftrohr, Ölleitungen – für Saugmotoren', kind: 'tuning' },
  turbo_big: { id: 'turbo_big', name: 'Größerer Turbolader', price: 1650, units: 1, desc: 'Mehr Luft – braucht Einspritzung, Kühlung und Abstimmung', kind: 'tuning', replaces: 'turbo' },
  injector_hp: { id: 'injector_hp', name: 'Hochleistungs-Einspritzdüse', price: 260, units: 1, desc: 'Mehr Durchfluss – je Zylinder eine', kind: 'tuning', replaces: 'injector' },
  piston_forged: { id: 'piston_forged', name: 'Geschmiedeter Kolben mit H-Pleuel', price: 420, units: 1, desc: 'Hält hohe Drücke aus – je Zylinder einer', kind: 'tuning', replaces: 'piston_kit' },
  camshaft_sport: { id: 'camshaft_sport', name: 'Sportnockenwellen', price: 780, units: 1, desc: 'Mehr Hub und Öffnungsdauer, mit verstärkten Ventilfedern', kind: 'tuning', replaces: 'camshaft' },
  intake_sport: { id: 'intake_sport', name: 'Sportluftfilter mit Ansaugrohr', price: 240, units: 1, desc: 'Offener Pilzfilter, größerer Querschnitt', kind: 'tuning', replaces: 'intake_hose' },
  exhaust_sport: { id: 'exhaust_sport', name: 'Sportabgasanlage', price: 890, units: 1, desc: 'Größerer Querschnitt, kräftigerer Klang', kind: 'tuning', replaces: 'downpipe' },
  manifold_sport: { id: 'manifold_sport', name: 'Fächerkrümmer', price: 620, units: 1, desc: 'Gleich lange Einzelrohre', kind: 'tuning', replaces: 'exhaust_manifold' },
  intercooler: { id: 'intercooler', name: 'Ladeluftkühler-Kit', price: 540, units: 1, desc: 'Großer Frontkühler mit Rohren – kühlere Ladeluft', kind: 'tuning', replaces: 'charge_pipe' },
  fuelpump_hp: { id: 'fuelpump_hp', name: 'Hochleistungs-Kraftstoffpumpe', price: 340, units: 1, desc: 'Mehr Fördermenge', kind: 'tuning', replaces: 'fuel_pump' },
};

export const PART_LIST = Object.values(PARTS);

/** Teile, die zum Fahrwerk gehören und nach Fahrzeugklasse passen; alles andere außer der Batterie gehört zum Motor. */
export const CHASSIS_PARTS: PartId[] = ['brake_pads', 'brake_disc', 'tire'];
export const UNIVERSAL_PARTS: PartId[] = ['battery', 'turbo_kit', 'intake_sport', 'swap_harness', 'swap_ecu', 'swap_radiator', 'swap_fuel', 'clutch_hd', 'fuel_pump', 'fuelpump_hp'];
