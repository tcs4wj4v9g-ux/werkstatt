/**
 * Unfallschäden bei Probefahrt und Rennen: Einschläge (Leitplanke, Baum, Haus, anderes Auto) werden während der Fahrt
 * gesammelt und beim Ende der Fahrt auf das Auto übertragen:
 *  - Beulen (`ZoneState.dent`, 0…1) im getroffenen Karosseriebereich – sichtbar eingedrückt, mindern den Wert,
 *    werden in der Lackierkabine ausgebeult (Schleifer) und dann lackiert.
 *  - Harte Treffer beschädigen Bauteile: vorn den Kühler, an einer vorderen Ecke Querlenker bzw. Spurstange,
 *    hinten den Endschalldämpfer.
 */
import type { CarInstance, ZoneId } from './types';
import { defsOf } from './data/components';

export interface CrashLog {
  /** Beulenzuwachs je Bereich (0…1). */
  dents: Partial<Record<ZoneId, number>>;
  /** Beschädigte Bauteile (Kennungen). */
  parts: string[];
  /** Stärkster Einschlag (m/s). */
  worst: number;
}

export const newCrash = (): CrashLog => ({ dents: {}, parts: [], worst: 0 });

/** Laufendes Protokoll der aktuellen Fahrt (schreibt die Fahrszene, liest der Spielstand beim Beenden). */
export const crashNow: { log: CrashLog } = { log: newCrash() };

/** Ab dieser Aufprallgeschwindigkeit (m/s, senkrecht zum Hindernis) gibt es eine Beule bzw. einen Bauteilschaden. */
export const DENT_MIN = 3;
export const PART_MIN = 8.5;

/**
 * Einschlag werten. `lx`, `ly`: Richtung vom Auto zum Hindernis im Fahrzeug (x nach vorn, y nach links, normiert),
 * `v`: Aufprallgeschwindigkeit (m/s) in diese Richtung. `rnd` für den Zufall bei Bauteilschäden.
 * Liefert den getroffenen Bereich (oder null, wenn zu sanft).
 */
export function recordImpact(log: CrashLog, lx: number, ly: number, v: number, rnd: () => number = Math.random): ZoneId | null {
  if (v < DENT_MIN) return null;
  log.worst = Math.max(log.worst, v);
  const zone: ZoneId = lx > 0.6 ? 'front' : lx < -0.6 ? 'rear' : ly > 0 ? 'left' : 'right';
  log.dents[zone] = Math.min(1, (log.dents[zone] ?? 0) + Math.min(0.55, (v - DENT_MIN) / 14));
  if (v >= PART_MIN) {
    const add = (id: string) => void (!log.parts.includes(id) && log.parts.push(id));
    const left = ly > 0;
    if (zone === 'front') {
      if (rnd() < 0.6) add('radiator');
      // schräg vorn: das Rad auf dieser Seite bekommt etwas ab
      if (Math.abs(ly) > 0.25 && rnd() < 0.5) add(rnd() < 0.5 ? (left ? 'arm_fl' : 'arm_fr') : left ? 'tie_fl' : 'tie_fr');
    } else if (zone === 'rear') {
      if (rnd() < 0.5) add('muffler');
    } else if (lx > 0.1 && rnd() < 0.55) {
      // seitlich vorn (Vorderrad trifft Planke oder Baum)
      add(rnd() < 0.5 ? (left ? 'arm_fl' : 'arm_fr') : left ? 'tie_fl' : 'tie_fr');
    }
  }
  return zone;
}

/** Beulen und Bauteilschäden der Fahrt auf ein (geklontes) Auto übertragen. Liefert eine kurze Beschreibung oder ''. */
export function applyCrash(car: CarInstance, log: CrashLog): string {
  const zones = Object.entries(log.dents) as [ZoneId, number][];
  const ids = new Set(defsOf(car).map((d) => d.id));
  const parts = log.parts.filter((id) => ids.has(id) && car.components[id]?.installed && car.components[id].condition !== 'defect');
  if (!zones.length && !parts.length) return '';
  for (const [z, d] of zones) {
    const zs = car.zones[z];
    if (!zs) continue;
    zs.dent = Math.min(1, (zs.dent ?? 0) + d);
    // Kratzer im Lack: der Glanz leidet mit
    zs.shine = Math.max(0, zs.shine - d * 0.4);
  }
  for (const id of parts) car.components[id] = { ...car.components[id], condition: 'defect', known: false };
  const names: Record<string, string> = { front: 'Front', rear: 'Heck', left: 'linke Seite', right: 'rechte Seite', top: 'Dach', wheels: 'Felgen' };
  const where = zones.filter(([, d]) => d > 0.02).map(([z]) => names[z]);
  return `Unfallschaden: ${where.length ? `Beulen an ${where.join(', ')}` : 'keine Beulen'}${parts.length ? ' – beim Einschlag hat auch die Technik etwas abbekommen (prüfen!)' : ''}.`;
}

/** Durchschnittliche Beulenstärke der Karosserie (0…1). */
export const dentLevel = (car: Pick<CarInstance, 'zones'>) => {
  const z = ['front', 'rear', 'left', 'right'] as const;
  return z.reduce((s, k) => s + (car.zones[k]?.dent ?? 0), 0) / z.length;
};
