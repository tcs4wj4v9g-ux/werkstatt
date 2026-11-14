import { useEffect, useState, type ReactNode } from 'react';
import { marketLabel } from '../game/market';
import { useGame } from '../game/store';
import { GFX_LABEL, useGfx, type GfxLevel } from '../three/gfx';
import { CoopChip } from './CoopUI';

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
      <CoopChip />
      <div className="daychip" title={marketLabel(index)}>
        Tag {day} · Markt {index >= 1 ? '+' : '−'}{Math.abs(Math.round((index - 1) * 100))} %
      </div>
      <button className="btn ghost" data-testid="sound" aria-label="Ton ein/aus" onClick={() => setSound(!sound)}>{sound ? '🔊' : '🔇'}</button>
      <button className="btn ghost" onClick={() => setPanel('help')}>? Hilfe</button>
      <div className="money" data-testid="money">{eur(money)}</div>
    </div>
  );
}

/** Wahl der Grafikstufe (wird getrennt vom Spielstand auf dem Gerät gemerkt). */
export function GfxPicker() {
  const level = useGfx((s) => s.level);
  const auto = useGfx((s) => s.auto);
  const fps = useGfx((s) => s.fps);
  const set = useGfx((s) => s.set);
  return (
    <div className="gfx" data-testid="gfx">
      <span className="gfx-label">Grafik</span>
      <button className={`btn ${auto ? 'primary' : ''}`} onClick={() => set(auto ? level : 'medium', !auto)}>Automatisch</button>
      {(['low', 'medium', 'high'] as GfxLevel[]).map((l) => (
        <button key={l} className={`btn ${!auto && level === l ? 'primary' : ''}`} onClick={() => set(l, false)}>
          {GFX_LABEL[l]}
        </button>
      ))}
      <span className="gfx-fps">{auto ? `${GFX_LABEL[level]} · ` : ''}{fps ? `${fps} Bilder/s` : ''}</span>
    </div>
  );
}

export function HelpModal() {
  const setPanel = useGame((s) => s.setPanel);
  return (
    <Modal title="So wird gespielt" onClose={() => setPanel(null)} wide>
      <GfxPicker />
      <ol className="help">
        <li><b>Laufen & Umsehen:</b> Joystick links, überall sonst wischen. 🔍 zoomt. Stationen leuchten gelb – antippen oder „Benutzen“.</li>
        <li><b>Computer:</b> Gebrauchtwagen besichtigen und verhandeln, eigene Autos verkaufen, Kundenaufträge annehmen und abrechnen, Teile bestellen.</li>
        <li><b>Fehlersuche:</b> Das Spiel verrät keine Ursache. Am Auto: 🔑 Motor starten, warm laufen lassen, Gas geben und hinhören. Mit der 🔦 Lampe das Auto antippen (Sichtprüfung) oder einzelne Teile prüfen. OBD zeigt nur elektronische Fehlercodes. 📋 Akte sammelt Symptome und mögliche Ursachen.</li>
        <li><b>Schrauben:</b> Mit dem richtigen Werkzeug lösen (Schraube steht gelb heraus), mit der ✋ Hand herausdrehen. Beim Einbau: mit der Hand ansetzen, mit Werkzeug festziehen. Radschrauben brauchen zum Festziehen den Drehmomentschlüssel. Beim Anvisieren steht dran, welches Werkzeug passt; Sechskant = Ratsche mit Nuss, Kreuzschlitz = Schraubendreher, große Mutter mit Bund = Schraubenschlüssel.</li>
        <li><b>Stecker & Abdeckung:</b> Erst die Motorabdeckung abnehmen. Zündspulen und Lichtmaschine haben einen Stecker, der mit der Hand abgezogen wird.</li>
        <li><b>Arbeitsansicht:</b> 🎯-Knöpfe fahren die Kamera nah an Motor, Rad oder Unterboden. „Ansicht verlassen“ bringt dich zurück.</li>
        <li><b>Hebebühne:</b> Räder und Bremsen vorn und hinten, Ölwanne nur angehoben; Motorraum nur abgelassen. Am laufenden Motor wird nicht geschraubt.</li>
        <li><b>Öl:</b> Ohne Öl leuchtet beim Start die Öldruckleuchte – sofort abstellen, sonst fressen nach wenigen Sekunden die Lager. Falsches Öl lässt die Hydrostößel auf Dauer klappern.</li>
        <li><b>Flüssigkeiten:</b> Auf der Hebebühne 🛢 antippen oder Peilstab und Behälter am Motor. Ölwechsel: anheben, Auffangwanne unterstellen, Ablassschraube raus und wieder rein, Ölfilter neu, richtiges Öl einfüllen, Stand prüfen.</li>
        <li><b>Hof:</b> Durch die offenen Tore geht es hinaus. 🅿 Umparken stellt ein Auto auf einen anderen Platz. Waschplatz, Lackierkabine und weitere Stellplätze kaufst du am Computer unter „Ausbau“.</li>
        <li><b>Waschen & Lack:</b> Am Waschplatz Gerät wählen und Karosseriebereiche antippen: vorspülen, einschäumen, abspülen, trocknen – dann polieren. Innenraum über das Dach. In der Kabine erst Rost schleifen, dann lackieren.</li>
        <li><b>Auktionen, Scheunenfunde, Neuigkeiten:</b> am Computer. Auktionen laufen in Echtzeit, auch wenn das Spiel zu ist.</li>
        <li><b>Motoren:</b> Jedes Auto hat seinen eigenen Motor – Reihen- oder V-Motor, vier bis acht Zylinder, Benziner oder Diesel, mit oder ohne Turbo. Ein Sechszylinder hat sechs Zündspulen, ein Diesel Einspritzdüsen und Glühkerzen. Die Daten stehen in der 📋 Akte.</li>
        <li><b>Ersatzteile:</b> Teile passen nur zur Motorfamilie und Fahrzeugklasse. Im Teileshop zuerst das Auto wählen. Teile für teure Autos kosten mehr.</li>
        <li><b>Markt:</b> 25 Inserate, die mehrere Tage stehen bleiben. Am Computer filtern und sortieren; beim Händler mit ◀ ▶ blättern.</li>
        <li><b>Karriere:</b> Erfolge bringen einmalige Prämien. Privatfahrzeuge bilden deine Sammlung. Wettbewerbe und Fahrzeugtreffen findest du am Computer unter „Wettbewerbe“.</li>
        <li><b>Spezialgeräte & Standorte:</b> Motor- und Getriebeheber, Leistungsprüfstand (📈 am Auto), Halle 2 mit weiteren Hebebühnen und der Showroom – alles unter „Ausbau“. In die neuen Hallen führt ein Durchgang in der Seitenwand.</li>
        <li><b>Koop:</b> Im Menü eine gemeinsame Werkstatt erstellen oder mit Einladungscode beitreten. Autos, Geld, Lager und Ausbau gehören beiden; jeder hat seine eigene Werkzeugleiste und holt Werkzeug aus den Kisten an den Hebebühnen, dem Werkzeugschrank oder dem Spezialwerkzeugschrank. Oben zeigt 🟢 Koop, wer online ist.</li>
        <li><b>Schrottplatz:</b> Mit dem Lieferwagen im Hof hin- und zurückfahren. Teile baust du selbst mit deinem Werkzeug aus – jedes ausgebaute Teil wird sofort bezahlt und liegt danach als Gebrauchtteil mit eigener Nummer im Lager. Gebrauchtteile können versteckte Mängel haben; an der Werkbank prüfen. Ganze Motoren lässt der Schrotthändler ausbauen (Aufpreis für den Kran), sie kommen ins Motorlager.</li>
        <li><b>Motor ausbauen:</b> Motorkran unter „Ausbau“ kaufen. Am Auto 🏗 zeigt die Checkliste: Batterie, Kühlmittel, Ansaugung, Kabelbaum, Hosenrohr (von unten), Motorlager. Dann hebt der Kran den Motor heraus – weiter auf den Motorständer oder ins Motorlager (Paletten im Hof, acht Plätze).</li>
        <li><b>Motorrevision:</b> Am Motorständer drehst du den Motor (Unterseite nach oben) und zerlegst ihn wie ein Auto: Krümmer, Ventildeckel, Steuerkette, Nockenwellen, Zylinderkopf, Kopfdichtung – dann liegen die Kolbenböden oben frei. Kolben ziehen: Motor drehen, Ölwanne und Pleuellager ab, zurückdrehen, Kolben nach oben heraus. Unten außerdem Ölpumpe, Hauptlager, Kurbelwelle. Der Motorprüfstand misst Kompression je Zylinder und Öldruck.</li>
        <li><b>Motorumbau:</b> Ein anderer Motor muss in den Motorraum passen. Der Teileshop zeigt unter „Umbau“, welche Umbauteile (Halter, Kabelbaum, Kühler, Kupplung …) für das gewählte Auto und den Motor am Kran nötig sind.</li>
        <li><b>Tuning:</b> Am Auto 🛠 Tuning. Leistungsteile (Turbo, Ladeluftkühler, Einspritzdüsen, Kraftstoffpumpe, Schmiedekolben, Nockenwelle, Sportauspuff) baust du wie Ersatzteile ein; das Steuergerät wird angepasst. Das Fenster zeigt, was die Leistung begrenzt und welche Risiken bestehen (Klopfen, Hitze, Mechanik, Kupplung). Optikteile kaufst und montierst du im selben Fenster.</li>
        <li><b>Türen:</b> Mit der ✋ Hand am Türgriff öffnest und schließt du die Vordertüren.</li>
        <li><b>Grafik:</b> Oben in dieser Hilfe und im Menü wählst du Niedrig, Mittel oder Hoch. „Automatisch“ senkt Auflösung und Stufe von selbst, wenn das Bild ruckelt.</li>
        <li><b>Ton:</b> 🔊 oben schaltet alle Geräusche ein oder aus.</li>
      </ol>
      <button className="btn primary big" onClick={() => setPanel(null)}>Los geht's</button>
    </Modal>
  );
}
