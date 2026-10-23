import { Chess } from 'chess.js';
import type { PieceSymbol } from 'chess.js';
import type { Threat } from '../coach/threats';

const PIECE_NAME: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

/**
 * One plain-language sentence per threat. Only ever describes what
 * `computeThreats` actually returned (SPEC 2.8).
 */
export function describeThreat(fen: string, threat: Threat): string {
  if (threat.kind === 'mate') {
    const matingSquare = threat.squares[1];
    return matingSquare
      ? `The opponent can mate next move on ${matingSquare}.`
      : 'The opponent can mate next move.';
  }

  const square = threat.squares[0];
  if (!square) return 'The opponent can win material next move.';

  let piece: ReturnType<Chess['get']> = undefined;
  try {
    piece = new Chess(fen).get(square);
  } catch {
    piece = undefined;
  }

  if (!piece) return `The opponent can win material on ${square}.`;

  const owner = piece.color === 'w' ? 'White' : 'Black';
  return `The ${owner.toLowerCase()} ${PIECE_NAME[piece.type]} on ${square} can be won.`;
}

export function describeThreats(fen: string, threats: readonly Threat[]): string[] {
  return threats.map((threat) => describeThreat(fen, threat));
}
