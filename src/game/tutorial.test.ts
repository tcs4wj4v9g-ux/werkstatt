import { describe, expect, it } from 'vitest';
import { checkTutorial, currentStep, TUTORIAL } from './tutorial';
import { createCar } from './market';
import { useGame, type GameState } from './store';

const base = () => ({ ...useGame.getInitialState(), started: true }) as GameState;

describe('Aufgabenbuch', () => {
  it('Schritte werden an Änderungen erkannt; der nächste offene Schritt wird angezeigt', () => {
    const p = base();
    const car = createCar('bavaria_330', [], () => 0.5, {});
    const cars = [...p.cars];
    cars[0] = car;
    // Auto gekauft
    const n = { ...p, cars, money: p.money - 3000 };
    expect(checkTutorial(p, n, []).map((t) => t.id)).toContain('buy');
    // Probefahrt
    const after = { ...n, cars: n.cars.map((c, i) => (i === 0 ? { ...c!, testDriven: true } : c)) };
    expect(checkTutorial(n, after, ['buy']).map((t) => t.id)).toEqual(['testdrive']);
    // Verkauf, Auftrag, Rennen
    expect(checkTutorial(p, { ...p, carsSold: 1 }, []).map((t) => t.id)).toEqual(['sell']);
    expect(checkTutorial(p, { ...p, jobsDone: 1 }, []).map((t) => t.id)).toEqual(['job']);
    // schon erledigt zählt nicht noch einmal
    expect(checkTutorial(p, { ...p, carsSold: 1 }, ['sell'])).toEqual([]);
    expect(currentStep([])?.id).toBe('buy');
    expect(currentStep(TUTORIAL.map((t) => t.id))).toBeNull();
    // vor dem Spielstart nichts
    expect(checkTutorial(p, { ...p, carsSold: 1, started: false }, [])).toEqual([]);
  });
});
