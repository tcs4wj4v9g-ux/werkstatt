import { CAR_MODELS } from '../game/data/cars';
import { SLOTS } from '../game/data/workshop';
import { dirtLevel, interiorDirt, rustLevel, shineLevel } from '../game/detail';
import { capacity, FLUID_NAMES } from '../game/fluids';
import { RARITY_NAMES } from '../game/market';
import type { FluidId } from '../game/types';
import { COMPONENT_MAP } from '../game/data/components';
import { DEFECTS } from '../game/data/defects';
import { SYMPTOMS } from '../game/data/symptoms';
import { causeStatus, possibleCauses } from '../game/diagnosis';
import { knownDefects } from '../game/repair';
import { useGame } from '../game/store';
import { Modal } from './common';

const STATUS = { confirmed: ['bestätigt', 'bad'], ruled_out: ['ausgeschlossen', 'good'], open: ['ungeprüft', ''] } as const;

/**
 * Fahrzeugakte: was der Spieler bisher weiß. Zeigt Symptome und alle
 * denkbaren Ursachen – welche es wirklich ist, steht hier erst, wenn das
 * Bauteil geprüft oder ausgebaut wurde.
 */
export function FileModal() {
  const s = useGame();
  const car = s.cars[s.panelBay];
  if (!car) return null;
  const removed = Object.keys(car.components).filter((c) => !car.components[c].installed);
  const loose = Object.keys(car.components).filter((c) => car.components[c].installed && (car.components[c].bolts.some((b) => b < 2) || (COMPONENT_MAP[c].connector && !car.components[c].connected)));
  const symptoms = car.observed.filter((id) => SYMPTOMS[id]);
  return (
    <Modal title={`Fahrzeugakte – ${SLOTS[s.panelBay].label}: ${CAR_MODELS[car.modelId].name}`} onClose={() => s.setPanel(null)} wide>
      <p className="meta">{CAR_MODELS[car.modelId].engine} · Bj. {car.year} · {car.km.toLocaleString('de-DE')} km{car.rarity > 0 ? ` · ${RARITY_NAMES[car.rarity]}` : ''}</p>
      {car.job && (
        <div className="note">
          <b>Kundenauftrag von {car.job.customer}:</b> „{car.job.complaint}“
        </div>
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
            {possibleCauses(id).map((d) => {
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
      {removed.map((c) => <div key={c} className="meta">ausgebaut: {COMPONENT_MAP[c].name}</div>)}
      {loose.map((c) => <div key={c} className="meta">noch nicht fest / Stecker offen: {COMPONENT_MAP[c].name}</div>)}
      <p className="meta">Status: {car.testDriven ? 'Probefahrt nach letzter Arbeit gemacht' : 'Probefahrt steht aus'} · verbaute Teile bisher {car.partsSpent} €</p>
    </Modal>
  );
}
