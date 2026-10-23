import { Chess } from 'chess.js';
import type { Color, Move, PieceSymbol, Square } from 'chess.js';

/** One row from the generated Lichess puzzle set (SPEC 7.1). */
export interface Puzzle {
  id: string;
  fen: string;
  /** Space-separated UCI. The first move is the opponent's, then the user's. */
  moves: string;
  rating: number;
  themes: string[];
}

/** A puzzle with the opponent's first move already applied. */
export interface PreparedPuzzle {
  puzzle: Puzzle;
  /** Position with the user to move. */
  fen: string;
  userColor: Color;
  /** Remaining UCI moves, starting with the user's solution move. */
  solution: string[];
}

let cache: Promise<Puzzle[]> | null = null;

/**
 * Loads the puzzle JSON lazily. It is a separate chunk so the initial app
 * bundle stays small; the file is still shipped inside the APK.
 */
export function loadPuzzles(): Promise<Puzzle[]> {
  cache ??= import('./puzzles.json').then((module) => {
    const data = (module as { default?: unknown }).default ?? module;
    return Array.isArray(data) ? (data as Puzzle[]) : [];
  });
  return cache;
}

export function uciToMove(uci: string): { from: Square; to: Square; promotion?: PieceSymbol } {
  const promotion = uci.length > 4 ? (uci.slice(4, 5) as PieceSymbol) : undefined;
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    ...(promotion ? { promotion } : {}),
  };
}

export function playUci(chess: Chess, uci: string): Move | null {
  try {
    return chess.move(uciToMove(uci));
  } catch {
    return null;
  }
}

/**
 * Applies the opponent's first move. Returns null for malformed data so a
 * single bad row cannot break a whole session.
 */
export function preparePuzzle(puzzle: Puzzle): PreparedPuzzle | null {
  const moves = puzzle.moves.trim().split(/\s+/).filter(Boolean);
  const first = moves[0];
  if (!first || moves.length < 2) return null;

  const chess = new Chess(puzzle.fen);
  if (!playUci(chess, first)) return null;

  const solution = moves.slice(1);
  const check = new Chess(chess.fen());
  for (const uci of solution) {
    if (!playUci(check, uci)) return null;
  }

  return {
    puzzle,
    fen: chess.fen(),
    userColor: chess.turn(),
    solution,
  };
}

/** The solution in SAN, starting from the prepared position. */
export function solutionSan(fen: string, solution: readonly string[]): string[] {
  const chess = new Chess(fen);
  const san: string[] = [];
  for (const uci of solution) {
    const move = playUci(chess, uci);
    if (!move) break;
    san.push(move.san);
  }
  return san;
}

/** The opponent's first move, for the board's "last move" highlight. */
export function firstMove(
  puzzle: Puzzle,
): { from: Square; to: Square; promotion?: PieceSymbol; san: string } | null {
  const chess = new Chess(puzzle.fen);
  const first = puzzle.moves.trim().split(/\s+/)[0];
  if (!first) return null;
  const move = playUci(chess, first);
  if (!move) return null;
  return {
    from: move.from,
    to: move.to,
    ...(move.promotion ? { promotion: move.promotion } : {}),
    san: move.san,
  };
}

/** The opponent's first move in SAN, for a small "last move" hint. */
export function firstMoveSan(puzzle: Puzzle): string | null {
  return firstMove(puzzle)?.san ?? null;
}
