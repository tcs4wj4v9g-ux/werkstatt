import { useEffect, useState } from 'react';
import { heldMoney, minBid } from '../game/auctions';
import { CAR_MODELS } from '../game/data/cars';
import { FLUID_LIST } from '../game/data/fluids';
import { defsOf, engineOf, modelEngine } from '../game/data/components';
import { PART_LIST, PARTS } from '../game/data/parts';
import { fitOf, stockOf } from '../game/fitment';
import { availableSlots, GARAGES, SLOTS, STAND_SLOTS, UPGRADES, isJunk } from '../game/data/workshop';
import { travel } from '../three/player';
import { fromStand, newEnginePrice, swapPlan, withRemovedEngine, type EngineUnit } from '../game/motor';
import { ENGINES } from '../game/data/engines';
import { RARITY_NAMES } from '../game/market';
import { fluidPrice, partPrice, removedEngines, useGame } from '../game/store';
import { eur } from './common';

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Laufende Uhrzeit für Auktions-Countdowns. */
export function useNow(interval = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}

export function AuctionsTab() {
  const s = useGame();
  const now = useNow();
  const held = heldMoney(s.auctions);
  return (
    <>
      <p className="meta">
        Händler bieten mit – jeder nur bis zu seinem Limit. Der Zustandsbericht nennt nicht alles. Freies Geld: {eur(s.money - held)}
        {held > 0 && ` (${eur(held)} in Höchstgeboten gebunden)`}
      </p>
      {s.waiting.length > 0 && (
        <div className="note">
          {s.waiting.length} ersteigertes Auto wartet beim Auktionshaus auf einen freien Stellplatz.
          <button className="btn" onClick={s.claimWaiting}>Jetzt liefern lassen</button>
        </div>
      )}
      {s.auctions.length === 0 && <p className="meta">Heute keine Auktion. Morgen gibt es neue.</p>}
      {s.auctions.map((a, i) => {
        const next = minBid(a);
        const mine = a.leader === 'player';
        return (
          <div key={a.id} className="sell-card" data-testid={`auction-${i}`}>
            <div className="row-between">
              <b>{a.title}{a.car.rarity > 0 ? ` · ${RARITY_NAMES[a.car.rarity]}` : ''}</b>
              <span className={`price ${a.result ? '' : 'live'}`}>{a.result ? 'beendet' : `⏱ ${clock(a.endsAt - now)}`}</span>
            </div>
            <p className="meta">{CAR_MODELS[a.car.modelId].engine} · Zustandsbericht: {a.report.length ? a.report.join(' ') : 'keine Auffälligkeiten vermerkt.'}</p>
            <p className="meta">
              {a.leader === null ? `Startgebot ${eur(a.startBid)}` : `Höchstgebot ${eur(a.current)} von ${mine ? 'dir' : a.leader}`} · Mindestschritt {eur(a.increment)} · {a.bidders.length} Händler im Saal
            </p>
            <div className="log">{a.log.slice(-4).map((line, k) => <div key={k}>{line}</div>)}</div>
            {!a.result && (
              <div className="row">
                <button className="btn" onClick={() => s.viewAuction(i)}>Ansehen</button>
                <button className="btn primary" disabled={mine} onClick={() => s.bid(i, next)}>{mine ? 'Du führst' : `Bieten ${eur(next)}`}</button>
                <button className="btn" disabled={mine} onClick={() => s.bid(i, next + a.increment * 4)}>{eur(next + a.increment * 4)}</button>
              </div>
            )}
            {a.result && <p className={`meta ${a.result === 'won' ? 'good' : ''}`}>{a.result === 'won' ? 'Zuschlag an dich.' : a.result === 'lost' ? `Zuschlag an ${a.leader}.` : 'Nicht verkauft.'}</p>}
          </div>
        );
      })}
    </>
  );
}

export function UpgradesTab() {
  const s = useGame();
  const slots = availableSlots(s.upgrades);
  return (
    <>
      <p className="meta">
        Stufe 1 (vorhanden): zwei Hebebühnen, Werkzeugschrank, Werkbank, Ersatzteillager, kleiner Hof mit einem Stellplatz. Stellplätze gesamt: {slots.length} · belegt: {slots.filter((x) => s.cars[x.id]).length}
      </p>
      {UPGRADES.filter((u) => !u.expo || (!s.upgrades.includes(u.id) && (!u.requires || s.upgrades.includes(u.requires)))).map((u) => {
        const owned = s.upgrades.includes(u.id);
        const locked = !!u.requires && !s.upgrades.includes(u.requires);
        return (
          <div key={u.id} className="shop-row">
            <div>
              <b>{u.equipment ? 'Spezialgerät' : u.location ? 'Standort' : u.garage ? 'Fahrzeuglager' : u.expo ? 'Ausstellung' : `Stufe ${u.stage}`}: {u.name}</b>
              <div className="meta">{u.desc}</div>
              {locked && <div className="meta bad">Voraussetzung: {UPGRADES.find((x) => x.id === u.requires)!.name}</div>}
            </div>
            <button className="btn primary" disabled={owned || locked || s.money < u.price} onClick={() => s.buyUpgrade(u.id)}>
              {owned ? (u.equipment ? '✓ vorhanden' : u.location ? '✓ eröffnet' : u.garage ? '✓ gekauft' : '✓ gebaut') : eur(u.price)}
            </button>
          </div>
        );
      })}
    </>
  );
}

export function EventsTab() {
  const s = useGame();
  const active = s.events.filter((e) => e.expiresDay >= s.day);
  return (
    <>
      <p className="meta">Nichts hiervon musst du annehmen. Was du liegen lässt, verfällt einfach.</p>
      {active.length === 0 && <p className="meta">Heute nichts Besonderes. Mach Feierabend – vielleicht tut sich morgen etwas.</p>}
      {active.map((e) => (
        <div key={e.id} className="sell-card">
          <b>{e.title}</b>
          <p>{e.text}</p>
          <p className="meta">{e.expiresDay === s.day ? 'Nur noch heute' : `Gültig bis Tag ${e.expiresDay}`}</p>
          <div className="row">
            <button className="btn" onClick={() => s.dismissEvent(e.id)}>Kein Interesse</button>
            {e.type !== 'parts_sale' && (
              <button className="btn primary" onClick={() => s.acceptEvent(e.id)}>
                {{ urgent_job: 'Auftrag annehmen', special_listing: 'Ansehen', barn_hint: 'Hinfahren und ansehen', rare_auction: 'Zur Auktion', extra_work: 'Kunden anrufen', parts_sale: '' }[e.type]}
              </button>
            )}
          </div>
        </div>
      ))}
    </>
  );
}

/** Für die Teilesuche: klein, ohne Akzente, Umlaute und ß wie ausgeschrieben (Zündkerze = zuendkerze). */
export const normSearch = (t: string) =>
  t.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Teile und Flüssigkeiten bestellen – mit Sonderangeboten und Großhandelsrabatt. */
export function ShopList() {
  const s = useGame();
  const slots = s.cars.map((c, i) => (c && !isJunk(i) ? i : -1)).filter((i) => i >= 0);
  const slot = s.cars[s.shopSlot] ? s.shopSlot : slots[0] ?? -1;
  const car = slot >= 0 ? s.cars[slot]! : null;
  // Nur Teile, die dieses Auto überhaupt hat (ein Diesel braucht keine Zündkerzen).
  // Ausgebauter Motor zählt mit; ist er nicht auffindbar, gelten die Teile des Werksmotors.
  const withEngine = car && car.motor === null ? withRemovedEngine(car, removedEngines(s)) : car;
  const partsCar = withEngine && withEngine.motor === null ? { ...withEngine, motor: undefined } : withEngine;
  const fitted = partsCar ? new Set(defsOf(partsCar).flatMap((d) => [d.partId, ...(d.variants ?? [])]).filter(Boolean)) : new Set();
  if (car && car.motor !== null && !engineOf(car).turbo && !car.motor?.turboKit) fitted.add('turbo_kit');
  const [dept, setDept] = useState<'parts' | 'revision' | 'tuning' | 'swap'>('parts');
  // Suche über alle Abteilungen (Name und Beschreibung, ohne Rücksicht auf Groß-/Kleinschreibung und Umlaute)
  const [query, setQuery] = useState('');
  const q = normSearch(query.trim());
  const hits = q ? PART_LIST.filter((p) => normSearch(`${p.name} ${p.desc}`).includes(q)) : [];
  const unfit = hits.filter((p) => !fitted.has(p.id)).length;
  const fluidHits = q ? FLUID_LIST.filter((f) => normSearch(`${f.name} ${f.desc}`).includes(q)) : FLUID_LIST;
  const motors = [s.crane, ...s.engines, ...STAND_SLOTS.filter((i) => s.cars[i]).map((i) => fromStand(s.cars[i]!))].filter((u): u is EngineUnit => !!u);
  return (
    <>
      <div className="search-row">
        <input data-testid="part-search" type="text" enterKeyHint="search" value={query} placeholder="🔍 Teil suchen, z. B. Bremse, Zündkerze, Turbo …" onChange={(e) => setQuery(e.target.value)} />
        {query && <button className="btn small" onClick={() => setQuery('')}>✕</button>}
      </div>
      {fluidHits.length > 0 && <h4>Betriebsflüssigkeiten</h4>}
      {fluidHits.map((f) => (
        <div key={f.id} className="shop-row">
          <div>
            <b>{f.name}</b>
            <div className="meta">{f.desc} · im Lager: {s.fluidStock[f.id].toLocaleString('de-DE')} l</div>
          </div>
          <button className="btn primary" disabled={s.money < fluidPrice(s, f.id)} onClick={() => s.buyFluid(f.id)}>Bestellen {eur(fluidPrice(s, f.id))}</button>
        </div>
      ))}
      <h4>Ersatzteile</h4>
      {!car && <p className="meta">Ersatzteile werden passend zum Fahrzeug bestellt. Im Moment steht kein Auto in der Werkstatt.</p>}
      {car && (
        <>
          <p className="meta">Teile passen nur zum jeweiligen Motor und zur Fahrzeugklasse. Für welches Auto bestellst du?</p>
          <div className="chips">
            {slots.map((i) => (
              <button key={i} className={`btn small${i === slot ? ' primary' : ''}`} onClick={() => s.setShopSlot(i)}>
                {SLOTS[i].label}: {CAR_MODELS[s.cars[i]!.modelId].name}
              </button>
            ))}
          </div>
          <p className="meta"><b>{CAR_MODELS[car.modelId].name}</b> · {engineOf(car).name} · Teilefamilie {engineOf(car).family}</p>
        </>
      )}
      {car && q && (
        <p className="meta" data-testid="search-meta">
          {hits.length - unfit === 0 ? 'Kein passendes Teil für dieses Auto gefunden.' : `${hits.length - unfit} Treffer für dieses Auto.`}
          {unfit > 0 && ` ${unfit} weitere Treffer passen nicht zu ${CAR_MODELS[car.modelId].name}.`}
        </p>
      )}
      {car && !q && (
        <div className="chips">
          {([['parts', 'Ersatzteile'], ['revision', 'Motorrevision'], ['tuning', 'Tuning'], ['swap', 'Umbau']] as const).map(([d, l]) => (
            <button key={d} className={`btn small${dept === d ? ' primary' : ''}`} data-testid={`dept-${d}`} onClick={() => setDept(d)}>{l}</button>
          ))}
        </div>
      )}
      {car && !q && dept === 'swap' && (
        <>
          <h4>Austauschmotor (fabrikneu)</h4>
          <p className="meta">Wenn der Motorblock gerissen ist oder sich eine Revision nicht lohnt: neuer Motor, komplett montiert, ohne Öl. Wird ins Motorlager geliefert ({s.engines.length}/8 Paletten). Günstiger: ein Motor vom Schrottplatz.</p>
          {[...new Set([modelEngine(car).id, engineOf(car).id])].map((id) => (
            <div key={id} className="shop-row">
              <div>{ENGINES[id].name} <span className="meta">– {ENGINES[id].ps} PS · neu, 0 km{id === modelEngine(car).id ? ' · Originalmotor' : ' · derzeit eingebaut'}</span></div>
              <button className="btn primary" data-testid={`newengine-${id}`} disabled={s.money < newEnginePrice(id) || s.engines.length >= 8} onClick={() => s.buyNewEngine(id, car.modelId)}>Bestellen {eur(newEnginePrice(id))}</button>
            </div>
          ))}
          <h4>Umbauteile</h4>
          <p className="meta">Umbauteile hängen davon ab, welcher Motor in welches Auto soll. Motoren am Kran, auf dem Ständer und im Lager:</p>
          {motors.length === 0 && <p className="meta">Kein ausgebauter Motor vorhanden – erst einen Motor ausbauen oder vom Schrottplatz holen.</p>}
          {motors.map((u) => {
            const plan = swapPlan(car, u.motor.engineId);
            return (
              <div key={u.motor.uid} className="shop-row col">
                <b>{ENGINES[u.motor.engineId]?.name} → {CAR_MODELS[car.modelId].name}: {plan.label}</b>
                <div className="meta">{plan.reasons.join(' ')}</div>
                {plan.needs.map((n) => (
                  <div key={n.key} className="shop-row">
                    <div>{PARTS[n.part].name} <span className="meta">– {PARTS[n.part].desc} · im Lager: {s.inventory[n.key] ?? 0}</span></div>
                    <button className="btn primary" data-testid={`swap-${n.part}`} onClick={() => s.buySwapPart(n.part, n.key)}>Bestellen {eur(PARTS[n.part].price)}</button>
                  </div>
                ))}
              </div>
            );
          })}
        </>
      )}
      {car && (q || dept !== 'swap') && (q ? hits.filter((p) => fitted.has(p.id)) : PART_LIST.filter((p) => fitted.has(p.id) && (dept === 'parts' ? !p.kind : p.kind === dept))).map((p) => {
        const price = partPrice(s, p.id, partsCar!);
        const list = partPrice({ events: [], upgrades: s.upgrades, day: s.day }, p.id, car);
        return (
          <div key={p.id} className="shop-row">
            <div>
              <b>{p.name}</b>
              <div className="meta">{p.desc} · passend für {fitOf(partsCar!, p.id)} · im Regal: {stockOf(s.inventory, partsCar!, p.id)}</div>
            </div>
            <button className="btn primary" data-testid={`buy-${p.id}`} disabled={s.money < price} onClick={() => s.buyPart(p.id, slot)}>
              Bestellen {eur(price)}{price < list ? ` statt ${list.toLocaleString('de-DE')}` : ''}
            </button>
          </div>
        );
      })}
    </>
  );
}

/** Auto auf einen anderen freien Platz stellen. */
/** Tiefgaragen: belegte Plätze, hinfahren oder kaufen. */
export function GarageList() {
  const s = useGame();
  return (
    <>
      <p className="meta">Fahrzeuglager und private Sammlung. Autos stellst du über „Umparken“ ab und holst sie genauso jederzeit wieder heraus.</p>
      {GARAGES.map((g) => {
        const owned = s.upgrades.includes(g.id);
        const used = SLOTS.filter((x) => x.place === g.id && s.cars[x.id]).length;
        return (
          <div key={g.id} className="shop-row">
            <div>
              <b>{g.name}</b>
              <div className="meta">{owned ? `${used} von ${g.slots} Plätzen belegt` : `${g.slots} Stellplätze · ${eur(g.price)} – am Werkstatt-Computer unter „Ausbau“ kaufen`}</div>
            </div>
            <button
              className="btn primary"
              data-testid={`goto-${g.id}`}
              disabled={!owned}
              onClick={() => {
                s.setPanel(null);
                travel(g.id);
              }}
            >
              {owned ? 'Hinunterfahren' : 'nicht gekauft'}
            </button>
          </div>
        );
      })}
    </>
  );
}

export function MoveList({ from }: { from: number }) {
  const s = useGame();
  const all = availableSlots(s.upgrades).filter((x) => !s.cars[x.id]);
  // Tiefgaragen erscheinen als eine Zeile je Garage (nächster freier Platz), nicht als 50 einzelne Knöpfe.
  const free = all.filter((x) => x.kind !== 'garage');
  const garages = GARAGES.map((g) => ({ g, slots: all.filter((x) => x.place === g.id) })).filter((x) => x.slots.length > 0);
  return (
    <>
      <p className="meta">Aktuell: {SLOTS[from].label}. Nicht fahrbereite Autos werden geschoben.</p>
      {all.length === 0 && <p className="meta bad">Kein anderer Platz frei. Mehr Stellplätze gibt es am Computer unter „Ausbau“.</p>}
      {garages.map(({ g, slots }) => (
        <button key={g.id} className="btn big" data-testid={`move-${g.id}`} onClick={() => s.moveCar(from, slots[0].id)}>
          → {g.name} ({slots.length} von {g.slots} frei)
        </button>
      ))}
      {free.map((x) => (
        <button key={x.id} className="btn big" onClick={() => s.moveCar(from, x.id)}>
          → {x.label}{x.kind === 'wash' ? ' (waschen, polieren, Innenraum)' : x.kind === 'paint' ? ' (Rost, Lack)' : x.kind === 'lift' ? ' (reparieren, warten)' : x.kind === 'show' || x.kind === 'expo' ? ' (ausstellen: +4 % beim Verkauf, mehr Ansehen)' : ''}
        </button>
      ))}
    </>
  );
}
