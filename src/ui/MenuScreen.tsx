import { useState } from 'react';
import { useGame } from '../game/store';
import { eur, GfxPicker } from './common';
import { CoopMenu } from './CoopUI';

export function MenuScreen() {
  const s = useGame();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="menu">
      <div className="menu-card">
        <div className="logo">GARAGE <span>KINGS</span></div>
        <p className="sub">Kaufen · Schrauben · Probefahren · Verkaufen</p>
        {s.started && (
          <button className="btn primary big" onClick={() => s.goto('garage')}>
            Einzelspieler fortsetzen
          </button>
        )}
        {!confirm ? (
          <button className={`btn big ${s.started ? '' : 'primary'}`} onClick={() => (s.started ? setConfirm(true) : s.newGame())}>
            Neues Spiel
          </button>
        ) : (
          <div className="row">
            <button className="btn danger big" onClick={() => s.newGame()}>Spielstand löschen & neu</button>
            <button className="btn big" onClick={() => setConfirm(false)}>Abbrechen</button>
          </div>
        )}
        {s.started && (
          <p className="stats">
            Kontostand {eur(s.money)} · Verkaufte Autos {s.carsSold} · Gesamtgewinn {eur(s.totalProfit)}
          </p>
        )}
        <CoopMenu />
        <GfxPicker />
        <p className="fine">Spielstand wird automatisch auf diesem Gerät gespeichert.</p>
      </div>
    </div>
  );
}
