import type { HangingPiece } from '../coach/hanging';
import type { Threat } from '../coach/threats';
import type { Puzzle } from '../data/puzzles';
import { preparePuzzle } from '../data/puzzles';

export interface ThreatDrillPosition {
  fen: string;
  threats: Threat[];
}

export interface HangingDrillPosition {
  fen: string;
  pieces: HangingPiece[];
}

export type ThreatComputer = (fen: string) => Promise<Threat[] | undefined>;
export type HangingComputer = (fen: string) => Promise<HangingPiece[] | undefined>;

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

/** Prepared FENs in random order, with puzzle ids de-duplicated. */
function* puzzleFens(
  puzzles: readonly Puzzle[],
  random: () => number,
): Generator<{ fen: string; puzzle: Puzzle }> {
  const order = shuffled(puzzles, random);
  const seen = new Set<string>();

  for (const puzzle of order) {
    if (seen.has(puzzle.id)) continue;
    seen.add(puzzle.id);
    const prepared = preparePuzzle(puzzle);
    if (prepared) yield { fen: prepared.fen, puzzle };
  }
}

/**
 * Builds a mixed session for Mode 2. Positions where the user failed an
 * in-game check come first; puzzle positions fill the rest. About a quarter of
 * the session is made of quiet positions so "Nothing" stays a real answer.
 */
export async function buildThreatDrillQueue(
  puzzles: readonly Puzzle[],
  failedFens: readonly string[],
  compute: ThreatComputer,
  count = 12,
  random: () => number = Math.random,
): Promise<ThreatDrillPosition[]> {
  const withThreats: ThreatDrillPosition[] = [];
  const quiet: ThreatDrillPosition[] = [];
  const seenFens = new Set<string>();

  for (const fen of unique(failedFens)) {
    if (seenFens.has(fen)) continue;
    seenFens.add(fen);
    const threats = await compute(fen);
    if (!threats) continue;
    const entry = { fen, threats };
    if (threats.length === 0) quiet.push(entry);
    else withThreats.push(entry);
  }

  const quietTarget = Math.max(1, Math.round(count * 0.25));
  let attempts = 0;
  for (const { fen } of puzzleFens(puzzles, random)) {
    if (seenFens.has(fen)) continue;
    if (withThreats.length >= count && quiet.length >= quietTarget) break;
    if (attempts >= 100) break;
    attempts += 1;

    const threats = await compute(fen);
    if (!threats) continue;
    seenFens.add(fen);
    const entry = { fen, threats };
    if (threats.length === 0) quiet.push(entry);
    else withThreats.push(entry);
  }

  const wantedQuiet = quiet.slice(0, quietTarget);
  const wantedThreats = withThreats.slice(0, Math.max(0, count - wantedQuiet.length));
  const combined = [...wantedThreats, ...wantedQuiet];
  return shuffled(combined, random).slice(0, count);
}

/**
 * Builds a session for Mode 3. Only positions with 0-3 hanging pieces are
 * included, as required by the spec.
 */
export async function buildHangingDrillQueue(
  puzzles: readonly Puzzle[],
  compute: HangingComputer,
  count = 12,
  random: () => number = Math.random,
): Promise<HangingDrillPosition[]> {
  const positions: HangingDrillPosition[] = [];
  const seenFens = new Set<string>();
  let attempts = 0;

  for (const { fen } of puzzleFens(puzzles, random)) {
    if (positions.length >= count) break;
    if (seenFens.has(fen)) continue;
    if (attempts >= 120) break;
    attempts += 1;
    const pieces = await compute(fen);
    if (!pieces || pieces.length > 3) continue;
    seenFens.add(fen);
    positions.push({ fen, pieces });
  }

  return positions;
}
