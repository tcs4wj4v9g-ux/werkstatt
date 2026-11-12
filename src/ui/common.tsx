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
  const sound = useGame((s) => s.sound);
  const setSound = useGame((s) => s.setSound);
  return (
    <div className="topbar">
      <button className="btn ghost" onClick={() => goto('menu')}>☰ Menü</button>
      {back && <button className="btn" onClick={back.onClick}>{back.label}</button>}
      <div className="title">{title}</div>
      <div className="daychip" title={marketLabel(index)}>
        Tag {day} · Markt {index >= 1 ? '+' : '−'}{Math.abs(Math.round((index - 1) * 100))} %
      </div>
      <button className="btn ghost" data-testid="sound" aria-label="Ton ein/aus" onClick={() => setSound(!sound)}>{sound ? '🔊' : '🔇'}</button>
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
        <li><b>Laufen & Umsehen:</b> Joystick links, überall sonst wischen. 🔍 zoomt. Stationen leuchten gelb – antippen oder „Benutzen“.</li>
        <li><b>Computer:</b> Gebrauchtwagen besichtigen und verhandeln, eigene Autos verkaufen, Kundenaufträge annehmen und abrechnen, Teile bestellen.</li>
        <li><b>Fehlersuche:</b> Das Spiel verrät keine Ursache. Am Auto: 🔑 Motor starten, warm laufen lassen, Gas geben und hinhören. Mit der 🔦 Lampe das Auto antippen (Sichtprüfung) oder einzelne Teile prüfen. OBD zeigt nur elektronische Fehlercodes. 📋 Akte sammelt Symptome und mögliche Ursachen.</li>
        <li><b>Schrauben:</b> Mit dem richtigen Werkzeug lösen (Schraube steht gelb heraus), mit der ✋ Hand herausdrehen. Beim Einbau: mit der Hand ansetzen, mit Werkzeug festziehen. Radschrauben brauchen zum Festziehen den Drehmomentschlüssel.</li>
        <li><b>Stecker & Abdeckung:</b> Erst die Motorabdeckung abnehmen. Zündspulen und Lichtmaschine haben einen Stecker, der mit der Hand abgezogen wird.</li>
        <li><b>Arbeitsansicht:</b> 🎯-Knöpfe fahren die Kamera nah an Motor, Rad oder Unterboden. „Ansicht verlassen“ bringt dich zurück.</li>
        <li><b>Hebebühne:</b> Räder, Bremsen, Ölwanne nur angehoben; Motorraum nur abgelassen. Am laufenden Motor wird nicht geschraubt.</li>
        <li><b>Flüssigkeiten:</b> Auf der Hebebühne 🛢 antippen oder Peilstab und Behälter am Motor. Ölwechsel: anheben, Auffangwanne unterstellen, Ablassschraube raus und wieder rein, Ölfilter neu, richtiges Öl einfüllen, Stand prüfen.</li>
        <li><b>Hof:</b> Durch die offenen Tore geht es hinaus. 🅿 Umparken stellt ein Auto auf einen anderen Platz. Waschplatz, Lackierkabine und weitere Stellplätze kaufst du am Computer unter „Ausbau“.</li>
        <li><b>Waschen & Lack:</b> Am Waschplatz Gerät wählen und Karosseriebereiche antippen: vorspülen, einschäumen, abspülen, trocknen – dann polieren. Innenraum über das Dach. In der Kabine erst Rost schleifen, dann lackieren.</li>
        <li><b>Auktionen, Scheunenfunde, Neuigkeiten:</b> am Computer. Auktionen laufen in Echtzeit, auch wenn das Spiel zu ist.</li>
        <li><b>Motoren:</b> Jedes Auto hat seinen eigenen Motor – Reihen- oder V-Motor, vier bis acht Zylinder, Benziner oder Diesel, mit oder ohne Turbo. Ein Sechszylinder hat sechs Zündspulen, ein Diesel Einspritzdüsen und Glühkerzen. Die Daten stehen in der 📋 Akte.</li>
        <li><b>Ersatzteile:</b> Teile passen nur zur Motorfamilie und Fahrzeugklasse. Im Teileshop zuerst das Auto wählen. Teile für teure Autos kosten mehr.</li>
        <li><b>Markt:</b> 25 Inserate, die mehrere Tage stehen bleiben. Am Computer filtern und sortieren; beim Händler mit ◀ ▶ blättern.</li>
        <li><b>Karriere:</b> Erfolge bringen einmalige Prämien. Privatfahrzeuge bilden deine Sammlung. Wettbewerbe und Fahrzeugtreffen findest du am Computer unter „Wettbewerbe“.</li>
        <li><b>Spezialgeräte & Standorte:</b> Motor- und Getriebeheber, Leistungsprüfstand (📈 am Auto), Halle 2 mit weiteren Hebebühnen und der Showroom – alles unter „Ausbau“. In die neuen Hallen führt ein Durchgang in der Seitenwand.</li>
        <li><b>Ton:</b> 🔊 oben schaltet alle Geräusche ein oder aus.</li>
      </ol>
      <button className="btn primary big" onClick={() => setPanel(null)}>Los geht's</button>
    </Modal>
  );
}
