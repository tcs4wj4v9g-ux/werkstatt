import { useEffect, useState } from 'react';
import { engineAudio } from '../game/audio';
import { CAR_MODELS } from '../game/data/cars';
import { COMPONENT_MAP } from '../game/data/components';
import { DEFECTS } from '../game/data/defects';
import { PARTS, PART_LIST } from '../game/data/parts';
import { CABINET_TOOLS, MAX_CARRIED, TOOL_MAP } from '../game/data/tools';
import { marketLabel, valuate } from '../game/market';
import { driveBlocker, isAssembled, knownDefects } from '../game/repair';
import { useGame } from '../game/store';
import type { CarInstance, PartId, ToolId } from '../game/types';
import { player, stationActions, useFocus, WORK_LABELS, workPose, type WorkView } from '../three/player';
import { FileModal } from './FileModal';
import { JobsTab } from './JobsTab';
import { eur, Modal, TopBar } from './common';
import { Joystick } from './Joystick';

const carName = (c: CarInstance) => `${CAR_MODELS[c.modelId].name} (${c.year})`;

export function GarageUI() {
  const s = useGame();
  const focus = useFocus();
  const [zoom, setZoom] = useState(player.zoom);
  const [work, setWork] = useState<string | null>(player.work?.id ?? null);
  const leave = () => {
    player.work = null;
    setWork(null);
  };
  const enter = (view: WorkView, bay: number) => {
    player.work = workPose(view, bay);
    setWork(player.work.id);
  };
  // Motor wird warm; die Arbeitsansicht endet, wenn das Auto dafür nicht mehr passt.
  useEffect(() => {
    const t = setInterval(() => useGame.getState().engineTick(), 1000);
    return () => clearInterval(t);
  }, []);
  const workBay = work ? Number(work.split(':')[1]) : -1;
  const nearBay = workBay >= 0 ? workBay : focus.nearBay;
  const near = nearBay >= 0 ? s.cars[nearBay] : null;
  const running = nearBay >= 0 && s.engineBay === nearBay;
  const views: WorkView[] = !near ? [] : near.lifted ? ['wheel_left', 'wheel_right', 'under'] : near.hoodOpen ? ['engine', 'engine_left', 'engine_right'] : [];
  useEffect(() => {
    if (work && !views.includes(work.split(':')[0] as WorkView)) leave();
  });
  const open = s.panel !== null || s.partPrompt !== null || s.lastSale !== null;
  const belt: ToolId[] = ['hand', 'lamp', ...s.carried];

  return (
    <>
      <TopBar title="Werkstatt" />

      {!open && (
        <>
          <div className="crosshair" />
          {focus.label && <div className="focus-label">{focus.label}</div>}
          {!work && <Joystick />}
          {near && (
            <div className="car-actions">
              <button className="btn" data-testid="file" onClick={() => s.setPanel('file', nearBay)}>📋 Akte</button>
              <button className={`btn ${running ? 'active' : ''}`} data-testid="engine" onClick={() => s.toggleEngine(nearBay)}>
                {running ? '⏹ Motor aus' : '🔑 Motor starten'}
              </button>
              {running && (
                <button
                  className="btn gas"
                  data-testid="gas"
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    engineAudio.throttle(0.85);
                    s.revEngine();
                  }}
                  onPointerUp={() => engineAudio.throttle(0)}
                  onPointerCancel={() => engineAudio.throttle(0)}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  Gas geben
                </button>
              )}
              {views.map((v) => (
                <button key={v} className={`btn ${work === `${v}:${nearBay}` ? 'active' : ''}`} onClick={() => enter(v, nearBay)}>
                  🎯 {WORK_LABELS[v]}
                </button>
              ))}
              {work && <button className="btn primary" data-testid="leave" onClick={leave}>✕ Ansicht verlassen</button>}
            </div>
          )}
          <div className="fp-buttons">
            {!work && (
              <button
                className={`btn round ${zoom ? 'active' : ''}`}
                onClick={() => {
                  player.zoom = !player.zoom;
                  setZoom(player.zoom);
                }}
              >
                🔍
              </button>
            )}
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
          <h3 className="small">Bühne {nearBay + 1}: {CAR_MODELS[near.modelId].name}</h3>
          <div className="meta">{near.job ? `Kundenfahrzeug von ${near.job.customer}` : 'Dein Fahrzeug'}</div>
          <h4>Bisher bekannt</h4>
          <div className="meta">{near.observed.length} Symptom(e) beobachtet – Details in der Akte</div>
          {knownDefects(near).length === 0 && <p className="meta">Noch kein Schaden am Bauteil bestätigt.</p>}
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
      {s.panel === 'file' && <FileModal />}

      {s.panel === 'report' && (
        <Modal title="Probefahrt-Bericht" onClose={() => s.setPanel(null)}>
          {s.driveReport?.length ? (
            <>
              <p>Runde geschafft. Dabei ist dir aufgefallen:</p>
              {s.driveReport.map((r) => <div key={r} className="finding">⚠ {r}</div>)}
              <p className="meta">Das sind Symptome, keine Diagnose – die möglichen Ursachen stehen in der Fahrzeugakte.</p>
            </>
          ) : (
            <p className="bigline good">Bei der Probefahrt ist dir nichts Auffälliges begegnet.</p>
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
        <Modal title={s.lastSale.title} onClose={s.dismissSale}>
          {s.lastSale.lines?.map((l) => <div key={l.label} className="meta">{l.label}: {eur(l.amount)}</div>)}
          <p className="bigline">Einnahme: {eur(s.lastSale.price)}</p>
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
            <h4>Bühne {i + 1}: {carName(car)}{car.job ? ` – Kunde ${car.job.customer}` : ''}</h4>
            {knownDefects(car).length === 0 && <p className="meta">Noch kein Schaden am Bauteil bestätigt.</p>}
            {knownDefects(car).map((d) => <div key={d} className="finding">⚠ {DEFECTS[d].name}</div>)}
            {Object.keys(car.components).filter((c) => !car.components[c].installed).map((c) => (
              <div key={c} className="meta">
                ausgebaut: {COMPONENT_MAP[c].name}
                {COMPONENT_MAP[c].partId ? (car.components[c].condition === 'defect' ? ' – defekt' : ' – in Ordnung') : ''}
              </div>
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
      <p className="meta">Das Gerät meldet nur elektronisch überwachte Fehler – und nur als Code. Ein Zündaussetzer-Code nennt den Zylinder, nicht das schuldige Bauteil. Mechanische Schäden erkennt es gar nicht.</p>
      <button className="btn primary big" onClick={() => s.scanObd(s.panelBay)}>Fehlerspeicher auslesen</button>
    </Modal>
  );
}

function ComputerModal() {
  const s = useGame();
  const [tab, setTab] = useState<'market' | 'mine' | 'jobs' | 'parts'>('market');
  const free = s.cars.filter((c) => !c).length;
  return (
    <Modal title="Werkstatt-Computer" onClose={() => s.setPanel(null)} wide>
      <div className="seg4">
        <button className={`btn ${tab === 'market' ? 'active' : ''}`} onClick={() => setTab('market')}>Gebrauchtwagen</button>
        <button className={`btn ${tab === 'mine' ? 'active' : ''}`} onClick={() => setTab('mine')}>Meine Autos</button>
        <button className={`btn ${tab === 'jobs' ? 'active' : ''}`} onClick={() => setTab('jobs')}>Aufträge</button>
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
                  {l.hints.length > 0 && ` · ${l.hints.length} Auffälligkeit(en) notiert`}
                  {l.gone && ' · Verkäufer hat abgebrochen'}
                </div>
              </div>
              <div className="price">{eur(l.current)}</div>
              <button className="btn primary" disabled={l.gone} onClick={() => s.viewListing(i)}>Besichtigen</button>
            </div>
          ))}
          <button className="btn big" onClick={s.nextDay}>🌙 Feierabend – nächster Tag (neue Angebote, neue Marktlage)</button>
        </>
      )}

      {tab === 'mine' && (
        <>
          {s.cars.every((c) => !c || c.job) && <p className="meta">Du besitzt gerade kein eigenes Auto. Kundenfahrzeuge stehen unter „Aufträge“ und können nicht verkauft werden.</p>}
          {s.cars.map((car, i) => (car && !car.job ? <SellCard key={car.uid} bay={i} car={car} /> : null))}
          <p className="meta">Verkaufte Autos: {s.carsSold} · Gesamtgewinn: {eur(s.totalProfit)}</p>
        </>
      )}

      {tab === 'jobs' && <JobsTab />}
      {tab === 'parts' && <ShopList />}
    </Modal>
  );
}

function SellCard({ bay, car }: { bay: number; car: CarInstance }) {
  const s = useGame();
  const v = valuate(car, s.marketIndex);
  const price = car.haggled ? v.haggleOffer : v.offer;
  const profit = price - car.purchasePrice - car.partsSpent;
  // Mängel, die der Spieler noch nicht gefunden hat, nennt der Käufer nicht beim Namen.
  const known = knownDefects(car);
  const named = v.deductions.filter((d) => !d.defect || known.includes(d.defect));
  const hidden = v.deductions.filter((d) => d.defect && !known.includes(d.defect)).reduce((a, d) => a + d.amount, 0);
  return (
    <div className="sell-card">
      <b>Bühne {bay + 1}: {carName(car)} · {car.km.toLocaleString('de-DE')} km</b>
      <table className="val">
        <tbody>
          <tr><td>Marktwert in Bestzustand (heutige Marktlage)</td><td>{eur(v.cleanValue)}</td></tr>
          {named.map((d) => (
            <tr key={d.label} className="bad"><td>− {d.label}</td><td>−{eur(d.amount)}</td></tr>
          ))}
          {hidden > 0 && (
            <tr className="bad"><td>− Weitere Mängel laut Gutachter des Käufers (dir noch unbekannt)</td><td>−{eur(hidden)}</td></tr>
          )}
          <tr className="sum"><td>Angebot des Käufers</td><td data-testid={`sell-price-${bay}`}>{eur(price)}</td></tr>
          <tr><td>Einkauf {eur(car.purchasePrice)} + verbaute Teile {eur(car.partsSpent)}</td><td>−{eur(car.purchasePrice + car.partsSpent)}</td></tr>
          <tr className={`sum ${profit >= 0 ? 'good' : 'bad'}`}><td>{profit >= 0 ? 'Gewinn' : 'Verlust'}</td><td>{eur(Math.abs(profit))}</td></tr>
        </tbody>
      </table>
      <div className="row">
        <button className="btn" disabled={car.haggled} onClick={() => s.haggle(bay)}>
          {car.haggled ? 'Bereits nachverhandelt' : 'Nachverhandeln (1 Versuch)'}
        </button>
        <button className="btn primary" onClick={() => s.sell(bay)}>Verkaufen für {eur(price)}</button>
      </div>
    </div>
  );
}
