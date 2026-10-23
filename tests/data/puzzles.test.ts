import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { Puzzle } from '../../src/data/puzzles';
import { preparePuzzle } from '../../src/data/puzzles';
import puzzlesJson from '../../src/data/puzzles.json';
import { THEMES } from '../../src/data/themes';

const puzzles = puzzlesJson as Puzzle[];
const knownThemes = new Set(THEMES.map((theme) => theme.id));

describe('puzzle data', () => {
  it('has the expected compact schema and unique ids', () => {
    expect(puzzles.length).toBeGreaterThan(1000);
    const ids = new Set<string>();

    for (const puzzle of puzzles) {
      expect(typeof puzzle.id).toBe('string');
      expect(ids.has(puzzle.id)).toBe(false);
      ids.add(puzzle.id);

      expect(typeof puzzle.fen).toBe('string');
      expect(typeof puzzle.moves).toBe('string');
      expect(Number.isInteger(puzzle.rating)).toBe(true);
      expect(puzzle.rating).toBeGreaterThanOrEqual(600);
      expect(puzzle.rating).toBeLessThanOrEqual(1800);

      expect(Array.isArray(puzzle.themes)).toBe(true);
      expect(puzzle.themes.length).toBeGreaterThan(0);
      for (const theme of puzzle.themes) expect(knownThemes.has(theme)).toBe(true);

      expect(new Chess(puzzle.fen).isGameOver()).toBe(false);
      expect(puzzle.moves.trim().split(/\s+/).length).toBeGreaterThanOrEqual(2);
    }
  }, 15_000);

  it('prepares a broad sample and validates each complete solution', () => {
    // The generator checks every row; replaying all 17k solutions here makes
    // the unit suite unnecessarily slow. Every 30th puzzle covers the data.
    const sample = puzzles.filter((_, index) => index % 30 === 0);
    expect(sample.length).toBeGreaterThan(400);
    for (const puzzle of sample) {
      expect(preparePuzzle(puzzle), puzzle.id).not.toBeNull();
    }
  }, 10_000);
});
