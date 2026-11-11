import { useEffect, useState } from 'react';
import { CAR_MODELS } from '../game/data/cars';
import { SELLERS } from '../game/data/sellers';
import { SYMPTOMS } from '../game/data/symptoms';
import { MARKET_CHECKS } from '../game/market';
import { useGame } from '../game/store';
import { eur, TopBar } from './common';

export function MarketUI() {
  const s = useGame();
  const l = s.listings[s.selected];
  const [offer, setOffer] = useState(0);
  const [args, setArgs] = useState<string[]>([]);
  useEffect(() => {
    if (l) setOffer(Math.min(s.money, Math.round((l.asking * 0.9) / 50) * 50));
    setArgs([]);
  }, [l?.id]);
  if (!l) return null;
  const model = CAR_MODELS[l.car.modelId];
  const profile = SELLERS[l.profile] ?? SELLERS.private;
  const toggle = (id: string) => setArgs((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
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
          Baujahr {l.car.year} · {l.car.km.toLocaleString('de-DE')} km
        </p>
        <p className="meta">
          {l.seller} · {profile.label}: {profile.vibe}
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
        <h4>Verhandeln</h4>
        {l.hints.length === 0 && <p className="meta">Ohne eigene Beobachtungen hast du keine Argumente – untersuche das Auto zuerst.</p>}
        {l.hints.length > 0 && <p className="meta">Als Begründung nennen (jedes Argument zieht nur einmal):</p>}
        <div className="chips">
          {l.hints.filter((h) => SYMPTOMS[h]).map((h) => {
            const used = l.usedArgs.includes(h);
            return (
              <button key={h} className={`chip ${args.includes(h) ? 'on' : ''} ${used ? 'used' : ''}`} disabled={used} onClick={() => toggle(h)}>
                {used ? '✓ ' : ''}{SYMPTOMS[h].argument}
              </button>
            );
          })}
        </div>
        <div className="offer">
          <button className="btn" onClick={() => bump(-500)}>−500</button>
          <button className="btn" onClick={() => bump(-50)}>−50</button>
          <div className="amount" data-testid="offer">{eur(offer)}</div>
          <button className="btn" onClick={() => bump(50)}>+50</button>
          <button className="btn" onClick={() => bump(500)}>+500</button>
        </div>
        {l.gone && <p className="meta bad">Der Verkäufer hat die Verhandlung beendet. Dieses Auto bekommst du nicht mehr.</p>}
        {full && <p className="meta bad">Beide Hebebühnen sind belegt – verkaufe erst ein Auto oder schließe einen Auftrag ab.</p>}
        <button className="btn primary big" disabled={full || l.gone} onClick={() => { s.offer(offer, args); setArgs([]); }}>Angebot machen</button>
        <button className="btn big" disabled={full || l.gone || l.current > s.money} onClick={() => s.offer(l.current)}>
          Sofort kaufen für {eur(l.current)}
        </button>
        {l.current > s.money && <p className="meta bad">Zu teuer für deinen Kontostand – verhandle oder wähle ein anderes Auto.</p>}
      </div>

    </>
  );
}
