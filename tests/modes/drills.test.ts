import { describe, expect, it } from 'vitest';
import type { HangingPiece } from '../../src/coach/hanging';
import type { Threat } from '../../src/coach/threats';
import type { Puzzle } from '../../src/data/puzzles';
import { buildHangingDrillQueue, buildThreatDrillQueue } from '../../src/modes/drills';

const puzzles: Puzzle[] = [
  {
    id: 'mate-fixture',
    fen: '7k/p7/5KQ1/8/2B5/8/8/8 b - - 0 1',
    moves: 'a7a6 g6g7',
    rating: 800,
    themes: ['mateIn1'],
  },
  {
    id: 'rook-fixture',
    fen: '4k3/8/8/8/8/8/8/R3K3 b - - 0 1',
    moves: 'e8d8 a1a8',
    rating: 900,
    themes: ['backRankMate'],
  },
  {
    id: 'back-rank-fixture',
    fen: '6k1/5ppp/8/8/8/8/8/R3K3 b - - 0 1',
    moves: 'g8f8 a1a8',
    rating: 1000,
    themes: ['backRankMate'],
  },
];

const threat: Threat = {
  kind: 'capture',
  squares: ['e5'],
  value: 1,
  move: 'e5e6',
};

const piece = (square: HangingPiece['square']): HangingPiece => ({
  square,
  color: 'w',
  type: 'n',
  value: 3,
});

describe('threat drill queue', () => {
  it('includes failed positions and mixes in quiet positions', async () => {
    const queue = await buildThreatDrillQueue(
      puzzles,
      ['failed-position'],
      async (fen) => {
        if (fen === 'failed-position') return [threat];
        if (fen.includes('7k')) return [];
        return [threat];
      },
      4,
      () => 0.5,
    );

    expect(queue.length).toBe(4);
    expect(queue.filter((entry) => entry.threats.length === 0).length).toBe(1);
    expect(queue.some((entry) => entry.fen === 'failed-position')).toBe(true);
  });

  it('skips positions where the threat question does not apply', async () => {
    const queue = await buildThreatDrillQueue(
      puzzles,
      [],
      async () => undefined,
      4,
    );
    expect(queue).toEqual([]);
  });
});

describe('hanging drill queue', () => {
  it('keeps only positions with zero to three hanging pieces', async () => {
    const queue = await buildHangingDrillQueue(
      puzzles,
      async (fen) => {
        if (fen.includes('7k')) return [piece('e5'), piece('d4'), piece('c3'), piece('b2')];
        if (fen.includes('6k1')) return [];
        return [piece('e5')];
      },
      3,
      () => 0.5,
    );

    expect(queue.length).toBeGreaterThan(0);
    for (const entry of queue) expect(entry.pieces.length).toBeLessThanOrEqual(3);
  });
});
