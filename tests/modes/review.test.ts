import { describe, expect, it } from 'vitest';
import type { Square } from 'chess.js';
import type { PositionEval } from '../../src/coach/classify';
import { applyMove, newGame } from '../../src/modes/play';
import type { GameState } from '../../src/modes/play';
import { buildReview, positionFens } from '../../src/modes/review';

function play(state: GameState, from: string, to: string): GameState {
  const next = applyMove(state, { from: from as Square, to: to as Square });
  if (!next) throw new Error(`Expected ${from}${to} to be legal`);
  return next;
}

function evaluation(
  sideToMove: 'w' | 'b',
  win: number,
  bestMove: string | null = null,
): PositionEval {
  return { sideToMove, bestMove, cp: 0, win, pv: bestMove ? [bestMove] : [] };
}

describe('buildReview', () => {
  it('classifies the user moves and keeps the eval graph in White terms', async () => {
    let game = newGame('w', 2);
    game = play(game, 'e2', 'e4');
    game = play(game, 'e7', 'e5');
    game = play(game, 'd1', 'h5');
    game = play(game, 'b8', 'c6');

    const fens = positionFens(game);
    const byFen = new Map<string, PositionEval>([
      [fens[0]!, evaluation('w', 50, 'e2e4')],
      [fens[1]!, evaluation('b', 50)],
      [fens[2]!, evaluation('w', 55, 'g1f3')],
      [fens[3]!, evaluation('b', 60)],
      [fens[4]!, evaluation('w', 40)],
    ]);

    const summary = await buildReview(game, async (fen) => byFen.get(fen) ?? null, [
      { fen: fens[2]!, correct: false, ms: 900, targets: 1, marked: 0, at: 0 },
    ]);

    expect(summary.userMoves).toBe(2);
    expect(summary.counts.best).toBe(1);
    expect(summary.counts.mistake).toBe(1);
    expect(summary.averageLoss).toBeCloseTo(7.5, 5);
    expect(summary.evalGraph).toEqual([50, 50, 55, 40, 40]);
    expect(summary.mistakes).toHaveLength(1);
    expect(summary.mistakes[0]?.played).toBe('d1h5');
    expect(summary.mistakes[0]?.best).toBe('g1f3');

    const queenMove = summary.moves.find((move) => move.san === 'Qh5');
    expect(queenMove?.label).toBe('mistake');
    expect(queenMove?.hinted).toBe(false);
    expect(queenMove?.rushed).toBe(true);
  });

  it('flags a hinted move', async () => {
    let game = newGame('w', 2);
    game = play(game, 'e2', 'e4');
    game = play(game, 'e7', 'e5');
    game = { ...game, hints: [{ ply: 0, level: 2 }] };

    const fens = positionFens(game);
    const summary = await buildReview(game, async (fen) =>
      fen === fens[0]
        ? evaluation('w', 50, 'e2e4')
        : evaluation('b', 50),
    );

    expect(summary.moves.find((move) => move.san === 'e4')?.hinted).toBe(true);
  });
});
