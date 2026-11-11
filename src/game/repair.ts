import { COMPONENTS, COMPONENT_MAP } from './data/components';
import { DEFECT_LIST } from './data/defects';
import { PARTS } from './data/parts';
import { toolName } from './data/tools';
import type { ActionResult, CarInstance, DefectId, Inventory, ToolNeed, Toolset } from './types';

// Reine Reparaturlogik. Alle Funktionen verändern das übergebene (zuvor
// geklonte) Fahrzeug und liefern ein Ergebnis mit Meldung für die UI.

const fail = (message: string): ActionResult => ({ ok: false, message });
const done = (message?: string): ActionResult => ({ ok: true, message });

export const isComplete = (car: CarInstance, id: string) => {
  const c = car.components[id];
  return c.installed && c.bolts.every(Boolean);
};

export const blockersRemoved = (car: CarInstance, id: string) =>
  COMPONENT_MAP[id].blockedBy.every((b) => !car.components[b].installed);

/** Bauteile, die unter `id` liegen und vorher fertig montiert sein müssen. */
const dependents = (id: string) => COMPONENTS.filter((c) => c.blockedBy.includes(id)).map((c) => c.id);

/** Kann das Bauteil jetzt sofort herausgenommen werden? */
export const removable = (car: CarInstance, id: string) =>
  car.components[id].installed && car.components[id].bolts.every((b) => !b) && blockersRemoved(car, id);

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

export const describeNeed = (need: ToolNeed) =>
  need.socket ? `${toolName(need.driver)} mit ${toolName(need.socket)}` : toolName(need.driver);

/** Prüft, ob das aktive Werkzeug samt Stecknuss zur Anforderung passt. */
function checkTool(need: ToolNeed, tools: Toolset, tightening: boolean): string | null {
  const wantsTorque = !!need.torque && tightening;
  if (tools.active === 'torque' && !need.torque) return `Falsches Werkzeug – du brauchst: ${describeNeed(need)}.`;
  if (tools.active === 'torque' && !tightening) return 'Der Drehmomentschlüssel ist nur zum Anziehen da – zum Lösen die Ratsche nehmen.';
  if (wantsTorque && tools.active !== 'torque') {
    return `Radschrauben werden mit dem Drehmomentschlüssel angezogen (mit ${toolName(need.socket!)}).`;
  }
  if (!wantsTorque && tools.active !== need.driver) return `Falsches Werkzeug – du brauchst: ${describeNeed(need)}.`;
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
    if (loose) return fail('Erst beide Vorderräder montieren und alle Radschrauben anziehen.');
  }
  car.lifted = !car.lifted;
  return done(car.lifted ? 'Auto angehoben.' : 'Auto abgelassen.');
}

export function boltAction(car: CarInstance, id: string, index: number, tools: Toolset): ActionResult {
  const def = COMPONENT_MAP[id];
  const st = car.components[id];
  const access = checkAccess(car, id);
  if (access) return fail(access);
  if (tools.active === 'lamp') return inspect(car, id);
  if (!st.installed) return fail(`${def.name} ist nicht eingebaut.`);
  if (!def.fastener) return fail('Hier gibt es nichts zu schrauben.');
  const tightening = !st.bolts[index];
  const wrong = checkTool(def.fastener, tools, tightening);
  if (wrong) return fail(wrong);
  if (!blockersRemoved(car, id)) {
    const b = def.blockedBy.find((x) => car.components[x].installed)!;
    return fail(`Nicht zugänglich – erst ausbauen: ${COMPONENT_MAP[b].name}.`);
  }
  st.bolts[index] = tightening;
  car.testDriven = false;
  const left = st.bolts.filter(Boolean).length;
  return done(tightening ? `Schraube angezogen (${left}/${def.bolts}).` : `Schraube gelöst (${def.bolts - left}/${def.bolts}).`);
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
    return done(`${def.name}: Von außen ist nichts zu erkennen – hier hilft nur die OBD-Diagnose oder der Ausbau.`);
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
    const wrong = checkTool(def.removeWith, tools, false);
    if (wrong) return fail(wrong);
  } else if (tools.active !== 'hand') {
    if (st.installed && st.bolts.some(Boolean)) return fail('Tippe direkt auf die Schrauben, um sie zu lösen.');
    return fail('Zum Aus- und Einbauen die Hand wählen.');
  }

  if (st.installed) {
    if (!blockersRemoved(car, id)) {
      const b = def.blockedBy.find((x) => car.components[x].installed)!;
      return fail(`Erst ausbauen: ${COMPONENT_MAP[b].name}.`);
    }
    if (st.bolts.some(Boolean)) return fail(`Erst alle Schrauben lösen (${describeNeed(def.fastener!)}).`);
    st.installed = false;
    car.testDriven = false;
    if (def.partId) {
      st.known = true;
      return done(
        st.condition === 'defect'
          ? `${def.name} ausgebaut – ${def.defectText} Neuteil nötig.`
          : `${def.name} ausgebaut – ${def.okText}`,
      );
    }
    return done(`${def.name} ausgebaut.`);
  }

  // Einbau
  const missing = dependents(id).find((d) => !isComplete(car, d));
  if (missing) return fail(`Erst montieren und festschrauben: ${COMPONENT_MAP[missing].name}.`);
  if (def.partId && st.condition === 'defect' && !opts.useOldPart) {
    if (inv[def.partId] > 0) {
      inv[def.partId] -= 1;
      st.condition = 'ok';
      st.installed = true;
      // Teilekosten werden dem Auto zugerechnet, in das das Teil wandert.
      car.partsSpent += Math.round(PARTS[def.partId].price / PARTS[def.partId].units);
      return done(`Neuteil eingebaut: ${def.name}.${def.bolts ? ' Jetzt festschrauben.' : ''}`);
    }
    return { ok: false, needsPart: def.partId, message: `Kein Neuteil im Lager: ${PARTS[def.partId].name}.` };
  }
  st.installed = true;
  return done(`${def.name} eingebaut.${def.bolts ? ' Jetzt festschrauben.' : ''}`);
}

export function activeDefects(car: CarInstance): DefectId[] {
  return DEFECT_LIST.filter((d) => d.components.some((c) => car.components[c].condition === 'defect')).map((d) => d.id);
}

export function knownDefects(car: CarInstance): DefectId[] {
  return DEFECT_LIST.filter((d) =>
    d.components.some((c) => car.components[c].condition === 'defect' && car.components[c].known),
  ).map((d) => d.id);
}

export const isAssembled = (car: CarInstance) => COMPONENTS.every((c) => isComplete(car, c.id));

export function driveBlocker(car: CarInstance): string | null {
  if (!isAssembled(car)) return 'Das Auto ist nicht komplett zusammengebaut.';
  if (car.lifted) return 'Das Auto steht noch auf der Hebebühne.';
  return null;
}

/** OBD-Diagnose: liest nur elektronisch erkennbare Fehler aus. */
export function obdScan(car: CarInstance): string[] {
  const codes: string[] = [];
  const bad = (id: string) => car.components[id].condition === 'defect';
  const mark = (ids: string[]) => ids.forEach((i) => bad(i) && (car.components[i].known = true));
  for (let n = 1; n <= 4; n++) {
    const c = car.components[`coil${n}`];
    if (c.condition === 'defect' || !c.installed) {
      codes.push(`P030${n} – Zündaussetzer Zylinder ${n} erkannt`);
      mark([`coil${n}`]);
    }
  }
  const plugs = ['plug1', 'plug2', 'plug3', 'plug4'];
  if (plugs.some(bad)) {
    codes.push('P0300 – Sporadische Zündaussetzer, mehrere Zylinder (Zündkerzen prüfen)');
    mark(plugs);
  }
  if (['pads_fl', 'pads_fr'].some(bad)) {
    codes.push('5E20 – Bremsbelagverschleiß Vorderachse, Verschleißgrenze erreicht');
    mark(['pads_fl', 'pads_fr']);
  }
  if (bad('alternator')) {
    codes.push('P0562 – Bordnetzspannung zu niedrig (Lichtmaschine lädt nicht)');
    mark(['alternator']);
  }
  if (bad('thermostat')) {
    codes.push('P0128 – Kühlmitteltemperatur unter Thermostat-Regeltemperatur');
    mark(['thermostat']);
  }
  car.obdCodes = codes;
  return codes;
}
