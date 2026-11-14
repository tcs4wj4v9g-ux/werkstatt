import { engineOf } from '../game/data/components';
import { CAR_MODELS } from '../game/data/cars';
import { FLUID_PRODUCTS } from '../game/data/fluids';
import { capacity, FLUID_NAMES } from '../game/fluids';
import { useGame } from '../game/store';
import type { FluidId, FluidProduct } from '../game/types';
import { Modal } from './common';

const PRODUCTS: Record<FluidId, FluidProduct[]> = { oil: ['oil_5w30', 'oil_5w40'], coolant: ['coolant'], brake: ['brake_fluid'] };
const l = (n: number) => `${n.toLocaleString('de-DE', { maximumFractionDigits: 1 })} l`;

/**
 * Flüssigkeiten eines Autos auf der Hebebühne. Angezeigt wird nur, was der
 * Spieler selbst abgelesen hat – der tatsächliche Stand bleibt bis dahin verborgen.
 */
export function FluidModal() {
  const s = useGame();
  const slot = s.panelBay;
  const car = s.cars[slot];
  if (!car) return null;
  const model = CAR_MODELS[car.modelId];
  const steps: Record<FluidId, string> = {
    oil: `Ölwechsel: Auto anheben, Auffangwanne unterstellen, Ablassschraube lösen (Ratsche + 17er Nuss), wieder eindrehen, ablassen, Ölfilter tauschen (Schraubenschlüssel), ${model.oilCapacity} l ${FLUID_PRODUCTS[model.oilSpec].name} einfüllen, Stand prüfen.`,
    coolant: 'Nach Arbeiten an Wasserpumpe, Thermostat oder Schlauch: auffüllen, Motor starten, entlüften, nachfüllen.',
    brake: 'Wechsel: Auto anheben, beide Vorderräder ab, Schraubenschlüssel holen und den Entlüfternippel oben am Bremssattel antippen – an beiden Seiten (je 0,5 l frische Flüssigkeit aus dem Lager).',
  };
  return (
    <Modal title={`Betriebsflüssigkeiten – ${model.name}`} onClose={() => s.setPanel(null)} wide>
      <p className="meta">{model.engine} · Motoröl {model.oilCapacity} l {FLUID_PRODUCTS[model.oilSpec].name}{engineOf(car).air ? ' · luftgekühlt' : ` · Kühlmittel ${model.coolantCapacity} l`}</p>
      {(['oil', 'coolant', 'brake'] as FluidId[]).filter((id) => id !== 'coolant' || !engineOf(car).air).map((id) => {
        const seen = car.checked[id];
        const cap = capacity(car, id);
        return (
          <div key={id} className="sell-card" data-testid={`fluid-${id}`}>
            <div className="row-between">
              <b>{FLUID_NAMES[id]}</b>
              <button className="btn" onClick={() => s.checkFluid(slot, id)}>Stand ablesen</button>
            </div>
            {seen ? (
              <>
                <div className="gauge"><div style={{ width: `${Math.min(100, (seen.level / cap) * 100)}%` }} className={seen.level / cap < 0.55 ? 'low' : ''} /></div>
                <p className="meta">Abgelesen an Tag {seen.day}: {l(seen.level)} von {l(cap)} · {seen.quality > 0.8 ? 'frisch' : seen.quality > 0.5 ? 'gebraucht' : seen.quality > 0.25 ? 'alt' : 'überaltert'}</p>
              </>
            ) : (
              <p className="meta">Noch nicht abgelesen.</p>
            )}
            <div className="chips">
              {PRODUCTS[id].map((p) =>
                [0.5, 1, id === 'brake' ? 0 : 4].filter(Boolean).map((amount) => (
                  <button key={p + amount} className="chip" disabled={s.fluidStock[p] < 0.05} onClick={() => s.addFluid(slot, id, p, amount)}>
                    + {l(amount)} {FLUID_PRODUCTS[p].name.replace('Motoröl ', '')} <small>(Lager {l(s.fluidStock[p])})</small>
                  </button>
                )),
              )}
              {id === 'coolant' && <button className="chip" onClick={() => s.bleedCoolant(slot)}>Kühlsystem entlüften</button>}
              {id === 'brake' && (
                <>
                  <button className="chip" onClick={() => s.bleedBrake(slot, 'fl')}>Entlüften vorne links{car.fluids.brake.bled.fl ? ' ✓' : ''}</button>
                  <button className="chip" onClick={() => s.bleedBrake(slot, 'fr')}>Entlüften vorne rechts{car.fluids.brake.bled.fr ? ' ✓' : ''}</button>
                </>
              )}
            </div>
            <p className="meta">{steps[id]}</p>
          </div>
        );
      })}
      <p className="meta">Flüssigkeiten bestellst du am Computer unter „Teile“. Vereinfachte Spielabläufe – keine Werkstattanleitung.</p>
    </Modal>
  );
}
