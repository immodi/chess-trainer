import type { PieceSymbol, Square } from 'chess.js';

/** Every reason the coach can give (SPEC 6.5). `fallback` is the honest last resort. */
export type FindingKind =
  | 'leftHanging'
  | 'missedCapture'
  | 'allowedMate'
  | 'missedMate'
  | 'fork'
  | 'pin'
  | 'skewer'
  | 'backRank'
  | 'discovered'
  | 'fallback';

export interface Finding {
  kind: FindingKind;
  /** Higher leads the feedback card. */
  severity: number;
  /** Squares to highlight, if any. */
  squares: Square[];
  /** Plain language, at most two sentences. */
  text: string;
}

export const PIECE_NAME: Readonly<Record<PieceSymbol, string>> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

export function pieceName(type: PieceSymbol): string {
  return PIECE_NAME[type];
}

/** "the knight on f6" */
export function describePiece(type: PieceSymbol, square: Square): string {
  return `the ${pieceName(type)} on ${square}`;
}
