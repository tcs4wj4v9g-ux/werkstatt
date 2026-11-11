import { CAR_MODELS } from '../game/data/cars';
import { COMPONENT_MAP } from '../game/data/components';
import { DEFECTS } from '../game/data/defects';
import { PARTS } from '../game/data/parts';
import { TOOLS } from '../game/data/tools';
import { valuate } from '../game/market';
import { driveBlocker, isAssembled, knownDefects } from '../game/repair';
import { useGame, type View } from '../game/store';
import type { PartId } from '../game/types';
import { eur, Modal, TopBar } from './common';

const VIEWS: { id: View; label: string }[] = [
  { id: 'overview', label: 'Gesamt' },
  { id: 'engine', label: 'Motor' },
  { id: 'wheel_fl', label: 'Rad VL' },
  { id: 'wheel_fr', label: 'Rad VR' },
];

export function GarageUI() {
  const s = useGame();
  const car = s.car;
  if (!car) return null;
  const model = CAR_MODELS[car.modelId];
  const known = knownDefects(car);
  const assembled = isAssembled(car);
  const invCount = Object.values(s.inventory).reduce((a, b) => a + b, 0);

  return (
    <>
      <TopBar title={`Werkstatt – ${model.name}`} />

      <div className="panel left">
        <h4>Befunde</h4>
        {known.length === 0 && (
          <p className="meta">{car.testDriven ? 'Keine offenen Mängel bekannt.' : 'Keine offenen Mängel bekannt. Nutze OBD und Prüflampe.'}</p>
        )}
        {known.map((d) => (
          <div key={d} className="finding">⚠ {DEFECTS[d].name}</div>
        ))}
        <h4>Status</h4>
        <div className="meta">{assembled ? '✓ komplett montiert' : '✗ Teile demontiert'}</div>
        <div className="meta">{car.lifted ? '▲ auf der Hebebühne' : '▼ am Boden'}</div>
        <div className="meta">{car.testDriven ? '✓ Probefahrt gemacht' : '– Probefahrt offen'}</div>
        <h4>Teilelager</h4>
        {invCount === 0 && <p className="meta">leer</p>}
        {(Object.keys(s.inventory) as PartId[]).filter((p) => s.inventory[p] > 0).map((p) => (
          <div key={p} className="meta">{s.inventory[p]}× {PARTS[p].name}</div>
        ))}
      </div>

      <div className="panel right narrow">
        <div className="seg">
          {VIEWS.map((v) => (
            <button key={v.id} className={`btn ${s.view === v.id ? 'active' : ''}`} onClick={() => s.setView(v.id)}>
              {v.label}
            </button>
          ))}
        </div>
        <button className="btn" onClick={s.tapLift}>{car.lifted ? '▼ Auto ablassen' : '▲ Auto anheben'}</button>
        <button className="btn" onClick={() => s.setPanel('obd')}>📟 OBD-Diagnose</button>
        <button className="btn" onClick={() => s.setPanel('shop')}>🛒 Teileshop</button>
        <button className="btn" onClick={s.startDrive}>🏁 Probefahrt</button>
        <button className="btn primary" onClick={() => s.setPanel('sell')}>💶 Verkaufen</button>
      </div>

      <div className="toolbar">
        {TOOLS.map((t) => (
          <button key={t.id} className={`btn tool ${s.tool === t.id ? 'active' : ''}`} onClick={() => s.setTool(t.id)}>
            <span className="ico">{t.icon}</span>
            {t.name}
            <small>{t.hint}</small>
          </button>
        ))}
      </div>

      {s.panel === 'shop' && (
        <Modal title="Teileshop" onClose={() => s.setPanel(null)} wide>
          {Object.values(PARTS).map((p) => (
            <div key={p.id} className="shop-row">
              <div>
                <b>{p.name}</b>
                <div className="meta">{p.desc} · im Lager: {s.inventory[p.id]}</div>
              </div>
              <button className="btn primary" disabled={s.money < p.price} onClick={() => s.buyPart(p.id)}>
                Kaufen {eur(p.price)}
              </button>
            </div>
          ))}
        </Modal>
      )}

      {s.panel === 'obd' && (
        <Modal title="OBD-Diagnosegerät" onClose={() => s.setPanel(null)}>
          <div className="obd">
            {car.obdCodes === null && <div>BEREIT – Stecker verbunden.</div>}
            {car.obdCodes?.length === 0 && <div>KEINE FEHLER GESPEICHERT</div>}
            {car.obdCodes?.map((c) => <div key={c}>▶ {c}</div>)}
          </div>
          <p className="meta">Das Gerät erkennt nur elektronisch überwachte Fehler. Öllecks z. B. findest du nur mit der Prüflampe.</p>
          <button className="btn primary big" onClick={s.scanObd}>Fehlerspeicher auslesen</button>
        </Modal>
      )}

      {s.panel === 'report' && (
        <Modal title="Probefahrt-Bericht" onClose={() => s.setPanel(null)}>
          {s.driveReport?.length ? (
            <>
              <p>Runde geschafft, aber dir ist etwas aufgefallen:</p>
              {s.driveReport.map((r) => <div key={r} className="finding">⚠ {r}</div>)}
            </>
          ) : (
            <p className="bigline good">Der Wagen läuft einwandfrei! Bereit für den Verkauf.</p>
          )}
          <button className="btn primary big" onClick={() => s.setPanel(null)}>Zur Werkstatt</button>
        </Modal>
      )}

      {s.panel === 'sell' && <SellModal />}

      {s.partPrompt && (
        <Modal title="Neuteil fehlt" onClose={s.closePartPrompt}>
          <p>
            {COMPONENT_MAP[s.partPrompt.compId].name} ist defekt. Du hast kein Neuteil „{PARTS[s.partPrompt.partId].name}“ im Lager.
          </p>
          <button className="btn primary big" onClick={() => { s.closePartPrompt(); s.setPanel('shop'); }}>Zum Teileshop</button>
          <button className="btn big" onClick={() => s.tapComponent(s.partPrompt!.compId, true)}>Defektes Altteil wieder einbauen</button>
        </Modal>
      )}
    </>
  );
}

function SellModal() {
  const s = useGame();
  const car = s.car!;
  const v = valuate(car);
  const price = car.haggled ? v.haggleOffer : v.offer;
  const profit = price - car.purchasePrice - car.partsSpent;
  const blocker = driveBlocker(car);
  return (
    <Modal title="Auto verkaufen" onClose={() => s.setPanel(null)} wide>
      <table className="val">
        <tbody>
          <tr><td>Marktwert in Bestzustand</td><td>{eur(v.cleanValue)}</td></tr>
          {v.deductions.map((d) => (
            <tr key={d.label} className="bad"><td>− {d.label}</td><td>−{eur(d.amount)}</td></tr>
          ))}
          <tr className="sum"><td>Angebot des Käufers</td><td data-testid="sell-price">{eur(price)}</td></tr>
          <tr><td>Einkauf + Teile</td><td>−{eur(car.purchasePrice + car.partsSpent)}</td></tr>
          <tr className={`sum ${profit >= 0 ? 'good' : 'bad'}`}><td>{profit >= 0 ? 'Gewinn' : 'Verlust'}</td><td>{eur(Math.abs(profit))}</td></tr>
        </tbody>
      </table>
      {blocker && <p className="meta bad">Hinweis: {blocker}</p>}
      <div className="row">
        <button className="btn big" disabled={car.haggled} onClick={s.haggle}>
          {car.haggled ? 'Bereits nachverhandelt' : 'Nachverhandeln (1 Versuch)'}
        </button>
        <button className="btn primary big" onClick={s.sell}>Verkaufen für {eur(price)}</button>
      </div>
    </Modal>
  );
}
