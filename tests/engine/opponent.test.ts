import { describe, expect, it } from 'vitest';
import { levelConfig, nextAdaptiveLevel, rankCandidates, sampleCandidate, chooseOpponentMove } from '../../src/engine/opponent';
import type { AnalyzeResult, EngineLine } from '../../src/engine/uci';

function line(multipv: number, cp: number, move: string): EngineLine {
  return { multipv, cp, pv: [move], depth: 12 };
}

const FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('levelConfig', () => {
  it('maps level 1-10 to the SPEC 6.3 table', () => {
    expect(levelConfig(1)).toEqual({ depth: 1, window: 40, temperature: 15 });
    expect(levelConfig(5)).toEqual({ depth: 6, window: 20, temperature: 6 });
    expect(levelConfig(10)).toEqual({ depth: 16, window: 2, temperature: 1 });
  });

  it('clamps out-of-range levels', () => {
    expect(levelConfig(0)).toEqual(levelConfig(1));
    expect(levelConfig(99)).toEqual(levelConfig(10));
    expect(levelConfig(3.4)).toEqual(levelConfig(3));
  });
});

describe('rankCandidates', () => {
  it('keeps only moves inside the window', () => {
    const lines = [line(1, 0, 'e2e4'), line(2, -100, 'd2d4'), line(3, -900, 'a2a3')];
    const candidates = rankCandidates(lines, levelConfig(10));
    expect(candidates.map((candidate) => candidate.move)).toEqual(['e2e4']);
  });

  it('weights losses by exp(-loss / T)', () => {
    const lines = [line(1, 0, 'e2e4'), line(2, -300, 'd2d4')];
    const candidates = rankCandidates(lines, levelConfig(1));
    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.loss).toBe(0);
    expect(candidates[1]?.loss).toBeGreaterThan(15);
    expect(candidates[1]?.weight).toBeLessThan(candidates[0]?.weight ?? 0);
  });

  it('ignores lines without a score or a move', () => {
    const lines: EngineLine[] = [
      { multipv: 1, pv: [], depth: 5 },
      { multipv: 2, cp: 20, pv: [], depth: 5 },
      line(3, 10, 'e2e4'),
    ];
    expect(rankCandidates(lines, levelConfig(5)).map((candidate) => candidate.move)).toEqual(['e2e4']);
  });
});

describe('sampleCandidate', () => {
  const candidates = [
    { move: 'a', loss: 0, weight: 1 },
    { move: 'b', loss: 5, weight: 1 },
  ];

  it('picks the first candidate for a low random value', () => {
    expect(sampleCandidate(candidates, () => 0)?.move).toBe('a');
  });

  it('picks the last candidate for a high random value', () => {
    expect(sampleCandidate(candidates, () => 0.99)?.move).toBe('b');
  });

  it('returns null for an empty list', () => {
    expect(sampleCandidate([], () => 0)).toBeNull();
  });
});

describe('chooseOpponentMove', () => {
  const analyze = async (): Promise<AnalyzeResult> => ({
    lines: [line(1, 30, 'e2e4'), line(2, -400, 'a2a3')],
    bestMove: 'e2e4',
    stopped: false,
  });

  it('asks for MultiPV 5 at the level depth with the time cap', async () => {
    const calls: unknown[] = [];
    await chooseOpponentMove(FEN, 7, async (fen, options) => {
      calls.push({ fen, options });
      return analyze();
    });

    expect(calls).toEqual([
      {
        fen: FEN,
        options: { depth: levelConfig(7).depth, movetime: 1500, multipv: 5 },
      },
    ]);
  });

  it('returns a move from the surviving lines', async () => {
    const result = await chooseOpponentMove(FEN, 10, analyze, () => 0);
    expect(result?.move).toBe('e2e4');
  });

  it('returns null when the search was preempted', async () => {
    const result = await chooseOpponentMove(
      FEN,
      3,
      async () => ({ lines: [], bestMove: null, stopped: true }),
      () => 0,
    );
    expect(result).toBeNull();
  });

  it('falls back to bestmove when no line carries a score', async () => {
    const result = await chooseOpponentMove(
      FEN,
      3,
      async () => ({
        lines: [{ multipv: 1, pv: [], depth: 3 }],
        bestMove: 'd2d4',
        stopped: false,
      }),
      () => 0,
    );
    expect(result?.move).toBe('d2d4');
  });
});

describe('nextAdaptiveLevel', () => {
  it('promotes a clean win', () => {
    expect(nextAdaptiveLevel({ level: 2, blundersPer100: 0, result: 'win' })).toBe(3);
  });

  it('demotes after a loss', () => {
    expect(nextAdaptiveLevel({ level: 5, blundersPer100: 0, result: 'loss' })).toBe(4);
  });

  it('demotes a blunder-heavy win', () => {
    expect(nextAdaptiveLevel({ level: 5, blundersPer100: 8, result: 'win' })).toBe(4);
  });

  it('holds on a draw', () => {
    expect(nextAdaptiveLevel({ level: 5, blundersPer100: 4, result: 'draw' })).toBe(5);
  });

  it('clamps to 1-10', () => {
    expect(nextAdaptiveLevel({ level: 1, blundersPer100: 0, result: 'loss' })).toBe(1);
    expect(nextAdaptiveLevel({ level: 10, blundersPer100: 0, result: 'win' })).toBe(10);
  });
});
