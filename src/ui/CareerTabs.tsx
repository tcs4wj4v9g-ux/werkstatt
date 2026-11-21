import { CarStatsCard } from './CarStatsCard';
import { CoopRacePanel, Leaderboard, CoopRaceTable } from './CoopRaceUI';
import { leaveCoopRace } from '../net/coopRace';
import { courseOf, driftTargets, MEDAL_LABEL, PLAYER_GRID, raceBlocker, raceClock, raceForDay, raceTargets, upcomingRaces, type Race } from '../game/races';
import { weatherLabel } from '../game/grip';
import { duration, todayOf } from '../game/playtime';
import { useEffect } from 'react';
import { ACHIEVEMENTS, collection, isAchieved } from '../game/career';
import { CAR_MODELS, CLASS_NAMES } from '../game/data/cars';
import { engineOf } from '../game/data/components';
import { SLOTS, isFleet } from '../game/data/workshop';
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
        ⏱ Arbeitszeit {duration(s.playTime.total)} (heute {duration(todayOf(s.playTime))}) · {done} von {ACHIEVEMENTS.length} Erfolgen erreicht · bisher {eur(ACHIEVEMENTS.filter((a) => s.achieved.includes(a.id)).reduce((sum, a) => sum + a.reward, 0))} Belohnung
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
      <h4>Fahrleistungen</h4>
      <CarStatsCard car={car} />
    </Modal>
  );
}

/** Einblendung frisch erreichter Erfolge: ein Banner, das die Arbeit nicht unterbricht und von selbst verschwindet. */
export function UnlockedModal() {
  const unlocked = useGame((s) => s.unlocked);
  const dismiss = useGame((s) => s.dismissUnlocked);
  useEffect(() => {
    if (!unlocked.length) return;
    const t = setTimeout(dismiss, 5000);
    return () => clearTimeout(t);
  }, [unlocked.length, dismiss]);
  if (!unlocked.length) return null;
  return (
    <div className="unlock-banner" data-testid="unlocked">
      {unlocked.slice(-3).map((u) => (
        <div key={u.title}>🏆 Erfolg: <b>{u.title}</b> · +{eur(u.reward)}</div>
      ))}
    </div>
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
  const own = s.cars.map((car, slot) => ({ car, slot })).filter((x) => x.car && !x.car.job && isFleet(x.slot));
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

/** Zeitrennen: heutiges Rennen mit Sollzeiten und Startknöpfen je Auto, dazu die nächsten Termine. */
export function RacesTab() {
  const s = useGame();
  const race = raceForDay(s.day);
  const upcoming = upcomingRaces(s.day + 1, 4);
  const best = race ? (s.career.raceBest ?? {})[race.id] : undefined;
  const paid = race ? (s.career.racePaid ?? {})[race.id] ?? 0 : 0;
  return (
    <>
      <p className="meta">
        Zeitrennen auf dem Straßennetz rund um Grünbach: Durch alle Kontrollpunkte bis ins Ziel, die Zeit entscheidet. Preisgeld gibt es für Gold, Silber
        und Bronze – fährst du später eine bessere Medaille, wird die Differenz nachgezahlt. Jeder Versuch kostet Startgeld. Tuning bis an die
        Klassengrenze, Reifen und Fahrwerk machen den Unterschied. Bei manchen Rennen fährst du gegen Gegner.
      </p>
      <p className="meta">
        Jeder dritte Tag: <b>Rallye</b> auf Schotter, Schnee oder Matsch (Schotter-, Winter- oder Spikereifen und Rallyefahrwerk helfen) oder ein{' '}
        <b>Driftwettbewerb</b> (Punkte für Driftwinkel × Tempo, lange Ketten erhöhen die Kombo – Driftreifen, Sperre oder verschweißtes Differential
        und Lenkwinkel-Kit helfen; ESP ist dabei aus). Das Wetter des Tages ({weatherLabel(s.day)}) macht die Straße nass oder glatt.
      </p>
      <CoopRacePanel />
      <Leaderboard />
      {!race && <p className="bigline">Heute ist kein Rennen.</p>}
      {race && (
        <div className="shop-row col" data-testid="race-today">
          <b>Heute: {race.title}</b>
          <div className="meta">{courseOf(race.course).desc} · {((courseOf(race.course).length * 2) / 1000).toFixed(1)} km</div>
          {race.kind === 'grid' ? <RaceField race={race} /> : race.kind === 'drift' ? <DriftTargets race={race} /> : <RaceTargets race={race} />}
          <div className="meta">
            Startgeld {eur(race.fee)} · Wetter: {weatherLabel(s.day)}
            {best !== undefined && <> · {race.kind === 'drift' ? `deine Bestwertung ${best.toLocaleString('de-DE')} Punkte` : `deine Bestzeit ${raceClock(best)}`}</>}
            {paid > 0 && <> · schon ausgezahlt {eur(paid)}</>}
          </div>
          {s.cars.map((car, i) => {
            if (!car || !isFleet(i) || car.junk) return null;
            const blocker = raceBlocker(car, race);
            return (
              <div key={i} className="shop-row">
                <div>
                  <b>{CAR_MODELS[car.modelId].name}</b> <span className="meta">– {performance(car).ps} PS</span>
                  {blocker && <div className="meta bad">{blocker}</div>}
                </div>
                <button className="btn primary" data-testid={`race-start-${i}`} disabled={!!blocker || s.money < race.fee} onClick={() => s.startRace(i)}>
                  🏁 Starten ({eur(race.fee)})
                </button>
              </div>
            );
          })}
        </div>
      )}
      <h4>Nächste Rennen</h4>
      {upcoming.map((r) => (
        <div key={r.id} className="shop-row">
          <div>
            <b>Tag {r.day}: {r.title}</b>
            <div className="meta">
              {weatherLabel(r.day)} · {r.kind === 'grid' ? `Gegen 5 Gegner · Platz 1 ${eur(r.prize.gold)} · Platz 2 ${eur(r.prize.silver)} · Platz 3 ${eur(r.prize.bronze)}` : `Gold ${eur(r.prize.gold)} · Silber ${eur(r.prize.silver)} · Bronze ${eur(r.prize.bronze)}`} · Startgeld {eur(r.fee)}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

/** Rennen gegen Gegner: Preisgeld nach Platz und das Starterfeld. */
function RaceField({ race }: { race: Race }) {
  return (
    <>
      <div className="race-table">
        <span>🏆 Platz 1 → {eur(race.prize.gold)}</span>
        <span>🥈 Platz 2 → {eur(race.prize.silver)}</span>
        <span>🥉 Platz 3 → {eur(race.prize.bronze)}</span>
      </div>
      <div className="meta" data-testid="race-field">
        Gegner: {race.opponents.map((o) => `${o.name} (${CAR_MODELS[o.modelId].name})`).join(' · ')}. Du startest von Platz {PLAYER_GRID + 1}.
      </div>
    </>
  );
}

/** Driftwettbewerb: Punkteziele für die Medaillen. */
function DriftTargets({ race }: { race: Race }) {
  const t = driftTargets(race);
  return (
    <div className="race-table" data-testid="drift-targets">
      <span>🥇 Gold ab {t.gold.toLocaleString('de-DE')} Punkten → {eur(race.prize.gold)}</span>
      <span>🥈 Silber ab {t.silver.toLocaleString('de-DE')} Punkten → {eur(race.prize.silver)}</span>
      <span>🥉 Bronze ab {t.bronze.toLocaleString('de-DE')} Punkten → {eur(race.prize.bronze)}</span>
    </div>
  );
}

function RaceTargets({ race }: { race: Race }) {
  const t = raceTargets(race);
  return (
    <div className="race-table">
      <span>🥇 Gold unter {raceClock(t.gold)} → {eur(race.prize.gold)}</span>
      <span>🥈 Silber unter {raceClock(t.silver)} → {eur(race.prize.silver)}</span>
      <span>🥉 Bronze unter {raceClock(t.bronze)} → {eur(race.prize.bronze)}</span>
    </div>
  );
}

/** Ergebnis nach dem Zieleinlauf. */
export function RaceResultModal() {
  const s = useGame();
  const r = s.raceResult;
  if (!r) return null;
  const race = raceForDay(s.day);
  if (r.coop) {
    const close = () => {
      leaveCoopRace();
      s.setPanel(null);
    };
    return (
      <Modal title={r.points !== undefined ? 'Ergebnis Drift-Duell' : 'Ergebnis Koop-Rennen'} onClose={close}>
        <p className="meta">{r.title} · {r.car}</p>
        <p className="bigline" data-testid="race-time">{r.points !== undefined ? `Deine Driftpunkte ${r.points.toLocaleString('de-DE')}` : `Deine Zeit ${raceClock(r.time)}`}</p>
        <CoopRaceTable lobby={r.coop} drift={r.points !== undefined} />
        <p className="meta">Die Tabelle füllt sich, sobald die anderen im Ziel sind.</p>
        <button className="btn primary" onClick={close}>Zur Werkstatt</button>
      </Modal>
    );
  }
  return (
    <Modal title={r.points !== undefined ? 'Ergebnis Driftwettbewerb' : r.title.startsWith('Rallye') ? 'Ergebnis Rallye' : 'Ergebnis Zeitrennen'} onClose={() => s.setPanel(null)}>
      <p className="meta">{r.title} · {r.car}</p>
      {r.points !== undefined ? (
        <p className="bigline" data-testid="race-time">{r.points.toLocaleString('de-DE')} Driftpunkte{r.improved ? ' – neue Bestwertung!' : ''} · Zeit {raceClock(r.time)}</p>
      ) : (
        <p className="bigline" data-testid="race-time">Zeit {raceClock(r.time)}{r.improved ? ' – neue Bestzeit!' : ''}</p>
      )}
      {r.points !== undefined ? (
        <p className={`bigline ${r.medal ? 'good' : 'bad'}`} data-testid="race-medal">
          {r.medal ? `${MEDAL_LABEL[r.medal]} – Preisgeld ${eur(r.prize)}` : `Keine Medaille (Bronze ab ${r.targets.bronze.toLocaleString('de-DE')} Punkten)`}
        </p>
      ) : r.place !== null ? (
        <p className={`bigline ${r.place <= 3 ? 'good' : 'bad'}`} data-testid="race-medal">
          {r.place === 1 ? '🏆 Sieg!' : `Platz ${r.place} von ${r.table?.length ?? 6}`}
          {r.place <= 3 ? ` – Preisgeld ${eur(r.prize)}` : ' – kein Preisgeld (nur Platz 1–3)'}
        </p>
      ) : (
        <p className={`bigline ${r.medal ? 'good' : 'bad'}`} data-testid="race-medal">
          {r.medal ? `${MEDAL_LABEL[r.medal]} – Preisgeld ${eur(r.prize)}` : `Keine Medaille (Bronze unter ${raceClock(r.targets.bronze)})`}
        </p>
      )}
      {r.table && (
        <div className="race-results" data-testid="race-results">
          {r.table.map((row, i) => (
            <div key={row.name} className={`race-row${row.you ? ' you' : ''}`}>
              <b>{i + 1}.</b> <span>{row.name}</span> <span className="meta">{row.car}</span> <span>{raceClock(row.time)}</span>
            </div>
          ))}
        </div>
      )}
      <p className="meta" data-testid="race-payout">
        {r.payout > 0 ? `Ausgezahlt: ${eur(r.payout)}` : r.medal ? 'Diese Medaille wurde für das heutige Rennen schon ausgezahlt.' : 'Kein Preisgeld.'} · {r.points !== undefined ? `Bestwertung heute ${r.best.toLocaleString('de-DE')} Punkte` : `Bestzeit heute ${raceClock(r.best)}`}
      </p>
      <div className="row">
        {race && s.race === null && s.cars[s.driveBay] && (
          <button className="btn primary" data-testid="race-again" disabled={s.money < race.fee} onClick={() => s.startRace(s.driveBay)}>
            Nochmal ({eur(race.fee)})
          </button>
        )}
        <button className="btn" onClick={() => s.setPanel(null)}>Zur Werkstatt</button>
      </div>
    </Modal>
  );
}
