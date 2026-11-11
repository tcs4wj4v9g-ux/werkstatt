import { useEffect, useState } from 'react';
import { CAR_MODELS } from '../game/data/cars';
import { DEFECTS } from '../game/data/defects';
import { MARKET_CHECKS } from '../game/market';
import { useGame } from '../game/store';
import { eur, TopBar } from './common';

export function MarketUI() {
  const s = useGame();
  const l = s.listings[s.selected];
  const [offer, setOffer] = useState(0);
  useEffect(() => {
    if (l) setOffer(Math.min(s.money, Math.round((l.asking * 0.8) / 50) * 50));
  }, [l?.id]);
  if (!l) return null;
  const model = CAR_MODELS[l.car.modelId];
  const full = s.cars.every(Boolean);
  const bump = (d: number) => setOffer((o) => Math.max(100, Math.min(s.money, o + d)));

  return (
    <>
      <TopBar title="Besichtigung beim Händler" back={{ label: '← Werkstatt', onClick: () => s.goto('garage') }} />
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
        {full && <p className="meta bad">Beide Hebebühnen sind belegt – verkaufe erst ein Auto am Computer.</p>}
        <button className="btn primary big" disabled={full} onClick={() => s.offer(offer)}>Angebot machen</button>
        <button className="btn big" disabled={full || l.current > s.money} onClick={() => s.offer(l.current)}>
          Sofort kaufen für {eur(l.current)}
        </button>
        {l.current > s.money && <p className="meta bad">Zu teuer für deinen Kontostand – verhandle oder wähle ein anderes Auto.</p>}
      </div>

    </>
  );
}
