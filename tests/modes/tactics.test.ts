import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { Puzzle } from '../../src/data/puzzles';
import {
  expectedMove,
  pickPuzzle,
  playPuzzleMove,
  startAttempt,
} from '../../src/modes/tactics';

const puzzle: Puzzle = {
  id: 'mate-fixture',
  fen: '7k/p7/5KQ1/8/2B5/8/8/8 b - - 0 1',
  moves: 'a7a6 g6g7',
  rating: 800,
  themes: ['mateIn1'],
};

const otherPuzzle: Puzzle = {
  ...puzzle,
  id: 'fork-fixture',
  fen: '4k3/8/8/8/8/8/8/R3K3 b - - 0 1',
  moves: 'e8d8 a1a8',
  themes: ['fork'],
  rating: 1200,
};

describe('puzzle preparation', () => {
  it('applies the opponent first move and leaves the user to move', () => {
    const attempt = startAttempt(puzzle);
    expect(attempt).not.toBeNull();
    expect(attempt?.prepared.userColor).toBe('w');
    expect(attempt?.prepared.solution).toEqual(['g6g7']);
    expect(new Chess(attempt?.fen).turn()).toBe('w');
  });

  it('rejects malformed puzzle data', () => {
    expect(startAttempt({ ...puzzle, moves: 'a7a6' })).toBeNull();
    expect(startAttempt({ ...puzzle, moves: 'a7a6 z9z9' })).toBeNull();
  });
});

describe('puzzle flow', () => {
  it('solves when the user plays the expected move', () => {
    const attempt = startAttempt(puzzle);
    expect(attempt).not.toBeNull();
    const solved = playPuzzleMove(attempt!, 'g6g7');

    expect(solved.done).toBe(true);
    expect(solved.solved).toBe(true);
    expect(solved.wrong).toBeNull();
    expect(solved.remainingSan).toEqual([]);
  });

  it('ends on a wrong move and keeps the expected move for the reveal', () => {
    const attempt = startAttempt(puzzle);
    expect(attempt).not.toBeNull();
    const before = attempt!.fen;
    const failed = playPuzzleMove(attempt!, 'g6g5');

    expect(failed.done).toBe(true);
    expect(failed.solved).toBe(false);
    expect(failed.wrong).toBe('g6g5');
    expect(failed.expected).toBe('g6g7');
    expect(failed.fen).toBe(before);
    expect(failed.remainingSan).toEqual(['Qg7#']);
  });

  it('accepts a different move that checkmates', () => {
    const attempt = startAttempt(puzzle);
    expect(attempt).not.toBeNull();
    expect(expectedMove(attempt!)).toBe('g6g7');

    const solved = playPuzzleMove(attempt!, 'g6h6');
    expect(solved.done).toBe(true);
    expect(solved.solved).toBe(true);
    expect(solved.wrong).toBeNull();
    expect(new Chess(solved.fen).isCheckmate()).toBe(true);
  });
});

describe('puzzle selection', () => {
  it('picks a puzzle in the requested theme and rating band', () => {
    const picked = pickPuzzle([puzzle, otherPuzzle], 'fork', { low: 1100, high: 1300 });
    expect(picked?.id).toBe('fork-fixture');
  });

  it('honours the exclude set', () => {
    const picked = pickPuzzle(
      [puzzle, otherPuzzle],
      'fork',
      { low: 600, high: 900 },
      new Set(['fork-fixture']),
    );
    expect(picked).toBeNull();
  });

  it('widens an empty band before giving up', () => {
    const picked = pickPuzzle([puzzle], 'mateIn1', { low: 2200, high: 2400 });
    expect(picked?.id).toBe('mate-fixture');
  });
});
