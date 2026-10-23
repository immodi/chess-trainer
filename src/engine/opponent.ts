import { ADAPTIVE, OPPONENT, OPPONENT_LEVELS } from '../coach/config';
import type { OpponentLevel } from '../coach/config';
import { lineToCp, winPercentFromCp } from './evalUtils';
import type { AnalyzeOptions, AnalyzeResult, EngineLine } from './uci';

export type RandomFn = () => number;

/** The engine call the opponent needs; injected so the sampler is testable. */
export type AnalyzeFn = (fen: string, options: AnalyzeOptions) => Promise<AnalyzeResult>;

export interface Candidate {
  move: string;
  /** Win% points lost versus the best line. */
  loss: number;
  weight: number;
}

export interface OpponentMove {
  move: string;
  lines: EngineLine[];
}

function clampLevel(level: number): number {
  const rounded = Math.round(level);
  return Math.min(OPPONENT.maxLevel, Math.max(OPPONENT.minLevel, rounded));
}

/** Level 1-10, clamped. Out-of-range input never throws. */
export function levelConfig(level: number): OpponentLevel {
  return OPPONENT_LEVELS[clampLevel(level) - 1]!;
}

/**
 * Keeps every line within the level's win% window and weights it by
 * `exp(-loss / T)` (SPEC 6.3). The best line always survives (loss 0), so the
 * result is never empty when at least one line has a score.
 */
export function rankCandidates(lines: readonly EngineLine[], level: OpponentLevel): Candidate[] {
  const scored: { move: string; win: number }[] = [];

  for (const line of lines) {
    const cp = lineToCp(line);
    const move = line.pv[0];
    if (cp === undefined || move === undefined) continue;
    scored.push({ move, win: winPercentFromCp(cp) });
  }

  if (scored.length === 0) return [];

  const bestWin = Math.max(...scored.map((entry) => entry.win));

  return scored
    .map((entry) => {
      const loss = Math.max(0, bestWin - entry.win);
      return { move: entry.move, loss, weight: Math.exp(-loss / level.temperature) };
    })
    .filter((candidate) => candidate.loss <= level.window);
}

/** Weighted random pick. `random` must return [0, 1). */
export function sampleCandidate(candidates: readonly Candidate[], random: RandomFn): Candidate | null {
  if (candidates.length === 0) return null;

  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  if (total <= 0) return candidates[0]!;

  let target = random() * total;
  for (const candidate of candidates) {
    target -= candidate.weight;
    if (target < 0) return candidate;
  }
  return candidates[candidates.length - 1]!;
}

/**
 * Picks the opponent's move: one MultiPV search, then a softmax sample inside
 * the level's window. Returns null when the search was preempted or the engine
 * had nothing to say (game over, no legal moves).
 */
export async function chooseOpponentMove(
  fen: string,
  level: number,
  analyze: AnalyzeFn,
  random: RandomFn = Math.random,
): Promise<OpponentMove | null> {
  const config = levelConfig(level);
  const result = await analyze(fen, {
    depth: config.depth,
    movetime: OPPONENT.movetimeMs,
    multipv: OPPONENT.multipv,
  });

  if (result.stopped) return null;

  const picked = sampleCandidate(rankCandidates(result.lines, config), random);
  if (picked) return { move: picked.move, lines: result.lines };

  // No scored lines: fall back to whatever the engine answered rather than
  // stalling the game.
  return result.bestMove ? { move: result.bestMove, lines: result.lines } : null;
}

export interface AdaptiveInput {
  level: number;
  blundersPer100: number;
  result: 'win' | 'loss' | 'draw';
}

/**
 * Adaptive level after a finished game (SPEC 6.3). A win with few blunders
 * promotes; a loss or a blunder-heavy game demotes. Everything else holds.
 */
export function nextAdaptiveLevel({ level, blundersPer100, result }: AdaptiveInput): number {
  if (result === 'loss' || blundersPer100 >= ADAPTIVE.demoteAtOrAboveBlundersPer100) {
    return clampLevel(level - 1);
  }
  if (result === 'win' && blundersPer100 < ADAPTIVE.promoteBelowBlundersPer100) {
    return clampLevel(level + 1);
  }
  return clampLevel(level);
}
