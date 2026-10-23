import { Chess } from 'chess.js';
import type { Color } from 'chess.js';
import type { Puzzle } from '../data/puzzles';
import { playUci, preparePuzzle, solutionSan } from '../data/puzzles';
import type { Progress } from '../storage/progress';
import { emptyTacticsProgress } from '../storage/progress';

export interface RatingBand {
  low: number;
  high: number;
}

export interface PuzzleAttempt {
  prepared: NonNullable<ReturnType<typeof preparePuzzle>>;
  /** Current position. After a wrong move this stays before the user's move. */
  fen: string;
  /** Index into prepared.solution for the next expected move. */
  step: number;
  done: boolean;
  solved: boolean;
  /** UCI of the user's losing move, if any. */
  wrong: string | null;
  /** UCI the puzzle expected at the failure point. */
  expected: string | null;
  /** SAN for the remaining line from `fen`. */
  remainingSan: string[];
}

export function bandFor(progress: Progress, theme: string): RatingBand {
  const tactics = progress.tacticsByTheme[theme] ?? emptyTacticsProgress();
  return { low: tactics.bandLow, high: tactics.bandHigh };
}

export function tacticsStats(progress: Progress, theme: string) {
  return progress.tacticsByTheme[theme] ?? emptyTacticsProgress();
}

/**
 * Picks a random puzzle in the theme's band. If the band is empty (early on,
 * or after a narrow theme filter) it widens in 200-point steps until it finds
 * something, then falls back to the whole theme.
 */
export function pickPuzzle(
  puzzles: readonly Puzzle[],
  theme: string,
  band: RatingBand,
  exclude: ReadonlySet<string> = new Set(),
  random: () => number = Math.random,
): Puzzle | null {
  const themed = puzzles.filter((puzzle) => puzzle.themes.includes(theme));
  if (themed.length === 0) return null;

  const fresh = (candidates: readonly Puzzle[]): Puzzle[] =>
    candidates.filter((puzzle) => !exclude.has(puzzle.id));

  let low = band.low;
  let high = band.high;
  for (let width = 0; width <= 6; width += 1) {
    const inBand = fresh(
      themed.filter((puzzle) => puzzle.rating >= low && puzzle.rating <= high),
    );
    if (inBand.length > 0) return inBand[Math.floor(random() * inBand.length)] ?? null;
    low = Math.max(400, low - 100);
    high = Math.min(2400, high + 100);
  }

  const any = fresh(themed);
  if (any.length > 0) return any[Math.floor(random() * any.length)] ?? null;
  return null;
}

export function startAttempt(puzzle: Puzzle): PuzzleAttempt | null {
  const prepared = preparePuzzle(puzzle);
  if (!prepared) return null;
  return {
    prepared,
    fen: prepared.fen,
    step: 0,
    done: false,
    solved: false,
    wrong: null,
    expected: null,
    remainingSan: solutionSan(prepared.fen, prepared.solution),
  };
}

export function expectedMove(attempt: PuzzleAttempt): string | null {
  return attempt.prepared.solution[attempt.step] ?? null;
}

function withRemaining(attempt: PuzzleAttempt, fen: string, step: number): PuzzleAttempt {
  return {
    ...attempt,
    fen,
    step,
    remainingSan: solutionSan(fen, attempt.prepared.solution.slice(step)),
  };
}

/**
 * Applies the user's move. A wrong move ends the puzzle without changing the
 * displayed position, so the UI can show the expected move alongside it.
 * A different move that checkmates counts as solved (SPEC 6.7 Mode 4).
 */
export function playPuzzleMove(attempt: PuzzleAttempt, uci: string): PuzzleAttempt {
  if (attempt.done) return attempt;

  const expected = expectedMove(attempt);
  const chess = new Chess(attempt.fen);
  const move = playUci(chess, uci);
  if (!move) return attempt;

  if (uci === expected) {
    const nextStep = attempt.step + 1;
    if (nextStep >= attempt.prepared.solution.length) {
      return {
        ...withRemaining(attempt, chess.fen(), nextStep),
        done: true,
        solved: true,
        remainingSan: [],
      };
    }

    const reply = attempt.prepared.solution[nextStep];
    if (reply) playUci(chess, reply);
    const afterReply = attempt.step + 2;
    if (afterReply >= attempt.prepared.solution.length) {
      return {
        ...withRemaining(attempt, chess.fen(), afterReply),
        done: true,
        solved: true,
        remainingSan: [],
      };
    }
    return withRemaining(attempt, chess.fen(), afterReply);
  }

  if (chess.isCheckmate()) {
    return {
      ...withRemaining(attempt, chess.fen(), attempt.prepared.solution.length),
      done: true,
      solved: true,
      remainingSan: [],
    };
  }

  return {
    ...attempt,
    done: true,
    solved: false,
    wrong: uci,
    expected,
  };
}

export function userColor(attempt: PuzzleAttempt): Color {
  return attempt.prepared.userColor;
}
