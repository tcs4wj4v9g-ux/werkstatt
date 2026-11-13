// Audiosystem: alle Klänge werden synthetisch erzeugt (WebAudio) – keine Audiodateien,
// keine Aufnahmen echter Fahrzeuge. Der Motorklang ist eine Annäherung, kein Original.
//
// iOS/Safari-Besonderheiten:
// - Ton darf erst nach einer Berührung starten -> `unlock` bei jedem Tippen.
// - Der AudioContext kann "suspended" oder "interrupted" sein (App-Wechsel,
//   Sperrbildschirm) und muss dann wieder aufgeweckt werden.
// - Ohne Audio-Session vom Typ "playback" bleibt WebAudio stumm, sobald das
//   Gerät stummgeschaltet ist.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
const VOLUME = 0.85;

/** Ton global ein-/ausschalten (weich, ohne Knacken). */
export function setMuted(m: boolean) {
  muted = m;
  if (ctx && master) master.gain.setTargetAtTime(m ? 0 : VOLUME, ctx.currentTime, 0.03);
}

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const AC = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC() as AudioContext;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : VOLUME;
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

// --- Motor -------------------------------------------------------------
// Ein einziger Motor ist gleichzeitig zu hören. Solange er läuft, existieren
// drei Oszillatoren und eine Rauschquelle; beim Abstellen wird alles beendet.

export interface EngineSound {
  misfire: number;
  hiss: number;
  knock: number;
  tick: number;
  rattle: number;
  squeal: number;
  /** Turbolader heult (Schaden) bzw. Ladeluft zischt (Leck). */
  whine?: number;
  boostHiss?: number;
  /** Grundcharakter: Bauart, Zylinderzahl, Diesel, Aufladung. */
  layout?: 'R4' | 'R6' | 'V6' | 'V8';
  cylinders?: number;
  diesel?: boolean;
  turbo?: boolean;
  sport?: number;
}

/**
 * Klangcharakter je Bauart: Frequenzverhältnisse und Lautstärken der drei
 * Grundoszillatoren zur Zündfrequenz, Klangfarbe und Auspuffanteil.
 * R4 brummt kernig, R6 läuft seidig und hell, V6 leicht rau, V8 blubbert
 * mit kräftigen Unterschwingungen.
 */
export const VOICES: Record<string, { ratios: number[]; gains: number[]; tone: number; exhaust: number }> = {
  R4: { ratios: [1, 0.5, 2.01], gains: [0.5, 0.35, 0.12], tone: 260, exhaust: 1 },
  R6: { ratios: [1, 0.5, 2.0], gains: [0.4, 0.1, 0.24], tone: 340, exhaust: 0.85 },
  V6: { ratios: [1, 1 / 3, 1.5], gains: [0.45, 0.26, 0.14], tone: 285, exhaust: 1.1 },
  V8: { ratios: [1, 0.25, 0.5], gains: [0.38, 0.42, 0.34], tone: 215, exhaust: 1.7 },
};
/** Zündfrequenz in Hz: je zwei Kurbelumdrehungen zündet jeder Zylinder einmal. */
export const firingHz = (rpm: number, cylinders = 4) => (rpm / 60) * (cylinders / 2);

interface Running {
  clatter: GainNode;
  boost: GainNode;
  whistle: OscillatorNode;
  whistleGain: GainNode;
  spool: number;
  nextClatter: number;
  oscs: OscillatorNode[];
  noise: AudioBufferSourceNode;
  tone: BiquadFilterNode;
  out: GainNode;
  miss: GainNode;
  exhaust: GainNode;
  knock: GainNode;
  tick: GainNode;
  rattle: GainNode;
  squeal: GainNode;
  profile: EngineSound;
  started: number;
  rpm: number;
  target: number;
  load: number;
  warm: boolean;
  nextKnock: number;
  nextTick: number;
  nextMiss: number;
  raf: number;
  demoTimer: number;
}

let run: Running | null = null;
let noiseBuffer: AudioBuffer | null = null;
const IDLE = 820;

function noise(c: AudioContext) {
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  return src;
}

function band(c: AudioContext, src: AudioNode, type: BiquadFilterType, freq: number, q: number, dest: AudioNode) {
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.value = 0.0001;
  src.connect(f).connect(g).connect(dest);
  return g;
}

function frame() {
  const r = run;
  const c = ctx;
  if (!r || !c) return;
  const t = c.currentTime;
  const since = t - r.started;
  r.rpm += (r.target - r.rpm) * 0.12;
  const p = r.profile;

  // Unrunder Lauf: Drehzahl schwankt, einzelne Zündungen fallen aus.
  const wobble = p.misfire ? Math.sin(t * 9) * 30 * p.misfire : 0;
  const voice = VOICES[p.layout ?? 'R4'];
  const firing = Math.max(8, firingHz(r.rpm + wobble, p.cylinders));
  voice.ratios.forEach((ratio, i) => r.oscs[i].frequency.setTargetAtTime(firing * ratio, t, 0.03));
  // Diesel klingen dumpfer, dafür härter (siehe Nageln unten).
  r.tone.frequency.setTargetAtTime((voice.tone + r.rpm * 0.22) * (p.diesel ? 0.72 : 1), t, 0.05);
  r.out.gain.setTargetAtTime(since < 0.55 ? 0.0001 : 0.16 + r.load * 0.12, t, 0.08);
  r.exhaust.gain.setTargetAtTime((0.1 + r.load * 0.3) * voice.exhaust * (1 + 0.35 * (p.sport ?? 0)), t, 0.08);

  // Diesel-Nageln: ein harter Schlag je Zündung, kalt und im Leerlauf am deutlichsten.
  if (p.diesel && since > 0.55) {
    const period = 1 / firing;
    const amp = (r.warm ? 0.035 : 0.06) * (1 - r.load * 0.4) * (p.misfire ? 1.6 : 1);
    while (r.nextClatter < t + 0.12) {
      const at = Math.max(t, r.nextClatter);
      r.clatter.gain.setValueAtTime(amp * (p.misfire ? 0.5 + Math.random() : 1), at);
      r.clatter.gain.exponentialRampToValueAtTime(0.0001, at + Math.min(0.02, period * 0.6));
      r.nextClatter = at + period;
    }
  }
  // Turbolader: läuft mit Verzögerung hoch, pfeift unter Last; ein defekter Lader heult wie eine Sirene.
  if (p.turbo || p.whine) {
    r.spool += ((r.load * Math.min(1, r.rpm / 3000)) - r.spool) * 0.04;
    r.whistle.frequency.setTargetAtTime(p.whine ? 900 + r.spool * 2600 : 2600 + r.spool * 5200, t, 0.05);
    r.whistleGain.gain.setTargetAtTime(since < 0.6 ? 0.0001 : p.whine ? 0.012 + r.spool * 0.05 : r.spool * 0.014, t, 0.06);
  }
  // Leck in der Ladeluft: zischt, sobald Ladedruck aufgebaut werden soll.
  if (p.boostHiss) r.boost.gain.setTargetAtTime(r.load * 0.07, t, 0.05);
  if (p.misfire && t >= r.nextMiss) {
    r.miss.gain.setTargetAtTime(0.2, t, 0.008);
    r.miss.gain.setTargetAtTime(1, t + 0.07, 0.02);
    r.nextMiss = t + (0.25 + Math.random() * 0.9) / p.misfire;
  }

  // Lagerschaden: dumpfes Klackern, erst warm und unter Last deutlich.
  if (p.knock && r.warm) {
    const period = 120 / Math.max(500, r.rpm);
    const amp = 0.1 + r.load * 0.5;
    while (r.nextKnock < t + 0.12) {
      const at = Math.max(t, r.nextKnock);
      r.knock.gain.setValueAtTime(amp, at);
      r.knock.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
      r.nextKnock = at + period;
    }
  }
  // Ventiltrieb: schnelles helles Tickern, geht mit der Drehzahl mit.
  if (p.tick) {
    const period = 30 / Math.max(500, r.rpm);
    while (r.nextTick < t + 0.12) {
      const at = Math.max(t, r.nextTick);
      r.tick.gain.setValueAtTime(0.09, at);
      r.tick.gain.exponentialRampToValueAtTime(0.0001, at + 0.012);
      r.nextTick = at + period;
    }
  }
  // Steuerkette: rasselt kurz nach dem Start, danach nur noch leise.
  if (p.rattle) r.rattle.gain.setTargetAtTime((since < 4 ? 0.3 : 0.03) * (0.5 + Math.random()), t, 0.02);
  // Riemen: quietscht beim Start und beim Gasgeben.
  if (p.squeal) r.squeal.gain.setTargetAtTime(since < 2.5 || r.load > 0.5 ? 0.05 : 0.0001, t, 0.06);

  r.raf = requestAnimationFrame(frame);
}

export const engineAudio = {
  running: () => !!run,
  /** Aktuelles Klangbild (für Tests und Anzeige). */
  profile: () => (run ? { ...run.profile, warm: run.warm } : null),

  start(profile: EngineSound) {
    this.stop();
    try {
      const c = audio();
      if (!c || !master) return;
      if (c.state !== 'running') void c.resume().catch(() => {});
      const t = c.currentTime;
      const out = c.createGain();
      out.gain.value = 0.0001;
      out.connect(master);
      const miss = c.createGain();
      const tone = c.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 400;
      tone.connect(miss).connect(out);
      const oscs = (['sawtooth', 'square', 'triangle'] as OscillatorType[]).map((type, i) => {
        const o = c.createOscillator();
        o.type = type;
        const g = c.createGain();
        g.gain.value = VOICES[profile.layout ?? 'R4'].gains[i];
        o.connect(g).connect(tone);
        o.start(t);
        return o;
      });
      const src = noise(c);
      const exhaust = band(c, src, 'lowpass', 200, 0.7, out);
      const hiss = band(c, src, 'highpass', 5200, 0.7, master);
      hiss.gain.setTargetAtTime(profile.hiss * 0.035, t + 0.6, 0.2);
      const knock = band(c, src, 'bandpass', 620, 4, master);
      const tick = band(c, src, 'bandpass', 3900, 7, master);
      const rattle = band(c, src, 'bandpass', 2300, 1.4, master);
      const clatter = band(c, src, 'bandpass', 1750, 2.2, master);
      const boost = band(c, src, 'highpass', 3400, 0.7, master);
      const whistle = c.createOscillator();
      whistle.type = 'sine';
      whistle.frequency.value = 2600;
      const whistleGain = c.createGain();
      whistleGain.gain.value = 0.0001;
      whistle.connect(whistleGain).connect(master);
      whistle.start(t);
      src.start(t);
      // Riemenquietschen als vierter Oszillator nur, wenn der Riemen wirklich defekt ist.
      const squeal = c.createGain();
      squeal.gain.value = 0.0001;
      squeal.connect(master);
      if (profile.squeal) {
        const sq = c.createOscillator();
        sq.type = 'sawtooth';
        sq.frequency.value = 2650;
        const lfo = c.createOscillator();
        lfo.frequency.value = 13;
        const depth = c.createGain();
        depth.gain.value = 140;
        lfo.connect(depth).connect(sq.frequency);
        const hp = c.createBiquadFilter();
        hp.type = 'bandpass';
        hp.frequency.value = 2700;
        hp.Q.value = 5;
        sq.connect(hp).connect(squeal);
        sq.start(t);
        lfo.start(t);
        oscs.push(sq, lfo);
      }
      // Anlasser: kurzes Orgeln, dann springt der Motor an.
      const starter = c.createOscillator();
      const sg = c.createGain();
      starter.type = 'sawtooth';
      starter.frequency.setValueAtTime(95, t);
      starter.frequency.linearRampToValueAtTime(150, t + 0.55);
      sg.gain.setValueAtTime(0.0001, t);
      sg.gain.linearRampToValueAtTime(0.12, t + 0.05);
      for (let k = 0; k < 6; k++) sg.gain.setTargetAtTime(k % 2 ? 0.12 : 0.05, t + 0.06 + k * 0.08, 0.02);
      sg.gain.setTargetAtTime(0.0001, t + 0.56, 0.03);
      starter.connect(sg).connect(master);
      starter.start(t);
      starter.stop(t + 0.8);

      run = {
        oscs: [...oscs, whistle], noise: src, tone, out, miss, exhaust, knock, tick, rattle, squeal, profile,
        clatter, boost, whistle, whistleGain, spool: 0, nextClatter: t + 0.6,
        started: t, rpm: 250, target: IDLE, load: 0, warm: false,
        nextKnock: t + 0.7, nextTick: t + 0.7, nextMiss: t + 1, raf: 0, demoTimer: 0,
      };
      run.rpm = 1250; // kurzer Drehzahlsprung nach dem Anspringen
      run.raf = requestAnimationFrame(frame);
    } catch {
      run = null;
    }
  },

  /** Drehzahl (U/min) und Last (0..1) vorgeben. */
  set(rpm: number, load: number) {
    if (!run) return;
    run.target = Math.max(IDLE, rpm);
    run.load = Math.max(0, Math.min(1, load));
  },

  /** Gaspedal im Stand: 0 = Leerlauf, 1 = hohe Drehzahl. */
  throttle(amount: number) {
    this.set(IDLE + amount * (run?.profile.diesel ? 2000 : 2600), amount);
  },

  setWarm(warm: boolean) {
    if (run) run.warm = warm;
  },

  /** Kurze Hörprobe beim Verkäufer; mit `driving` inklusive Gasstoß und warmem Motor. */
  demo(profile: EngineSound, driving: boolean) {
    this.start(profile);
    if (!run) return;
    const r = run;
    if (driving) {
      r.warm = true;
      r.demoTimer = window.setTimeout(() => this.throttle(0.8), 1300);
      window.setTimeout(() => run === r && this.throttle(0), 3200);
    }
    window.setTimeout(() => run === r && this.stop(), driving ? 5200 : 4200);
  },

  stop() {
    const r = run;
    if (!r || !ctx) return;
    run = null;
    cancelAnimationFrame(r.raf);
    clearTimeout(r.demoTimer);
    const t = ctx.currentTime;
    // Auslaufen statt abruptem Ende – so gibt es kein Knacken.
    for (const g of [r.out, r.exhaust, r.knock, r.tick, r.rattle, r.squeal, r.clatter, r.boost, r.whistleGain]) {
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(0.0001, t, 0.07);
    }
    r.oscs[0].frequency.setTargetAtTime(6, t, 0.12);
    r.oscs[1].frequency.setTargetAtTime(3, t, 0.12);
    setTimeout(() => {
      try {
        r.oscs.forEach((o) => o.stop());
        r.noise.stop();
        r.out.disconnect();
      } catch {
        /* schon beendet */
      }
    }, 600);
  },
};
