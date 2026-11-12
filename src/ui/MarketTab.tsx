import { useState } from 'react';
import { CAR_MODELS, CLASS_NAMES } from '../game/data/cars';
import { engineOf } from '../game/data/components';
import { availableSlots } from '../game/data/workshop';
import { marketLabel, RARITY_NAMES } from '../game/market';
import { adCondition, brandsOf, DEFAULT_FILTER, filterListings, type MarketFilter } from '../game/marketFilter';
import { useGame } from '../game/store';
import type { CarClass } from '../game/types';
import { eur } from './common';

// Der Filter bleibt erhalten, wenn man von einer Besichtigung zurückkommt.
let remembered: MarketFilter = DEFAULT_FILTER;

/** Gebrauchtwagenmarkt am Werkstatt-Computer: Liste mit Filtern und Sortierung. */
export function MarketTab() {
  const s = useGame();
  const [f, setF] = useState<MarketFilter>(remembered);
  const set = (patch: Partial<MarketFilter>) => {
    remembered = { ...f, ...patch };
    setF(remembered);
  };
  const free = availableSlots(s.upgrades).filter((x) => !s.cars[x.id] && x.kind !== 'wash' && x.kind !== 'paint').length;
  const rows = filterListings(s.listings, f, s.money);
  return (
    <>
      <p className="meta">
        Tag {s.day} · {marketLabel(s.marketIndex)} · freie Stellplätze: {free} · {rows.length} von {s.listings.length} Inseraten
      </p>
      <div className="filters">
        <label>
          Klasse
          <select value={f.cls} onChange={(e) => set({ cls: e.target.value as CarClass | 'all' })}>
            <option value="all">alle</option>
            {(Object.keys(CLASS_NAMES) as CarClass[]).map((c) => <option key={c} value={c}>{CLASS_NAMES[c]}</option>)}
          </select>
        </label>
        <label>
          Marke
          <select value={f.brand} onChange={(e) => set({ brand: e.target.value })}>
            <option value="all">alle</option>
            {brandsOf(s.listings).map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <label>
          Motor
          <select value={f.engine} onChange={(e) => set({ engine: e.target.value as MarketFilter['engine'] })}>
            <option value="all">alle</option>
            <option value="R4">Reihenvierzylinder</option>
            <option value="R6">Reihensechszylinder</option>
            <option value="V6">V6</option>
            <option value="V8">V8</option>
            <option value="diesel">Diesel</option>
            <option value="turbo">Turbo</option>
          </select>
        </label>
        <label>
          Sortierung
          <select value={f.sort} onChange={(e) => set({ sort: e.target.value as MarketFilter['sort'] })}>
            <option value="price_asc">Preis aufsteigend</option>
            <option value="price_desc">Preis absteigend</option>
            <option value="km">Kilometerstand</option>
            <option value="year">Baujahr (neueste zuerst)</option>
            <option value="power">Leistung</option>
            <option value="condition">Zustand laut Inserat</option>
          </select>
        </label>
      </div>
      <div className="chips">
        <button className={`chip ${f.affordable ? 'on' : ''}`} onClick={() => set({ affordable: !f.affordable })}>nur bezahlbare</button>
        <button className={`chip ${f.damaged ? 'on' : ''}`} onClick={() => set({ damaged: !f.damaged })}>nur mit Mängeln inseriert</button>
        <button className={`chip ${f.rare ? 'on' : ''}`} onClick={() => set({ rare: !f.rare })}>nur seltene</button>
        <button className="chip" onClick={() => set(DEFAULT_FILTER)}>Filter zurücksetzen</button>
      </div>
      {rows.length === 0 && <p className="meta">Kein Inserat passt zu diesen Filtern.</p>}
      {rows.map(({ listing: l, index }) => {
        const m = CAR_MODELS[l.car.modelId];
        const e = engineOf(l.car);
        const left = l.expiresDay ?? l.until;
        return (
          <div key={l.id} className="shop-row" data-testid="listing">
            <div>
              <b>{l.barn ? '🏚 Scheunenfund: ' : l.expiresDay ? '⏳ ' : ''}{m.name}{l.car.rarity > 0 ? ` (${RARITY_NAMES[l.car.rarity]})` : ''}</b>
              <div className="meta">
                {CLASS_NAMES[m.cls]} · {e.name}, {e.ps} PS · Bj. {l.car.year} · {l.car.km.toLocaleString('de-DE')} km
              </div>
              <div className="meta">
                Inserat: {adCondition(l)} · {l.seller}
                {left !== undefined && ` · noch ${Math.max(0, left - s.day) + 1} Tag(e)`}
                {l.hints.length > 0 && ` · ${l.hints.length} Auffälligkeit(en) notiert`}
                {l.gone && ' · Verkäufer hat abgebrochen'}
              </div>
            </div>
            <div className={`price${l.current > s.money ? ' bad' : ''}`}>{eur(l.current)}</div>
            <button className="btn primary" disabled={l.gone} onClick={() => s.viewListing(index)}>Besichtigen</button>
          </div>
        );
      })}
      <button className="btn big" onClick={s.nextDay}>🌙 Feierabend – nächster Tag (neue Angebote, neue Marktlage)</button>
    </>
  );
}
