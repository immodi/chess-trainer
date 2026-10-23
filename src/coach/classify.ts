import type { Color } from 'chess.js';
import { CLASSIFY } from './config';

/** SPEC 6.4 labels, from best to worst. */
export type MoveLabel = 'best' | 'good' | 'ok' | 'inaccuracy' | 'mistake' | 'blunder';

/** One analysed position, from the point of view of the side to move. */
export interface PositionEval {
  sideToMove: Color;
  /** Best move in UCI, when the engine reported one. */
  bestMove: string | null;
  /** Score for the side to move in centipawns; mate is mapped near ±10000. */
  cp: number;
  /** Win probability for the side to move, 0-100. */
  win: number;
  /** Principal variation in UCI, best first. */
  pv: string[];
}

export interface MoveClassification {
  label: MoveLabel;
  /** Win% points given away, clamped at 0. */
  loss: number;
  /** True when the played move was the engine's first choice. */
  best: boolean;
  /** Win% for the mover before and after the move. */
  winBefore: number;
  winAfter: number;
}

export function labelForLoss(loss: number, isBest: boolean): MoveLabel {
  if (isBest) return 'best';
  if (loss < CLASSIFY.good) return 'good';
  if (loss < CLASSIFY.ok) return 'ok';
  if (loss < CLASSIFY.mistake) return 'inaccuracy';
  if (loss < CLASSIFY.blunder) return 'mistake';
  return 'blunder';
}

/**
 * Classifies the mover's move (SPEC 6.4).
 *
 * `before` is the position before the move (mover to move) and `after` is the
 * position after it (opponent to move). Win% is always converted to the
 * mover's point of view before subtracting, so a strong move never looks like
 * a loss because the side to move changed.
 */
export function classifyMove(
  before: PositionEval,
  after: PositionEval,
  playedUci: string,
): MoveClassification {
  const winBefore = clampPercent(before.win);
  const winAfter = clampPercent(100 - after.win);
  const loss = Math.max(0, winBefore - winAfter);
  const best = before.bestMove !== null && before.bestMove === playedUci;
  return {
    label: labelForLoss(loss, best),
    loss,
    best,
    winBefore,
    winAfter,
  };
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/** Labels that get a feedback card (SPEC 6.7 Mode 1). */
export function isProblem(label: MoveLabel): boolean {
  return label === 'inaccuracy' || label === 'mistake' || label === 'blunder';
}
