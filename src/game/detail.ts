import type { ActionResult, CarInstance, ToolId, ZoneId, ZoneState } from './types';

// Aufbereitung: Waschen in Schritten je Karosseriebereich, Polieren,
// Innenraum, dazu Rostbehandlung und Lackieren in der Lackierkabine.

export const BODY_ZONES: ZoneId[] = ['front', 'rear', 'left', 'right', 'top'];
export const ALL_ZONES: ZoneId[] = [...BODY_ZONES, 'wheels'];
export const ZONE_NAMES: Record<ZoneId, string> = { front: 'Front & Haube', rear: 'Heck', left: 'linke Seite', right: 'rechte Seite', top: 'Dach & Scheiben', wheels: 'Felgen' };
export const PAINT_COST = 70;
export const PAINT_COLORS = ['#1f2a44', '#101114', '#c9ccd1', '#f2f2ee', '#7a1f24', '#1d3fae', '#2f4f3a', '#c8501e', '#e3a81c'];

const fail = (message: string): ActionResult => ({ ok: false, message });
const done = (message: string): ActionResult => ({ ok: true, message });

export function createZones(dirt: number, shine: number, rust: number, rng: () => number): Record<ZoneId, ZoneState> {
  const z = (): ZoneState => ({
    dirt: Math.max(0, Math.min(1, dirt * (0.7 + rng() * 0.6))),
    step: 0,
    shine: Math.max(0, Math.min(1, shine * (0.8 + rng() * 0.4))),
    rust: 0,
  });
  const zones = Object.fromEntries(ALL_ZONES.map((id) => [id, z()])) as Record<ZoneId, ZoneState>;
  // Rost sitzt nie überall gleich.
  if (rust > 0) for (const id of BODY_ZONES) if (rng() < 0.75) zones[id].rust = Math.min(1, rust * (0.5 + rng()));
  zones.wheels.shine = 1;
  return zones;
}

/** Sichtbarer Schmutz eines Bereichs unter Berücksichtigung des Waschfortschritts. */
export const visibleDirt = (z: ZoneState) => z.dirt * [1, 0.6, 0.45, 0.1][z.step];
const avg = (car: CarInstance, ids: ZoneId[], f: (z: ZoneState) => number) => ids.reduce((s, id) => s + f(car.zones[id]), 0) / ids.length;
export const dirtLevel = (car: CarInstance) => avg(car, ALL_ZONES, visibleDirt);
export const shineLevel = (car: CarInstance) => avg(car, BODY_ZONES, (z) => z.shine);
export const rustLevel = (car: CarInstance) => avg(car, BODY_ZONES, (z) => z.rust);
export const interiorDirt = (car: CarInstance) => (car.interior.seats + car.interior.dash + car.interior.floor) / 3;

export const WASH_TOOLS: ToolId[] = ['washer', 'foam', 'brush', 'towel', 'polisher', 'vacuum', 'upholstery', 'cockpit'];
export const PAINT_TOOLS: ToolId[] = ['sander', 'spraygun'];

/** Waschgerät auf einen Bereich anwenden. Reihenfolge: vorspülen, einschäumen (Felgen: bürsten), abspülen, trocknen. */
export function washAction(car: CarInstance, zone: ZoneId, tool: ToolId): ActionResult {
  const z = car.zones[zone];
  const name = ZONE_NAMES[zone];
  if (tool === 'vacuum' || tool === 'upholstery' || tool === 'cockpit') {
    if (zone !== 'top') return fail('Für den Innenraum auf die Fahrgastzelle (Dach & Scheiben) tippen.');
    const [key, label] = tool === 'vacuum' ? (['floor', 'Fußraum gesaugt'] as const) : tool === 'upholstery' ? (['seats', 'Sitze gereinigt'] as const) : (['dash', 'Armaturenbrett gereinigt'] as const);
    if (car.interior[key] < 0.05) return fail('Das ist schon sauber.');
    car.interior[key] = 0;
    return done(`Innenraum: ${label}.`);
  }
  if (tool === 'polisher') {
    if (zone === 'wheels') return fail('Felgen werden nicht poliert.');
    if (visibleDirt(z) > 0.05 || z.step !== 0) return fail('Erst waschen und trocknen – auf Schmutz poliert man Kratzer in den Lack.');
    const max = 1 - z.rust * 0.7;
    if (z.shine >= max - 0.02) return fail(z.rust > 0.1 ? 'Mehr geht hier nicht – Rost lässt sich nicht wegpolieren.' : 'Der Lack glänzt hier schon.');
    z.shine = max;
    return done(`${name} poliert${z.rust > 0.1 ? ' – der Rost bleibt aber sichtbar' : ''}.`);
  }
  if (z.dirt < 0.03 && z.step === 0) return fail(`${name}: schon sauber.`);
  const scrub: ToolId = zone === 'wheels' ? 'brush' : 'foam';
  const need: ToolId = [`washer`, scrub, 'washer', 'towel'][z.step] as ToolId;
  if (tool !== need) {
    const hint = { washer: 'Hochdruckreiniger', foam: 'Schaumlanze', brush: 'Felgenbürste', towel: 'Trockentuch' }[need as 'washer'];
    return fail(`${name}: als Nächstes kommt ${hint}.`);
  }
  if (z.step === 3) {
    z.step = 0;
    z.dirt = 0;
    return done(`${name} getrocknet – sauber.`);
  }
  z.step += 1;
  return done(`${name}: ${['vorgespült', zone === 'wheels' ? 'gebürstet' : 'eingeschäumt', 'abgespült – jetzt trocknen'][z.step - 1]}.`);
}

/** Lackierkabine: Rost abschleifen und grundieren, dann Bereich für Bereich lackieren. */
export function paintAction(car: CarInstance, zone: ZoneId, tool: ToolId, color: string, money: number): ActionResult & { cost?: number } {
  if (zone === 'wheels') return fail('Felgen werden hier nicht lackiert.');
  const z = car.zones[zone];
  const name = ZONE_NAMES[zone];
  if (visibleDirt(z) > 0.05 || z.step !== 0) return fail('Das Auto muss sauber und trocken in die Kabine – erst waschen.');
  if (tool === 'sander') {
    if (z.rust < 0.02) return fail(`${name}: kein Rost zu entfernen.`);
    z.rust = 0;
    z.shine = 0.1;
    z.paint = '#8a8d91'; // Grundierung
    return done(`${name}: Rost abgeschliffen und grundiert. Jetzt lackieren.`);
  }
  if (z.rust > 0.02) return fail(`${name}: erst den Rost abschleifen.`);
  if (z.paint === color || (!z.paint && car.color === color && z.shine > 0.9)) return fail(`${name} hat diese Farbe schon.`);
  if (money < PAINT_COST) return fail(`Lack für einen Bereich kostet ${PAINT_COST} € – das Geld reicht nicht.`);
  z.paint = color;
  z.shine = 1;
  // Ist das ganze Auto einheitlich lackiert, gilt die neue Farbe als Wagenfarbe.
  const zs = BODY_ZONES.map((id) => car.zones[id]);
  if (zs.every((x) => x.paint === color)) {
    car.color = color;
    zs.forEach((x) => delete x.paint);
    return { ok: true, cost: PAINT_COST, message: `${name} lackiert – das ganze Auto ist jetzt neu lackiert.` };
  }
  return { ok: true, cost: PAINT_COST, message: `${name} lackiert (−${PAINT_COST} € Material).` };
}

/** Anteil am Bestwert, den die Aufbereitung beim Verkauf bringt oder kostet. Bewusst begrenzt. */
export function detailFactor(car: CarInstance): { label: string; pct: number }[] {
  const out: { label: string; pct: number }[] = [];
  const dirt = dirtLevel(car);
  if (dirt > 0.5) out.push({ label: 'Stark verschmutzt', pct: -0.03 });
  else if (dirt < 0.08) out.push({ label: 'Frisch gewaschen', pct: 0.015 });
  if (shineLevel(car) > 0.85) out.push({ label: 'Lack poliert', pct: 0.015 });
  const inner = interiorDirt(car);
  if (inner > 0.5) out.push({ label: 'Innenraum verdreckt', pct: -0.02 });
  else if (inner < 0.05) out.push({ label: 'Innenraum aufbereitet', pct: 0.015 });
  const rust = rustLevel(car);
  if (rust > 0.03) out.push({ label: 'Rost an der Karosserie', pct: -Math.min(0.18, 0.04 + rust * 0.25) });
  if (BODY_ZONES.some((id) => car.zones[id].paint)) out.push({ label: 'Lackierung nicht fertig (uneinheitlich)', pct: -0.05 });
  return out;
}
