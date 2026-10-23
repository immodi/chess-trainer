import { Chess } from 'chess.js';
import type { Color } from 'chess.js';
import type { MoveLabel, PositionEval } from '../coach/classify';
import { classifyMove, isProblem } from '../coach/classify';
import { THREAT_CHECK } from '../coach/config';
import type { DetectCtx } from '../coach/detectors';
import type { Feedback } from '../coach/feedback';
import { buildFeedback } from '../coach/feedback';
import type { ThreatCheckEntry } from '../storage/progress';
import type { NewMistake } from '../storage/mistakes';
import type { GameState } from './play';
import { playedUci } from './play';

export type AnalyzePosition = (fen: string) => Promise<PositionEval | null>;

export interface ReviewMove {
  /** Index in the game's move list. */
  ply: number;
  moveNumber: number;
  color: Color;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  label: MoveLabel;
  /** Win% points lost. */
  loss: number;
  bestMove: string | null;
  feedback: Feedback | null;
  hinted: boolean;
  rushed: boolean;
}

export interface ReviewSummary {
  moves: ReviewMove[];
  /** Only the user's moves. */
  userMoves: number;
  averageLoss: number;
  counts: Record<MoveLabel, number>;
  /** White win% after each position, starting with the initial position. */
  evalGraph: number[];
  mistakes: NewMistake[];
}

const EMPTY_COUNTS: Record<MoveLabel, number> = {
  best: 0,
  good: 0,
  ok: 0,
  inaccuracy: 0,
  mistake: 0,
  blunder: 0,
};

/** Replays SAN history and returns the FEN after every ply, starting at ply 0. */
export function positionFens(game: GameState): string[] {
  const chess = new Chess();
  const fens = [chess.fen()];
  for (const move of game.moves) {
    chess.move(move.san);
    fens.push(chess.fen());
  }
  return fens;
}

/**
 * Builds a review from one analysis per position (SPEC 6.4 / 6.7 Mode 5).
 * `analyze` is injected so the classification logic can be tested without an
 * engine; the screen passes the cached engine analysis.
 */
export async function buildReview(
  game: GameState,
  analyze: AnalyzePosition,
  threatChecks: readonly ThreatCheckEntry[] = [],
  onProgress?: (done: number, total: number) => void,
  isCancelled?: () => boolean,
): Promise<ReviewSummary> {
  const fens = positionFens(game);
  const evals: Array<PositionEval | null> = [];

  for (let index = 0; index < fens.length; index += 1) {
    if (isCancelled?.()) break;
    evals.push(await analyze(fens[index]!));
    onProgress?.(index + 1, fens.length);
  }

  const evalGraph: number[] = [];
  let lastWhite = 50;
  for (const evaluation of evals) {
    if (evaluation) {
      lastWhite = evaluation.sideToMove === 'w' ? evaluation.win : 100 - evaluation.win;
    }
    evalGraph.push(lastWhite);
  }

  const moves: ReviewMove[] = [];
  const counts = { ...EMPTY_COUNTS };
  const mistakes: NewMistake[] = [];
  let userMoves = 0;
  let totalLoss = 0;

  for (let index = 0; index < game.moves.length; index += 1) {
    const move = game.moves[index]!;
    const before = evals[index];
    const after = evals[index + 1];
    if (!before || !after) continue;

    const uci = playedUci(move);
    const classification = classifyMove(before, after, uci);
    const isUserMove = move.color === game.userColor;
    const hinted = game.hints.some((hint) => hint.ply === index);
    const rushed = threatChecks.some(
      (check) =>
        check.fen === fens[index] &&
        check.targets > 0 &&
        check.ms < THREAT_CHECK.rushedMoveMs,
    );

    let feedback: Feedback | null = null;
    if (isUserMove && isProblem(classification.label)) {
      const ctx: DetectCtx = {
        fenBefore: fens[index]!,
        fenAfter: fens[index + 1]!,
        playedUci: uci,
        mover: move.color,
        bestMove: before.bestMove,
        opponentBestMove: after.bestMove,
      };
      feedback = buildFeedback(ctx, classification, before.cp, -after.cp);
    }

    if (isUserMove) {
      userMoves += 1;
      totalLoss += classification.loss;
      counts[classification.label] += 1;
      if (
        (classification.label === 'mistake' || classification.label === 'blunder') &&
        before.bestMove
      ) {
        mistakes.push({
          fen: fens[index]!,
          played: uci,
          best: before.bestMove,
          label: classification.label,
          loss: classification.loss,
        });
      }
    }

    moves.push({
      ply: index,
      moveNumber: Math.floor(index / 2) + 1,
      color: move.color,
      san: move.san,
      uci,
      fenBefore: fens[index]!,
      fenAfter: fens[index + 1]!,
      label: classification.label,
      loss: classification.loss,
      bestMove: before.bestMove,
      feedback,
      hinted,
      rushed,
    });
  }

  return {
    moves,
    userMoves,
    averageLoss: userMoves > 0 ? totalLoss / userMoves : 0,
    counts,
    evalGraph,
    mistakes,
  };
}
