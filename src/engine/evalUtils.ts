import type { EngineLine } from './uci';

/** Mate scores are mapped to this magnitude in centipawns (SPEC 5). */
const MATE_CP = 10_000;

/** Constant from the Lichess win% formula (SPEC 5). */
const WIN_PCT_SCALE = 0.00368208;

export type SideToMove = 'w' | 'b';

/**
 * Maps a `score mate N` value to centipawns: mate in 1 is stronger than
 * mate in 2, and both are far beyond any normal material advantage.
 */
export function mateToCp(mate: number): number {
  if (!Number.isFinite(mate) || mate === 0) {
    throw new Error(`mateToCp: expected a non-zero finite mate distance, got ${mate}`);
  }
  const signed = MATE_CP - Math.abs(mate);
  return mate > 0 ? signed : -signed;
}

/** UCI score for one line as centipawns, side-to-move relative. */
export function lineToCp(line: EngineLine): number | undefined {
  if (line.cp !== undefined) return line.cp;
  if (line.mate !== undefined) return mateToCp(line.mate);
  return undefined;
}

/** Lichess win probability, 0..100, from centipawns. */
export function winPercentFromCp(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-WIN_PCT_SCALE * cp)) - 1);
}

/** True when the score is a forced mate rather than a material evaluation. */
export function isMateScore(line: EngineLine): boolean {
  return line.mate !== undefined;
}

/**
 * Converts a side-to-move score to White's perspective (SPEC 6.2).
 * Returns undefined when the line carries no score.
 */
export function toWhiteCp(line: EngineLine, sideToMove: SideToMove): number | undefined {
  const cp = lineToCp(line);
  if (cp === undefined) return undefined;
  return sideToMove === 'w' ? cp : -cp;
}

/** Win probability for White, 0..100, from a side-to-move score. */
export function whiteWinPercent(line: EngineLine, sideToMove: SideToMove): number | undefined {
  const cp = toWhiteCp(line, sideToMove);
  if (cp === undefined) return undefined;
  return winPercentFromCp(cp);
}
