import type { ToolId } from '../types';

export interface ToolDef {
  id: ToolId;
  name: string;
  short: string;
  icon: string;
  /** builtin = immer dabei, driver = wird aktiv benutzt, socket = steckt automatisch auf der Ratsche. */
  kind: 'builtin' | 'driver' | 'socket' | 'device';
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
];

export const TOOL_MAP = Object.fromEntries(TOOLS.map((t) => [t.id, t])) as Record<ToolId, ToolDef>;
export const CABINET_TOOLS = TOOLS.filter((t) => t.kind !== 'builtin');
export const toolName = (id: ToolId) => TOOL_MAP[id].name;
