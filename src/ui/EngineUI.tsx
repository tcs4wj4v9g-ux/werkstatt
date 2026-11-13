import { CAR_MODELS } from '../game/data/cars';
import { defOf, engineOf } from '../game/data/components';
import { DEFECTS } from '../game/data/defects';
import { ENGINES } from '../game/data/engines';
import { PARTS } from '../game/data/parts';
import { VISUAL_MAP, VISUAL_PARTS, dropOf, mountedId } from '../game/data/visual';
import { JUNK_SLOTS, SLOTS, STAND_SLOT, isLift } from '../game/data/workshop';
import { fitOf } from '../game/fitment';
import { engineHealth, engineValue, junkEnginePrice, motorLabel, removalSteps, swapPlan, unitComplete, type EngineUnit } from '../game/motor';
import { engineOutput, performance } from '../game/performance';
import { isAssembled } from '../game/repair';
import { installOptions, useGame } from '../game/store';
import type { CarInstance, VisualTune } from '../game/types';
import { eur, Modal } from './common';

const carName = (c: CarInstance) => `${CAR_MODELS[c.modelId].name} (${c.year})`;

function UnitLine({ u }: { u: EngineUnit }) {
  const e = ENGINES[u.motor.engineId];
  const h = engineHealth(u);
  const known = h.defects.filter((d) => Object.values(u.components).some((c) => c.known && c.condition === 'defect'));
  return (
    <div className="meta">
      <b>{e?.name ?? u.motor.engineId}</b> · {e?.layout} {e?.fuel === 'diesel' ? 'Diesel' : 'Benzin'}{e?.turbo || u.motor.turboKit ? ' Turbo' : ''} · {e?.liters} l · {e?.ps} PS · {u.motor.km.toLocaleString('de-DE')} km · aus {CAR_MODELS[u.motor.donor]?.name ?? u.motor.donor}
      {known.length > 0 && <span className="bad"> · bekannte Schäden: {known.map((d) => DEFECTS[d].name).join(', ')}</span>}
      {!unitComplete(u) && <span> · teilweise zerlegt</span>}
    </div>
  );
}

function Checklist({ car }: { car: CarInstance }) {
  return (
    <ul className="checklist">
      {removalSteps(car).map((x) => (
        <li key={x.label} className={x.done ? 'good' : ''}>
          {x.done ? '✓' : '✗'} {x.label}
        </li>
      ))}
    </ul>
  );
}

/** Motorkran, Motorständer und Einbau in ein Auto. */
export function CranePanel() {
  const s = useGame();
  const stand = s.cars[STAND_SLOT];
  const lifts = SLOTS.filter((x) => isLift(x.id) && s.cars[x.id]);
  const hoist = s.upgrades.includes('hoist');
  return (
    <Modal title="Motorkran und Motorständer" onClose={() => s.setPanel(null)} wide>
      {!hoist && <p className="meta">Für Motorausbau und -einbau brauchst du den Motorkran: Werkstatt-Computer → Ausbau → „Motor- und Getriebeheber“. Der Motorständer ist schon da.</p>}
      <h4>Am Kran</h4>
      {s.crane ? <UnitLine u={s.crane} /> : <p className="meta">Am Kran hängt kein Motor.</p>}
      {s.crane && (
        <div className="row wrap">
          <button className="btn primary" disabled={!!stand} onClick={() => s.craneToStand()}>Auf den Motorständer</button>
          <button className="btn" onClick={() => s.craneToStorage()}>Ins Motorlager (Palette)</button>
        </div>
      )}
      {hoist &&
        lifts.map((x) => {
          const car = s.cars[x.id]!;
          if (car.motor === null) {
            if (!s.crane) return <p key={x.id} className="meta">{x.label}: {carName(car)} – kein Motor eingebaut.</p>;
            const plan = swapPlan(car, s.crane.motor.engineId);
            return (
              <div key={x.id} className="shop-row col">
                <b>{x.label}: {carName(car)} – {s.crane.motor.engineId === engineOf({ modelId: car.modelId }).id ? 'Originalmotor' : 'Motorumbau'}</b>
                <div className="meta">{plan.label}: {plan.reasons.join(' ')}</div>
                {plan.needs.map((n) => (
                  <div key={n.key} className={`meta ${s.inventory[n.key] > 0 ? 'good' : 'bad'}`}>
                    {s.inventory[n.key] > 0 ? '✓' : '✗'} {PARTS[n.part].name} {s.inventory[n.key] > 0 ? '(im Lager)' : '– im Teileshop unter „Umbau“'}
                  </div>
                ))}
                {!unitComplete(s.crane) && <div className="meta bad">✗ Motor ist nicht komplett montiert.</div>}
                <button className="btn primary" data-testid={`install-${x.id}`} disabled={!plan.possible} onClick={() => s.installEngine(x.id)}>
                  Motor einsetzen
                </button>
              </div>
            );
          }
          return (
            <div key={x.id} className="shop-row col">
              <b>{x.label}: {carName(car)} – {engineOf(car).name}</b>
              <Checklist car={car} />
              <button className="btn" data-testid={`lift-${x.id}`} disabled={!!s.crane} onClick={() => s.liftEngine(x.id)}>
                Motor herausheben
              </button>
            </div>
          );
        })}
      <h4>Motorständer</h4>
      {!stand && <p className="meta">Der Motorständer ist leer.</p>}
      {stand && (
        <>
          <div className="meta">
            <b>{motorLabel(stand.motor!)}</b> · {stand.motor!.km.toLocaleString('de-DE')} km · {stand.lifted ? 'gedreht (Unterseite oben)' : 'Oberseite oben'} · {isAssembled(stand) ? 'komplett montiert' : 'teilweise zerlegt'}
          </div>
          <div className="row wrap">
            <button className="btn primary" data-testid="flip" onClick={() => s.flipEngine()}>↻ Motor drehen</button>
            <button className="btn" data-testid="enginetest" onClick={() => s.testEngine()}>📊 Kompression und Öldruck prüfen</button>
            <button className="btn" disabled={!!s.crane || !hoist} onClick={() => s.standToCrane()}>An den Kran hängen</button>
            {!engineOf(stand).turbo && !stand.motor?.turboKit && <button className="btn" onClick={() => s.fitTurboKit(STAND_SLOT)}>Turbo-Nachrüstsatz vorbereiten</button>}
          </div>
          <details>
            <summary className="meta">Historie</summary>
            {stand.motor!.history.map((h, i) => (
              <div key={i} className="meta">{h}</div>
            ))}
          </details>
        </>
      )}
      {!s.crane && s.engines.length > 0 && hoist && (
        <>
          <h4>Aus dem Motorlager holen</h4>
          {s.engines.map((u) => (
            <div key={u.motor.uid} className="shop-row">
              <UnitLine u={u} />
              <button className="btn" onClick={() => s.storageToCrane(u.motor.uid)}>An den Kran</button>
            </div>
          ))}
        </>
      )}
    </Modal>
  );
}

/** Motorlager: alle ausgebauten Motoren. */
export function EnginesPanel() {
  const s = useGame();
  return (
    <Modal title={`Motorlager – ${s.engines.length}/8 Paletten`} onClose={() => s.setPanel(null)} wide>
      {s.engines.length === 0 && <p className="meta">Keine Motoren eingelagert. Motoren vom Schrottplatz werden hierher geliefert; ausgebaute Motoren stellst du mit dem Kran ab.</p>}
      {s.engines.map((u) => (
        <div key={u.motor.uid} className="shop-row col">
          <UnitLine u={u} />
          <details>
            <summary className="meta">Historie</summary>
            {u.motor.history.map((h, i) => (
              <div key={i} className="meta">{h}</div>
            ))}
          </details>
          <div className="row">
            <button className="btn" disabled={!!s.crane || !s.upgrades.includes('hoist')} onClick={() => s.storageToCrane(u.motor.uid)}>An den Kran holen</button>
            <button className="btn" onClick={() => s.sellEngine(u.motor.uid)}>Verkaufen ({eur(engineValue(u))})</button>
          </div>
        </div>
      ))}
    </Modal>
  );
}

/** Schrottplatz-Büro: Fahrzeuge, Preise, Motor- und Komplettkauf. */
export function JunkPanel() {
  const s = useGame();
  return (
    <Modal title="Schrott & Teile Krüger" onClose={() => s.setPanel(null)} wide>
      <p className="meta">Teile baust du selbst aus – bezahlt wird beim Ausbau. Werkzeug kannst du am Regal ausleihen. Motoren hebt unser Kran heraus (40 € Miete) und liefert sie in dein Motorlager.</p>
      {JUNK_SLOTS.map((slot) => {
        const car = s.cars[slot];
        if (!car?.junk) return null;
        const missing = Object.values(car.components).filter((c) => c.missing).length;
        const tuned = Object.values(car.components).filter((c) => c.variant && !c.missing).length + (car.visual ? Object.values(car.visual).filter(Boolean).length : 0);
        return (
          <div key={slot} className="shop-row col" data-testid={`junk-${slot}`}>
            <b>{SLOTS[slot].label}: {carName(car)} – {car.junk.story}</b>
            <div className="meta">
              {car.motor === null ? 'ohne Motor' : engineOf(car).name} · {(car.motor?.km ?? car.km).toLocaleString('de-DE')} km · {missing} Teile fehlen{tuned ? ` · ${tuned} Tuningteile` : ''} · steht bis Tag {car.junk.until}
            </div>
            {car.motor !== null && (
              <>
                <Checklist car={car} />
                <button className="btn" data-testid={`junk-engine-${slot}`} onClick={() => s.liftEngine(slot)}>Motor kaufen und ausbauen lassen</button>
              </>
            )}
            <button className="btn" onClick={() => s.buyJunkCar(slot)}>Ganzes Auto kaufen und abschleppen ({eur(car.junk.price + 150)})</button>
          </div>
        );
      })}
    </Modal>
  );
}

const FIELDS: { field: keyof VisualTune; label: string }[] = [
  { field: 'rim', label: 'Felgen' }, { field: 'rimSize', label: 'Felgengröße' }, { field: 'rimColor', label: 'Felgenfarbe' }, { field: 'suspension', label: 'Fahrwerk' },
  { field: 'front', label: 'Frontstoßstange' }, { field: 'rear', label: 'Heckschürze' }, { field: 'skirts', label: 'Seitenschweller' }, { field: 'spoiler', label: 'Spoiler' },
  { field: 'hood', label: 'Motorhaube' }, { field: 'flares', label: 'Verbreiterungen' }, { field: 'finish', label: 'Lackart' }, { field: 'wrap', label: 'Folie' },
  { field: 'lamps', label: 'Rückleuchten' }, { field: 'tips', label: 'Endrohre' }, { field: 'seats', label: 'Sitze' }, { field: 'wheel', label: 'Lenkrad' },
];

/** Tuning-Werkbank: Optik montieren, Steuergerät abstimmen, Leistung ablesen. */
export function TuningPanel() {
  const s = useGame();
  const slot = s.panelBay;
  const car = s.cars[slot];
  if (!car || car.bare || car.junk) return null;
  const p = performance(car);
  const out = engineOutput(car);
  const ecu = car.ecu ?? { map: 0, boost: 0, limiter: 0 };
  const charged = engineOf(car).turbo || !!car.motor?.turboKit;
  const hasObd = s.carried.includes('obd');
  return (
    <Modal title={`Tuning – ${carName(car)}`} onClose={() => s.setPanel(null)} wide>
      <h4>Leistung jetzt</h4>
      <div className="meta" data-testid="tune-perf">
        <b>{p.ps} PS · {p.nm} Nm</b> (Serie {p.ratedPs} PS) · {Math.round(p.weight)} kg · {p.powerToWeight.toFixed(0)} PS/t
        {charged ? ` · Ladedruck ${out.boost.toFixed(2)} bar` : ''} · begrenzt durch: {out.limit}
      </div>
      {out.notes.map((n) => <div key={n} className="meta">{n}</div>)}
      {out.risks.map((r) => (
        <div key={r.label} className={`meta ${r.level >= 1 ? 'bad' : ''}`}>⚠ {r.label}{r.level >= 1 ? ' – unter Volllast drohen Schäden!' : ''}</div>
      ))}
      <h4>Steuergerät {hasObd ? '' : '(OBD-Diagnosegerät mitnehmen)'}</h4>
      <div className="row wrap">
        {[0, 1, 2].map((m) => (
          <button key={m} className={`btn ${ecu.map === m ? 'primary' : ''}`} disabled={!hasObd || m < ecu.map} onClick={() => s.setEcu(slot, {}, m)}>
            {m === 0 ? 'Serie' : `Stufe ${m}`}{m > ecu.map ? ` (${m === 1 ? '450' : '950'} €)` : ''}
          </button>
        ))}
      </div>
      {charged && (
        <label className="field">
          Ladedruck-Ziel: {ecu.boost ? `${ecu.boost.toFixed(2)} bar` : 'Serie'}
          <input type="range" min={0} max={2} step={0.05} value={ecu.boost} disabled={!hasObd} onChange={(e) => s.setEcu(slot, { boost: Number(e.target.value) })} data-testid="boost" />
        </label>
      )}
      <label className="field">
        Drehzahlbegrenzer: {ecu.limiter > 0 ? `+${ecu.limiter}` : ecu.limiter} U/min
        <input type="range" min={-500} max={600} step={100} value={ecu.limiter} disabled={!hasObd || ecu.map === 0} onChange={(e) => s.setEcu(slot, { limiter: Number(e.target.value) })} />
      </label>
      {!engineOf(car).turbo && !car.motor?.turboKit && car.motor !== null && (
        <button className="btn" onClick={() => s.fitTurboKit(slot)}>Turbo-Nachrüstsatz vorbereiten (Halter, Ölleitungen)</button>
      )}
      <p className="meta">Mechanische Tuningteile (Turbolader, Sportluftfilter, Sportauspuff, Ladeluftkühler, Kraftstoffpumpe, Einspritzdüsen, Kolben, Nockenwellen, Fächerkrümmer) baust du wie ein Ersatzteil ein: Serienteil ausbauen, beim Einbau das Tuningteil wählen.</p>
      <h4>Optik</h4>
      {FIELDS.map(({ field, label }) => {
        const mounted = mountedId(car.visual, field);
        const avail = VISUAL_PARTS.filter((v) => v.field === field && (s.visualStock[v.id] ?? 0) > 0 && v.id !== mounted);
        return (
          <div key={field} className="shop-row">
            <div>
              <b>{label}</b>: {mounted ? VISUAL_MAP[mounted].name : 'Serie'}
            </div>
            <div className="row wrap">
              {avail.map((v) => (
                <button key={v.id} className="btn" data-testid={`mount-${v.id}`} onClick={() => s.mountVisual(slot, v.id)}>
                  {v.name} montieren ({s.visualStock[v.id]})
                </button>
              ))}
              {mounted && <button className="btn ghost" onClick={() => s.unmountVisual(slot, field)}>Serie</button>}
            </div>
          </div>
        );
      })}
      {car.visual?.suspension === 'coilover' && (
        <label className="field">
          Gewindefahrwerk: −{dropOf(car.visual)} cm
          <input type="range" min={2} max={7} step={1} value={dropOf(car.visual)} onChange={(e) => s.setDrop(slot, Number(e.target.value))} />
        </label>
      )}
      <h4>Optik bestellen</h4>
      {(['Felgen', 'Fahrwerk', 'Karosserie', 'Lack & Folie', 'Licht', 'Auspuffblenden', 'Innenraum'] as const).map((g) => (
        <details key={g}>
          <summary>{g}</summary>
          {VISUAL_PARTS.filter((v) => v.group === g).map((v) => (
            <div key={v.id} className="shop-row">
              <div>
                <b>{v.name}</b> <span className="meta">– {v.desc} · im Lager: {s.visualStock[v.id] ?? 0}</span>
              </div>
              <button className="btn" data-testid={`buy-${v.id}`} onClick={() => s.buyVisual(v.id)}>{eur(v.price)}</button>
            </div>
          ))}
        </details>
      ))}
    </Modal>
  );
}

/** Ergebnis der Prüfung am ausgebauten Motor. */
export function EngineTestPanel() {
  const s = useGame();
  const r = s.engineReport;
  if (!r) return null;
  const max = Math.max(r.nominal * 1.1, ...r.compression);
  return (
    <Modal title={`Motorprüfstand – ${r.title}`} onClose={() => s.setPanel(null)}>
      <h4>Kompression je Zylinder (Soll {r.nominal} bar)</h4>
      <div className="bars" data-testid="compression">
        {r.compression.map((v, i) => (
          <div key={i} className="bar-row">
            <span>Zyl. {i + 1}</span>
            <div className="bar"><div className={`fill ${v < r.nominal * 0.85 ? 'bad' : ''}`} style={{ width: `${(v / max) * 100}%` }} /></div>
            <span>{v} bar</span>
          </div>
        ))}
      </div>
      <p className={`bigline ${r.oilPressure < 2.5 ? 'bad' : 'good'}`}>Öldruck bei 3000 U/min: {r.oilPressure} bar</p>
      {r.findings.length === 0 ? <p className="meta">Keine Auffälligkeiten.</p> : r.findings.map((f) => <div key={f} className="finding">⚠ {f}</div>)}
      <button className="btn primary big" onClick={() => s.setPanel('crane')}>Zurück zum Motorständer</button>
    </Modal>
  );
}

/** Einbau mit Auswahl: Neuteil, Tuningteil, Gebrauchtteil oder das ausgebaute Altteil. */
export function PartChoice() {
  const s = useGame();
  const pp = s.partPrompt!;
  const car = s.cars[pp.bay];
  if (!car) return null;
  const opt = installOptions(s, car, pp.compId);
  const def = defOf(car, pp.compId);
  const st = car.components[pp.compId];
  return (
    <Modal title={`${def.name} einbauen`} onClose={s.closePartPrompt}>
      {opt && opt.newStock > 0 && <button className="btn big primary" onClick={() => s.installWith(pp.bay, pp.compId, { kind: 'new' })}>Neuteil (Serie) – {opt.newStock} im Lager</button>}
      {opt?.variants.map((v) => (
        <button key={v.part} className="btn big" data-testid={`variant-${v.part}`} onClick={() => s.installWith(pp.bay, pp.compId, { kind: 'variant', part: v.part })}>
          Tuning: {PARTS[v.part].name} – {v.stock} im Lager
        </button>
      ))}
      {opt?.used.map((u) => (
        <button key={u.id} className="btn big" data-testid={`used-${u.id}`} onClick={() => s.installWith(pp.bay, pp.compId, { kind: 'used', id: u.id })}>
          Gebraucht: {PARTS[u.part].name} · {u.km.toLocaleString('de-DE')} km · {u.known ? (u.condition === 'defect' ? 'DEFEKT' : u.health !== undefined ? `${u.health} %` : 'geprüft, in Ordnung') : 'ungeprüft'} · aus {u.from}
        </button>
      ))}
      {opt?.old && <button className="btn big ghost" onClick={() => s.installWith(pp.bay, pp.compId, { kind: 'old' })}>Ausgebautes Altteil wieder einbauen{st?.known ? (st.condition === 'defect' ? ' (defekt)' : ' (in Ordnung)') : ''}</button>}
      <p className="meta">Passform: {fitOf(car, def.partId!)}. Gebrauchtteile kannst du an der Werkbank vorher prüfen.</p>
    </Modal>
  );
}

/** Gebrauchtteile an der Werkbank: prüfen und verkaufen. */
export function UsedPartsList() {
  const s = useGame();
  if (!s.used.length) return <p className="meta">Keine Gebrauchtteile im Lager.</p>;
  return (
    <>
      {s.used.map((u) => (
        <div key={u.id} className="shop-row" data-testid="used-part">
          <div>
            <b>{PARTS[u.part].name}</b> <span className="meta">– {u.fit} · {u.km.toLocaleString('de-DE')} km · aus {u.from} · {u.known ? (u.condition === 'defect' ? 'defekt' : 'geprüft, in Ordnung') : 'ungeprüft'} · bezahlt {eur(u.price)}</span>
          </div>
          <div className="row">
            {!u.known && <button className="btn" onClick={() => s.checkUsed(u.id)}>Prüfen</button>}
            <button className="btn ghost" onClick={() => s.sellUsed(u.id)}>Verkaufen</button>
          </div>
        </div>
      ))}
    </>
  );
}

export const junkPrice = junkEnginePrice;
