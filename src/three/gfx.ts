import { create } from 'zustand';

// Grafikstufen. Die Wahl liegt getrennt vom Spielstand im Gerätespeicher.

export type GfxLevel = 'low' | 'medium' | 'high';
export interface GfxSettings {
  /** Obergrenze der Pixeldichte. */
  dpr: number;
  shadows: boolean;
  shadowMap: number;
  antialias: boolean;
  /** Feines Karosserienetz und volle Anbauteile. */
  detail: 0 | 1;
  /** Klarlack-Material (aufwendiger) statt einfachem Lack. */
  clearcoat: boolean;
  /** Zusätzliche Dekoration in der Werkstatt. */
  decor: boolean;
  /** Auflösung des Spiegelbilds der Umgebung. */
  envSize: number;
  /** Anzahl der Punktlichter in der Halle. */
  lights: number;
}

export const GFX: Record<GfxLevel, GfxSettings> = {
  low: { dpr: 1, shadows: false, shadowMap: 512, antialias: false, detail: 0, clearcoat: false, decor: false, envSize: 128, lights: 1 },
  medium: { dpr: 1.5, shadows: true, shadowMap: 1024, antialias: true, detail: 1, clearcoat: true, decor: true, envSize: 256, lights: 2 },
  high: { dpr: 2, shadows: true, shadowMap: 2048, antialias: true, detail: 1, clearcoat: true, decor: true, envSize: 512, lights: 4 },
};
export const GFX_LABEL: Record<GfxLevel, string> = { low: 'Niedrig', medium: 'Mittel', high: 'Hoch' };

const KEY = 'garage-kings-gfx';
const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
/** Testmodus (`?test`): niedrigste Stufe mit halber Auflösung – nur für automatisierte Browser-Tests ohne Grafikkarte. */
export const TEST_MODE = params.has('test');

function load(): { level: GfxLevel; auto: boolean } {
  const forced = params.get('gfx');
  if (forced === 'low' || forced === 'medium' || forced === 'high') return { level: forced, auto: false };
  if (TEST_MODE) return { level: 'low', auto: false };
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v && (v.level === 'low' || v.level === 'medium' || v.level === 'high')) return { level: v.level, auto: !!v.auto };
  } catch {
    /* kein Speicher verfügbar */
  }
  return { level: 'medium', auto: true };
}

interface GfxState {
  level: GfxLevel;
  /** Automatik: senkt Auflösung und Stufe, wenn die Bildrate dauerhaft zu niedrig ist. */
  auto: boolean;
  /** Von der Automatik zusätzlich abgesenkte Pixeldichte (1 = keine Absenkung). */
  scale: number;
  fps: number;
  set(level: GfxLevel, auto?: boolean): void;
}

export const useGfx = create<GfxState>((set) => ({
  ...load(),
  scale: 1,
  fps: 0,
  set: (level, auto = false) => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ level, auto }));
    } catch {
      /* ohne Speicher gilt die Wahl nur für diese Sitzung */
    }
    set({ level, auto, scale: 1 });
  },
}));

export const gfx = () => GFX[useGfx.getState().level];
export const useGfxSettings = () => GFX[useGfx((s) => s.level)];
