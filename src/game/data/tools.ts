import type { ToolId, ToolNeed } from '../types';

export interface ToolDef {
  id: ToolId;
  name: string;
  short: string;
  icon: string;
  /** builtin = immer dabei, driver = wird aktiv benutzt, socket = steckt automatisch auf der Ratsche. */
  kind: 'builtin' | 'driver' | 'socket' | 'device' | 'station';
  hint: string;
}

export const MAX_CARRIED = 3;

export const TOOLS: ToolDef[] = [
  { id: 'hand', name: 'Hand', short: 'Hand', icon: '✋', kind: 'builtin', hint: 'Teile aus- und einbauen, Haube öffnen' },
  { id: 'lamp', name: 'Prüflampe', short: 'Lampe', icon: '🔦', kind: 'builtin', hint: 'Bauteile begutachten' },
  { id: 'ratchet', name: 'Ratsche', short: 'Ratsche', icon: '🔧', kind: 'driver', hint: 'Braucht die passende Stecknuss' },
  { id: 'socket10', name: 'Stecknuss 10 mm', short: 'Nuss 10', icon: '⬡', kind: 'socket', hint: 'Zündspulen, Ventildeckel, Wasserpumpe, Thermostat, Ölwanne' },
  { id: 'socket13', name: 'Stecknuss 13 mm', short: 'Nuss 13', icon: '⬡', kind: 'socket', hint: 'Lichtmaschine' },
  { id: 'socket16', name: 'Zündkerzennuss 16 mm', short: 'Kerzennuss', icon: '⬡', kind: 'socket', hint: 'Zündkerzen' },
  { id: 'socket17', name: 'Stecknuss 17 mm', short: 'Nuss 17', icon: '⬡', kind: 'socket', hint: 'Radschrauben, Bremssattel' },
  { id: 'torque', name: 'Drehmomentschlüssel', short: 'Drehmoment', icon: '📏', kind: 'driver', hint: 'Radschrauben korrekt anziehen (mit 17er Nuss)' },
  { id: 'wrench', name: 'Schraubenschlüssel', short: 'Schlüssel', icon: '🗜️', kind: 'driver', hint: 'Riemenspanner entlasten' },
  { id: 'screwdriver', name: 'Schraubendreher', short: 'Dreher', icon: '🪛', kind: 'driver', hint: 'Schlauchschellen, Bremsscheiben-Halteschraube' },
  { id: 'obd', name: 'OBD-Diagnosegerät', short: 'OBD', icon: '📟', kind: 'device', hint: 'Fehlerspeicher auslesen: Gerät wählen, Auto antippen' },
  // Geräte am Waschplatz und in der Lackierkabine – stehen dort bereit, werden nicht getragen.
  { id: 'washer', name: 'Hochdruckreiniger', short: 'Hochdruck', icon: '💦', kind: 'station', hint: 'Vorspülen und Abspülen' },
  { id: 'foam', name: 'Schaumlanze', short: 'Schaum', icon: '🫧', kind: 'station', hint: 'Karosserie einschäumen' },
  { id: 'brush', name: 'Felgenbürste', short: 'Felgen', icon: '🪥', kind: 'station', hint: 'Felgen schrubben' },
  { id: 'towel', name: 'Trockentuch', short: 'Trocknen', icon: '🧽', kind: 'station', hint: 'Abledern' },
  { id: 'polisher', name: 'Poliermaschine', short: 'Polieren', icon: '✨', kind: 'station', hint: 'Lack aufpolieren' },
  { id: 'vacuum', name: 'Staubsauger', short: 'Saugen', icon: '🧹', kind: 'station', hint: 'Fußraum' },
  { id: 'upholstery', name: 'Polsterreiniger', short: 'Sitze', icon: '🪑', kind: 'station', hint: 'Sitze' },
  { id: 'cockpit', name: 'Cockpitpflege', short: 'Cockpit', icon: '🧴', kind: 'station', hint: 'Armaturenbrett' },
  { id: 'sander', name: 'Schleifer', short: 'Schleifen', icon: '🪚', kind: 'station', hint: 'Rost entfernen und grundieren' },
  { id: 'spraygun', name: 'Lackierpistole', short: 'Lackieren', icon: '🎨', kind: 'station', hint: 'Bereich lackieren' },
];

export const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.id, t])) as Record<ToolId, ToolDef>;
export const CABINET_TOOLS = TOOLS.filter((t) => t.kind === 'driver' || t.kind === 'socket' || t.kind === 'device');
export const toolName = (id: ToolId) => TOOL_MAP[id].name;

const NUSS: Partial<Record<ToolId, string>> = { socket10: '10er Nuss', socket13: '13er Nuss', socket16: 'Kerzennuss', socket17: '17er Nuss' };
/** Womit eine Schraube gelöst wird – für die Beschriftung beim Anvisieren. */
export function fastenerText(need: ToolNeed): string {
  const base = need.driver === 'ratchet' ? `🔧 Ratsche + ${NUSS[need.socket!] ?? 'Nuss'}` : need.driver === 'screwdriver' ? '🪛 Schraubendreher' : '🗜️ Schraubenschlüssel';
  return need.torque ? `${base}, festziehen mit 📏 Drehmomentschlüssel` : base;
}
