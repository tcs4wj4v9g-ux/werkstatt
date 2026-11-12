import { CAR_MODELS } from '../game/data/cars';
import { availableSlots, SLOTS } from '../game/data/workshop';
import { billJob } from '../game/jobs';
import { useGame } from '../game/store';
import { eur } from './common';

/** Kundenaufträge am Werkstatt-Computer: Anfragen annehmen, laufende Aufträge abrechnen. */
export function JobsTab() {
  const s = useGame();
  const free = availableSlots(s.upgrades).filter((x) => !s.cars[x.id] && x.kind !== 'wash' && x.kind !== 'paint').length;
  const active = s.cars.map((car, bay) => ({ car, bay })).filter((x) => x.car?.job);
  return (
    <>
      <p className="meta">
        Kunden beschreiben nur, was ihnen auffällt. Bezahlt wird, wenn die Ursache behoben ist. Erledigt: {s.jobsDone} · Ertrag: {eur(s.jobEarnings)}
      </p>
      <h4>Laufende Aufträge</h4>
      {active.length === 0 && <p className="meta">Kein Kundenfahrzeug in der Werkstatt.</p>}
      {active.map(({ car, bay }) => {
        const job = car!.job!;
        const bill = billJob(car!, s.day);
        const touched = car!.partsSpent > 0 || car!.observed.length > 0 || car!.obdCodes !== null;
        return (
          <div key={job.id} className="sell-card">
            <b>
              {SLOTS[bay].label}: {CAR_MODELS[car!.modelId].name} von {job.customer}{job.dueDay !== undefined ? ` · Eilauftrag bis Tag ${job.dueDay}` : ''} · {bill.done ? 'bereit zur Abholung' : touched ? 'in Bearbeitung' : 'angenommen'}
            </b>
            <p className="meta">„{job.complaint}“</p>
            <table className="val">
              <tbody>
                {bill.lines.map((l) => (
                  <tr key={l.label}><td>{l.label}</td><td>{eur(l.amount)}</td></tr>
                ))}
                <tr className="sum"><td>Rechnung an den Kunden</td><td>{eur(bill.total)}</td></tr>
                <tr><td>Deine Teilekosten</td><td>−{eur(car!.partsSpent)}</td></tr>
              </tbody>
            </table>
            {bill.problems.map((p) => <p key={p} className="meta bad">✗ {p}</p>)}
            <div className="row">
              <button className="btn" onClick={() => s.returnJob(bay, true)}>Unrepariert zurückgeben (kein Geld)</button>
              <button className="btn primary" disabled={!bill.done} onClick={() => s.returnJob(bay)}>
                Übergeben & kassieren {eur(bill.total)}
              </button>
            </div>
          </div>
        );
      })}
      <h4>Neue Anfragen · freie Stellplätze: {free}</h4>
      {s.jobs.map((j, i) => (
        <div key={j.id} className="shop-row">
          <div>
            <b>{j.car.job!.category}: {CAR_MODELS[j.car.modelId].name} ({j.car.year})</b>
            <div className="meta">{j.car.job!.customer}: „{j.car.job!.complaint}“</div>
            <div className="meta">Vereinbarter Arbeitslohn {eur(j.car.job!.fee)} zzgl. Teile mit 15 % Aufschlag</div>
          </div>
          <button className="btn primary" disabled={free === 0} onClick={() => s.acceptJob(i)}>Annehmen</button>
        </div>
      ))}
    </>
  );
}
