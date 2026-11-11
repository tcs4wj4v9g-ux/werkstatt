import type { ToolId } from '../types';

export const TOOLS: { id: ToolId; name: string; icon: string; hint: string }[] = [
  { id: 'hand', name: 'Hand', icon: '✋', hint: 'Teile aus- und einbauen, Haube öffnen' },
  { id: 'ratchet', name: 'Ratsche', icon: '🔧', hint: 'Schrauben an Motor und Bremse' },
  { id: 'wheelWrench', name: 'Radkreuz', icon: '✚', hint: 'Radschrauben' },
  { id: 'inspect', name: 'Prüflampe', icon: '🔦', hint: 'Bauteile begutachten' },
];

export const toolName = (id: ToolId) => TOOLS.find((t) => t.id === id)!.name;
