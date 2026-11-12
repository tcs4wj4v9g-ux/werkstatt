// Symptome sind das, was der Spieler wahrnimmt – nie die Ursache selbst.
// Mehrere Defekte teilen sich Symptome; erst Untersuchungen grenzen ein.

/**
 * Wann ein Symptom auffällt:
 * idle/sound/dash = Motor läuft im Stand, rev = beim Gasgeben,
 * drive = Probefahrt, hood/under/wheels = Sichtprüfung mit der Lampe.
 */
export type Channel = 'idle' | 'sound' | 'dash' | 'rev' | 'drive' | 'hood' | 'under' | 'wheels';

export interface SymptomDef {
  id: string;
  text: string;
  channel: Channel;
  /** Tritt erst bei warmem Motor auf. */
  warm?: boolean;
  /** Kurzform als Verhandlungsargument. */
  argument: string;
  /** Kann (auch) an dieser Betriebsflüssigkeit liegen. */
  fluid?: 'oil' | 'coolant' | 'brake';
}

const list: SymptomDef[] = [
  { id: 'rough_idle', channel: 'idle', text: 'Der Motor läuft im Leerlauf unruhig und schüttelt sich.', argument: 'Unrunder Motorlauf' },
  { id: 'misfire', channel: 'sound', text: 'Gelegentliche Fehlzündungen – der Motor setzt hörbar aus.', argument: 'Fehlzündungen' },
  { id: 'power_loss', channel: 'drive', text: 'Leistungsverlust und Ruckeln beim Beschleunigen.', argument: 'Ruckeln beim Beschleunigen' },
  { id: 'hiss', channel: 'sound', text: 'Leises Zischen aus dem Motorraum bei laufendem Motor.', argument: 'Zischen im Motorraum' },
  { id: 'metal_noise', channel: 'sound', warm: true, text: 'Metallisches Geräusch aus dem Motor, sobald er warm ist.', argument: 'Metallisches Motorgeräusch' },
  { id: 'knock_load', channel: 'rev', warm: true, text: 'Dumpfes Klackern, das unter Last deutlich stärker wird.', argument: 'Klackern unter Last' },
  { id: 'tick_top', channel: 'rev', text: 'Schnelles helles Tickern von oben, das mit der Drehzahl mitgeht.', argument: 'Tickern im Ventiltrieb' },
  { id: 'rattle_start', channel: 'idle', text: 'Rasseln in den ersten Sekunden nach dem Start.', argument: 'Rasseln beim Start' },
  { id: 'squeal', channel: 'sound', text: 'Quietschen aus dem Riementrieb.', argument: 'Quietschender Riemen' },
  { id: 'battery_lamp', channel: 'dash', text: 'Die Batteriekontrollleuchte geht nicht aus.', argument: 'Batterieleuchte brennt' },
  { id: 'temp_high', channel: 'drive', warm: true, text: 'Die Kühlmitteltemperatur steigt bedenklich an.', argument: 'Motor wird zu heiß', fluid: 'coolant' },
  { id: 'temp_low', channel: 'dash', warm: true, text: 'Die Temperaturanzeige bleibt auch bei warmem Motor im Keller.', argument: 'Motor wird nicht warm' },
  { id: 'coolant_wet', channel: 'hood', text: 'Kühlmittelstand niedrig, Feuchtigkeit und Kalkspuren im Motorraum.', argument: 'Kühlmittelverlust' },
  { id: 'oil_top', channel: 'hood', text: 'Der Motor ist oben ölfeucht, es riecht nach verbranntem Öl.', argument: 'Ölfeuchter Motor' },
  { id: 'oil_drip', channel: 'under', text: 'Unter dem Motor hängen Öltropfen, der Unterboden ist verschmiert.', argument: 'Ölverlust' },
  { id: 'brake_look', channel: 'wheels', text: 'Durch die Felgen sieht die Bremse vorn mitgenommen aus.', argument: 'Verschlissene Bremse' },
  { id: 'brake_grind', channel: 'drive', text: 'Schleifgeräusch und schwache Wirkung beim Bremsen.', argument: 'Bremse schleift' },
  { id: 'brake_soft', channel: 'drive', text: 'Das Bremspedal ist weich und lässt sich weit durchtreten.', argument: 'Weiches Bremspedal', fluid: 'brake' },
  { id: 'oil_lamp', channel: 'dash', text: 'Die Öldruck-Warnleuchte flackert.', argument: 'Ölwarnleuchte', fluid: 'oil' },
  { id: 'no_start', channel: 'idle', text: 'Beim Startversuch klackt nur das Relais – der Anlasser dreht nicht.', argument: 'Springt nicht an' },
  { id: 'tire_look', channel: 'wheels', text: 'Die Reifen sind rissig und uralt.', argument: 'Alte Reifen' },
  { id: 'cold_start', channel: 'idle', text: 'Der Diesel springt kalt nur widerwillig an, nagelt hart und qualmt weiß.', argument: 'Schlechter Kaltstart' },
  { id: 'diesel_knock', channel: 'sound', text: 'Hartes, unregelmäßiges Nageln aus dem Motor.', argument: 'Hartes Nageln' },
  { id: 'boost_loss', channel: 'drive', text: 'Unter Last fehlt der Schub – der Ladedruck kommt nicht.', argument: 'Kein Ladedruck' },
  { id: 'turbo_whine', channel: 'rev', text: 'Beim Gasgeben heult es sirenenartig aus dem Turbolader.', argument: 'Turbolader heult' },
  { id: 'boost_hiss', channel: 'rev', text: 'Beim Gasgeben zischt es laut aus dem Ansaugbereich.', argument: 'Zischen unter Last' },
  { id: 'blue_smoke', channel: 'drive', warm: true, text: 'Blauer Rauch aus dem Auspuff – der Motor verbrennt Öl.', argument: 'Blauer Rauch' },
  { id: 'black_smoke', channel: 'drive', text: 'Beim Beschleunigen stößt er eine schwarze Rußwolke aus.', argument: 'Schwarzer Rauch' },
  { id: 'limp_mode', channel: 'drive', warm: true, text: 'Nach kurzer Fahrt geht er in den Notlauf und dreht nicht mehr aus.', argument: 'Notlauf' },
  { id: 'dpf_lamp', channel: 'dash', text: 'Die Partikelfilter-Warnleuchte brennt.', argument: 'DPF-Warnleuchte' },
  { id: 'brake_judder', channel: 'drive', text: 'Beim Bremsen rubbelt und vibriert das Lenkrad.', argument: 'Bremse rubbelt' },
];

export const SYMPTOMS: Record<string, SymptomDef> = Object.fromEntries(list.map((s) => [s.id, s]));
export const SYMPTOM_LIST = list;
