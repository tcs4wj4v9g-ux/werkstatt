import { useEffect, useState } from 'react';
import { CABINET_TOOLS, MAX_CARRIED, TOOL_MAP } from '../game/data/tools';
import { useGame } from '../game/store';
import { COOP_CONFIGURED } from '../net/config';
import { BOXES, buyTool, createWorkshop, joinWorkshop, lastWorkshop, leave, listWorkshops, loadLedger, openWorkshop, returnTool, setInvite, takeTool, TOOL_PRICE, useCoop } from '../net/coop';
import { eur, Modal } from './common';

const NAME_KEY = 'garage-kings-koop-name';
const savedName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
};

/** Koop-Bereich des Hauptmenüs: erstellen, beitreten, bestehende Werkstatt öffnen. */
export function CoopMenu() {
  const c = useCoop();
  const hasSave = useGame((s) => s.started);
  const [mode, setMode] = useState<null | 'create' | 'join' | 'open'>(null);
  const [name, setName] = useState(savedName);
  const [title, setTitle] = useState('Unsere Werkstatt');
  const [code, setCode] = useState('');
  const [copy, setCopy] = useState(false);
  const last = lastWorkshop();
  const keep = () => {
    try {
      localStorage.setItem(NAME_KEY, name.trim());
    } catch {
      /* Name gilt dann nur für diese Sitzung */
    }
  };
  useEffect(() => {
    if (mode === 'open') void listWorkshops();
  }, [mode]);

  if (!COOP_CONFIGURED) {
    return (
      <div className="coop-box">
        <b>Koop-Werkstatt</b>
        <p className="fine">Der Online-Server ist noch nicht eingerichtet. Sobald das Supabase-Projekt eingetragen ist, kannst du hier eine gemeinsame Werkstatt erstellen oder beitreten.</p>
      </div>
    );
  }
  const nameField = (
    <label className="field">
      Dein Name
      <input value={name} maxLength={24} placeholder="z. B. Elias" onChange={(e) => setName(e.target.value)} data-testid="coop-name" />
    </label>
  );
  return (
    <div className="coop-box" data-testid="coop-menu">
      <b>Koop – gemeinsame Online-Werkstatt</b>
      {mode === null && (
        <div className="col">
          <button className="btn big" onClick={() => setMode('create')}>Koop-Werkstatt erstellen</button>
          <button className="btn big" onClick={() => setMode('join')}>Koop-Werkstatt beitreten</button>
          <button className="btn big" onClick={() => (last ? void openWorkshop(last) : setMode('open'))} disabled={c.working}>
            Bestehende Koop-Werkstatt öffnen
          </button>
          {last && <button className="btn ghost" onClick={() => setMode('open')}>Andere Werkstatt wählen</button>}
        </div>
      )}
      {mode === 'create' && (
        <div className="col">
          {nameField}
          <label className="field">
            Name der Werkstatt
            <input value={title} maxLength={40} onChange={(e) => setTitle(e.target.value)} />
          </label>
          {hasSave && (
            <label className="check">
              <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} /> Mit einer Kopie meines Einzelspielstands starten (der Einzelspielstand bleibt unverändert)
            </label>
          )}
          <div className="row">
            <button className="btn primary big" disabled={c.working || !name.trim()} onClick={() => (keep(), void createWorkshop(title, name, copy))}>
              {c.working ? 'Wird angelegt …' : 'Erstellen'}
            </button>
            <button className="btn big" onClick={() => setMode(null)}>Zurück</button>
          </div>
        </div>
      )}
      {mode === 'join' && (
        <div className="col">
          {nameField}
          <label className="field">
            Einladungscode
            <input value={code} maxLength={6} placeholder="6 Zeichen" autoCapitalize="characters" onChange={(e) => setCode(e.target.value.toUpperCase())} data-testid="coop-code" />
          </label>
          <div className="row">
            <button className="btn primary big" disabled={c.working || !name.trim() || code.trim().length < 6} onClick={() => (keep(), void joinWorkshop(code, name))}>
              {c.working ? 'Verbinde …' : 'Beitreten'}
            </button>
            <button className="btn big" onClick={() => setMode(null)}>Zurück</button>
          </div>
        </div>
      )}
      {mode === 'open' && (
        <div className="col">
          {c.list.length === 0 && <p className="fine">{c.working ? 'Lade …' : 'Auf diesem Gerät ist noch keine Koop-Werkstatt bekannt.'}</p>}
          {c.list.map((w) => (
            <button key={w.id} className="btn big" disabled={c.working} onClick={() => void openWorkshop(w.id)}>
              {w.name} – {w.members.join(' & ')} · Tag {w.day} · {eur(w.money)}
            </button>
          ))}
          <button className="btn" onClick={() => setMode(null)}>Zurück</button>
        </div>
      )}
      {c.error && <p className="coop-error" data-testid="coop-error">{c.error}</p>}
    </div>
  );
}

/** Anzeige in der Kopfzeile: Verbindungsstatus und wer online ist. */
export function CoopChip() {
  const c = useCoop();
  const setPanel = useGame((s) => s.setPanel);
  if (c.status === 'off') return null;
  const others = c.members.filter((m) => m.id !== c.me);
  const online = others.filter((m) => m.online);
  return (
    <button className={`btn coop-chip ${c.status}`} data-testid="coop-chip" onClick={() => (setPanel('coop'), void loadLedger())}>
      {c.status === 'offline' ? '🔴 Offline' : '🟢 Koop'} · {others.length === 0 ? 'allein' : online.length ? online.map((m) => m.name).join(', ') : `${others[0].name} offline`}
    </button>
  );
}

const ago = (seen: number) => {
  const min = Math.max(0, Math.round((Date.now() / 1000 - seen) / 60));
  return min < 2 ? 'gerade eben' : min < 90 ? `vor ${min} min` : min < 2880 ? `vor ${Math.round(min / 60)} Std.` : `vor ${Math.round(min / 1440)} Tagen`;
};

/** Übersicht der gemeinsamen Werkstatt: Mitglieder, Einladung, Kontobuch. */
export function CoopModal() {
  const c = useCoop();
  const g = useGame();
  return (
    <Modal title={`Koop-Werkstatt „${c.name}“`} onClose={() => g.setPanel(null)} wide>
      <h4>Mitglieder</h4>
      {c.members.map((m) => {
        const tools = c.tools.filter((t) => t.holder === m.id).map((t) => TOOL_MAP[t.type].short);
        return (
          <div key={m.id} className="meta" data-testid="coop-member">
            {m.online || m.id === c.me ? '🟢' : '⚪'} <b>{m.name}</b>
            {m.id === c.me ? ' (du)' : m.online ? '' : ` – zuletzt ${ago(m.seen)}`} · trägt: {tools.length ? tools.join(', ') : 'nichts'}
          </div>
        );
      })}
      <h4>Einladung</h4>
      <p className="meta">
        Code: <b className="coop-code" data-testid="coop-code-show">{c.inviteOpen ? c.code : 'geschlossen'}</b> – nur zum Beitreten. Wer einmal Mitglied ist, braucht ihn nicht mehr.
      </p>
      <div className="row">
        <button className="btn" onClick={() => void setInvite(!c.inviteOpen, false)}>{c.inviteOpen ? 'Einladung schließen' : 'Einladung öffnen'}</button>
        <button className="btn" onClick={() => void setInvite(true, true)}>Neuen Code erzeugen</button>
      </div>
      <h4>Kontobuch – gemeinsames Konto {eur(g.money)}</h4>
      {c.ledger.length === 0 && <p className="meta">Noch keine Buchungen.</p>}
      <div className="ledger" data-testid="coop-ledger">
        {c.ledger.map((l, i) => (
          <div key={i} className="meta">
            <span className={l.amount < 0 ? 'neg' : 'pos'}>{l.amount > 0 ? '+' : ''}{eur(l.amount)}</span> · {l.by}: {l.note} <span className="dim">(Stand {eur(l.balance)})</span>
          </div>
        ))}
      </div>
      <div className="row">
        <button className="btn" onClick={() => void loadLedger()}>Aktualisieren</button>
        <button className="btn danger" onClick={() => void leave()}>Koop verlassen (zum Menü)</button>
      </div>
      <p className="meta">Verlassen beendet nur diese Sitzung. Die Werkstatt bleibt bestehen, dein Einzelspielstand ist unverändert.</p>
    </Modal>
  );
}

/** Werkzeugkiste im Koop: zeigt die tatsächlich vorhandenen Exemplare dieser Kiste. */
export function CoopCabinet() {
  const c = useCoop();
  const g = useGame();
  const box = BOXES[c.box] ? c.box : 'schrank';
  const here = c.tools.filter((t) => t.box === box);
  const mine = c.tools.filter((t) => t.holder === c.me);
  const others = c.tools.filter((t) => t.holder && t.holder !== c.me && t.home === box);
  const nameOf = (id: string | null) => c.members.find((m) => m.id === id)?.name ?? 'Partner';
  return (
    <Modal title={`${BOXES[box].name} – ${here.length}/${BOXES[box].cap} Plätze belegt`} onClose={() => g.setPanel(null)} wide>
      <h4>In dieser Kiste</h4>
      {here.length === 0 && <p className="meta">Die Kiste ist leer.</p>}
      <div className="grid2" data-testid="coop-box">
        {here.map((t) => (
          <div key={t.id} className="tool-card" data-tool={t.type}>
            <span className="ico">{TOOL_MAP[t.type].icon}</span>
            <div className="grow">
              <b>{TOOL_MAP[t.type].name}</b>
              <div className="meta">{TOOL_MAP[t.type].hint}</div>
            </div>
            <button className="btn primary" disabled={mine.length >= MAX_CARRIED} onClick={() => void takeTool(t)}>Nehmen</button>
          </div>
        ))}
      </div>
      {others.length > 0 && <p className="meta">Unterwegs: {others.map((t) => `${TOOL_MAP[t.type].name} (${nameOf(t.holder)})`).join(', ')}</p>}
      <h4>Deine Werkzeugleiste – {mine.length}/{MAX_CARRIED}</h4>
      {mine.length === 0 && <p className="meta">Du trägst kein Werkzeug.</p>}
      <div className="grid2" data-testid="coop-mine">
        {mine.map((t) => (
          <div key={t.id} className="tool-card has" data-tool={t.type}>
            <span className="ico">{TOOL_MAP[t.type].icon}</span>
            <div className="grow">
              <b>{TOOL_MAP[t.type].name}</b>
              <div className="meta">gehört in: {BOXES[t.home]?.name ?? t.home}</div>
            </div>
            <button className="btn" onClick={() => void returnTool(t, box)}>Hier ablegen</button>
          </div>
        ))}
      </div>
      {box !== 'spezial' && (
        <>
          <h4>Weiteres Exemplar für diese Kiste kaufen</h4>
          <div className="row wrap">
            {CABINET_TOOLS.filter((t) => TOOL_PRICE[t.id]).map((t) => (
              <button key={t.id} className="btn" disabled={g.money < TOOL_PRICE[t.id]! || here.length >= BOXES[box].cap} onClick={() => void buyTool(t.id, box)}>
                {t.icon} {t.short} · {eur(TOOL_PRICE[t.id]!)}
              </button>
            ))}
          </div>
        </>
      )}
      <p className="meta">
        Jedes Werkzeug ist ein einzelnes Exemplar: Was du nimmst, fehlt in der Kiste, bis du es zurücklegst. Drehmomentschlüssel und OBD-Diagnosegerät gibt es nur einmal – im Spezialwerkzeugschrank am Schreibtisch.
        Hand und Prüflampe hat jeder immer dabei.
      </p>
    </Modal>
  );
}
