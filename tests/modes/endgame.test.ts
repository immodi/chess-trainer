import { Chess } from 'chess.js';
import { describe, expect, it, vi } from 'vitest';
import { ENDGAMES } from '../../src/data/endgames';
import type { EndgameDrill } from '../../src/data/endgames';
import {
  applyEndgameMove,
  budgetExceeded,
  chooseEndgameMove,
  endgameResult,
  goalMet,
} from '../../src/modes/endgame';

const drill: EndgameDrill = ENDGAMES[0]!;

describe('endgame moves', () => {
  it('applies a legal move and rejects an illegal one', () => {
    const applied = applyEndgameMove(drill.fen, { from: 'h5', to: 'd5' });
    expect(applied?.uci).toBe('h5d5');
    expect(applied?.san).toBe('Qd5');
    expect(applyEndgameMove(drill.fen, { from: 'a1', to: 'h8' })).toBeNull();
  });
});

describe('endgame results', () => {
  it('reports a win for the mating side and a loss for the other', () => {
    const mate = new Chess('R5k1/5ppp/8/8/8/8/8/4K3 b - - 0 1');
    expect(mate.isCheckmate()).toBe(true);
    expect(endgameResult(mate, 'w')).toBe('win');
    expect(endgameResult(mate, 'b')).toBe('loss');
  });

  it('reports a draw for stalemate', () => {
    const stalemate = new Chess('7k/5K2/6Q1/8/8/8/8/8 b - - 0 1');
    expect(stalemate.isStalemate()).toBe(true);
    expect(endgameResult(stalemate, 'w')).toBe('draw');
  });

  it('returns null while the game is still running', () => {
    expect(endgameResult(new Chess(drill.fen), 'w')).toBeNull();
  });

  it('matches the goal only when the result is the same', () => {
    expect(goalMet(drill, 'win')).toBe(true);
    expect(goalMet(drill, 'draw')).toBe(false);
    expect(goalMet({ ...drill, goal: 'draw' }, 'draw')).toBe(true);
  });
});

describe('move budget', () => {
  it('allows the stated number of full moves and fails after it', () => {
    expect(budgetExceeded({ ...drill, moveBudget: 2 }, 4)).toBe(false);
    expect(budgetExceeded({ ...drill, moveBudget: 2 }, 5)).toBe(true);
  });
});

describe('full-strength engine move', () => {
  it('uses the engine best move', async () => {
    const analyze = vi.fn().mockResolvedValue({
      lines: [{ multipv: 1, pv: ['h5d5'], depth: 18 }],
      bestMove: 'h5d5',
      stopped: false,
    });
    await expect(chooseEndgameMove(drill.fen, analyze)).resolves.toBe('h5d5');
  });

  it('falls back to the first PV move and refuses a stopped search', async () => {
    const withPv = vi.fn().mockResolvedValue({
      lines: [{ multipv: 1, pv: ['h5d5'], depth: 18 }],
      bestMove: null,
      stopped: false,
    });
    await expect(chooseEndgameMove(drill.fen, withPv)).resolves.toBe('h5d5');

    const stopped = vi.fn().mockResolvedValue({ lines: [], bestMove: null, stopped: true });
    await expect(chooseEndgameMove(drill.fen, stopped)).resolves.toBeNull();
  });
});
