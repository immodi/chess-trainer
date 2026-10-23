import { Chess } from 'chess.js';
import type { Color, PieceSymbol, Square } from 'chess.js';
import { opposite } from '../coach/hanging';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * Practice games run the coach and feed Progress; casual games are plain chess
 * with their own save slot (SPEC 6.7 Mode 1b).
 */
export type GameMode = 'practice' | 'casual';

export type GameOutcome =
  | { kind: 'checkmate'; winner: Color }
  | { kind: 'resigned'; winner: Color }
  | { kind: 'stalemate' }
  | { kind: 'draw'; reason: string };

export interface PlayedMove {
  san: string;
  from: Square;
  to: Square;
  /** Set on promotion moves; needed to rebuild the UCI form for review. */
  promotion?: PieceSymbol;
  color: Color;
  piece: PieceSymbol;
}

/** A hint the user asked for, recorded so Review can flag the move. */
export interface HintUse {
  /** Index in `moves` of the move the hint was for. */
  ply: number;
  /** 1 = threat warning, 2 = piece to look at, 3 = engine move. */
  level: number;
}

export interface GameState {
  fen: string;
  /** SAN history. Replaying it keeps repetition and 50-move detection exact. */
  moves: PlayedMove[];
  userColor: Color;
  /** Adaptive level this game is being played at. */
  level: number;
  mode: GameMode;
  hints: HintUse[];
  outcome: GameOutcome | null;
}

export interface MoveInput {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
}

export function newGame(
  userColor: Color,
  level: number,
  mode: GameMode = 'practice',
): GameState {
  return { fen: START_FEN, moves: [], userColor, level, mode, hints: [], outcome: null };
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
      {
        san: played.san,
        from: played.from,
        to: played.to,
        ...(played.promotion ? { promotion: played.promotion } : {}),
        color: played.color,
        piece: played.piece,
      },
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
  /** Missing in saves written before casual mode existed. */
  mode?: GameMode;
  hints?: HintUse[];
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
      ...(played.promotion ? { promotion: played.promotion } : {}),
      color: played.color,
      piece: played.piece,
    });
  }

  return {
    fen: chess.fen(),
    moves,
    userColor: saved.userColor,
    level: saved.level,
    mode: saved.mode === 'casual' ? 'casual' : 'practice',
    hints: normaliseHints(saved.hints),
    outcome: outcomeOf(chess),
  };
}

/** UCI form of a played move, e.g. `e7e8q`. */
export function playedUci(move: PlayedMove): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

/** Accepts anything from storage and returns usable hint entries. */
export function normaliseHints(raw: unknown): HintUse[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const value = entry as Partial<HintUse>;
    if (typeof value.ply !== 'number' || typeof value.level !== 'number') return [];
    if (!Number.isFinite(value.ply) || !Number.isFinite(value.level)) return [];
    return [
      {
        ply: Math.max(0, Math.trunc(value.ply)),
        level: Math.min(3, Math.max(1, Math.trunc(value.level))),
      },
    ];
  });
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
