import { Chess } from 'chess.js';
import type { Move, Square } from 'chess.js';
import { SEE_MAX_PLIES } from './config';
import { PIECE_VALUES } from './pieceValues';

/**
 * Static exchange evaluation (SPEC 6.5).
 *
 * Negamax over *legal* captures on one square, with a stand-pat option, so
 * pins, x-rays and overloaded defenders fall out of the rules engine instead of
 * being special-cased. Returns the net material the side to move wins by
 * starting a capture sequence on `square` (0 if it prefers not to capture).
 *
 * En-passant captures are ignored: the target square is empty, so there is
 * nothing to exchange on. Hanging-piece detection only ever asks about
 * occupied squares, which is what this is for.
 */
export function seeFrom(chess: Chess, square: Square, plies: number = SEE_MAX_PLIES): number {
  if (plies <= 0) return 0;

  const victim = chess.get(square);
  if (!victim) return 0;

  const captures: Move[] = chess
    .moves({ verbose: true })
    .filter((move) => move.to === square && move.captured !== undefined);

  if (captures.length === 0) return 0;

  const victimValue = PIECE_VALUES[victim.type];
  let best = 0;

  for (const capture of captures) {
    chess.move({ from: capture.from, to: capture.to, promotion: capture.promotion });
    const recapture = seeFrom(chess, square, plies - 1);
    chess.undo();

    const gain = victimValue - recapture;
    if (gain > best) best = gain;
  }

  return best;
}

/** Convenience wrapper for a FEN. */
export function see(fen: string, square: Square): number {
  return seeFrom(new Chess(fen), square);
}
