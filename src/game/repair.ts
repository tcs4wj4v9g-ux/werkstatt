import { CAR_MODELS } from './data/cars';
import { COMPONENTS, COMPONENT_MAP } from './data/components';
import { DEFECT_LIST } from './data/defects';
import { PARTS } from './data/parts';
import { toolName } from './data/tools';
import { TIGHT, type ActionResult, type CarInstance, type DefectId, type Inventory, type ToolNeed, type Toolset } from './types';

// Reine Reparaturlogik. Alle Funktionen verändern das übergebene (zuvor
// geklonte) Fahrzeug und liefern ein Ergebnis mit Meldung für die UI.

const fail = (message: string): ActionResult => ({ ok: false, message });
const done = (message?: string): ActionResult => ({ ok: true, message });

/** Eingebaut, alle Schrauben fest, Stecker verbunden. */
export const isComplete = (car: CarInstance, id: string) => {
  const c = car.components[id];
  return c.installed && c.bolts.every((b) => b === TIGHT) && (!COMPONENT_MAP[id].connector || c.connected);
};

export const blockersRemoved = (car: CarInstance, id: string) =>
  COMPONENT_MAP[id].blockedBy.every((b) => !car.components[b].installed);

/** Bauteile, die unter `id` liegen und vorher fertig montiert sein müssen. */
const dependents = (id: string) => COMPONENTS.filter((c) => c.blockedBy.includes(id)).map((c) => c.id);

/** Kann das Bauteil jetzt sofort herausgenommen werden? */
export const removable = (car: CarInstance, id: string) => {
  const c = car.components[id];
  return c.installed && c.bolts.every((b) => b === 0) && !(COMPONENT_MAP[id].connector && c.connected) && blockersRemoved(car, id);
};

/** Alle Bauteile, die (auch indirekt) unter `id` verbaut sind. */
export const beneath = (id: string): string[] => dependents(id).flatMap((d) => [d, ...beneath(d)]);

export const installReady = (car: CarInstance, id: string) => dependents(id).every((d) => isComplete(car, d));

function checkAccess(car: CarInstance, id: string): string | null {
  const def = COMPONENT_MAP[id];
  if (def.access === 'hood') {
    if (car.lifted) return 'Für Arbeiten im Motorraum das Auto ablassen.';
    if (!car.hoodOpen) return 'Erst die Motorhaube öffnen.';
  }
  if (def.access === 'lifted' && !car.lifted) return 'Dafür muss das Auto auf der Hebebühne angehoben sein.';
  return null;
}

function blockedMessage(car: CarInstance, id: string): string | null {
  const b = COMPONENT_MAP[id].blockedBy.find((x) => car.components[x].installed);
  return b ? `Nicht zugänglich – erst ausbauen: ${COMPONENT_MAP[b].name}.` : null;
}

export const describeNeed = (need: ToolNeed) =>
  need.socket ? `${toolName(need.driver)} mit ${toolName(need.socket)}` : toolName(need.driver);

/** Prüft, ob das aktive Werkzeug samt Stecknuss zur Anforderung passt. */
function checkTool(need: ToolNeed, tools: Toolset, mode: 'loosen' | 'tighten' | 'other'): string | null {
  const wantsTorque = !!need.torque && mode === 'tighten';
  if (tools.active === 'torque') {
    if (!need.torque) return `Falsches Werkzeug – du brauchst: ${describeNeed(need)}.`;
    if (mode === 'loosen') return 'Der Drehmomentschlüssel ist nur zum Anziehen da – zum Lösen die Ratsche nehmen.';
  } else {
    if (tools.active !== need.driver) return `Falsches Werkzeug – du brauchst: ${describeNeed(need)}.`;
    if (wantsTorque) return `Die Schraube sitzt handfest. Endgültig angezogen wird mit dem Drehmomentschlüssel (mit ${toolName(need.socket!)}).`;
  }
  if (need.socket && !tools.carried.includes(need.socket)) {
    return `Dir fehlt die ${toolName(need.socket)} – hol sie aus dem Werkzeugschrank.`;
  }
  return null;
}

export function toggleHood(car: CarInstance): ActionResult {
  if (!car.hoodOpen && car.lifted) return fail('Die Haube erreichst du nur, wenn das Auto unten ist.');
  car.hoodOpen = !car.hoodOpen;
  return done(car.hoodOpen ? 'Motorhaube geöffnet.' : 'Motorhaube geschlossen.');
}

export function toggleLift(car: CarInstance): ActionResult {
  if (car.lifted) {
    const loose = ['wheel_fl', 'wheel_fr'].find((w) => !isComplete(car, w));
    if (loose) return fail('Erst beide Vorderräder montieren und alle Radschrauben festziehen.');
  }
  car.lifted = !car.lifted;
  return done(car.lifted ? 'Auto angehoben.' : 'Auto abgelassen.');
}

/**
 * Schraube bedienen. Ablauf wie in der echten Werkstatt:
 * fest –(Werkzeug)→ gelöst –(Hand)→ entfernt, und zurück:
 * entfernt –(Hand/Werkzeug)→ angesetzt –(Werkzeug)→ fest.
 */
export function boltAction(car: CarInstance, id: string, index: number, tools: Toolset): ActionResult {
  const def = COMPONENT_MAP[id];
  const st = car.components[id];
  const access = checkAccess(car, id);
  if (access) return fail(access);
  if (tools.active === 'lamp') return inspect(car, id);
  if (!st.installed) return fail(`${def.name} ist nicht eingebaut.`);
  if (!def.fastener) return fail('Hier gibt es nichts zu schrauben.');
  const blocked = blockedMessage(car, id);
  if (blocked) return fail(blocked);
  const b = st.bolts[index];
  const count = (v: number) => st.bolts.filter((x) => x === v).length;

  if (tools.active === 'hand') {
    if (b === TIGHT) return fail(`Die Schraube sitzt fest – erst mit Werkzeug lösen (${describeNeed(def.fastener)}).`);
    st.bolts[index] = b === 1 ? 0 : 1;
    car.testDriven = false;
    return done(b === 1 ? `Schraube herausgedreht (${count(0)}/${def.bolts} entfernt).` : 'Schraube von Hand angesetzt – jetzt mit Werkzeug festziehen.');
  }

  const wrong = checkTool(def.fastener, tools, b === TIGHT ? 'loosen' : b === 1 ? 'tighten' : 'other');
  if (wrong) return fail(wrong);
  car.testDriven = false;
  if (b === TIGHT) {
    st.bolts[index] = 1;
    return done(`Schraube gelöst (${count(1) + count(0)}/${def.bolts}) – mit der Hand herausdrehen.`);
  }
  if (b === 1) {
    st.bolts[index] = TIGHT;
    return done(`Schraube festgezogen (${count(TIGHT)}/${def.bolts}).`);
  }
  st.bolts[index] = 1;
  return done('Schraube angesetzt – noch einmal antippen zum Festziehen.');
}

/** Elektrischen Stecker abziehen bzw. aufstecken (mit der Hand). */
export function connectorAction(car: CarInstance, id: string, tools: Toolset): ActionResult {
  const def = COMPONENT_MAP[id];
  const st = car.components[id];
  const access = checkAccess(car, id);
  if (access) return fail(access);
  if (tools.active === 'lamp') return done(`Stecker ${def.name}: Kontakte sauber, Verriegelung in Ordnung.`);
  if (tools.active !== 'hand') return fail('Stecker ziehst du mit der Hand ab.');
  if (!st.installed) return fail(`${def.name} ist nicht eingebaut.`);
  const blocked = blockedMessage(car, id);
  if (blocked) return fail(blocked);
  st.connected = !st.connected;
  car.testDriven = false;
  return done(st.connected ? `Stecker ${def.name} eingerastet.` : `Stecker ${def.name} abgezogen.`);
}

export function inspect(car: CarInstance, id: string): ActionResult {
  const access = checkAccess(car, id);
  if (access) return fail(access);
  const def = COMPONENT_MAP[id];
  const st = car.components[id];
  for (const other of def.inspectReveals ?? []) {
    const o = car.components[other];
    if (!COMPONENT_MAP[other].hidden) o.known = true;
    if (o.condition === 'defect' && !COMPONENT_MAP[other].hidden) {
      return done(`${COMPONENT_MAP[other].name}: ${COMPONENT_MAP[other].defectText}`);
    }
  }
  if (def.hidden && st.installed) {
    return done(`${def.name}: Im eingebauten Zustand ist nichts zu erkennen – ausbauen und ansehen.`);
  }
  st.known = true;
  return done(`${def.name}: ${st.condition === 'defect' ? def.defectText : def.okText}`);
}

export function componentAction(
  car: CarInstance,
  inv: Inventory,
  id: string,
  tools: Toolset,
  opts: { useOldPart?: boolean } = {},
): ActionResult {
  const def = COMPONENT_MAP[id];
  const st = car.components[id];
  const access = checkAccess(car, id);
  if (access) return fail(access);
  if (tools.active === 'lamp') return inspect(car, id);

  if (def.removeWith) {
    const wrong = checkTool(def.removeWith, tools, 'other');
    if (wrong) return fail(wrong);
  } else if (tools.active !== 'hand') {
    if (st.installed && st.bolts.some((b) => b > 0)) return fail('Tippe direkt auf die Schrauben, um sie zu lösen.');
    return fail('Zum Aus- und Einbauen die Hand wählen.');
  }

  if (st.installed) {
    const blocked = blockedMessage(car, id);
    if (blocked) return fail(blocked);
    if (st.bolts.some((b) => b === TIGHT)) return fail(`Erst alle Schrauben lösen (${describeNeed(def.fastener!)}).`);
    if (st.bolts.some((b) => b === 1)) return fail('Die gelösten Schrauben noch mit der Hand herausdrehen.');
    if (def.connector && st.connected) return fail('Erst den elektrischen Stecker abziehen.');
    if (id === 'oil_pan' && car.fluids.oil.level > 0.05) return fail('In der Ölwanne steht noch Öl – erst über die Ablassschraube ablassen.');
    st.installed = false;
    car.testDriven = false;
    if (id === 'drain_plug') {
      const liters = car.fluids.oil.level;
      car.fluids.oil.level = 0;
      car.fluids.oil.quality = 1;
      car.checked.oil = undefined;
      return done(`Ablassschraube heraus – ${liters.toLocaleString('de-DE')} l Altöl laufen in die Auffangwanne.`);
    }
    if (['water_pump', 'thermostat', 'hose'].includes(id)) {
      // Kühlsystem geöffnet: ein Großteil läuft aus, danach ist Luft im System.
      car.fluids.coolant.level = Math.min(car.fluids.coolant.level, Math.round(car.fluids.coolant.level * 3.5) / 10);
      car.fluids.coolant.air = true;
      car.checked.coolant = undefined;
    }
    if (def.consumable) st.condition = 'defect';
    if (def.partId) {
      st.known = true;
      return done(
        st.condition === 'defect'
          ? `${def.name} ausgebaut und begutachtet – ${def.defectText} Neuteil nötig.`
          : `${def.name} ausgebaut und begutachtet – ${def.okText}`,
      );
    }
    return done(`${def.name} ausgebaut.`);
  }

  // Einbau
  const above = blockedMessage(car, id);
  if (above) return fail(above);
  const missing = dependents(id).find((d) => !isComplete(car, d));
  if (missing) return fail(`Erst fertig montieren: ${COMPONENT_MAP[missing].name}.`);
  const next = def.bolts ? ' Jetzt Schrauben ansetzen und festziehen.' : def.connector ? ' Stecker nicht vergessen.' : '';
  if (def.partId && st.condition === 'defect' && !opts.useOldPart) {
    if (inv[def.partId] > 0) {
      inv[def.partId] -= 1;
      st.condition = 'ok';
      st.installed = true;
      if (id === 'oil_filter') car.fluids.oil.filterFresh = true;
      // Teilekosten werden dem Auto zugerechnet, in das das Teil wandert.
      car.partsSpent += Math.round(PARTS[def.partId].price / PARTS[def.partId].units);
      return done(`Neuteil eingebaut: ${def.name}.${next}`);
    }
    return { ok: false, needsPart: def.partId, message: `Kein Neuteil im Lager: ${PARTS[def.partId].name}.` };
  }
  st.installed = true;
  return done(`${def.name} eingebaut.${next}`);
}

export function activeDefects(car: CarInstance): DefectId[] {
  return DEFECT_LIST.filter((d) => d.components.some((c) => car.components[c].condition === 'defect')).map((d) => d.id);
}

/** Defekte, die der Spieler am Bauteil selbst festgestellt hat. */
export function knownDefects(car: CarInstance): DefectId[] {
  return DEFECT_LIST.filter((d) =>
    d.components.some((c) => car.components[c].condition === 'defect' && car.components[c].known),
  ).map((d) => d.id);
}

export const isAssembled = (car: CarInstance) => COMPONENTS.every((c) => isComplete(car, c.id));

export function driveBlocker(car: CarInstance): string | null {
  if (!isAssembled(car)) return 'Das Auto ist nicht komplett zusammengebaut.';
  const engine = engineBlocker(car);
  if (engine) return engine;
  if (['wheel_fl', 'wheel_fr'].some((w) => car.components[w].condition === 'defect')) return 'Mit diesen uralten Reifen fährst du keinen Meter – erst neue montieren.';
  if (car.lifted) return 'Das Auto steht noch auf der Hebebühne.';
  return null;
}

/** Der Motor läuft nur, wenn am Motor nichts demontiert ist (Räder dürfen ab sein). */
export function engineBlocker(car: CarInstance): string | null {
  const open = COMPONENTS.find((c) => (c.access === 'hood' || c.id.startsWith('oil_pan') || c.id === 'bearing' || c.id === 'drain_plug') && !isComplete(car, c.id));
  if (open) return `Der Motor startet so nicht – erst fertig montieren: ${open.name}.`;
  if (car.components.battery.condition === 'defect') return 'Beim Startversuch klackt nur das Relais – der Anlasser dreht nicht.';
  if (car.fluids.oil.level / CAR_MODELS[car.modelId].oilCapacity < 0.1) return 'Im Motor ist kein Öl – so startest du ihn nicht.';
  return null;
}
