import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useCoop } from '../net/coop';
import { saveGate } from '../game/saveGate';
import { useGame } from '../game/store';
import { checkTutorial, currentStep, TUTORIAL, useTutorial } from '../game/tutorial';
import { TEST_MODE } from '../three/gfx';
import { eur, Modal } from './common';

/** Aufgabenbuch: nach jeder Änderung prüfen; Belohnung nur im Einzelspieler, Partner-Änderungen (Koop) zählen nicht. */
useGame.subscribe((s, p) => {
  if (saveGate.remote) return;
  const t = useTutorial.getState();
  const fresh = checkTutorial(p, s, t.done);
  if (!fresh.length) return;
  useTutorial.setState({ done: [...t.done, ...fresh.map((x) => x.id)] });
  const coop = useCoop.getState().status !== 'off';
  // Im Testmodus nur mitzählen: keine Belohnung (Kontoprüfungen) und keine Meldung (sie überdeckte erwartete Hinweise)
  if (TEST_MODE) return;
  const reward = coop ? 0 : fresh.reduce((a, x) => a + x.reward, 0);
  if (reward) useGame.setState({ money: useGame.getState().money + reward });
  const next = currentStep(useTutorial.getState().done);
  setTimeout(() => useGame.getState().say(`📘 Aufgabe erledigt: ${fresh.map((x) => x.title).join(', ')}${reward ? ` (+${eur(reward)})` : ''}${next ? ` · Als Nächstes: ${next.title}` : ' · Aufgabenbuch abgeschlossen!'}`), 300);
});

/** Knopf in der Kopfleiste: Fortschritt im Aufgabenbuch, öffnet die Liste. */
export function TutorialButton() {
  const done = useTutorial((t) => t.done);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn ghost" data-testid="tutorial" onClick={() => setOpen(true)}>
        📘 {done.length}/{TUTORIAL.length}
      </button>
      {/* auf oberster Ebene einhängen – in der Kopfleiste würde das Fenster abgeschnitten */}
      {open && createPortal(<div className="ui"><TutorialPanel onClose={() => setOpen(false)} /></div>, document.body)}
    </>
  );
}

function TutorialPanel({ onClose }: { onClose(): void }) {
  const { done, hidden } = useTutorial();
  const cur = currentStep(done);
  const coop = useCoop((c) => c.status !== 'off');
  return (
    <Modal title="Aufgabenbuch – erste Schritte" onClose={onClose}>
      <p className="meta">
        Schritt für Schritt durch die Werkstatt.{coop ? ' Im Koop gibt es keine Belohnung (gemeinsames Konto) – die Liste gilt je Gerät.' : ' Jede erledigte Aufgabe bringt eine kleine Belohnung.'}
      </p>
      {TUTORIAL.map((t) => {
        const ok = done.includes(t.id);
        const now = cur?.id === t.id;
        return (
          <div key={t.id} className={`shop-row col${now ? ' tut-now' : ''}`} data-testid={`tut-${t.id}`}>
            <b>
              {ok ? '✅' : now ? '👉' : '⬜'} {t.title}
              {!coop && <span className="meta"> · {eur(t.reward)}</span>}
            </b>
            {(now || !ok) && <div className="meta">{t.how}</div>}
          </div>
        );
      })}
      <div className="row wrap">
        <button className="btn" onClick={() => useTutorial.setState({ hidden: !hidden })}>{hidden ? 'Hinweis wieder einblenden' : 'Hinweis ausblenden'}</button>
        <button className="btn ghost" onClick={() => useTutorial.setState({ done: [], hidden: false })}>Von vorn beginnen</button>
      </div>
    </Modal>
  );
}

/** Kleiner Hinweis mit dem nächsten Schritt (unten links in der Werkstatt). Lässt sich ausblenden. */
export function TutorialHint() {
  const { done, hidden } = useTutorial();
  const cur = currentStep(done);
  if (!cur || hidden || TEST_MODE) return null;
  return (
    <div className="tut-hint" data-testid="tutorial-hint">
      <div>
        <b>📘 {cur.title}</b>
        <div className="meta">{cur.how}</div>
      </div>
      <button className="btn ghost" aria-label="Hinweis ausblenden" onClick={() => useTutorial.setState({ hidden: true })}>✕</button>
    </div>
  );
}
