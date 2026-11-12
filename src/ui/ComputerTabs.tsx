import { useEffect, useState } from 'react';
import { heldMoney, minBid } from '../game/auctions';
import { CAR_MODELS } from '../game/data/cars';
import { FLUID_LIST } from '../game/data/fluids';
import { defsOf, engineOf } from '../game/data/components';
import { PART_LIST } from '../game/data/parts';
import { fitOf, stockOf } from '../game/fitment';
import { availableSlots, SLOTS, UPGRADES } from '../game/data/workshop';
import { RARITY_NAMES } from '../game/market';
import { fluidPrice, partPrice, useGame } from '../game/store';
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
      {UPGRADES.map((u) => {
        const owned = s.upgrades.includes(u.id);
        const locked = !!u.requires && !s.upgrades.includes(u.requires);
        return (
          <div key={u.id} className="shop-row">
            <div>
              <b>Stufe {u.stage}: {u.name}</b>
              <div className="meta">{u.desc}</div>
              {locked && <div className="meta bad">Voraussetzung: {UPGRADES.find((x) => x.id === u.requires)!.name}</div>}
            </div>
            <button className="btn primary" disabled={owned || locked || s.money < u.price} onClick={() => s.buyUpgrade(u.id)}>
              {owned ? '✓ gebaut' : eur(u.price)}
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

/** Teile und Flüssigkeiten bestellen – mit Sonderangeboten und Großhandelsrabatt. */
export function ShopList() {
  const s = useGame();
  const slots = s.cars.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
  const slot = s.cars[s.shopSlot] ? s.shopSlot : slots[0] ?? -1;
  const car = slot >= 0 ? s.cars[slot]! : null;
  // Nur Teile, die dieses Auto überhaupt hat (ein Diesel braucht keine Zündkerzen).
  const fitted = car ? new Set(defsOf(car).map((d) => d.partId).filter(Boolean)) : new Set();
  return (
    <>
      <h4>Betriebsflüssigkeiten</h4>
      {FLUID_LIST.map((f) => (
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
      {car && PART_LIST.filter((p) => fitted.has(p.id)).map((p) => {
        const price = partPrice(s, p.id, car);
        const list = partPrice({ events: [], upgrades: [], day: s.day }, p.id, car);
        return (
          <div key={p.id} className="shop-row">
            <div>
              <b>{p.name}</b>
              <div className="meta">{p.desc} · passend für {fitOf(car, p.id)} · im Regal: {stockOf(s.inventory, car, p.id)}</div>
            </div>
            <button className="btn primary" disabled={s.money < price} onClick={() => s.buyPart(p.id, slot)}>
              Bestellen {eur(price)}{price < list ? ` statt ${list.toLocaleString('de-DE')}` : ''}
            </button>
          </div>
        );
      })}
    </>
  );
}

/** Auto auf einen anderen freien Platz stellen. */
export function MoveList({ from }: { from: number }) {
  const s = useGame();
  const free = availableSlots(s.upgrades).filter((x) => !s.cars[x.id]);
  return (
    <>
      <p className="meta">Aktuell: {SLOTS[from].label}. Nicht fahrbereite Autos werden geschoben.</p>
      {free.length === 0 && <p className="meta bad">Kein anderer Platz frei. Mehr Stellplätze gibt es am Computer unter „Ausbau“.</p>}
      {free.map((x) => (
        <button key={x.id} className="btn big" onClick={() => s.moveCar(from, x.id)}>
          → {x.label}{x.kind === 'wash' ? ' (waschen, polieren, Innenraum)' : x.kind === 'paint' ? ' (Rost, Lack)' : x.kind === 'lift' ? ' (reparieren, warten)' : ''}
        </button>
      ))}
    </>
  );
}
