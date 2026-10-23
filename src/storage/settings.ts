import { readValue, writeValue } from './db';

export type ThreatCheckMode = 'always' | 'whenThreatExists' | 'off';
export type TacticsMode = 'learn' | 'test';

export interface Settings {
  /** SPEC 2.5: once a piece is picked it must move. Default ON. */
  touchMove: boolean;
  /** SPEC 2.7: default `always`. */
  threatCheck: ThreatCheckMode;
  /** `adaptive` or a fixed level 1-10. */
  opponentLevel: 'adaptive' | number;
  /** Hints per game, 0-3. Used from Phase 2 on. */
  hintsPerGame: number;
  /** SPEC 6.7 Mode 4: Learn shows the theme before the puzzle. */
  tacticsMode: TacticsMode;
}

export const DEFAULT_SETTINGS: Settings = {
  touchMove: true,
  threatCheck: 'always',
  opponentLevel: 'adaptive',
  hintsPerGame: 3,
  tacticsMode: 'learn',
};

const SETTINGS_KEY = 'settings';

const THREAT_MODES: readonly ThreatCheckMode[] = ['always', 'whenThreatExists', 'off'];

function normaliseLevel(value: unknown): 'adaptive' | number {
  if (value === 'adaptive') return 'adaptive';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(10, Math.max(1, Math.round(value)));
  }
  return DEFAULT_SETTINGS.opponentLevel;
}

/** Accepts anything from storage and returns a usable object. */
export function normaliseSettings(raw: unknown): Settings {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SETTINGS };
  const value = raw as Partial<Record<keyof Settings, unknown>>;

  const threatCheck = THREAT_MODES.includes(value.threatCheck as ThreatCheckMode)
    ? (value.threatCheck as ThreatCheckMode)
    : DEFAULT_SETTINGS.threatCheck;

  const hints =
    typeof value.hintsPerGame === 'number' && Number.isFinite(value.hintsPerGame)
      ? Math.min(3, Math.max(0, Math.round(value.hintsPerGame)))
      : DEFAULT_SETTINGS.hintsPerGame;

  const tacticsMode =
    value.tacticsMode === 'test' || value.tacticsMode === 'learn'
      ? value.tacticsMode
      : DEFAULT_SETTINGS.tacticsMode;

  return {
    touchMove: typeof value.touchMove === 'boolean' ? value.touchMove : DEFAULT_SETTINGS.touchMove,
    threatCheck,
    opponentLevel: normaliseLevel(value.opponentLevel),
    hintsPerGame: hints,
    tacticsMode,
  };
}

export async function loadSettings(): Promise<Settings> {
  return normaliseSettings(await readValue<unknown>(SETTINGS_KEY));
}

export async function saveSettings(settings: Settings): Promise<void> {
  await writeValue(SETTINGS_KEY, normaliseSettings(settings));
}
