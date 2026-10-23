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

/** Per-theme tactics stats and the current adaptive rating band. */
export interface TacticsProgress {
  attempts: number;
  correct: number;
  /** Recent results, oldest first. Used to move the rating band. */
  recent: boolean[];
  bandLow: number;
  bandHigh: number;
}

export interface EndgameProgress {
  attempts: number;
  successes: number;
}

export interface Progress {
  threatAnswers: number;
  threatCorrect: number;
  /** Answers given in under `THREAT_CHECK.rushedMoveMs` while a threat existed. */
  threatRushed: number;
  /** Find-the-threat drill answers, kept separate from in-game checks. */
  threatDrillAnswers: number;
  threatDrillCorrect: number;
  /** Hanging-pieces drill answers. */
  hangingAnswers: number;
  hangingCorrect: number;
  gamesPlayed: number;
  /** Level the adaptive opponent starts the next game at. */
  adaptiveLevel: number;
  recentThreatChecks: ThreatCheckEntry[];
  /** Last 10 finished practice games, for the adaptive adjustment and Progress. */
  recentGames: GameSummary[];
  tacticsByTheme: Record<string, TacticsProgress>;
  endgames: Record<string, EndgameProgress>;
}

export const TACTICS_BAND_LOW = 600;
export const TACTICS_BAND_HIGH = 900;
export const TACTICS_BAND_STEP = 100;
export const TACTICS_BAND_MIN = 400;
export const TACTICS_BAND_MAX = 2400;
export const TACTICS_BAND_SAMPLE = 5;
export const TACTICS_RECENT_MAX = 10;

export function emptyTacticsProgress(): TacticsProgress {
  return {
    attempts: 0,
    correct: 0,
    recent: [],
    bandLow: TACTICS_BAND_LOW,
    bandHigh: TACTICS_BAND_HIGH,
  };
}

export const EMPTY_PROGRESS: Progress = {
  threatAnswers: 0,
  threatCorrect: 0,
  threatRushed: 0,
  threatDrillAnswers: 0,
  threatDrillCorrect: 0,
  hangingAnswers: 0,
  hangingCorrect: 0,
  gamesPlayed: 0,
  adaptiveLevel: 2,
  recentThreatChecks: [],
  recentGames: [],
  tacticsByTheme: {},
  endgames: {},
};

const PROGRESS_KEY = 'progress';
const MAX_RECENT = 50;
const MAX_RECENT_GAMES = 10;

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function normaliseTactics(raw: unknown): TacticsProgress {
  if (typeof raw !== 'object' || raw === null) return emptyTacticsProgress();
  const value = raw as Partial<TacticsProgress>;
  const attempts = count(value.attempts);
  const correct = Math.min(attempts, count(value.correct));
  const recent = Array.isArray(value.recent)
    ? value.recent.filter((entry): entry is boolean => typeof entry === 'boolean').slice(-TACTICS_RECENT_MAX)
    : [];

  let bandLow = count(value.bandLow);
  let bandHigh = count(value.bandHigh);
  if (
    bandLow < TACTICS_BAND_MIN ||
    bandHigh > TACTICS_BAND_MAX ||
    bandLow >= bandHigh
  ) {
    bandLow = TACTICS_BAND_LOW;
    bandHigh = TACTICS_BAND_HIGH;
  }

  return { attempts, correct, recent, bandLow, bandHigh };
}

function normaliseTacticsMap(raw: unknown): Record<string, TacticsProgress> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const map: Record<string, TacticsProgress> = {};
  for (const [theme, value] of Object.entries(raw)) {
    if (theme.length > 0) map[theme] = normaliseTactics(value);
  }
  return map;
}

function normaliseEndgames(raw: unknown): Record<string, EndgameProgress> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const map: Record<string, EndgameProgress> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (id.length === 0 || typeof value !== 'object' || value === null) continue;
    const entry = value as Partial<EndgameProgress>;
    const attempts = count(entry.attempts);
    map[id] = { attempts, successes: Math.min(attempts, count(entry.successes)) };
  }
  return map;
}

export function normaliseProgress(raw: unknown): Progress {
  if (typeof raw !== 'object' || raw === null) return { ...EMPTY_PROGRESS };
  const value = raw as Partial<Progress>;

  return {
    threatAnswers: count(value.threatAnswers),
    threatCorrect: Math.min(count(value.threatAnswers), count(value.threatCorrect)),
    threatRushed: count(value.threatRushed),
    threatDrillAnswers: count(value.threatDrillAnswers),
    threatDrillCorrect: Math.min(
      count(value.threatDrillAnswers),
      count(value.threatDrillCorrect),
    ),
    hangingAnswers: count(value.hangingAnswers),
    hangingCorrect: Math.min(count(value.hangingAnswers), count(value.hangingCorrect)),
    gamesPlayed: count(value.gamesPlayed),
    adaptiveLevel: Math.min(10, Math.max(1, count(value.adaptiveLevel) || EMPTY_PROGRESS.adaptiveLevel)),
    recentThreatChecks: Array.isArray(value.recentThreatChecks)
      ? (value.recentThreatChecks as ThreatCheckEntry[]).slice(-MAX_RECENT)
      : [],
    recentGames: Array.isArray(value.recentGames)
      ? (value.recentGames as GameSummary[]).filter(isGameSummary).slice(-MAX_RECENT_GAMES)
      : [],
    tacticsByTheme: normaliseTacticsMap(value.tacticsByTheme),
    endgames: normaliseEndgames(value.endgames),
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

export async function recordThreatDrillAnswer(correct: boolean): Promise<Progress> {
  const progress = await loadProgress();
  const next: Progress = {
    ...progress,
    threatDrillAnswers: progress.threatDrillAnswers + 1,
    threatDrillCorrect: progress.threatDrillCorrect + (correct ? 1 : 0),
  };
  await writeValue(PROGRESS_KEY, next);
  return next;
}

export async function recordHangingAnswer(correct: boolean): Promise<Progress> {
  const progress = await loadProgress();
  const next: Progress = {
    ...progress,
    hangingAnswers: progress.hangingAnswers + 1,
    hangingCorrect: progress.hangingCorrect + (correct ? 1 : 0),
  };
  await writeValue(PROGRESS_KEY, next);
  return next;
}

function shiftBand(tactics: TacticsProgress, delta: number): { bandLow: number; bandHigh: number } {
  const width = Math.max(TACTICS_BAND_STEP, tactics.bandHigh - tactics.bandLow);
  const bandLow = Math.min(
    TACTICS_BAND_MAX - width,
    Math.max(TACTICS_BAND_MIN, tactics.bandLow + delta),
  );
  return { bandLow, bandHigh: bandLow + width };
}

/**
 * Records one tactics puzzle. The band moves up after five recent results at
 * >= 80% and down at <= 50% (SPEC 6.7 Mode 4).
 */
export async function recordTacticsResult(theme: string, correct: boolean): Promise<Progress> {
  const progress = await loadProgress();
  const current = progress.tacticsByTheme[theme] ?? emptyTacticsProgress();
  let recent = [...current.recent, correct].slice(-TACTICS_RECENT_MAX);
  let bandLow = current.bandLow;
  let bandHigh = current.bandHigh;

  if (recent.length >= TACTICS_BAND_SAMPLE) {
    const successes = recent.filter(Boolean).length;
    const rate = successes / recent.length;
    if (rate >= 0.8) {
      ({ bandLow, bandHigh } = shiftBand(current, TACTICS_BAND_STEP));
      recent = [];
    } else if (rate <= 0.5) {
      ({ bandLow, bandHigh } = shiftBand(current, -TACTICS_BAND_STEP));
      recent = [];
    }
  }

  const nextTactics: TacticsProgress = {
    ...current,
    attempts: current.attempts + 1,
    correct: current.correct + (correct ? 1 : 0),
    recent,
    bandLow,
    bandHigh,
  };

  const next: Progress = {
    ...progress,
    tacticsByTheme: { ...progress.tacticsByTheme, [theme]: nextTactics },
  };
  await writeValue(PROGRESS_KEY, next);
  return next;
}

export async function recordEndgameResult(id: string, success: boolean): Promise<Progress> {
  const progress = await loadProgress();
  const current = progress.endgames[id] ?? { attempts: 0, successes: 0 };
  const next: Progress = {
    ...progress,
    endgames: {
      ...progress.endgames,
      [id]: {
        attempts: current.attempts + 1,
        successes: current.successes + (success ? 1 : 0),
      },
    },
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
