import { Chess } from 'chess.js';
import type { Color, PieceSymbol, Square } from 'chess.js';
import { opposite } from '../coach/hanging';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export type GameOutcome =
  | { kind: 'checkmate'; winner: Color }
  | { kind: 'resigned'; winner: Color }
  | { kind: 'stalemate' }
  | { kind: 'draw'; reason: string };

export interface PlayedMove {
  san: string;
  from: Square;
  to: Square;
  color: Color;
  piece: PieceSymbol;
}

export interface GameState {
  fen: string;
  /** SAN history. Replaying it keeps repetition and 50-move detection exact. */
  moves: PlayedMove[];
  userColor: Color;
  /** Adaptive level this game is being played at. */
  level: number;
  outcome: GameOutcome | null;
}

export interface MoveInput {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
}

export function newGame(userColor: Color, level: number): GameState {
  return { fen: START_FEN, moves: [], userColor, level, outcome: null };
}

/** Rebuilds the position with full history from the SAN list. */
export function replay(moves: readonly PlayedMove[]): Chess {
  const chess = new Chess();
  for (const move of moves) chess.move(move.san);
  return chess;
}

export function turnOf(fen: string): Color {
  return fen.split(/\s+/)[1] === 'b' ? 'b' : 'w';
}

export function isUserTurn(state: GameState): boolean {
  return state.outcome === null && turnOf(state.fen) === state.userColor;
}

export function outcomeOf(chess: Chess): GameOutcome | null {
  if (chess.isCheckmate()) return { kind: 'checkmate', winner: opposite(chess.turn()) };
  if (chess.isStalemate()) return { kind: 'stalemate' };
  if (chess.isInsufficientMaterial()) return { kind: 'draw', reason: 'insufficient material' };
  if (chess.isThreefoldRepetition()) return { kind: 'draw', reason: 'threefold repetition' };
  if (chess.isDrawByFiftyMoves()) return { kind: 'draw', reason: 'the 50-move rule' };
  if (chess.isDraw()) return { kind: 'draw', reason: 'a draw' };
  return null;
}

/** Applies a move, or returns null when it is illegal (SPEC 2.3: ignore it). */
export function applyMove(state: GameState, move: MoveInput): GameState | null {
  if (state.outcome) return null;

  const chess = replay(state.moves);
  let played;
  try {
    played = chess.move(
      move.promotion
        ? { from: move.from, to: move.to, promotion: move.promotion }
        : { from: move.from, to: move.to },
    );
  } catch {
    return null;
  }

  return {
    ...state,
    fen: chess.fen(),
    moves: [
      ...state.moves,
      { san: played.san, from: played.from, to: played.to, color: played.color, piece: played.piece },
    ],
    outcome: outcomeOf(chess),
  };
}

/** Applies a UCI move such as `e7e8q`. */
export function applyUci(state: GameState, uci: string): GameState | null {
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const promotion = uci.length > 4 ? (uci.slice(4, 5) as PieceSymbol) : undefined;
  return applyMove(state, promotion ? { from, to, promotion } : { from, to });
}

export function resign(state: GameState): GameState {
  if (state.outcome) return state;
  return { ...state, outcome: { kind: 'resigned', winner: opposite(state.userColor) } };
}

export interface SavedInput {
  moves: string[];
  userColor: Color;
  level: number;
}

/** Rebuilds a game from saved SAN moves. Returns null for an unusable save. */
export function fromSaved(saved: SavedInput): GameState | null {
  const chess = new Chess();
  const moves: PlayedMove[] = [];

  for (const san of saved.moves) {
    let played;
    try {
      played = chess.move(san);
    } catch {
      return null;
    }
    moves.push({
      san: played.san,
      from: played.from,
      to: played.to,
      color: played.color,
      piece: played.piece,
    });
  }

  return {
    fen: chess.fen(),
    moves,
    userColor: saved.userColor,
    level: saved.level,
    outcome: outcomeOf(chess),
  };
}

export function resultText(outcome: GameOutcome, userColor: Color): string {
  switch (outcome.kind) {
    case 'checkmate':
      return outcome.winner === userColor
        ? 'Checkmate. You won!'
        : 'Checkmate. The computer won.';
    case 'resigned':
      return 'You resigned.';
    case 'stalemate':
      return 'Draw: stalemate.';
    case 'draw':
      return `Draw: ${outcome.reason}.`;
  }
}

/** 'win' | 'loss' | 'draw' from the user's point of view. */
export function resultFor(outcome: GameOutcome, userColor: Color): 'win' | 'loss' | 'draw' {
  if (outcome.kind === 'stalemate' || outcome.kind === 'draw') return 'draw';
  return outcome.winner === userColor ? 'win' : 'loss';
}
