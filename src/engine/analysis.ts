import type { Color } from 'chess.js';
import type { PositionEval } from '../coach/classify';
import { ANALYSIS } from '../coach/config';
import { readValue, writeValue } from '../storage/db';
import { getEngine } from './engine';
import { lineToCp, winPercentFromCp } from './evalUtils';
import type { EngineLine } from './uci';

/** A cached position analysis. SPEC 6.4: cache by FEN + depth. */
export interface AnalysisResult extends PositionEval {
  fen: string;
  depth: number;
  at: number;
}

export interface AnalysisProfile {
  depth: number;
  movetimeMs: number;
}

const CACHE_PREFIX = 'analysis:';
const inFlight = new Map<string, Promise<AnalysisResult | null>>();

function sideToMove(fen: string): Color {
  return fen.split(/\s+/)[1] === 'b' ? 'b' : 'w';
}

/** Turns the engine's first line into a side-to-move evaluation. */
export function positionEvalFromLines(
  fen: string,
  lines: readonly EngineLine[],
  bestMove: string | null,
): PositionEval | null {
  const line = lines[0];
  if (!line) return null;
  const cp = lineToCp(line);
  if (cp === undefined) return null;
  return {
    sideToMove: sideToMove(fen),
    bestMove: bestMove ?? line.pv[0] ?? null,
    cp,
    win: winPercentFromCp(cp),
    pv: line.pv,
  };
}

function cacheKey(fen: string, depth: number): string {
  return `${CACHE_PREFIX}${depth}:${fen}`;
}

/**
 * Analyses one position at the fixed coach profile (SPEC 6.4).
 *
 * Results are cached in IndexedDB, so reviewing a game that was already played
 * costs nothing for positions the coach has seen. Returns null when the engine
 * has no usable score (stopped search, timeout, missing line); callers must
 * skip coaching rather than invent a reason.
 */
export async function analyzePosition(
  fen: string,
  profile: AnalysisProfile = ANALYSIS,
  timeoutMs = 6000,
): Promise<AnalysisResult | null> {
  const key = cacheKey(fen, profile.depth);
  const cached = await readValue<AnalysisResult>(key);
  if (cached && cached.fen === fen && typeof cached.win === 'number') return cached;

  const pendingKey = `${key}:${profile.movetimeMs}`;
  const existing = inFlight.get(pendingKey);
  if (existing) return existing;

  const run = (async (): Promise<AnalysisResult | null> => {
    const search = getEngine().analyze(fen, {
      depth: profile.depth,
      movetime: profile.movetimeMs,
      multipv: 1,
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });

    try {
      const result = await Promise.race([search, timeout]);
      if (!result || result.stopped) return null;
      const evaluated = positionEvalFromLines(fen, result.lines, result.bestMove);
      if (!evaluated) return null;
      const stored: AnalysisResult = {
        ...evaluated,
        fen,
        depth: profile.depth,
        at: Date.now(),
      };
      await writeValue(key, stored);
      return stored;
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  })();

  inFlight.set(pendingKey, run);
  try {
    return await run;
  } finally {
    inFlight.delete(pendingKey);
  }
}

/** Test hook: forget in-memory promises (IndexedDB cache is untouched). */
export function clearAnalysisInFlight(): void {
  inFlight.clear();
}
