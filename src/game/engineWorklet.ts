/**
 * Motorklang aus Zündpulsen (AudioWorklet).
 *
 * Grundidee (physikalisch angelehnt, vgl. Pulse-Train-Modelle der Motorklang-Synthese): Jeder Zylinder stößt beim
 * Öffnen des Auslassventils einen kurzen Druckpuls ins Abgasrohr. Das Ohr hört die Folge dieser Pulse:
 * - Zündabstand und Zündfolge bestimmen die Grundordnung (Drehzahl/60 × Zylinder/2).
 * - Pulse, die im selben Abgasstrang ungleichmäßig dicht aufeinander folgen (Crossplane-V8), verstärken bzw. schwächen
 *   sich gegenseitig – das erzeugt die „halben Ordnungen“, das typische Blubbern.
 * - Ungleich lange Krümmerrohre (Boxer) versetzen die Pulse zeitlich – das Grummeln.
 * - Jedes Rohr klingt mit seiner Länge nach (Kammfilter), der Endtopf (Filter danach im Web-Audio-Graph) dämpft die Höhen.
 */
import type { EngineSound } from './audio';

export interface EngineVoice {
  /** Zündwinkel je Zylinder (Grad im 720°-Arbeitsspiel) und Abgasstrang (0/1). */
  fire: number[];
  bank: number[];
  /** Verzögerung je Zylinder durch die Krümmerlänge (ms). */
  header: number[];
  /** Resonanz des Pulses (Hz) und Abklingzeit (ms) bei Leerlauf. */
  ring: number;
  decay: number;
  /** Anteil Strömungsrauschen im Puls. */
  rough: number;
  /** Kammfilter der Abgasstränge: Laufzeit (ms) und Rückkopplung. */
  pipe: number[];
  feedback: number;
  /** Wie stark dicht folgende Pulse im selben Strang die Lautstärke verändern (Blubbern). */
  interaction: number;
  /** Lautstärke-Streuung je Zylinder (Fertigung, Ventile) – macht den Lauf lebendig. */
  spread: number;
  /** Stereobreite der beiden Stränge (0 = mono). */
  width: number;
}

const even = (n: number) => Array.from({ length: n }, (_, i) => (720 / n) * i);

/** Klangcharakter aus dem Motor- und Auspuffzustand ableiten. */
export function engineVoice(p: EngineSound): EngineVoice {
  const cyl = p.cylinders ?? 4;
  const liters = p.liters ?? 2;
  const perCyl = liters / cyl;
  // Größere Einzelhubräume klingen tiefer; Fächerkrümmer und Sportanlage machen die Pulse härter und heller.
  const ring = (p.diesel ? 95 : 150) * Math.pow(0.5 / Math.max(0.25, perCyl), 0.35) * (p.headers ? 1.18 : 1) * (p.exhaust === 'sport' ? 1.08 : 1);
  const decay = (p.diesel ? 11 : 8) * (p.headers ? 0.85 : 1);
  const base = { ring, decay, rough: p.diesel ? 0.45 : 0.22, feedback: 0.42, interaction: 0, spread: 0.06, width: 0 };
  switch (p.layout) {
    case 'R5':
      return { ...base, fire: even(5), bank: [0, 0, 0, 0, 0], header: [0, 0, 0, 0, 0], pipe: [6.5, 6.5], spread: 0.1, rough: base.rough + 0.04 };
    case 'R6':
      // Reihensechser: gleichmäßige Zündfolge, zwei Krümmerstränge (1–3 und 4–6) – seidig, hell
      return { ...base, fire: [0, 480, 240, 600, 120, 360], bank: [0, 0, 0, 1, 1, 1], header: [0, 0, 0, 0, 0, 0], pipe: [5.2, 5.6], feedback: 0.38, ring: ring * 1.12, spread: 0.035, width: 0.25 };
    case 'V6':
      return { ...base, fire: even(6), bank: [0, 1, 0, 1, 0, 1], header: [0, 0, 0, 0, 0, 0], pipe: [6, 6.6], spread: 0.07, width: 0.4, rough: base.rough + 0.05 };
    case 'V8':
      if (p.flatPlane)
        // Flache Kurbelwelle: Bänke zünden abwechselnd, je Strang gleichmäßig – kreischt hell wie zwei Vierzylinder
        return { ...base, fire: even(8), bank: [0, 1, 0, 1, 0, 1, 0, 1], header: Array(8).fill(0), pipe: [4.4, 4.6], ring: ring * 1.35, decay: decay * 0.7, feedback: 0.36, spread: 0.04, width: 0.55 };
      // Crossplane: Zündfolge 1-8-4-3-6-5-7-2 – je Bank ungleichmäßige Abstände (L R L L R L R R): Blubbern
      return { ...base, fire: even(8), bank: [0, 1, 0, 0, 1, 0, 1, 1], header: Array(8).fill(0), pipe: [7.5, 8.1], ring: ring * 0.9, interaction: 1.6, spread: 0.08, width: 0.55, feedback: 0.48 };
    case 'B4':
      // Boxer: gleichmäßige Zündung, aber ungleich lange Krümmer je Seite – versetzte Pulse, Grummeln
      return { ...base, fire: even(4), bank: [0, 1, 0, 1], header: p.air ? [0, 0.4, 0.15, 0.55] : [0, 1.4, 0.2, 1.6], pipe: [5.5, 6.2], interaction: 0.3, spread: 0.09, width: 0.4, rough: base.rough + 0.06 };
    case 'B6':
      // Sechszylinder-Boxer: gleich lange Krümmer, harte helle Pulse – heiseres Kreischen
      return { ...base, fire: even(6), bank: [0, 1, 0, 1, 0, 1], header: Array(6).fill(0), pipe: [4.8, 5.1], ring: ring * 1.3, decay: decay * 0.75, spread: 0.05, width: 0.45, rough: base.rough + 0.08 };
    default:
      // Vierzylinder in Reihe: kernig, zwei Zündungen je Umdrehung
      return { ...base, fire: [0, 180, 540, 360], bank: [0, 0, 0, 0], header: [0, 0, 0, 0], pipe: [6, 6], spread: 0.07 };
  }
}

/** Quelltext des Worklets (als Blob geladen, damit es ohne eigene Datei im PWA-Cache funktioniert). */
export const ENGINE_WORKLET = `
class EnginePulses extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 850, minValue: 0, maxValue: 12000, automationRate: 'k-rate' },
      { name: 'load', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'misfire', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.v = null;
    this.angle = 0;
    this.pulses = [];
    this.seed = 12345;
    this.last = [-1, -1];
    this.t = 0;
    this.combs = [new Float32Array(2048), new Float32Array(2048)];
    this.ci = [0, 0];
    this.gainCyl = [];
    this.port.onmessage = (e) => {
      this.v = e.data;
      this.gainCyl = this.v.fire.map(() => 1 + (this.rand() * 2 - 1) * this.v.spread);
    };
  }
  rand() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  process(inputs, outputs, params) {
    const out = outputs[0];
    const L = out[0];
    const R = out[1] || out[0];
    const v = this.v;
    if (!v) return true;
    const rpm = params.rpm[0];
    const load = params.load[0];
    const miss = params.misfire[0];
    const sr = sampleRate;
    const degPerSample = (rpm / 60) * 360 / sr;
    const msToDeg = (rpm / 60) * 360 / 1000;
    // Pulse sind kurz genug, um sich bei hoher Drehzahl nicht zu einem Brei zu überlagern
    const period = 60 / Math.max(300, rpm) / (v.fire.length / 2);
    const decay = Math.max(0.0012, Math.min(v.decay / 1000, period * 0.85)) * (1 - load * 0.25);
    const amp = 0.35 + load * 0.75;
    const rough = v.rough * (0.5 + load);
    const ringHz = v.ring * (1 + load * 0.25 + rpm / 9000);
    const fb = v.feedback;
    const d0 = Math.min(2040, Math.round(v.pipe[0] * sr / 1000));
    const d1 = Math.min(2040, Math.round(v.pipe[1] * sr / 1000));
    const n = L.length;
    for (let i = 0; i < n; i++) {
      const prev = this.angle;
      let a = prev + degPerSample;
      for (let c = 0; c < v.fire.length; c++) {
        let fa = v.fire[c] + v.header[c] * msToDeg;
        fa = fa % 720;
        const crossed = a < 720 ? prev < fa && a >= fa : prev < fa || a - 720 >= fa;
        if (!crossed) continue;
        if (miss > 0 && this.rand() < miss * 0.22) continue;
        const b = v.bank[c];
        // Abstand zum letzten Puls im selben Strang: dicht folgende Pulse prallen aufeinander (lauter), große Lücken leiser
        let k = 1;
        if (v.interaction > 0 && this.last[b] >= 0) {
          const gap = this.t - this.last[b];
          const nominal = period * 2 * sr;
          k = 1 + v.interaction * (nominal / Math.max(1, gap) - 1) * 0.5;
          k = Math.max(0.3, Math.min(2.4, k));
        }
        this.last[b] = this.t;
        this.pulses.push({ b, age: 0, a: amp * this.gainCyl[c] * k, ph: 0 });
      }
      this.angle = a >= 720 ? a - 720 : a;
      this.t++;
      let s0 = 0;
      let s1 = 0;
      const w = 2 * Math.PI * ringHz / sr;
      for (let p = this.pulses.length - 1; p >= 0; p--) {
        const q = this.pulses[p];
        const t = q.age / sr;
        // schneller Anstieg, exponentielles Abklingen; Ton der Rohrresonanz plus Strömungsrauschen
        const env = (1 - Math.exp(-t / 0.0004)) * Math.exp(-t / decay);
        const x = q.a * env * (Math.sin(q.ph) * (1 - rough) + (this.rand() * 2 - 1) * rough);
        q.ph += w;
        q.age++;
        if (q.b) s1 += x; else s0 += x;
        if (t > decay * 7) this.pulses.splice(p, 1);
      }
      // Rohrresonanz je Strang (Kammfilter)
      const c0 = this.combs[0];
      const c1 = this.combs[1];
      const y0 = s0 + fb * c0[(this.ci[0] - d0 + 2048) % 2048];
      const y1 = s1 + fb * c1[(this.ci[1] - d1 + 2048) % 2048];
      c0[this.ci[0]] = y0;
      c1[this.ci[1]] = y1;
      this.ci[0] = (this.ci[0] + 1) % 2048;
      this.ci[1] = (this.ci[1] + 1) % 2048;
      const wd = v.width;
      L[i] = (y0 * (1 + wd) + y1 * (1 - wd)) * 0.5;
      R[i] = (y1 * (1 + wd) + y0 * (1 - wd)) * 0.5;
    }
    return true;
  }
}
registerProcessor('engine-pulses', EnginePulses);
`;
