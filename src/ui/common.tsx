import { useEffect, useState, type ReactNode } from 'react';
import { useGame } from '../game/store';

export const eur = (n: number) => `${Math.round(n).toLocaleString('de-DE')} €`;

export function Modal({ title, onClose, children, wide }: { title: string; onClose?: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className={`modal ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          {onClose && (
            <button className="btn ghost" onClick={onClose} aria-label="Schließen">
              ✕
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export function Toast() {
  const toast = useGame((s) => s.toast);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!toast) return;
    setShown(toast.id);
    const t = setTimeout(() => setShown(0), 4200);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast || shown !== toast.id) return null;
  return <div className={`toast ${toast.bad ? 'bad' : ''}`}>{toast.text}</div>;
}

export function TopBar({ title }: { title: string }) {
  const money = useGame((s) => s.money);
  const goto = useGame((s) => s.goto);
  const setPanel = useGame((s) => s.setPanel);
  return (
    <div className="topbar">
      <button className="btn ghost" onClick={() => goto('menu')}>☰ Menü</button>
      <div className="title">{title}</div>
      <button className="btn ghost" onClick={() => setPanel('help')}>? Hilfe</button>
      <div className="money" data-testid="money">{eur(money)}</div>
    </div>
  );
}

export function HelpModal() {
  const setPanel = useGame((s) => s.setPanel);
  return (
    <Modal title="So wird gespielt" onClose={() => setPanel(null)} wide>
      <ol className="help">
        <li><b>Markt:</b> Auto untersuchen (deckt Mängel auf = Argumente), dann Angebot machen und verhandeln.</li>
        <li><b>Werkstatt:</b> Mit einem Finger die Kamera drehen, mit zwei Fingern zoomen. Unten ein Werkzeug wählen und Teile am Auto antippen.</li>
        <li><b>Diagnose:</b> OBD-Gerät auslesen und Teile mit der 🔦 Prüflampe antippen. Bekannte Defekte leuchten rot.</li>
        <li><b>Reparatur:</b> Haube mit ✋ öffnen, Schrauben mit 🔧 Ratsche lösen, Teil mit ✋ herausnehmen. Grüne Platzhalter antippen = einbauen. Neuteile gibt es im Teileshop.</li>
        <li><b>Bremsen:</b> Auto anheben, Radschrauben mit ✚ Radkreuz lösen, Rad ab, Bremssattel ab, Beläge tauschen.</li>
        <li><b>Probefahrt:</b> Alles zusammenbauen, ablassen, eine Runde fahren. Danach mit Gewinn verkaufen.</li>
      </ol>
      <button className="btn primary big" onClick={() => setPanel(null)}>Los geht's</button>
    </Modal>
  );
}
