import { CAR_MODELS } from '../game/data/cars';
import { SLOTS } from '../game/data/workshop';
import { dirtLevel, interiorDirt, rustLevel, shineLevel } from '../game/detail';
import { capacity, FLUID_NAMES } from '../game/fluids';
import { RARITY_NAMES } from '../game/market';
import type { FluidId } from '../game/types';
import { COMPONENT_MAP, engineOf } from '../game/data/components';
import { DEFECTS } from '../game/data/defects';
import { SYMPTOMS } from '../game/data/symptoms';
import { causeStatus, possibleCauses } from '../game/diagnosis';
import { knownDefects } from '../game/repair';
import { removedEngines, useGame } from '../game/store';
import { withRemovedEngine } from '../game/motor';
import { Modal } from './common';

const STATUS = { confirmed: ['bestätigt', 'bad'], ruled_out: ['ausgeschlossen', 'good'], open: ['ungeprüft', ''] } as const;

/**
 * Fahrzeugakte: was der Spieler bisher weiß. Zeigt Symptome und alle
 * denkbaren Ursachen – welche es wirklich ist, steht hier erst, wenn das
 * Bauteil geprüft oder ausgebaut wurde.
 */
export function FileModal() {
  const s = useGame();
  const real = s.cars[s.panelBay];
  if (!real) return null;
  // Ausgebauter Motor gehört für die Fehlersuche weiter zum Auto.
  const car = withRemovedEngine(real, removedEngines(s));
  const out = real.motor === null;
  const removed = Object.keys(car.components).filter((c) => !car.components[c].installed);
  const loose = Object.keys(car.components).filter((c) => car.components[c].installed && (car.components[c].bolts.some((b) => b < 2) || (COMPONENT_MAP[c].connector && !car.components[c].connected)));
  const symptoms = car.observed.filter((id) => SYMPTOMS[id]);
  const model = CAR_MODELS[car.modelId];
  const e = engineOf(car);
  // Restzustand kennt man nur von Teilen, die man in der Hand hatte.
  const measured = Object.keys(car.components).filter((c) => car.components[c].health !== undefined && car.components[c].known);
  return (
    <Modal title={`Fahrzeugakte – ${SLOTS[s.panelBay].label}: ${CAR_MODELS[car.modelId].name}`} onClose={() => s.setPanel(null)} wide>
      <p className="meta">{model.engine} · Bj. {car.year} · {car.km.toLocaleString('de-DE')} km{car.rarity > 0 ? ` · ${RARITY_NAMES[car.rarity]}` : ''}</p>
      <p className="meta">
        Motor: {e.layout === 'R4' || e.layout === 'R6' ? 'Reihe' : 'V-Motor'}, {e.cylinders} Zylinder · {e.fuel === 'diesel' ? 'Diesel' : 'Benzin'} ·{' '}
        {e.turbo ? 'Turbo' : 'Sauger'} · {e.liters.toLocaleString('de-DE')} l · {e.ps} PS · {e.nm} Nm · {model.weight.toLocaleString('de-DE')} kg · Teilefamilie {e.family}
      </p>
      {car.job && (
        <div className="note">
          <b>Kundenauftrag von {car.job.customer}:</b> „{car.job.complaint}“
        </div>
      )}
      {out && (
        <p className="meta">
          {car.motor ? 'Der Motor ist ausgebaut (am Kran, auf dem Ständer oder im Lager) – seine Teile zählen hier weiter mit.' : 'In diesem Auto ist kein Motor. Motorursachen lassen sich erst wieder mit Motor prüfen.'}
        </p>
      )}
      <h4>Beobachtete Symptome und mögliche Ursachen</h4>
      {symptoms.length === 0 && (
        <p className="meta">
          Noch nichts beobachtet. Motor starten und warm laufen lassen, Gas geben, mit der Prüflampe Motorraum und Unterboden ansehen, Probefahrt machen.
        </p>
      )}
      {symptoms.map((id) => (
        <div key={id} className="symptom">
          <div>{SYMPTOMS[id].text}</div>
          <div className="causes">
            {SYMPTOMS[id].fluid && (
              <span className={`cause ${car.checked[SYMPTOMS[id].fluid!] ? '' : ''}`}>
                {FLUID_NAMES[SYMPTOMS[id].fluid!]} · {car.checked[SYMPTOMS[id].fluid!] ? 'Stand abgelesen' : 'Stand ungeprüft'}
              </span>
            )}
            {possibleCauses(id, car).map((d) => {
              const [label, cls] = STATUS[causeStatus(car, d)];
              return (
                <span key={d.id} className={`cause ${cls}`}>
                  {d.name} · {label}
                </span>
              );
            })}
          </div>
        </div>
      ))}
      <h4>Flüssigkeiten (zuletzt abgelesen)</h4>
      {(['oil', 'coolant', 'brake'] as FluidId[]).map((id) => {
        const c = car.checked[id];
        return <div key={id} className="meta">{FLUID_NAMES[id]}: {c ? `${c.level.toLocaleString('de-DE')} von ${capacity(car, id)} l (Tag ${c.day})` : 'noch nicht abgelesen'}</div>;
      })}
      <h4>Pflegezustand</h4>
      <div className="meta">
        Schmutz {Math.round(dirtLevel(car) * 100)} % · Lackglanz {Math.round(shineLevel(car) * 100)} % · Rost {Math.round(rustLevel(car) * 100)} % · Innenraum {Math.round((1 - interiorDirt(car)) * 100)} % sauber
      </div>
      <h4>OBD-Fehlerspeicher</h4>
      {car.obdCodes === null && <p className="meta">Noch nicht ausgelesen (OBD-Gerät aus dem Werkzeugschrank).</p>}
      {car.obdCodes?.length === 0 && <p className="meta">Keine Fehler gespeichert. Mechanische Schäden erkennt das Gerät nicht.</p>}
      {car.obdCodes?.map((c) => <div key={c} className="meta">▶ {c}</div>)}
      <h4>Am Bauteil bestätigte Schäden</h4>
      {knownDefects(car).length === 0 && <p className="meta">Noch keiner.</p>}
      {knownDefects(car).map((d) => <div key={d} className="finding">⚠ {DEFECTS[d].name}</div>)}
      {(removed.length > 0 || loose.length > 0) && <h4>Laufende Arbeiten</h4>}
      {measured.length > 0 && <h4>Geprüfte Zünd- und Einspritzteile</h4>}
      {measured.map((c) => (
        <div key={c} className="meta">
          {COMPONENT_MAP[c].name}: {car.components[c].condition === 'defect' ? 'defekt' : `${car.components[c].health} %`}
        </div>
      ))}
      {removed.map((c) => <div key={c} className="meta">ausgebaut: {COMPONENT_MAP[c].name}</div>)}
      {loose.map((c) => <div key={c} className="meta">noch nicht fest / Stecker offen: {COMPONENT_MAP[c].name}</div>)}
      <p className="meta">Status: {car.testDriven ? 'Probefahrt nach letzter Arbeit gemacht' : 'Probefahrt steht aus'} · verbaute Teile bisher {car.partsSpent} €</p>
    </Modal>
  );
}
