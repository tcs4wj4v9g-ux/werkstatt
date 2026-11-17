import { ENGINE_WORKLET, engineVoice } from './engineWorklet';
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
  layout?: 'R4' | 'R5' | 'R6' | 'V6' | 'V8' | 'B4' | 'B6';
  cylinders?: number;
  diesel?: boolean;
  turbo?: boolean;
  sport?: number;
  liters?: number;
  exhaust?: 'stock' | 'sport' | 'rusty';
  headers?: boolean;
  bov?: 'recirc' | 'atmo';
  flatPlane?: boolean;
  air?: boolean;
  pops?: boolean;
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
  // Boxer: rauer, luftiger Klang mit kräftiger halber Ordnung (Gebläse und ungleiche Abgasführung)
  // Fünfzylinder: ungleichmäßiges Trällern durch die 2,5. Ordnung
  R5: { ratios: [1, 0.4, 0.6], gains: [0.42, 0.3, 0.26], tone: 290, exhaust: 1.25 },
  B4: { ratios: [1, 0.5, 1.5], gains: [0.42, 0.38, 0.16], tone: 240, exhaust: 1.2 },
  // Sechszylinder-Boxer: heiseres, metallisches Kreischen mit kräftigen höheren Ordnungen
  B6: { ratios: [1, 0.5, 2.0], gains: [0.4, 0.22, 0.3], tone: 330, exhaust: 1.35 },
};
/** Zündfrequenz in Hz: je zwei Kurbelumdrehungen zündet jeder Zylinder einmal. */
export const firingHz = (rpm: number, cylinders = 4) => (rpm / 60) * (cylinders / 2);

interface Running {
  /** Puls-Synthese (AudioWorklet), sobald geladen; dann sind die Oszillatoren stumm. */
  pulse: AudioWorkletNode | null;
  oscGains: GainNode[];
  whoosh: GainNode;
  rasp: GainNode;
  fan: GainNode;
  lastLoad: number;
  crackleUntil: number;
  nextPop: number;
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

// --- Puls-Synthese laden (einmal pro Audiokontext) ---
let workletReady: Promise<boolean> | null = null;
function ensureWorklet(c: AudioContext): Promise<boolean> {
  if (workletReady) return workletReady;
  if (!c.audioWorklet || typeof AudioWorkletNode === 'undefined') return (workletReady = Promise.resolve(false));
  const url = URL.createObjectURL(new Blob([ENGINE_WORKLET], { type: 'application/javascript' }));
  workletReady = c.audioWorklet.addModule(url).then(
    () => true,
    () => false,
  );
  return workletReady;
}

/** Kurzer Geräuschstoß (Knall, Abblasen) über ein Filter mit eigener Hüllkurve. */
function burst(c: AudioContext, type: BiquadFilterType, freq: number, q: number, peak: number, decay: number, at: number, len = 0.6) {
  if (!master) return null;
  const src = noise(c);
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(peak, at + 0.004);
  g.gain.setTargetAtTime(0.0001, at + 0.006, decay);
  src.connect(f).connect(g).connect(master);
  src.start(at, Math.random() * 1.5);
  src.stop(at + len);
  return g;
}

/** Endtopf: Grenzfrequenz des Tiefpasses je Anlage – Serie dumpf, Sport offen, durchgerostet scharf. */
function mufflerHz(p: EngineSound, rpm: number, load: number) {
  const x = p.exhaust === 'rusty' ? 2600 + rpm * 0.25 : p.exhaust === 'sport' ? 1250 + rpm * 0.28 : 520 + rpm * 0.14;
  return x * (p.diesel ? 0.8 : 1) * (0.8 + load * 0.3);
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
  r.tone.frequency.setTargetAtTime(r.pulse ? mufflerHz(p, r.rpm, r.load) : (voice.tone + r.rpm * 0.22) * (p.diesel ? 0.72 : 1), t, 0.05);
  if (r.pulse) {
    const pr = r.pulse.parameters;
    pr.get('rpm')!.setTargetAtTime(since < 0.5 ? 0 : r.rpm + wobble, t, 0.02);
    pr.get('load')!.setTargetAtTime(r.load, t, 0.03);
    pr.get('misfire')!.setValueAtTime(p.misfire ?? 0, t);
  }
  // Durchgerosteter Topf: Kratzen und Schnarren, mit Last lauter
  r.rasp.gain.setTargetAtTime(p.exhaust === 'rusty' && since > 0.6 ? 0.012 + r.load * 0.05 : 0.0001, t, 0.05);
  // Luftgekühlt: Kühlgebläse rauscht mit der Drehzahl
  r.fan.gain.setTargetAtTime(p.air && since > 0.6 ? 0.006 + Math.min(1, r.rpm / 7000) * 0.022 : 0.0001, t, 0.1);
  // Gas weg aus hoher Drehzahl: Abblasen (Turbo) und Nachverbrennung im Auspuff (Sportanlage, Kennfeld)
  const lift = r.lastLoad > 0.55 && r.load < 0.12;
  if (lift && since > 1) {
    if (p.turbo && r.spool > 0.4) {
      if (p.bov === 'atmo') {
        // nach außen abblasendes Ventil: lautes „Pschh“, dazu kurzes Flattern des Verdichters
        burst(c, 'highpass', 1900, 0.6, 0.2 * r.spool, 0.16, t, 0.9);
        for (let k = 0; k < 7; k++) burst(c, 'bandpass', 700, 1.4, 0.07 * r.spool * (1 - k / 8), 0.012, t + 0.05 + k * 0.055, 0.2);
      } else burst(c, 'bandpass', 1100, 0.8, 0.045 * r.spool, 0.12, t, 0.6); // Schubumluft: leises Zurückblasen
      r.spool *= 0.3;
    }
    if (r.rpm > 2800 && (p.pops || p.exhaust === 'sport' || p.exhaust === 'rusty')) r.crackleUntil = t + (p.pops ? 1.8 : 0.9);
  }
  r.lastLoad = r.load;
  // Knallen und Knistern im Schub: Nachverbrennung von unverbranntem Kraftstoff im heißen Auspuff
  if (t < r.crackleUntil && r.load < 0.2 && r.rpm > 1800) {
    while (r.nextPop < t + 0.12) {
      const at = Math.max(t, r.nextPop);
      const big = p.pops && Math.random() < 0.25;
      burst(c, 'bandpass', big ? 380 : 650 + Math.random() * 500, big ? 0.9 : 1.6, (big ? 0.32 : 0.12) * (p.pops ? 1 : 0.6), big ? 0.03 : 0.012, at, 0.25);
      r.nextPop = at + (p.pops ? 0.04 : 0.09) + Math.random() * (p.pops ? 0.16 : 0.28);
    }
  } else r.nextPop = t;
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
    // Pfeifen: Laderwelle dreht mit dem Ladedruck hoch (Tonhöhe folgt), dazu Rauschen der angesaugten Luft
    r.whistle.frequency.setTargetAtTime(p.whine ? 900 + r.spool * 2600 : 1500 + r.spool * 3600, t, 0.05);
    r.whistleGain.gain.setTargetAtTime(since < 0.6 ? 0.0001 : p.whine ? 0.012 + r.spool * 0.05 : r.spool * (0.0018 + r.load * 0.0035) * (p.bov === 'atmo' ? 1.5 : 1), t, 0.06);
    r.whoosh.gain.setTargetAtTime(since < 0.6 ? 0.0001 : r.spool * r.load * (p.bov === 'atmo' ? 0.012 : 0.007), t, 0.08);
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
  /** Nur für Tests/Hörproben: Gesamtklang als Aufnahmestrom. */
  tap() {
    const c = audio();
    if (!c || !master) return null;
    const d = c.createMediaStreamDestination();
    master.connect(d);
    return d.stream;
  },
  /** Läuft die Puls-Synthese (AudioWorklet) oder der Oszillator-Rückfall? */
  synth: () => (run ? (run.pulse ? 'pulse' : 'osc') : null),
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
      const oscGains: GainNode[] = [];
      const oscs = (['sawtooth', 'square', 'triangle'] as OscillatorType[]).map((type, i) => {
        const o = c.createOscillator();
        o.type = type;
        const g = c.createGain();
        g.gain.value = VOICES[profile.layout ?? 'R4'].gains[i];
        o.connect(g).connect(tone);
        o.start(t);
        oscGains.push(g);
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
      // Turbo-Ansaugrauschen, kratziger Auspuff (durchgerostet), Kühlgebläse der luftgekühlten Boxer
      const whoosh = band(c, src, 'bandpass', 1700, 0.7, master);
      const rasp = band(c, src, 'bandpass', 1500, 1.2, master);
      const fan = band(c, src, 'bandpass', 3100, 2.2, master);
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
        pulse: null, oscGains, whoosh, rasp, fan, lastLoad: 0, crackleUntil: 0, nextPop: 0,
        oscs: [...oscs, whistle], noise: src, tone, out, miss, exhaust, knock, tick, rattle, squeal, profile,
        clatter, boost, whistle, whistleGain, spool: 0, nextClatter: t + 0.6,
        started: t, rpm: 250, target: IDLE, load: 0, warm: false,
        nextKnock: t + 0.7, nextTick: t + 0.7, nextMiss: t + 1, raf: 0, demoTimer: 0,
      };
      run.rpm = 1250; // kurzer Drehzahlsprung nach dem Anspringen
      run.raf = requestAnimationFrame(frame);
      // Puls-Synthese nachladen; sobald sie läuft, übernimmt sie den Grundklang
      const mine = run;
      void ensureWorklet(c).then((ok) => {
        if (!ok || run !== mine) return;
        try {
          const node = new AudioWorkletNode(c, 'engine-pulses', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
          node.port.postMessage(engineVoice(mine.profile));
          const level = c.createGain();
          level.gain.value = 0.55;
          node.connect(level).connect(mine.tone);
          const now = c.currentTime;
          for (const g of mine.oscGains) g.gain.setTargetAtTime(0.0001, now, 0.08);
          mine.pulse = node;
        } catch {
          /* Rückfall: Oszillatoren bleiben */
        }
      });
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
  /** Klangbild des laufenden Motors ändern (z. B. wenn er gerade Schaden nimmt). */
  setProfile(profile: EngineSound) {
    if (run) run.profile = { ...run.profile, ...profile };
    if (run?.pulse) run.pulse.port.postMessage(engineVoice(run.profile));
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
    for (const g of [r.out, r.exhaust, r.knock, r.tick, r.rattle, r.squeal, r.clatter, r.boost, r.whistleGain, r.whoosh, r.rasp, r.fan]) {
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(0.0001, t, 0.07);
    }
    r.oscs[0].frequency.setTargetAtTime(6, t, 0.12);
    r.oscs[1].frequency.setTargetAtTime(3, t, 0.12);
    // Puls-Synthese: Drehzahl fällt auf null (Motor läuft aus)
    r.pulse?.parameters.get('rpm')!.setTargetAtTime(0, t, 0.15);
    setTimeout(() => {
      try {
        r.oscs.forEach((o) => o.stop());
        r.noise.stop();
        r.out.disconnect();
        r.pulse?.disconnect();
        r.pulse?.port.close();
      } catch {
        /* schon beendet */
      }
    }, 600);
  },
};

/**
 * Fahrgeräusche der Probefahrt: Reifenquietschen beim Rutschen, Fahrtwind mit dem Tempo, Krachen beim Schalten
 * (Getriebeschaden), Klacken ausgeschlagener Fahrwerksteile bei Lastwechseln und ein dumpfer Schlag bei Berührung der Leitplanke.
 */
let road: { src: AudioBufferSourceNode; tire: GainNode; wind: GainNode } | null = null;
export const roadAudio = {
  start() {
    this.stop();
    const c = audio();
    if (!c || !master) return;
    const src = noise(c);
    const tire = band(c, src, 'bandpass', 1150, 3.5, master);
    const wind = band(c, src, 'lowpass', 520, 0.6, master);
    src.start();
    road = { src, tire, wind };
  },
  /** slide 0..1, Tempo in m/s */
  set(slide: number, speed: number) {
    const c = audio();
    if (!road || !c) return;
    const t = c.currentTime;
    road.tire.gain.setTargetAtTime(Math.min(1, slide) * 0.09, t, 0.05);
    road.wind.gain.setTargetAtTime(Math.min(1, speed / 55) ** 2 * 0.07, t, 0.2);
  },
  /** kurzer Geräuschstoß: Schaltkrachen oder Anprall */
  hit(kind: 'crunch' | 'bump' | 'clunk') {
    const c = audio();
    if (!c || !master) return;
    const t = c.currentTime;
    const src = noise(c);
    const g = band(c, src, 'bandpass', kind === 'crunch' ? 2400 : kind === 'clunk' ? 420 : 160, kind === 'crunch' ? 2 : kind === 'clunk' ? 5 : 0.8, master);
    g.gain.setValueAtTime(kind === 'crunch' ? 0.12 : kind === 'clunk' ? 0.18 : 0.35, t);
    g.gain.setTargetAtTime(0.0001, t + 0.05, kind === 'crunch' ? 0.06 : 0.12);
    src.start(t);
    src.stop(t + 0.6);
  },
  stop() {
    if (!road) return;
    try {
      road.src.stop();
    } catch {
      /* bereits gestoppt */
    }
    road = null;
  },
};
