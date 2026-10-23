import { Chess } from 'chess.js';
import type { Color, PieceSymbol, Square } from 'chess.js';
import { seeFrom } from './see';

export interface HangingPiece {
  square: Square;
  color: Color;
  type: PieceSymbol;
  /** What the opponent stands to win, in pawns. */
  value: number;
}

export function opposite(color: Color): Color {
  return color === 'w' ? 'b' : 'w';
}

/**
 * Returns `fen` with the other side to move, and en passant cleared.
 *
 * Clearing en passant matters because an en-passant square is only meaningful
 * for the side that just moved; after flipping it would point at the wrong
 * square. Castling rights are left alone: they are position facts, not
 * side-to-move facts.
 */
export function withSideToMove(fen: string, color: Color): string {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) throw new Error(`Malformed FEN: ${fen}`);
  parts[1] = color;
  parts[3] = '-';
  return parts.join(' ');
}

export function findKing(chess: Chess, color: Color): Square | undefined {
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell && cell.type === 'k' && cell.color === color) return cell.square;
    }
  }
  return undefined;
}

/**
 * Builds the null-move position (SPEC 6.6): `fen` with `color` to move and en
 * passant cleared.
 *
 * Returns undefined when the result would be illegal — that is, when the side
 * that is *not* to move would be in check. chess.js happily loads such
 * positions, so this has to be checked explicitly (SPEC 12). Callers must treat
 * undefined as "cannot answer", never as "nothing is happening".
 */
export function nullMovePosition(fen: string, color: Color): Chess | undefined {
  let chess: Chess;
  try {
    chess = new Chess(withSideToMove(fen, color));
  } catch {
    return undefined;
  }

  const passedKing = findKing(chess, opposite(color));
  if (!passedKing) return undefined;
  if (chess.isAttacked(passedKing, color)) return undefined;

  return chess;
}

/**
 * Every non-king piece that its owner would lose material on (SPEC 6.5).
 *
 * Returns `undefined` when the position cannot be evaluated from the other
 * side's point of view, which the caller must treat as "unknown".
 */
export function hangingPieces(fen: string): HangingPiece[] | undefined {
  const found: HangingPiece[] = [];

  for (const color of ['w', 'b'] as const) {
    const chess = nullMovePosition(fen, opposite(color));
    if (!chess) return undefined;

    for (const row of chess.board()) {
      for (const cell of row) {
        if (!cell || cell.color !== color || cell.type === 'k') continue;
        const value = seeFrom(chess, cell.square);
        if (value > 0) {
          found.push({ square: cell.square, color: cell.color, type: cell.type, value });
        }
      }
    }
  }

  return found;
}

/** True when the given side has at least one hanging piece. */
export function hasHangingPiece(fen: string, color: Color): boolean | undefined {
  const pieces = hangingPieces(fen);
  if (pieces === undefined) return undefined;
  return pieces.some((piece) => piece.color === color);
}
