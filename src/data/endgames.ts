import type { Color } from 'chess.js';

export type EndgameGoal = 'win' | 'draw';

/**
 * Stockfish's evaluation of the starting position, from the user's point of
 * view. Stored with the drill so the data can be checked without shipping an
 * engine with the tests.
 */
export interface EndgameEngineResult {
  depth: number;
  /** Centipawns, positive for the user. Exactly one of cp/mate is set. */
  cp?: number;
  /** Mate distance, positive when the user mates. */
  mate?: number;
}

export interface EndgameDrill {
  id: string;
  name: string;
  fen: string;
  /** The colour the user plays. Must match the FEN's side to move. */
  userColor: Color;
  goal: EndgameGoal;
  hint: string;
  /** Full moves the user has to reach the goal. */
  moveBudget: number;
  engine: EndgameEngineResult;
}

/**
 * Fixed starting positions (SPEC 6.7 Mode 6). Evaluations were produced with
 * Stockfish 19 at depth 18 on 2026-10-24; `npm test` checks that each stored
 * result still supports the stated goal.
 */
export const ENDGAMES: readonly EndgameDrill[] = [
  {
    id: 'kq-vs-k',
    name: 'King and queen vs king',
    fen: '8/8/8/7Q/8/8/8/K1k5 w - - 0 1',
    userColor: 'w',
    goal: 'win',
    hint: 'Use the queen to cut the king off, then bring your king closer. Watch out for stalemate.',
    moveBudget: 50,
    engine: { depth: 18, mate: 6 },
  },
  {
    id: 'kr-vs-k',
    name: 'King and rook vs king',
    fen: '8/8/8/7R/8/8/8/K1k5 w - - 0 1',
    userColor: 'w',
    goal: 'win',
    hint: 'Cut the king off with the rook, then walk your king up. Mate comes on the edge.',
    moveBudget: 50,
    engine: { depth: 18, cp: 709 },
  },
  {
    id: 'kp-vs-k-win',
    name: 'King and pawn vs king (win)',
    fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1',
    userColor: 'w',
    goal: 'win',
    hint: 'Take the opposition: step the king forward, then push the pawn when the defender gives way.',
    moveBudget: 50,
    engine: { depth: 18, cp: 702 },
  },
  {
    id: 'kp-vs-k-draw',
    name: 'Rook pawn vs king (draw)',
    fen: 'k7/8/K7/P7/8/8/8/8 w - - 0 1',
    userColor: 'w',
    goal: 'draw',
    hint: 'With a rook pawn the defender draws by reaching the corner in front of the pawn. Keep your king near a8 and b8.',
    moveBudget: 50,
    engine: { depth: 18, cp: 0 },
  },
  {
    id: 'rp-vs-r-draw',
    name: 'Rook and pawn vs rook (draw)',
    fen: '4k3/1r6/4K3/4P3/8/8/8/4R3 w - - 0 1',
    userColor: 'w',
    goal: 'draw',
    hint: 'The Philidor defence: keep your rook active on the third rank and check from behind when the king advances.',
    moveBudget: 60,
    engine: { depth: 18, cp: 4 },
  },
  {
    id: 'rp-vs-r-win',
    name: 'Rook and pawn vs rook (win)',
    fen: '1K1k4/1P6/8/8/8/8/r7/1R6 w - - 0 1',
    userColor: 'w',
    goal: 'win',
    hint: 'Build a bridge: use your rook to block the checks, then promote the pawn.',
    moveBudget: 60,
    engine: { depth: 18, cp: 401 },
  },
];

/** Evaluations within this many centipawns of zero count as a draw. */
export const ENDGAME_DRAW_CP = 50;

export function endgameById(id: string): EndgameDrill | undefined {
  return ENDGAMES.find((drill) => drill.id === id);
}

/** Turns the stored engine score into a result for the user. */
export function engineResultForUser(drill: EndgameDrill): 'win' | 'draw' | 'loss' {
  const { cp, mate } = drill.engine;
  if (mate !== undefined) return mate > 0 ? 'win' : 'loss';
  if (cp !== undefined) {
    if (cp >= ENDGAME_DRAW_CP) return 'win';
    if (cp <= -ENDGAME_DRAW_CP) return 'loss';
  }
  return 'draw';
}

/** True when the drill's goal agrees with the stored Stockfish result. */
export function goalMatchesEngine(drill: EndgameDrill): boolean {
  return engineResultForUser(drill) === drill.goal;
}
