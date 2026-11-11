// Winzige synthetische Soundeffekte (WebAudio) – keine Audiodateien nötig.
//
// iOS/Safari-Besonderheiten:
// - Ton darf erst nach einer Berührung starten -> `unlock` bei jedem Tippen.
// - Der AudioContext kann "suspended" oder "interrupted" sein (App-Wechsel,
//   Sperrbildschirm) und muss dann wieder aufgeweckt werden.
// - Ohne Audio-Session vom Typ "playback" bleibt WebAudio stumm, sobald das
//   Gerät stummgeschaltet ist.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const AC = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC() as AudioContext;
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Bei jeder Berührung aufrufen: schaltet den Ton frei bzw. weckt ihn wieder auf. */
export function unlock() {
  try {
    const session = (navigator as any).audioSession;
    if (session && session.type !== 'playback') session.type = 'playback';
  } catch {
    /* nicht unterstützt */
  }
  const c = audio();
  if (!c) return;
  if (c.state !== 'running') {
    void c.resume().catch(() => {});
    // Ein stiller Puffer innerhalb der Berührung schaltet ältere iOS-Versionen frei.
    try {
      const src = c.createBufferSource();
      src.buffer = c.createBuffer(1, 1, 22050);
      src.connect(c.destination);
      src.start(0);
    } catch {
      /* egal */
    }
  }
}

if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'touchstart', 'touchend', 'click', 'keydown']) {
    window.addEventListener(ev, unlock, { capture: true, passive: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && ctx && ctx.state !== 'running') void ctx.resume().catch(() => {});
  });
}

function play(freq: number, dur: number, type: OscillatorType, vol: number, slide: number) {
  const c = ctx!;
  const o = c.createOscillator();
  const g = c.createGain();
  const t = c.currentTime + 0.005;
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.18, slide = 0) {
  try {
    const c = audio();
    if (!c) return;
    if (c.state === 'running') play(freq, dur, type, vol, slide);
    else void c.resume().then(() => play(freq, dur, type, vol, slide)).catch(() => {});
  } catch {
    /* Ton ist optional */
  }
}

export const sfx = {
  click: () => tone(660, 0.07, 'triangle', 0.3),
  ratchet: () => {
    tone(900, 0.04);
    setTimeout(() => tone(1100, 0.04), 55);
    setTimeout(() => tone(900, 0.04), 110);
  },
  clunk: () => tone(140, 0.16, 'sawtooth', 0.3, -60),
  error: () => tone(160, 0.22, 'sawtooth', 0.22, -40),
  cash: () => {
    tone(880, 0.1, 'triangle', 0.3);
    setTimeout(() => tone(1320, 0.18, 'triangle', 0.3), 90);
  },
};

// --- Motorgeräusch für die Probefahrt ---
let engine: { o1: OscillatorNode; o2: OscillatorNode; gain: GainNode } | null = null;

export function startEngine() {
  try {
    const c = audio();
    if (!c || engine) return;
    if (c.state !== 'running') void c.resume().catch(() => {});
    const gain = c.createGain();
    gain.gain.value = 0.0001;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const o1 = c.createOscillator();
    const o2 = c.createOscillator();
    o1.type = 'sawtooth';
    o2.type = 'square';
    o1.connect(filter);
    o2.connect(filter);
    filter.connect(gain).connect(master!);
    o1.start();
    o2.start();
    engine = { o1, o2, gain };
  } catch {
    engine = null;
  }
}

/** speed in m/s, throttle 0..1, rough = Zündaussetzer. */
export function setEngine(speed: number, throttle: number, rough = false) {
  if (!engine || !ctx) return;
  const t = ctx.currentTime;
  const rpm = 55 + Math.abs(speed) * 5.5 + throttle * 18;
  const wobble = rough ? Math.sin(t * 23) * 9 : 0;
  engine.o1.frequency.setTargetAtTime(rpm + wobble, t, 0.06);
  engine.o2.frequency.setTargetAtTime((rpm + wobble) / 2, t, 0.06);
  const cut = rough && Math.sin(t * 11) > 0.3 ? 0.4 : 1;
  engine.gain.gain.setTargetAtTime((0.1 + throttle * 0.12) * cut, t, 0.08);
}

export function stopEngine() {
  if (!engine) return;
  try {
    engine.o1.stop();
    engine.o2.stop();
    engine.gain.disconnect();
  } catch {
    /* schon gestoppt */
  }
  engine = null;
}
