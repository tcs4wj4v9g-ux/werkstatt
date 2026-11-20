import { useEffect, useState } from 'react';
import { CAR_MODELS } from '../game/data/cars';
import { isFleet } from '../game/data/workshop';
import { COURSE_IDS, courseOf, raceClock, type CourseId } from '../game/races';
import { driveBlocker } from '../game/repair';
import { useGame } from '../game/store';
import { useCoop } from '../net/coop';
import { coopRaceOut, hostRace, joinRace, leaveCoopRace, lobbiesOf, participantsOf, startCoopRace, useCoopRace, type RaceMember } from '../net/coopRace';

/** Im Koop: Rennen gegeneinander ausschreiben, mitfahren, starten (Reiter „Rennen“ am Computer). */
export function CoopRacePanel() {
  const coop = useCoop();
  const g = useGame();
  const mine = useCoopRace();
  const [course, setCourse] = useState<CourseId>('ost');
  if (coop.status === 'off') return null;
  const members = coop.members as unknown as RaceMember[];
  const lobbies = lobbiesOf(members, coop.me);
  const cars = g.cars.map((c, i) => ({ c, i })).filter(({ c, i }) => c && isFleet(i) && !c.junk);
  const carInfo = (i: number) => ({ modelId: g.cars[i]!.modelId, color: g.cars[i]!.color, name: CAR_MODELS[g.cars[i]!.modelId].name });
  return (
    <div className="shop-row col" data-testid="coop-race">
      <b>🏁 Koop-Rennen gegeneinander</b>
      <p className="meta">Jeder fährt sein eigenes Auto, ihr seht euch auf der Strecke und könnt euch berühren. Kein Startgeld, kein Preisgeld – es geht um die Ehre.</p>
      {lobbies.length === 0 && !mine.join && (
        <>
          <div className="row wrap">
            <select data-testid="coop-race-course" value={course} onChange={(e) => setCourse(e.target.value as CourseId)}>
              {COURSE_IDS.map((id) => (
                <option key={id} value={id}>{courseOf(id).name}{courseOf(id).laps > 1 ? ` (${courseOf(id).laps} Runden)` : ''}</option>
              ))}
            </select>
          </div>
          {cars.map(({ c, i }) => {
            const blocker = driveBlocker(c!);
            return (
              <div key={i} className="shop-row">
                <div>{CAR_MODELS[c!.modelId].name}{blocker && <div className="meta bad">{blocker}</div>}</div>
                <button className="btn primary" data-testid={`coop-race-host-${i}`} disabled={!!blocker} onClick={() => hostRace(course, i, carInfo(i))}>Ausschreiben</button>
              </div>
            );
          })}
        </>
      )}
      {lobbies.map(({ host, lobby }) => {
        const parts = participantsOf(members, coop.me, lobby.id);
        const mineHere = mine.join?.id === lobby.id;
        const isHost = host.id === coop.me;
        return (
          <div key={lobby.id} className="coop-lobby" data-testid="coop-lobby">
            <div>
              <b>{isHost ? 'Dein Rennen' : `${host.name} lädt ein`}: {courseOf(lobby.course).name}</b>
              {lobby.startAt && <span className="meta"> · läuft</span>}
            </div>
            <div className="meta" data-testid="coop-lobby-members">
              Am Start: {parts.map((p) => `${p.member.name} (${p.join.car})`).join(' · ') || 'noch niemand'}
            </div>
            {!mineHere && !lobby.startAt && (
              <div className="row wrap">
                {cars.map(({ c, i }) => (
                  <button key={i} className="btn" data-testid={`coop-race-join-${i}`} disabled={!!driveBlocker(c!)} onClick={() => joinRace(lobby.id, i, carInfo(i), lobby.course)}>
                    Mitfahren mit {CAR_MODELS[c!.modelId].name}
                  </button>
                ))}
              </div>
            )}
            <div className="row">
              {isHost && !lobby.startAt && (
                <button className="btn primary" data-testid="coop-race-start" disabled={parts.length < 2} onClick={() => startCoopRace()}>
                  {parts.length < 2 ? 'Warte auf Mitfahrer …' : `Start (${parts.length} Autos)`}
                </button>
              )}
              {mineHere && <button className="btn" onClick={() => leaveCoopRace()}>{isHost ? 'Ausschreibung zurückziehen' : 'Aussteigen'}</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Wacht im Hintergrund: Sobald das Rennen, bei dem man mitfährt, gestartet wird, geht es auf die Startaufstellung
 * (auch aus der Werkstatt heraus). Neue Ausschreibungen von Mitspielern werden kurz angesagt.
 */
export function CoopRaceWatcher() {
  useEffect(() => {
    const entered = new Set<string>();
    const announced = new Set<string>();
    const t = setInterval(() => {
      const c = useCoop.getState();
      if (c.status === 'off') return;
      const g = useGame.getState();
      const members = c.members as unknown as RaceMember[];
      const mine = useCoopRace.getState();
      for (const { host, lobby } of lobbiesOf(members, c.me)) {
        if (host.id !== c.me && !announced.has(lobby.id) && !lobby.startAt) {
          announced.add(lobby.id);
          g.say(`${host.name} schreibt ein Koop-Rennen aus (${courseOf(lobby.course).name}) – mitfahren am Computer unter „Rennen“.`);
        }
        if (mine.join?.id === lobby.id && lobby.startAt && !entered.has(lobby.id) && Date.now() < lobby.startAt + 15000 && !g.race && (g.screen === 'garage' || g.screen === 'market')) {
          entered.add(lobby.id);
          g.enterCoopRace(mine.bay, lobby.id, lobby.course, lobby.startAt);
        }
      }
    }, 300);
    return () => clearInterval(t);
  }, []);
  return null;
}

/** Endstand eines Koop-Rennens, live aus den Lagen der Mitspieler (wer noch fährt, steht mit Fortschritt da). */
export function CoopRaceTable({ lobby }: { lobby: string }) {
  const coop = useCoop();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);
  const rows = (coop.members as unknown as RaceMember[])
    .map((m) => ({ name: m.id === coop.me ? 'Du' : m.name, rr: m.id === coop.me ? coopRaceOut.car : m.presence.rr, you: m.id === coop.me }))
    .filter((r) => r.rr && r.rr.id === lobby)
    .sort((a, b) => (a.rr!.fin ?? Infinity) - (b.rr!.fin ?? Infinity) || b.rr!.p - a.rr!.p);
  return (
    <div className="race-results" data-testid="coop-race-results">
      {rows.map((r, i) => (
        <div key={r.name} className={`race-row${r.you ? ' you' : ''}`}>
          <b>{i + 1}.</b> <span>{r.name}</span> <span className="meta">{r.rr!.fin === null ? 'fährt noch …' : ''}</span> <span>{r.rr!.fin !== null ? raceClock(r.rr!.fin) : ''}</span>
        </div>
      ))}
    </div>
  );
}
