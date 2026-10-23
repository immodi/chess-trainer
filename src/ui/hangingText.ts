import type { PieceSymbol } from 'chess.js';
import type { HangingPiece } from '../coach/hanging';

const PIECE_NAME: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

/** One sentence per loose piece, using only `hangingPieces` output. */
export function describeHangingPieces(pieces: readonly HangingPiece[]): string[] {
  return pieces.map(
    (piece) =>
      `${piece.color === 'w' ? 'White' : 'Black'} ${PIECE_NAME[piece.type]} on ${piece.square} can be won (${piece.value}).`,
  );
}
