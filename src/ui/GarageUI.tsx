import { useState } from 'react';
import { CAR_MODELS } from '../game/data/cars';
import { COMPONENT_MAP } from '../game/data/components';
import { DEFECTS } from '../game/data/defects';
import { PARTS, PART_LIST } from '../game/data/parts';
import { CABINET_TOOLS, MAX_CARRIED, TOOL_MAP } from '../game/data/tools';
import { marketLabel, valuate } from '../game/market';
import { driveBlocker, isAssembled, knownDefects } from '../game/repair';
import { useGame } from '../game/store';
import type { CarInstance, PartId, ToolId } from '../game/types';
import { player, stationActions, useFocus } from '../three/player';
import { eur, Modal, TopBar } from './common';
import { Joystick } from './Joystick';

const carName = (c: CarInstance) => `${CAR_MODELS[c.modelId].name} (${c.year})`;

export function GarageUI() {
  const s = useGame();
  const focus = useFocus();
  const [zoom, setZoom] = useState(player.zoom);
  const near = focus.nearBay >= 0 ? s.cars[focus.nearBay] : null;
  const open = s.panel !== null || s.partPrompt !== null || s.lastSale !== null;
  const belt: ToolId[] = ['hand', 'lamp', ...s.carried];

  return (
    <>
      <TopBar title="Werkstatt" />

      {!open && (
        <>
          <div className="crosshair" />
          {focus.label && <div className="focus-label">{focus.label}</div>}
          <Joystick />
          <div className="fp-buttons">
            <button
              className={`btn round ${zoom ? 'active' : ''}`}
              onClick={() => {
                player.zoom = !player.zoom;
                setZoom(player.zoom);
              }}
            >
              🔍
            </button>
            {focus.id && (
              <button className="btn primary use" data-testid="use" onClick={() => stationActions.get(focus.id!)?.()}>
                Benutzen
              </button>
            )}
          </div>
        </>
      )}

      {near && !open && (
        <div className="panel left">
          <h3 className="small">Bühne {focus.nearBay + 1}: {CAR_MODELS[near.modelId].name}</h3>
          <h4>Befunde</h4>
          {knownDefects(near).length === 0 && <p className="meta">Keine offenen Mängel bekannt.</p>}
          {knownDefects(near).map((d) => (
            <div key={d} className="finding">⚠ {DEFECTS[d].name}</div>
          ))}
          <h4>Status</h4>
          <div className="meta">{isAssembled(near) ? '✓ komplett montiert' : '✗ Teile demontiert'}</div>
          <div className="meta">{near.lifted ? '▲ angehoben' : '▼ am Boden'} · {near.hoodOpen ? 'Haube offen' : 'Haube zu'}</div>
          <div className="meta">{near.testDriven ? '✓ Probefahrt gemacht' : '– Probefahrt offen'}</div>
        </div>
      )}

      <div className="toolbar" data-testid="toolbelt">
        {belt.map((id) => {
          const t = TOOL_MAP[id];
          const socket = t.kind === 'socket';
          return (
            <button
              key={id}
              className={`btn tool ${s.tool === id ? 'active' : ''} ${socket ? 'socket' : ''}`}
              disabled={socket}
              onClick={() => s.setTool(id)}
            >
              <span className="ico">{t.icon}</span>
              {t.short}
              {socket && <small>steckt bereit</small>}
            </button>
          );
        })}
        {Array.from({ length: MAX_CARRIED - s.carried.length }, (_, i) => (
          <div key={i} className="tool empty">frei</div>
        ))}
      </div>

      {s.panel === 'cabinet' && <CabinetModal />}
      {s.panel === 'computer' && <ComputerModal />}
      {s.panel === 'shop' && (
        <Modal title="Ersatzteilregal" onClose={() => s.setPanel(null)} wide>
          <ShopList />
        </Modal>
      )}
      {s.panel === 'bench' && <BenchModal />}
      {s.panel === 'drive' && <DriveModal />}
      {s.panel === 'obd' && <ObdModal />}

      {s.panel === 'report' && (
        <Modal title="Probefahrt-Bericht" onClose={() => s.setPanel(null)}>
          {s.driveReport?.length ? (
            <>
              <p>Runde geschafft, aber dir ist etwas aufgefallen:</p>
              {s.driveReport.map((r) => <div key={r} className="finding">⚠ {r}</div>)}
              <p className="meta">Symptome sind Hinweise – die Ursache findest du mit Prüflampe und OBD.</p>
            </>
          ) : (
            <p className="bigline good">Der Wagen läuft einwandfrei! Bereit für den Verkauf.</p>
          )}
          <button className="btn primary big" onClick={() => s.setPanel(null)}>Zur Werkstatt</button>
        </Modal>
      )}

      {s.partPrompt && (
        <Modal title="Neuteil fehlt" onClose={s.closePartPrompt}>
          <p>
            {COMPONENT_MAP[s.partPrompt.compId].name} ist defekt. Du hast kein Neuteil „{PARTS[s.partPrompt.partId].name}“ im Regal.
          </p>
          <button className="btn primary big" onClick={() => { s.closePartPrompt(); s.setPanel('shop'); }}>Teil bestellen</button>
          <button className="btn big" onClick={() => s.tapComponent(s.partPrompt!.bay, s.partPrompt!.compId, true)}>Defektes Altteil wieder einbauen</button>
        </Modal>
      )}

      {s.lastSale && (
        <Modal title="Verkauft!" onClose={s.dismissSale}>
          <p className="bigline">Verkaufspreis: {eur(s.lastSale.price)}</p>
          <p className={`bigline ${s.lastSale.profit >= 0 ? 'good' : 'bad'}`}>
            {s.lastSale.profit >= 0 ? 'Gewinn' : 'Verlust'}: {eur(Math.abs(s.lastSale.profit))}
          </p>
          <button className="btn primary big" onClick={s.dismissSale}>Weiter</button>
        </Modal>
      )}
    </>
  );
}

function CabinetModal() {
  const s = useGame();
  return (
    <Modal title={`Werkzeugschrank – du trägst ${s.carried.length}/${MAX_CARRIED}`} onClose={() => s.setPanel(null)} wide>
      <div className="grid2">
        {CABINET_TOOLS.map((t) => {
          const has = s.carried.includes(t.id);
          return (
            <div key={t.id} className={`tool-card ${has ? 'has' : ''}`}>
              <span className="ico">{t.icon}</span>
              <div className="grow">
                <b>{t.name}</b>
                <div className="meta">{t.hint}</div>
              </div>
              <button className={`btn ${has ? '' : 'primary'}`} onClick={() => (has ? s.returnTool(t.id) : s.takeTool(t.id))}>
                {has ? 'Zurücklegen' : 'Nehmen'}
              </button>
            </div>
          );
        })}
      </div>
      <p className="meta">Hand und Prüflampe hast du immer dabei. Stecknüsse stecken automatisch auf Ratsche oder Drehmomentschlüssel.</p>
    </Modal>
  );
}

function ShopList() {
  const s = useGame();
  return (
    <>
      {PART_LIST.map((p) => (
        <div key={p.id} className="shop-row">
          <div>
            <b>{p.name}</b>
            <div className="meta">{p.desc} · im Regal: {s.inventory[p.id]}</div>
          </div>
          <button className="btn primary" disabled={s.money < p.price} onClick={() => s.buyPart(p.id)}>
            Bestellen {eur(p.price)}
          </button>
        </div>
      ))}
    </>
  );
}

/** Werkbank: Übersicht über Lager und Befunde beider Autos. */
function BenchModal() {
  const s = useGame();
  const stock = (Object.keys(s.inventory) as PartId[]).filter((p) => s.inventory[p] > 0);
  return (
    <Modal title="Werkbank" onClose={() => s.setPanel(null)} wide>
      <h4>Teile im Regal</h4>
      {stock.length === 0 && <p className="meta">Keine Ersatzteile vorrätig.</p>}
      {stock.map((p) => <div key={p} className="meta">{s.inventory[p]}× {PARTS[p].name}</div>)}
      {s.cars.map((car, i) =>
        car ? (
          <div key={i}>
            <h4>Bühne {i + 1}: {carName(car)}</h4>
            {knownDefects(car).length === 0 && <p className="meta">Keine offenen Mängel bekannt.</p>}
            {knownDefects(car).map((d) => <div key={d} className="finding">⚠ {DEFECTS[d].name}</div>)}
            {Object.keys(car.components).filter((c) => !car.components[c].installed).map((c) => (
              <div key={c} className="meta">ausgebaut: {COMPONENT_MAP[c].name}</div>
            ))}
          </div>
        ) : null,
      )}
    </Modal>
  );
}

function DriveModal() {
  const s = useGame();
  const any = s.cars.some(Boolean);
  return (
    <Modal title="Probefahrt" onClose={() => s.setPanel(null)}>
      {!any && <p className="meta">Du besitzt noch kein Auto. Am Computer findest du den Gebrauchtwagenmarkt.</p>}
      {s.cars.map((car, i) => {
        if (!car) return null;
        const blocker = driveBlocker(car);
        return (
          <div key={i} className="shop-row">
            <div>
              <b>Bühne {i + 1}: {carName(car)}</b>
              <div className={`meta ${blocker ? 'bad' : ''}`}>{blocker ?? 'Fahrbereit.'}</div>
            </div>
            <button className="btn primary" disabled={!!blocker} onClick={() => s.startDrive(i)}>🏁 Losfahren</button>
          </div>
        );
      })}
    </Modal>
  );
}

function ObdModal() {
  const s = useGame();
  const car = s.cars[s.panelBay];
  if (!car) return null;
  return (
    <Modal title={`OBD-Diagnose – Bühne ${s.panelBay + 1}`} onClose={() => s.setPanel(null)}>
      <div className="obd">
        {car.obdCodes === null && <div>BEREIT – Stecker verbunden.</div>}
        {car.obdCodes?.length === 0 && <div>KEINE FEHLER GESPEICHERT</div>}
        {car.obdCodes?.map((c) => <div key={c}>▶ {c}</div>)}
      </div>
      <p className="meta">Das Gerät erkennt nur elektronisch überwachte Fehler. Lecks, Riemen und Bremsscheiben findest du nur mit der Prüflampe.</p>
      <button className="btn primary big" onClick={() => s.scanObd(s.panelBay)}>Fehlerspeicher auslesen</button>
    </Modal>
  );
}

function ComputerModal() {
  const s = useGame();
  const [tab, setTab] = useState<'market' | 'mine' | 'parts'>('market');
  const free = s.cars.filter((c) => !c).length;
  return (
    <Modal title="Werkstatt-Computer" onClose={() => s.setPanel(null)} wide>
      <div className="seg3">
        <button className={`btn ${tab === 'market' ? 'active' : ''}`} onClick={() => setTab('market')}>Gebrauchtwagen</button>
        <button className={`btn ${tab === 'mine' ? 'active' : ''}`} onClick={() => setTab('mine')}>Meine Autos</button>
        <button className={`btn ${tab === 'parts' ? 'active' : ''}`} onClick={() => setTab('parts')}>Teile bestellen</button>
      </div>

      {tab === 'market' && (
        <>
          <p className="meta">
            Tag {s.day} · {marketLabel(s.marketIndex)} · freie Hebebühnen: {free}
          </p>
          {s.listings.map((l, i) => (
            <div key={l.id} className="shop-row">
              <div>
                <b>{CAR_MODELS[l.car.modelId].name}</b>
                <div className="meta">
                  Bj. {l.car.year} · {l.car.km.toLocaleString('de-DE')} km · {l.seller}
                  {l.hints.length > 0 && ` · ${l.hints.length} Mangel entdeckt`}
                </div>
              </div>
              <div className="price">{eur(l.current)}</div>
              <button className="btn primary" onClick={() => s.viewListing(i)}>Besichtigen</button>
            </div>
          ))}
          <button className="btn big" onClick={s.nextDay}>🌙 Feierabend – nächster Tag (neue Angebote, neue Marktlage)</button>
        </>
      )}

      {tab === 'mine' && (
        <>
          {s.cars.every((c) => !c) && <p className="meta">Du besitzt noch kein Auto.</p>}
          {s.cars.map((car, i) => (car ? <SellCard key={car.uid} bay={i} car={car} /> : null))}
          <p className="meta">Verkaufte Autos: {s.carsSold} · Gesamtgewinn: {eur(s.totalProfit)}</p>
        </>
      )}

      {tab === 'parts' && <ShopList />}
    </Modal>
  );
}

function SellCard({ bay, car }: { bay: number; car: CarInstance }) {
  const s = useGame();
  const v = valuate(car, s.marketIndex);
  const price = car.haggled ? v.haggleOffer : v.offer;
  const profit = price - car.purchasePrice - car.partsSpent;
  return (
    <div className="sell-card">
      <b>Bühne {bay + 1}: {carName(car)} · {car.km.toLocaleString('de-DE')} km</b>
      <table className="val">
        <tbody>
          <tr><td>Marktwert in Bestzustand (heutige Marktlage)</td><td>{eur(v.cleanValue)}</td></tr>
          {v.deductions.map((d) => (
            <tr key={d.label} className="bad"><td>− {d.label}</td><td>−{eur(d.amount)}</td></tr>
          ))}
          <tr className="sum"><td>Angebot des Käufers</td><td data-testid={`sell-price-${bay}`}>{eur(price)}</td></tr>
          <tr><td>Einkauf {eur(car.purchasePrice)} + verbaute Teile {eur(car.partsSpent)}</td><td>−{eur(car.purchasePrice + car.partsSpent)}</td></tr>
          <tr className={`sum ${profit >= 0 ? 'good' : 'bad'}`}><td>{profit >= 0 ? 'Gewinn' : 'Verlust'}</td><td>{eur(Math.abs(profit))}</td></tr>
        </tbody>
      </table>
      <p className="meta">Bekannt sind dir bisher nur die Mängel, die du selbst gefunden hast – der Käufer findet alle.</p>
      <div className="row">
        <button className="btn" disabled={car.haggled} onClick={() => s.haggle(bay)}>
          {car.haggled ? 'Bereits nachverhandelt' : 'Nachverhandeln (1 Versuch)'}
        </button>
        <button className="btn primary" onClick={() => s.sell(bay)}>Verkaufen für {eur(price)}</button>
      </div>
    </div>
  );
}
