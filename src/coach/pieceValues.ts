import type { PieceSymbol } from 'chess.js';

/** SPEC 6.5: P1 N3 B3 R5 Q9. The king is never captured, so it is worth 0. */
export const PIECE_VALUES: Readonly<Record<PieceSymbol, number>> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

export function pieceValue(piece: PieceSymbol): number {
  return PIECE_VALUES[piece];
}
