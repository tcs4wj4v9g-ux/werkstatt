import { useEffect, useState, type ReactNode } from 'react';
import { marketLabel } from '../game/market';
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

export function TopBar({ title, back }: { title: string; back?: { label: string; onClick(): void } }) {
  const money = useGame((s) => s.money);
  const day = useGame((s) => s.day);
  const index = useGame((s) => s.marketIndex);
  const goto = useGame((s) => s.goto);
  const setPanel = useGame((s) => s.setPanel);
  return (
    <div className="topbar">
      <button className="btn ghost" onClick={() => goto('menu')}>☰ Menü</button>
      {back && <button className="btn" onClick={back.onClick}>{back.label}</button>}
      <div className="title">{title}</div>
      <div className="daychip" title={marketLabel(index)}>
        Tag {day} · Markt {index >= 1 ? '+' : '−'}{Math.abs(Math.round((index - 1) * 100))} %
      </div>
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
        <li><b>Laufen & Umsehen:</b> Links unten der Joystick zum Laufen, überall sonst wischen zum Umsehen. 🔍 zoomt für Feinarbeit heran.</li>
        <li><b>Stationen:</b> Schau etwas an – es leuchtet gelb. Antippen oder „Benutzen“ drücken.</li>
        <li><b>Computer (Schreibtisch):</b> Gebrauchtwagen besichtigen und kaufen, eigene Autos jederzeit verkaufen, Teile bestellen, Tag beenden.</li>
        <li><b>Werkzeugschrank:</b> Du trägst höchstens drei Werkzeuge. Die Ratsche braucht die passende Stecknuss.</li>
        <li><b>Diagnose:</b> 🔦 Prüflampe wählen und Teile antippen; OBD-Gerät wählen und das Auto antippen. Manche Defekte zeigen sich erst bei der Probefahrt.</li>
        <li><b>Reparatur:</b> Haube mit ✋ öffnen, Schrauben mit dem richtigen Werkzeug lösen, Teil mit ✋ herausnehmen. Grüne Platzhalter antippen = einbauen.</li>
        <li><b>Hebebühne:</b> Bedienkasten an der Säule. Räder, Bremsen und Ölwanne gehen nur angehoben, der Motorraum nur abgelassen.</li>
        <li><b>Probefahrt:</b> am Garagentor. Zwei Autos passen gleichzeitig in die Werkstatt.</li>
      </ol>
      <button className="btn primary big" onClick={() => setPanel(null)}>Los geht's</button>
    </Modal>
  );
}
