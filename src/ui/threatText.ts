import { Chess } from 'chess.js';
import type { PieceSymbol, Square } from 'chess.js';
import type { Threat } from '../coach/threats';

const PIECE_NAME: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

function pieceName(fen: string, square: Square | undefined): string | null {
  if (!square) return null;
  let piece: ReturnType<Chess['get']> = undefined;
  try {
    piece = new Chess(fen).get(square);
  } catch {
    piece = undefined;
  }
  return piece ? PIECE_NAME[piece.type] : null;
}

function afterMove(fen: string, uci: string): Chess | null {
  const chess = new Chess(fen);
  try {
    chess.move({
      from: uci.slice(0, 2) as Square,
      to: uci.slice(2, 4) as Square,
      promotion: uci.length > 4 ? (uci.slice(4, 5) as 'q' | 'r' | 'b' | 'n') : undefined,
    });
    return chess;
  } catch {
    return null;
  }
}

function actorName(fen: string, threat: Threat): string | null {
  if (!threat.actor) return null;
  const after = afterMove(fen, threat.move);
  if (after) return pieceName(after.fen(), threat.actor);
  return pieceName(fen, threat.actor);
}

function targetNames(fen: string, threat: Threat): { square: Square; name: string }[] {
  return (threat.targets ?? threat.squares)
    .map((square) => ({ square, name: pieceName(fen, square) }))
    .filter((entry): entry is { square: Square; name: string } => entry.name !== null);
}

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

  if (threat.kind === 'fork') {
    const actor = actorName(fen, threat);
    const targets = targetNames(fen, threat);
    if (actor && targets.length >= 2) {
      const list = targets.map((target) => `your ${target.name} on ${target.square}`);
      const joined =
        list.length === 2 ? `${list[0]} and ${list[1]}` : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
      return `The opponent can fork ${joined} with the ${actor} on ${threat.actor}.`;
    }
    return 'The opponent can fork two of your pieces next move.';
  }

  if (threat.kind === 'pin') {
    const actor = actorName(fen, threat);
    const targets = targetNames(fen, threat);
    if (actor && targets.length >= 2 && threat.actor) {
      return `The opponent can pin your ${targets[0]?.name} on ${targets[0]?.square} to your ${targets[1]?.name} on ${targets[1]?.square} with the ${actor} on ${threat.actor}.`;
    }
    return 'The opponent can pin one of your pieces next move.';
  }

  if (threat.kind === 'skewer') {
    const actor = actorName(fen, threat);
    const targets = targetNames(fen, threat);
    if (actor && targets.length >= 2 && threat.actor) {
      return `The opponent can skewer your ${targets[0]?.name} on ${targets[0]?.square} and win your ${targets[1]?.name} on ${targets[1]?.square} with the ${actor} on ${threat.actor}.`;
    }
    return 'The opponent can skewer two of your pieces next move.';
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
