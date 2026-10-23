import { THREAT_CHECK } from '../coach/config';
import { readValue, writeValue } from './db';

export interface ThreatCheckEntry {
  fen: string;
  correct: boolean;
  /** Response time from prompt shown to answer. */
  ms: number;
  /** How many threatened squares existed. */
  targets: number;
  /** How many squares the user marked. */
  marked: number;
  at: number;
}

export interface GameSummary {
  result: 'win' | 'loss' | 'draw';
  /** Blunders per 100 user moves (SPEC 6.3). */
  blundersPer100: number;
  userMoves: number;
  at: number;
}

export interface Progress {
  threatAnswers: number;
  threatCorrect: number;
  /** Answers given in under `THREAT_CHECK.rushedMoveMs` while a threat existed. */
  threatRushed: number;
  gamesPlayed: number;
  /** Level the adaptive opponent starts the next game at. */
  adaptiveLevel: number;
  recentThreatChecks: ThreatCheckEntry[];
  /** Last 10 finished practice games, for the adaptive adjustment and Progress. */
  recentGames: GameSummary[];
}

export const EMPTY_PROGRESS: Progress = {
  threatAnswers: 0,
  threatCorrect: 0,
  threatRushed: 0,
  gamesPlayed: 0,
  adaptiveLevel: 2,
  recentThreatChecks: [],
  recentGames: [],
};

const PROGRESS_KEY = 'progress';
const MAX_RECENT = 50;
const MAX_RECENT_GAMES = 10;

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export function normaliseProgress(raw: unknown): Progress {
  if (typeof raw !== 'object' || raw === null) return { ...EMPTY_PROGRESS };
  const value = raw as Partial<Progress>;

  return {
    threatAnswers: count(value.threatAnswers),
    threatCorrect: count(value.threatCorrect),
    threatRushed: count(value.threatRushed),
    gamesPlayed: count(value.gamesPlayed),
    adaptiveLevel: Math.min(10, Math.max(1, count(value.adaptiveLevel) || EMPTY_PROGRESS.adaptiveLevel)),
    recentThreatChecks: Array.isArray(value.recentThreatChecks)
      ? (value.recentThreatChecks as ThreatCheckEntry[]).slice(-MAX_RECENT)
      : [],
    recentGames: Array.isArray(value.recentGames)
      ? (value.recentGames as GameSummary[]).filter(isGameSummary).slice(-MAX_RECENT_GAMES)
      : [],
  };
}

function isGameSummary(value: unknown): value is GameSummary {
  if (typeof value !== 'object' || value === null) return false;
  const game = value as Partial<GameSummary>;
  return (
    (game.result === 'win' || game.result === 'loss' || game.result === 'draw') &&
    typeof game.blundersPer100 === 'number' &&
    Number.isFinite(game.blundersPer100) &&
    typeof game.userMoves === 'number' &&
    typeof game.at === 'number'
  );
}

export async function loadProgress(): Promise<Progress> {
  return normaliseProgress(await readValue<unknown>(PROGRESS_KEY));
}

export async function recordThreatCheck(entry: ThreatCheckEntry): Promise<Progress> {
  const progress = await loadProgress();
  const next: Progress = {
    ...progress,
    threatAnswers: progress.threatAnswers + 1,
    threatCorrect: progress.threatCorrect + (entry.correct ? 1 : 0),
    threatRushed:
      progress.threatRushed +
      (entry.targets > 0 && entry.ms < THREAT_CHECK.rushedMoveMs ? 1 : 0),
    recentThreatChecks: [...progress.recentThreatChecks, entry].slice(-MAX_RECENT),
  };
  await writeValue(PROGRESS_KEY, next);
  return next;
}

export async function recordGameFinished(
  summary: Omit<GameSummary, 'at'> & { at?: number },
): Promise<Progress> {
  const progress = await loadProgress();
  const entry: GameSummary = {
    result: summary.result,
    blundersPer100: summary.blundersPer100,
    userMoves: summary.userMoves,
    at: summary.at ?? Date.now(),
  };
  const next: Progress = {
    ...progress,
    gamesPlayed: progress.gamesPlayed + 1,
    recentGames: [...progress.recentGames, entry].slice(-MAX_RECENT_GAMES),
  };
  await writeValue(PROGRESS_KEY, next);
  return next;
}

/** Stores the level adaptive mode will start the next game at. */
export async function setAdaptiveLevel(level: number): Promise<Progress> {
  const progress = await loadProgress();
  const next: Progress = {
    ...progress,
    adaptiveLevel: Math.min(10, Math.max(1, Math.round(level))),
  };
  await writeValue(PROGRESS_KEY, next);
  return next;
}
