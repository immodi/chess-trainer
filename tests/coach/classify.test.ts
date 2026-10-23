import { describe, expect, it } from 'vitest';
import {
  classifyMove,
  isProblem,
  labelForLoss,
} from '../../src/coach/classify';
import type { PositionEval } from '../../src/coach/classify';
import { winPercentFromCp } from '../../src/engine/evalUtils';

function position(win: number, bestMove: string | null = null): PositionEval {
  return { sideToMove: 'w', bestMove, cp: 0, win, pv: bestMove ? [bestMove] : [] };
}

describe('labelForLoss', () => {
  it('uses the SPEC 6.4 thresholds', () => {
    expect(labelForLoss(0, false)).toBe('good');
    expect(labelForLoss(1.99, false)).toBe('good');
    expect(labelForLoss(2, false)).toBe('ok');
    expect(labelForLoss(4.99, false)).toBe('ok');
    expect(labelForLoss(5, false)).toBe('inaccuracy');
    expect(labelForLoss(9.99, false)).toBe('inaccuracy');
    expect(labelForLoss(10, false)).toBe('mistake');
    expect(labelForLoss(19.99, false)).toBe('mistake');
    expect(labelForLoss(20, false)).toBe('blunder');
  });

  it('labels the engine move best regardless of the loss', () => {
    expect(labelForLoss(0, true)).toBe('best');
  });
});

describe('classifyMove', () => {
  it('measures the loss from the mover point of view', () => {
    const result = classifyMove(position(60, 'e2e4'), position(40), 'e2e4');
    expect(result.winBefore).toBe(60);
    expect(result.winAfter).toBe(60);
    expect(result.loss).toBe(0);
    expect(result.label).toBe('best');
    expect(result.best).toBe(true);
  });

  it('does not clamp away a real loss', () => {
    const result = classifyMove(position(70, 'g1f3'), position(55), 'e2e4');
    expect(result.winAfter).toBe(45);
    expect(result.loss).toBe(25);
    expect(result.label).toBe('blunder');
  });

  it('never returns a negative loss', () => {
    const result = classifyMove(position(40, 'g1f3'), position(20), 'e2e4');
    expect(result.loss).toBe(0);
  });

  it('does not call a mate-to-+9 transition a blunder', () => {
    const before = position(100, 'd1h5');
    const after: PositionEval = {
      sideToMove: 'b',
      bestMove: null,
      cp: -900,
      win: winPercentFromCp(-900),
      pv: [],
    };
    const result = classifyMove(before, after, 'd1h5');
    expect(result.label).toBe('best');
    expect(result.loss).toBeLessThan(5);
  });

  it('marks only inaccuracy and worse as a problem', () => {
    expect(isProblem('best')).toBe(false);
    expect(isProblem('good')).toBe(false);
    expect(isProblem('ok')).toBe(false);
    expect(isProblem('inaccuracy')).toBe(true);
    expect(isProblem('mistake')).toBe(true);
    expect(isProblem('blunder')).toBe(true);
  });
});
