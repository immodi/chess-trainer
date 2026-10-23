import { describe, expect, it } from 'vitest';
import { computeThreats, isThreatAnswerCorrect, threatTargets } from '../../src/coach/threats';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('computeThreats', () => {
  it('finds no threats in the starting position (negative fixture)', () => {
    expect(computeThreats(START)).toEqual([]);
  });

  it('finds a capture threat and its value (positive fixture)', () => {
    expect(computeThreats('3rk3/8/8/8/8/8/8/K2Q4 w - - 0 1')).toEqual([
      { kind: 'capture', squares: ['d1'], value: 9, move: 'd8d1' },
    ]);
  });

  it('finds a mate-in-one threat, marking king and mating square', () => {
    expect(computeThreats('k2q4/8/8/8/8/8/5PPP/6K1 w - - 0 1')).toEqual([
      { kind: 'mate', squares: ['g1', 'd1'], value: 100, move: 'd8d1' },
    ]);
  });

  it('does not ask about threats while the user is in check', () => {
    expect(computeThreats('4k3/4r3/8/8/8/8/8/4K3 w - - 0 1')).toBeUndefined();
  });

  it('ranks mate above material', () => {
    const threats = computeThreats('k2q4/8/8/8/8/8/5PPP/6K1 w - - 0 1');
    expect(threats?.[0]?.kind).toBe('mate');
  });

  it('finds a knight fork threat (positive fixture)', () => {
    expect(computeThreats('4k3/8/8/2n5/8/8/8/2R1K3 w - - 0 1')).toEqual([
      {
        kind: 'fork',
        squares: ['c1', 'e1'],
        value: 5,
        move: 'c5d3',
        actor: 'd3',
        targets: ['c1', 'e1'],
      },
    ]);
  });

  it('finds a pin threat (positive fixture)', () => {
    expect(computeThreats('4k3/8/8/5b2/8/5N2/8/3QK3 w - - 0 1')).toEqual([
      {
        kind: 'pin',
        squares: ['f3'],
        value: 3,
        move: 'f5g4',
        actor: 'g4',
        targets: ['f3', 'd1'],
      },
    ]);
  });

  it('finds a skewer threat (positive fixture)', () => {
    const threats = computeThreats('r3k3/8/8/8/n7/8/Q7/R3K3 w - - 0 1') ?? [];
    expect(threats).toContainEqual(
      expect.objectContaining({
        kind: 'skewer',
        squares: ['a1'],
        value: 5,
        actor: 'a8',
        targets: ['a2', 'a1'],
      }),
    );
  });
});

describe('threatTargets', () => {
  it('collects every square that has to be marked, once', () => {
    const threats = computeThreats('k2q4/8/8/8/8/8/5PPP/6K1 w - - 0 1') ?? [];
    expect(threatTargets(threats).sort()).toEqual(['d1', 'g1']);
  });
});

describe('isThreatAnswerCorrect', () => {
  const threats = computeThreats('3rk3/8/8/8/8/8/8/K2Q4 w - - 0 1') ?? [];

  it('accepts the full target set', () => {
    expect(isThreatAnswerCorrect(threats, ['d1'], 1)).toBe(true);
  });

  it('accepts one extra square', () => {
    expect(isThreatAnswerCorrect(threats, ['d1', 'e2'], 1)).toBe(true);
  });

  it('rejects two extra squares', () => {
    expect(isThreatAnswerCorrect(threats, ['d1', 'e2', 'f3'], 1)).toBe(false);
  });

  it('rejects a missing target', () => {
    expect(isThreatAnswerCorrect(threats, [], 1)).toBe(false);
  });

  it('treats "Nothing" as correct only when nothing is threatened', () => {
    expect(isThreatAnswerCorrect([], [], 1)).toBe(true);
    expect(isThreatAnswerCorrect([], ['d1'], 1)).toBe(false);
  });
});
