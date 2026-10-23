import { Chess } from 'chess.js';
import type { PieceSymbol, Square } from 'chess.js';
import { opposite } from '../coach/hanging';
import { ENDGAME } from '../coach/config';
import type { EndgameDrill } from '../data/endgames';
import type { AnalyzeFn } from '../engine/opponent';

export type EndgameResult = 'win' | 'draw' | 'loss';

export interface EndgameMove {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
}

export interface AppliedEndgameMove {
  fen: string;
  uci: string;
  san: string;
}

/** Applies a move to a bare FEN. Illegal input returns null. */
export function applyEndgameMove(fen: string, move: EndgameMove): AppliedEndgameMove | null {
  const chess = new Chess(fen);
  try {
    const played = chess.move(
      move.promotion
        ? { from: move.from, to: move.to, promotion: move.promotion }
        : { from: move.from, to: move.to },
    );
    return { fen: chess.fen(), uci: `${played.from}${played.to}${played.promotion ?? ''}`, san: played.san };
  } catch {
    return null;
  }
}

/** Result from the user's point of view, or null while the game is running. */
export function endgameResult(chess: Chess, userColor: 'w' | 'b'): EndgameResult | null {
  if (chess.isCheckmate()) {
    return opposite(chess.turn()) === userColor ? 'win' : 'loss';
  }
  if (chess.isGameOver() || chess.isDraw()) return 'draw';
  return null;
}

/** The goal is met only by the matching result; a draw is not a win. */
export function goalMet(drill: EndgameDrill, result: EndgameResult): boolean {
  return result === drill.goal;
}

/** Full move number after `plies` half-moves, 1-based. */
export function fullMove(plies: number): number {
  return Math.floor(plies / 2) + 1;
}

/** True once the user has used more than the drill's full-move budget. */
export function budgetExceeded(drill: EndgameDrill, plies: number): boolean {
  return Math.ceil(plies / 2) > drill.moveBudget;
}

/**
 * Full-strength Stockfish move: one search, no level sampling (SPEC 6.7
 * Mode 6). Returns null when the search was stopped or had no move.
 */
export async function chooseEndgameMove(fen: string, analyze: AnalyzeFn): Promise<string | null> {
  const result = await analyze(fen, {
    depth: ENDGAME.depth,
    movetime: ENDGAME.movetimeMs,
    multipv: 1,
  });
  if (result.stopped) return null;
  return result.bestMove ?? result.lines[0]?.pv[0] ?? null;
}
