import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import {
  ENDGAMES,
  engineResultForUser,
  goalMatchesEngine,
} from '../../src/data/endgames';
import type { EndgameDrill } from '../../src/data/endgames';

describe('endgame data', () => {
  it('has unique ids and legal, unfinished starting positions', () => {
    const ids = new Set<string>();

    for (const drill of ENDGAMES) {
      expect(ids.has(drill.id)).toBe(false);
      ids.add(drill.id);

      const chess = new Chess(drill.fen);
      expect(chess.turn()).toBe(drill.userColor);
      expect(chess.isGameOver()).toBe(false);
      expect(drill.hint.length).toBeGreaterThan(0);
      expect(drill.moveBudget).toBeGreaterThan(0);
      expect(drill.engine.depth).toBeGreaterThan(0);
    }
  });

  it('covers the required initial set', () => {
    expect(ENDGAMES.some((drill) => drill.id === 'kq-vs-k')).toBe(true);
    expect(ENDGAMES.some((drill) => drill.id === 'kr-vs-k')).toBe(true);
    expect(ENDGAMES.filter((drill) => drill.id.startsWith('kp-vs-k')).length).toBeGreaterThanOrEqual(
      2,
    );
    expect(ENDGAMES.filter((drill) => drill.id.startsWith('rp-vs-r')).length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it('has a stored Stockfish result that supports each stated goal', () => {
    for (const drill of ENDGAMES) {
      expect(goalMatchesEngine(drill), drill.id).toBe(true);
    }
  });
});

describe('engine result interpretation', () => {
  const base: EndgameDrill = ENDGAMES[0]!;

  it('reads mate and centipawn scores from the user perspective', () => {
    expect(engineResultForUser({ ...base, engine: { depth: 18, mate: 4 } })).toBe('win');
    expect(engineResultForUser({ ...base, engine: { depth: 18, mate: -4 } })).toBe('loss');
    expect(engineResultForUser({ ...base, engine: { depth: 18, cp: 300 } })).toBe('win');
    expect(engineResultForUser({ ...base, engine: { depth: 18, cp: -300 } })).toBe('loss');
    expect(engineResultForUser({ ...base, engine: { depth: 18, cp: 4 } })).toBe('draw');
  });

  it('does not treat a draw as a win', () => {
    expect(goalMatchesEngine({ ...base, goal: 'win', engine: { depth: 18, cp: 0 } })).toBe(false);
    expect(goalMatchesEngine({ ...base, goal: 'draw', engine: { depth: 18, cp: 0 } })).toBe(true);
  });
});
