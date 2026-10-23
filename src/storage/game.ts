import type { Color } from 'chess.js';
import { readValue, removeValue, writeValue } from './db';

/** Enough to rebuild the game after the app was closed. */
export interface SavedGame {
  fen: string;
  /** SAN history, in order. */
  moves: string[];
  userColor: Color;
  level: number;
  updatedAt: number;
}

const GAME_KEY = 'current-game';

export async function saveGame(game: SavedGame): Promise<void> {
  await writeValue(GAME_KEY, game);
}

export async function loadGame(): Promise<SavedGame | null> {
  const raw = await readValue<SavedGame>(GAME_KEY);
  if (!raw || typeof raw.fen !== 'string' || !Array.isArray(raw.moves)) return null;
  if (raw.userColor !== 'w' && raw.userColor !== 'b') return null;
  return {
    fen: raw.fen,
    moves: raw.moves.filter((move): move is string => typeof move === 'string'),
    userColor: raw.userColor,
    level: typeof raw.level === 'number' ? raw.level : 2,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
  };
}

export async function clearGame(): Promise<void> {
  await removeValue(GAME_KEY);
}
