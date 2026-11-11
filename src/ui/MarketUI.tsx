import { useEffect, useState } from 'react';
import { CAR_MODELS } from '../game/data/cars';
import { DEFECTS } from '../game/data/defects';
import { MARKET_CHECKS } from '../game/market';
import { useGame } from '../game/store';
import { eur, Modal, TopBar } from './common';

export function MarketUI() {
  const s = useGame();
  const l = s.listings[s.selected];
  const [offer, setOffer] = useState(0);
  useEffect(() => {
    if (l) setOffer(Math.min(s.money, Math.round((l.asking * 0.8) / 50) * 50));
  }, [l?.id]);
  if (!l) return null;
  const model = CAR_MODELS[l.car.modelId];
  const bump = (d: number) => setOffer((o) => Math.max(100, Math.min(s.money, o + d)));

  return (
    <>
      <TopBar title="Gebrauchtwagenmarkt" />
      <div className="tabs">
        {s.listings.map((x, i) => (
          <button key={x.id} className={`btn tab ${i === s.selected ? 'active' : ''}`} onClick={() => s.selectListing(i)}>
            {CAR_MODELS[x.car.modelId].name.replace('Bavaria ', '')}
            <small>{eur(x.asking)}</small>
          </button>
        ))}
      </div>

      <div className="panel right market">
        <h3>{model.name}</h3>
        <p className="meta">
          Baujahr {l.car.year} · {l.car.km.toLocaleString('de-DE')} km · Verkäufer: {l.seller}
        </p>
        <div className="speech">{l.sellerLine}</div>

        <h4>Untersuchen</h4>
        <div className="col">
          {MARKET_CHECKS.map((c) => (
            <button key={c.id} className={`btn ${l.checks.includes(c.id) ? 'done' : ''}`} onClick={() => s.checkListing(c.id)}>
              {l.checks.includes(c.id) ? '✓ ' : ''}
              {c.label}
            </button>
          ))}
        </div>
        {s.marketNote && <div className="note">{s.marketNote}</div>}
        {l.hints.length > 0 && (
          <p className="meta">Argumente: {l.hints.map((h) => DEFECTS[h].name).join(', ')}</p>
        )}

        <h4>Verhandeln</h4>
        <div className="offer">
          <button className="btn" onClick={() => bump(-500)}>−500</button>
          <button className="btn" onClick={() => bump(-50)}>−50</button>
          <div className="amount" data-testid="offer">{eur(offer)}</div>
          <button className="btn" onClick={() => bump(50)}>+50</button>
          <button className="btn" onClick={() => bump(500)}>+500</button>
        </div>
        <button className="btn primary big" onClick={() => s.offer(offer)}>Angebot machen</button>
        <button className="btn big" disabled={l.current > s.money} onClick={() => s.offer(l.current)}>
          Sofort kaufen für {eur(l.current)}
        </button>
        {l.current > s.money && <p className="meta bad">Zu teuer für deinen Kontostand – verhandle oder wähle ein anderes Auto.</p>}
      </div>

      {s.lastSale && (
        <Modal title="Verkauft!" onClose={s.dismissSale}>
          <p className="bigline">Verkaufspreis: {eur(s.lastSale.price)}</p>
          <p className={`bigline ${s.lastSale.profit >= 0 ? 'good' : 'bad'}`}>
            {s.lastSale.profit >= 0 ? 'Gewinn' : 'Verlust'}: {eur(Math.abs(s.lastSale.profit))}
          </p>
          <p className="meta">Neue Angebote stehen auf dem Markt. Such dir das nächste Projekt aus!</p>
          <button className="btn primary big" onClick={s.dismissSale}>Weiter</button>
        </Modal>
      )}
    </>
  );
}
