import type { Color } from 'chess.js';
import type { GameMode, HintUse } from '../modes/play';
import { normaliseHints } from '../modes/play';
import { readValue, removeValue, writeValue } from './db';

/** Enough to rebuild the game after the app was closed. */
export interface SavedGame {
  fen: string;
  /** SAN history, in order. */
  moves: string[];
  userColor: Color;
  level: number;
  mode: GameMode;
  hints: HintUse[];
  updatedAt: number;
}

/** Written before casual mode existed; migrated into the practice slot. */
const LEGACY_GAME_KEY = 'current-game';

function gameKey(mode: GameMode): string {
  return `current-game:${mode}`;
}

export async function saveGame(game: SavedGame): Promise<boolean> {
  return writeValue(gameKey(game.mode), game);
}

export async function loadGame(mode: GameMode): Promise<SavedGame | null> {
  let raw = await readValue<SavedGame>(gameKey(mode));

  if (!raw && mode === 'practice') {
    const legacy = await readValue<SavedGame>(LEGACY_GAME_KEY);
    if (legacy) {
      const migrated: SavedGame = {
        ...legacy,
        mode: 'practice',
        hints: normaliseHints(legacy.hints),
      };
      // Keep the legacy copy until the new one is safely written.
      if (await saveGame(migrated)) await removeValue(LEGACY_GAME_KEY);
      raw = migrated;
    }
  }

  if (!raw || typeof raw.fen !== 'string' || !Array.isArray(raw.moves)) return null;
  if (raw.userColor !== 'w' && raw.userColor !== 'b') return null;
  return {
    fen: raw.fen,
    moves: raw.moves.filter((move): move is string => typeof move === 'string'),
    userColor: raw.userColor,
    level: typeof raw.level === 'number' ? raw.level : 2,
    mode: raw.mode === 'casual' ? 'casual' : 'practice',
    hints: normaliseHints(raw.hints),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
  };
}

export async function clearGame(mode: GameMode): Promise<void> {
  await removeValue(gameKey(mode));
  if (mode === 'practice') await removeValue(LEGACY_GAME_KEY);
}
