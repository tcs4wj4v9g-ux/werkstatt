/**
 * Aufgabenbuch für Einsteiger: geführte erste Schritte mit kurzer Anleitung und kleiner Belohnung.
 *
 * Erkannt wird jeder Schritt an einer Änderung im Spielstand (vorher → nachher), nicht an einzelnen Aktionen –
 * so bleibt die Spiellogik unberührt. Der Fortschritt gilt je Gerät (eigener Speicher `gk-tutorial`), im Koop hat also
 * jeder Spieler sein eigenes Aufgabenbuch. Belohnungen gibt es nur im Einzelspieler (sonst zahlte das gemeinsame Konto
 * dieselbe Aufgabe mehrfach).
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GameState } from './store';
import type { CarInstance } from './types';

export interface TutorialStep {
  id: string;
  title: string;
  /** So geht's – kurz und konkret. */
  how: string;
  reward: number;
  /** Schritt erledigt durch diese Änderung? */
  done(prev: GameState, next: GameState): boolean;
}

const owned = (s: GameState) => s.cars.filter((c): c is CarInstance => !!c && !c.job && !c.junk && !c.bare);
const byUid = (s: GameState) => new Map(s.cars.filter((c): c is CarInstance => !!c).map((c) => [c.uid, c]));
const anyCar = (prev: GameState, next: GameState, f: (a: CarInstance, b: CarInstance) => boolean) => {
  const before = byUid(prev);
  return next.cars.some((b) => {
    const a = b && before.get(b.uid);
    return !!a && !!b && f(a, b);
  });
};

export const TUTORIAL: TutorialStep[] = [
  {
    id: 'buy',
    title: 'Erstes Auto kaufen',
    how: 'Am Computer „Gebrauchtwagen“ öffnen, ein günstiges Angebot ansehen und kaufen. Nach dem Kauf steht es auf einem freien Stellplatz.',
    reward: 300,
    done: (p, n) => owned(n).length > owned(p).length && n.money < p.money,
  },
  {
    id: 'file',
    title: 'Fahrzeugakte lesen',
    how: 'Zum Auto gehen und „Akte“ antippen: Dort stehen Beschwerden, bekannte Mängel und der Wert.',
    reward: 100,
    done: (p, n) => n.panel === 'file' && p.panel !== 'file',
  },
  {
    id: 'tool',
    title: 'Werkzeug nehmen',
    how: 'Am Werkzeugwagen bzw. -schrank einen Schlüssel oder eine Nuss nehmen – unten in der Werkzeugleiste auswählen.',
    reward: 100,
    done: (p, n) => n.tool !== 'hand' && p.tool !== n.tool,
  },
  {
    id: 'engine',
    title: 'Motor starten und hinhören',
    how: 'Am Auto „Motor starten“: Klappern, Rauch oder unruhiger Lauf verraten Schäden. Warm laufen lassen und Gas geben.',
    reward: 150,
    done: (p, n) => n.engineBay >= 0 && p.engineBay < 0,
  },
  {
    id: 'part',
    title: 'Ein Bauteil tauschen',
    how: 'Defektes Teil finden (Akte, hören, ansehen), Schrauben lösen, Teil ausbauen, Ersatzteil am Computer kaufen und einbauen.',
    reward: 300,
    done: (p, n) => anyCar(p, n, (a, b) => b.partsSpent > a.partsSpent),
  },
  {
    id: 'testdrive',
    title: 'Probefahrt machen',
    how: 'Am Auto „Probefahrt“: mindestens 45 s fahren und auf dem Werkstatt-Vorplatz anhalten. Unterwegs merkt man, ob alles stimmt.',
    reward: 200,
    done: (p, n) => anyCar(p, n, (a, b) => !a.testDriven && !!b.testDriven),
  },
  {
    id: 'wash',
    title: 'Auto waschen',
    how: 'Auto auf den Waschplatz stellen: abspritzen, einschäumen, bürsten, abspülen. Ein sauberes Auto verkauft sich besser.',
    reward: 150,
    done: (p, n) => anyCar(p, n, (a, b) => Object.keys(b.zones).some((z) => (b.zones as Record<string, { dirt: number }>)[z].dirt < (a.zones as Record<string, { dirt: number }>)[z].dirt - 0.15)),
  },
  {
    id: 'sell',
    title: 'Auto verkaufen',
    how: 'Am Auto „Verkaufen“: Das Angebot richtet sich nach Zustand und Marktlage. Einmal verhandeln ist erlaubt.',
    reward: 300,
    done: (p, n) => n.carsSold > p.carsSold,
  },
  {
    id: 'job',
    title: 'Kundenauftrag erledigen',
    how: 'Am Computer „Aufträge“: einen Auftrag annehmen, die gewünschte Arbeit erledigen und das Auto zurückgeben.',
    reward: 400,
    done: (p, n) => n.jobsDone > p.jobsDone,
  },
  {
    id: 'tuning',
    title: 'Tuningteil montieren',
    how: 'Am Computer Teile bestellen (Optik, Reifen, Fahrwerk …) und an der Tuning-Werkbank montieren.',
    reward: 300,
    done: (p, n) => anyCar(p, n, (a, b) => Object.values(b.visual ?? {}).filter(Boolean).length > Object.values(a.visual ?? {}).filter(Boolean).length),
  },
  {
    id: 'race',
    title: 'Ein Rennen fahren',
    how: 'Am Computer „Rennen“: Rennen des Tages starten. Medaillen bringen Preisgeld – Tuning bis an die Klassengrenze hilft.',
    reward: 500,
    done: (p, n) => !!n.raceResult && !p.raceResult,
  },
];

export const useTutorial = create<{ done: string[]; hidden: boolean }>()(
  persist(() => ({ done: [] as string[], hidden: false as boolean }), { name: 'gk-tutorial' }),
);

/** Aktueller (erster offener) Schritt oder null, wenn alles erledigt ist. */
export const currentStep = (done: string[]) => TUTORIAL.find((t) => !done.includes(t.id)) ?? null;

/**
 * Prüft nach jeder Änderung, ob ein Schritt erledigt wurde. `reward(step)` zahlt die Belohnung aus (oder nicht, im Koop).
 * Liefert die frisch erledigten Schritte.
 */
export function checkTutorial(prev: GameState, next: GameState, done: string[]): TutorialStep[] {
  if (!next.started) return [];
  return TUTORIAL.filter((t) => !done.includes(t.id) && t.done(prev, next));
}
