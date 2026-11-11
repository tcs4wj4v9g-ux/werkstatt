// Winzige synthetische Soundeffekte (WebAudio) – keine Audiodateien nötig.
let ctx: AudioContext | null = null;

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.06, slide = 0) {
  try {
    const AC = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    const c = ctx!;
    if (c.state === 'suspended') void c.resume();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), c.currentTime + dur);
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + dur);
  } catch {
    /* Ton ist optional */
  }
}

export const sfx = {
  click: () => tone(660, 0.05, 'triangle'),
  ratchet: () => {
    tone(900, 0.03);
    setTimeout(() => tone(1100, 0.03), 50);
    setTimeout(() => tone(900, 0.03), 100);
  },
  clunk: () => tone(140, 0.12, 'sawtooth', 0.08, -60),
  error: () => tone(160, 0.18, 'sawtooth', 0.05, -40),
  cash: () => {
    tone(880, 0.08, 'triangle');
    setTimeout(() => tone(1320, 0.14, 'triangle'), 80);
  },
};
