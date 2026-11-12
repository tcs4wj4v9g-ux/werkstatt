import { ACHIEVEMENTS, collection, isAchieved } from '../game/career';
import { CAR_MODELS, CLASS_NAMES } from '../game/data/cars';
import { engineOf } from '../game/data/components';
import { SLOTS } from '../game/data/workshop';
import { RARITY_NAMES } from '../game/market';
import { performance, powerCurve } from '../game/performance';
import { contestScore, meetBlocker, meetScore } from '../game/contests';
import { useGame } from '../game/store';
import { eur, Modal } from './common';

/** Erfolge: einmalige Belohnungen, die nach Neuladen nicht erneut ausgezahlt werden. */
export function AchievementsTab() {
  const s = useGame();
  const done = ACHIEVEMENTS.filter((a) => s.achieved.includes(a.id)).length;
  return (
    <>
      <p className="meta">
        {done} von {ACHIEVEMENTS.length} Erfolgen erreicht · bisher {eur(ACHIEVEMENTS.filter((a) => s.achieved.includes(a.id)).reduce((sum, a) => sum + a.reward, 0))} Belohnung
      </p>
      {ACHIEVEMENTS.map((a) => {
        const got = s.achieved.includes(a.id);
        const [n, of] = a.progress(s);
        return (
          <div key={a.id} className="shop-row" data-testid="achievement">
            <div>
              <b>{got ? '🏆 ' : ''}{a.title}</b>
              <div className="meta">{a.desc}</div>
              {!got && of > 1 && (
                <div className="bar"><div style={{ width: `${Math.round((n / of) * 100)}%` }} /></div>
              )}
              {!got && of > 1 && <div className="meta">{Math.round(n).toLocaleString('de-DE')} / {of.toLocaleString('de-DE')}</div>}
            </div>
            <div className={`price${got || isAchieved(a, s) ? '' : ' dim'}`}>{got ? '✓ ' : ''}{eur(a.reward)}</div>
          </div>
        );
      })}
    </>
  );
}

/** Private Sammlung: Autos, die man behält, mit Wert und Ansehen. */
export function CollectionTab() {
  const s = useGame();
  const entries = collection(s.cars, s.marketIndex);
  const total = entries.reduce((sum, e) => sum + e.value, 0);
  const prestige = entries.reduce((sum, e) => sum + e.prestige, 0);
  return (
    <>
      <p className="meta">
        {entries.length} Privatfahrzeug(e) · Sammlungswert {eur(total)} · Ansehen {prestige}
      </p>
      {entries.length === 0 && (
        <p className="meta">
          Noch keine Sammlung. Markiere ein eigenes Auto unter „Meine Autos“ als Privatfahrzeug – es wird dann nicht versehentlich verkauft und zählt hier mit. Seltene Autos
          und Sammlerstücke in Bestzustand bringen das meiste Ansehen.
        </p>
      )}
      {entries.map((e) => {
        const m = CAR_MODELS[e.car.modelId];
        return (
          <div key={e.car.uid} className="shop-row" data-testid="collection">
            <div>
              <b>★ {m.name} ({e.car.year}){e.car.rarity > 0 ? ` · ${RARITY_NAMES[e.car.rarity]}` : ''}</b>
              <div className="meta">{CLASS_NAMES[m.cls]} · {engineOf(e.car).name} · {e.car.km.toLocaleString('de-DE')} km · {SLOTS[e.slot].label}</div>
              <div className="meta">Ansehen {e.prestige}{e.car.dyno ? ` · Prüfstand: ${e.car.dyno.ps} PS` : ''}</div>
            </div>
            <div className="price">{eur(e.value)}</div>
            <button className="btn" onClick={() => s.toggleKeep(e.slot)}>Freigeben</button>
          </div>
        );
      })}
    </>
  );
}

/** Messprotokoll des Leistungsprüfstands mit Leistungs- und Drehmomentkurve. */
export function DynoModal() {
  const s = useGame();
  const car = s.cars[s.panelBay];
  if (!car) return null;
  const p = performance(car);
  const curve = powerCurve(car);
  const W = 520;
  const H = 240;
  const pad = 34;
  const maxRpm = curve[curve.length - 1].rpm;
  const top = Math.max(p.ratedPs, p.ratedNm) * 1.08;
  const x = (rpm: number) => pad + ((rpm - 1000) / (maxRpm - 1000)) * (W - pad * 2);
  const y = (v: number) => H - pad - (v / top) * (H - pad * 2);
  const line = (key: 'ps' | 'nm') => curve.map((c, i) => `${i ? 'L' : 'M'}${x(c.rpm).toFixed(1)},${y(c[key]).toFixed(1)}`).join(' ');
  const loss = Math.round((1 - p.ps / p.ratedPs) * 100);
  return (
    <Modal title={`Leistungsprüfstand – ${CAR_MODELS[car.modelId].name}`} onClose={() => s.setPanel(null)} wide>
      <p className="meta">{engineOf(car).name} · Messung am Tag {s.day} im aktuellen technischen Zustand</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="dyno" role="img" aria-label="Leistungs- und Drehmomentkurve">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={pad} x2={W - pad} y1={y(top * f * 0.92)} y2={y(top * f * 0.92)} stroke="#3a424c" strokeWidth="1" />
            <text x={4} y={y(top * f * 0.92) + 4} fill="#9aa3ad" fontSize="10">{Math.round(top * f * 0.92)}</text>
          </g>
        ))}
        {curve.filter((_, i) => i % 6 === 0).map((c) => (
          <text key={c.rpm} x={x(c.rpm) - 12} y={H - 12} fill="#9aa3ad" fontSize="10">{c.rpm}</text>
        ))}
        <line x1={pad} x2={W - pad} y1={y(p.ratedPs)} y2={y(p.ratedPs)} stroke="#ffd23f" strokeWidth="1" strokeDasharray="5 4" />
        <path d={line('nm')} fill="none" stroke="#5ab0ff" strokeWidth="2.5" />
        <path d={line('ps')} fill="none" stroke="#ff7043" strokeWidth="2.5" />
      </svg>
      <p className="meta"><span style={{ color: '#ff7043' }}>■</span> Leistung (PS) · <span style={{ color: '#5ab0ff' }}>■</span> Drehmoment (Nm) · <span style={{ color: '#ffd23f' }}>┄</span> Werksleistung · unten: Drehzahl (U/min)</p>
      <p className="bigline" data-testid="dyno-result">
        {p.ps} PS · {p.nm} Nm <span className="meta">(Werk: {p.ratedPs} PS · {p.ratedNm} Nm)</span>
      </p>
      {loss >= 3 ? (
        <div className="finding">⚠ Es fehlen rund {loss} % Leistung. Der Prüfstand zeigt nur, dass etwas fehlt – nicht, warum. Beobachtungen stehen in der Fahrzeugakte.</div>
      ) : (
        <p className="meta good">Volle Leistung. Das Messprotokoll liegt dem Auto bei und überzeugt Käufer.</p>
      )}
      <button className="btn primary big" onClick={() => s.setPanel('file', s.panelBay)}>Zur Fahrzeugakte</button>
    </Modal>
  );
}

/** Einblendung frisch erreichter Erfolge. */
export function UnlockedModal() {
  const s = useGame();
  if (!s.unlocked.length) return null;
  return (
    <Modal title="🏆 Erfolg erreicht" onClose={s.dismissUnlocked}>
      {s.unlocked.map((u) => (
        <p key={u.title} className="bigline">{u.title}: +{eur(u.reward)}</p>
      ))}
      <button className="btn primary big" onClick={s.dismissUnlocked}>Weiter</button>
    </Modal>
  );
}

const CONTEST_UNIT: Record<string, (n: number) => string> = {
  restoration: (n) => `${n} Punkte`,
  dealer: (n) => eur(n),
  collector: (n) => `Ansehen ${n}`,
};

/** Händler-Wettbewerbe und Fahrzeugtreffen. */
export function ContestsTab() {
  const s = useGame();
  const c = s.contest;
  const m = s.meet;
  const own = s.cars.map((car, slot) => ({ car, slot })).filter((x) => x.car && !x.car.job);
  return (
    <>
      <h4>Händler-Wettbewerb</h4>
      {!c && <p className="meta">Zurzeit ist kein Wettbewerb ausgeschrieben. Die Innung meldet sich alle paar Tage.</p>}
      {c && (
        <div data-testid="contest">
          <p><b>{c.title}</b> · bis einschließlich Tag {c.endDay} · Startgeld {eur(c.fee)} · Siegprämie {eur(c.prize)}</p>
          <p className="meta">{c.desc}</p>
          <p className="meta">Dein aktueller Stand: {CONTEST_UNIT[c.type](contestScore(c, s))}{c.joined ? '' : ' (noch nicht angemeldet)'}</p>
          <div className="meta">Konkurrenz: {c.rivals.map((r) => r.name).join(', ')} – ihre Ergebnisse siehst du erst bei der Auswertung.</div>
          <button className="btn primary big" disabled={c.joined || s.money < c.fee} onClick={s.joinContest}>{c.joined ? '✓ Angemeldet' : `Anmelden für ${eur(c.fee)}`}</button>
        </div>
      )}
      <h4>Fahrzeugtreffen</h4>
      {!m && <p className="meta">Heute findet kein Treffen statt. Treffen gibt es an jedem dritten Tag.</p>}
      {m && (
        <div data-testid="meet">
          <p><b>{m.title}</b> · nur heute · Startgeld {eur(m.fee)} · Siegprämie {eur(m.prize)}</p>
          <p className="meta">{m.desc}</p>
          {m.result ? (
            <p className="meta">Du warst mit dem {m.result.car} dabei: Platz {m.result.place} von {m.result.of} mit {m.result.score} Punkten.</p>
          ) : (
            <>
              {own.length === 0 && <p className="meta">Du brauchst ein eigenes, fahrbereites Auto.</p>}
              {own.map(({ car, slot }) => (
                <div key={car!.uid} className="shop-row">
                  <div>
                    <b>{CAR_MODELS[car!.modelId].name}</b>
                    <div className="meta">{SLOTS[slot].label} · voraussichtliche Wertung: {meetScore(car!, m.category, s.day)} Punkte{meetBlocker(car!) ? ` · ${meetBlocker(car!)}` : ''}</div>
                  </div>
                  <button className="btn primary" disabled={!!meetBlocker(car!) || s.money < m.fee} onClick={() => s.enterMeet(slot)}>Hinfahren</button>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </>
  );
}

/** Ergebnistafel nach Wettbewerb oder Treffen. */
export function ContestResultModal() {
  const s = useGame();
  const r = s.contestResult;
  if (!r) return null;
  return (
    <Modal title={`${r.title} – Ergebnis`} onClose={s.dismissContestResult}>
      <p className="bigline">{r.place === 1 ? '🏆 Sieg!' : `Platz ${r.place} von ${r.of}`}</p>
      {r.table.map((row, i) => (
        <div key={row.name} className={`meta${row.name === 'Du' ? ' good' : ''}`}>{i + 1}. {row.name}: {row.score.toLocaleString('de-DE')}</div>
      ))}
      <p>{r.payout > 0 ? `Auszahlung: ${eur(r.payout)}` : 'Diesmal kein Preisgeld.'}</p>
      <button className="btn primary big" onClick={s.dismissContestResult}>Weiter</button>
    </Modal>
  );
}
