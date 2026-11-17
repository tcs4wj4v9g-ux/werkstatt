import { useEffect, useRef, useState } from 'react';
import { bubbleMs, CHAT_MAX, sendChat, setChatOpen, useChat, useCoop } from '../net/coop';

/** Häufige Sätze zum schnellen Antippen (auf dem iPad ohne Tastatur). */
const QUICK = ['Hilf mir mal kurz!', 'Komm her, schau dir das an', 'Bin gleich da', 'Brauchst du die Ratsche?', 'Gute Arbeit 👍', 'Ich fahre Probe'];

/** Knopf in der oberen Leiste (nur im Koop), mit Zahl ungelesener Nachrichten. */
export function ChatButton() {
  const coop = useCoop((c) => c.status !== 'off');
  const unread = useChat((c) => c.unread);
  if (!coop) return null;
  return (
    <button className="btn ghost" data-testid="chat" onClick={() => setChatOpen(!useChat.getState().open)}>
      💬 Chat{unread > 0 && <span className="badge">{unread}</span>}
    </button>
  );
}

/** Chatfenster: Verlauf, Eingabe und Schnellantworten. */
export function ChatPanel() {
  const open = useChat((c) => c.open);
  const log = useChat((c) => c.log);
  const coop = useCoop((c) => c.status !== 'off');
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [log.length, open]);
  if (!open || !coop) return null;
  const send = (t: string) => {
    if (sendChat(t)) setText('');
  };
  return (
    <div className="chat-panel" data-testid="chat-panel">
      <div className="chat-head">
        <b>💬 Werkstatt-Chat</b>
        <button className="btn ghost" data-testid="chat-close" onClick={() => setChatOpen(false)}>✕</button>
      </div>
      <div className="chat-log" ref={list}>
        {log.length === 0 && <p className="meta">Noch keine Nachrichten. Was du schreibst, erscheint als Sprechblase über deiner Figur.</p>}
        {log.map((m) => (
          <div key={m.id} className={`chat-line ${m.mine ? 'mine' : ''}`}>
            <span className="who">{m.mine ? 'Du' : m.name}</span> {m.text}
          </div>
        ))}
      </div>
      <div className="chat-quick">
        {QUICK.map((q) => (
          <button key={q} className="btn small" onClick={() => send(q)}>{q}</button>
        ))}
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input data-testid="chat-input" value={text} maxLength={CHAT_MAX} placeholder="Nachricht schreiben …" enterKeyHint="send" onChange={(e) => setText(e.target.value)} />
        <button className="btn primary" data-testid="chat-send" type="submit" disabled={!text.trim()}>Senden</button>
      </form>
      <div className="meta">{text.length}/{CHAT_MAX}</div>
    </div>
  );
}

/** Neue Nachrichten kurz am Rand einblenden (so lange wie die Sprechblase), auch bei geschlossenem Fenster. */
export function ChatFeed() {
  const log = useChat((c) => c.log);
  const open = useChat((c) => c.open);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);
  if (open) return null;
  const now = Date.now();
  const recent = log.filter((m) => now - m.at < bubbleMs(m.text)).slice(-3);
  if (!recent.length) return null;
  return (
    <div className="chat-feed" data-testid="chat-feed">
      {recent.map((m) => (
        <div key={m.id} className={`chat-line ${m.mine ? 'mine' : ''}`}>
          <span className="who">{m.mine ? 'Du' : m.name}</span> {m.text}
        </div>
      ))}
    </div>
  );
}
