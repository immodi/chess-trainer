/**
 * Every tunable number lives here so behaviour can be adjusted without
 * touching logic (SPEC 4: src/coach/config.ts).
 */

/** Capture search never looks deeper than this many plies. */
export const SEE_MAX_PLIES = 8;

/**
 * Win% loss thresholds for move labels (SPEC 6.4):
 * loss < good -> good, < ok -> ok, < mistake -> inaccuracy, < blunder -> mistake.
 * A move that matches the engine's top choice is labelled `best` regardless.
 */
export const CLASSIFY = {
  good: 2,
  ok: 5,
  mistake: 10,
  blunder: 20,
} as const;

/** Opponent levels (SPEC 6.3). */
export interface OpponentLevel {
  readonly depth: number;
  /** Allowed win% loss versus the best move. */
  readonly window: number;
  /** Softmax temperature in win% points. */
  readonly temperature: number;
}

/** Exactly the table in SPEC 6.3. */
export const OPPONENT_LEVELS: readonly OpponentLevel[] = [
  { depth: 1, window: 40, temperature: 15 },
  { depth: 2, window: 35, temperature: 12 },
  { depth: 3, window: 30, temperature: 10 },
  { depth: 4, window: 25, temperature: 8 },
  { depth: 6, window: 20, temperature: 6 },
  { depth: 8, window: 15, temperature: 5 },
  { depth: 10, window: 10, temperature: 4 },
  { depth: 12, window: 7, temperature: 3 },
  { depth: 14, window: 4, temperature: 2 },
  { depth: 16, window: 2, temperature: 1 },
];

export const OPPONENT = {
  minLevel: 1,
  maxLevel: 10,
  multipv: 5,
  /** Hard cap so slow phones stay responsive. */
  movetimeMs: 1500,
} as const;

/** Analysis profile for move classification and review (fixed, level-independent). */
export const ANALYSIS = {
  depth: 12,
  movetimeMs: 600,
} as const;

/** Threat prompt (SPEC 6.6). */
export const THREAT_CHECK = {
  /** How long the correct answers stay visible after an answer, in ms. */
  revealMs: 1500,
  /** A correct selection may contain at most this many extra squares. */
  maxExtraSquares: 1,
  /** Moving faster than this while a threat exists is mentioned in Review. */
  rushedMoveMs: 2000,
} as const;

/** Adaptive opponent (SPEC 6.3). */
export const ADAPTIVE = {
  startLevel: 2,
  promoteBelowBlundersPer100: 3,
  demoteAtOrAboveBlundersPer100: 8,
} as const;
