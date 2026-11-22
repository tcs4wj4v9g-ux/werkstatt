import { describe, expect, it } from 'vitest';
import { boardRows, recordBoard } from './board';
import { emptyCareer } from './career';

describe('Bestenliste', () => {
  it('Zeiten: nur Verbesserungen zählen; wer eine fremde Bestmarke unterbietet, wird gemeldet', () => {
    let c = emptyCareer();
    let r = recordBoard(c, 'eifel', false, 182.5, 'Golf', 3, 'Anna');
    expect(r.improved && r.beat === null).toBe(true);
    c = r.career;
    r = recordBoard(c, 'eifel', false, 190, 'Twingo', 4, 'Ben');
    expect(r.beat).toBeNull();
    c = r.career;
    expect(recordBoard(c, 'eifel', false, 200, 'Golf', 5, 'Anna').improved).toBe(false);
    r = recordBoard(c, 'eifel', false, 180.123, 'M4', 6, 'Ben');
    expect(r.beat).toBe('Anna');
    c = r.career;
    expect(boardRows(c.board, 'eifel', false).map((x) => [x.name, x.v])).toEqual([['Ben', 180.12], ['Anna', 182.5]]);
  });

  it('Driftpunkte: mehr ist besser, eigene Liste je Strecke', () => {
    let c = emptyCareer();
    c = recordBoard(c, 'motodrom', true, 3000, 'E36', 2, 'Anna').career;
    const r = recordBoard(c, 'motodrom', true, 4200.4, 'E46', 3, 'Ben');
    expect(r.beat).toBe('Anna');
    expect(boardRows(r.career.board, 'motodrom', true)[0]).toMatchObject({ name: 'Ben', v: 4200 });
    expect(boardRows(r.career.board, 'motodrom', false)).toEqual([]);
    // ungültige Werte werden ignoriert
    expect(recordBoard(c, 'motodrom', true, 0, 'x', 1, 'Anna').improved).toBe(false);
  });
});
