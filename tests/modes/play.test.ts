import { describe, expect, it } from 'vitest';
import type { Square } from 'chess.js';
import {
  applyMove,
  applyUci,
  fromSaved,
  isUserTurn,
  newGame,
  normaliseHints,
  playedUci,
  resign,
  resultFor,
  resultText,
  START_FEN,
} from '../../src/modes/play';
import type { GameState } from '../../src/modes/play';

function play(state: GameState, from: string, to: string): GameState {
  const next = applyMove(state, { from: from as Square, to: to as Square });
  if (!next) throw new Error(`Expected ${from}${to} to be legal`);
  return next;
}

describe('newGame', () => {
  it('starts from the initial position with the user to move as White', () => {
    const state = newGame('w', 3);
    expect(state.fen).toBe(START_FEN);
    expect(state.moves).toEqual([]);
    expect(state.outcome).toBeNull();
    expect(isUserTurn(state)).toBe(true);
  });

  it('is not the user turn when the user plays Black', () => {
    expect(isUserTurn(newGame('b', 3))).toBe(false);
  });

  it('defaults to a practice game', () => {
    expect(newGame('w', 3).mode).toBe('practice');
  });

  it('carries the requested mode', () => {
    expect(newGame('w', 3, 'casual').mode).toBe('casual');
  });
});

describe('applyMove', () => {
  it('plays a legal move and records it', () => {
    const state = play(newGame('w', 1), 'e2', 'e4');
    expect(state.moves).toHaveLength(1);
    expect(state.moves[0]?.san).toBe('e4');
    expect(state.fen).not.toBe(START_FEN);
    expect(isUserTurn(state)).toBe(false);
  });

  it('ignores an illegal move (SPEC 2.3)', () => {
    expect(applyMove(newGame('w', 1), { from: 'e2', to: 'e5' })).toBeNull();
  });

  it('ignores a move of the wrong colour', () => {
    expect(applyMove(newGame('w', 1), { from: 'e7', to: 'e5' })).toBeNull();
  });

  it('detects checkmate', () => {
    let state = newGame('w', 1);
    state = play(state, 'f2', 'f3');
    state = play(state, 'e7', 'e5');
    state = play(state, 'g2', 'g4');
    state = play(state, 'd8', 'h4');

    expect(state.outcome).toEqual({ kind: 'checkmate', winner: 'b' });
    expect(resultText(state.outcome!, 'w')).toBe('Checkmate. The computer won.');
    expect(resultFor(state.outcome!, 'w')).toBe('loss');
  });

  it('refuses to move after the game ended', () => {
    let state = newGame('w', 1);
    state = play(state, 'f2', 'f3');
    state = play(state, 'e7', 'e5');
    state = play(state, 'g2', 'g4');
    state = play(state, 'd8', 'h4');
    expect(applyMove(state, { from: 'a2', to: 'a3' })).toBeNull();
  });
});

describe('applyUci', () => {
  it('applies an engine move', () => {
    const state = applyUci(newGame('w', 1), 'e2e4');
    expect(state?.moves[0]?.san).toBe('e4');
  });

  it('rejects a bogus engine move', () => {
    expect(applyUci(newGame('w', 1), 'e2e5')).toBeNull();
  });
});

describe('promotions and hints', () => {
  it('keeps the promotion piece in the UCI form', () => {
    expect(
      playedUci({
        san: 'b8=Q+',
        from: 'b7',
        to: 'b8',
        promotion: 'q',
        color: 'w',
        piece: 'p',
      }),
    ).toBe('b7b8q');
  });

  it('normalises stored hints and drops junk', () => {
    expect(
      normaliseHints([
        { ply: 1.9, level: 9 },
        { ply: -2, level: 0 },
        null,
        { ply: 'x', level: 2 },
      ]),
    ).toEqual([
      { ply: 1, level: 3 },
      { ply: 0, level: 1 },
    ]);
    expect(normaliseHints('nope')).toEqual([]);
  });
});

describe('resign', () => {
  it('ends the game with the computer as winner', () => {
    const state = resign(newGame('w', 1));
    expect(state.outcome).toEqual({ kind: 'resigned', winner: 'b' });
    expect(resultText(state.outcome!, 'w')).toBe('You resigned.');
  });
});

describe('fromSaved', () => {
  it('rebuilds the position from SAN history', () => {
    let state = newGame('w', 1);
    state = play(state, 'e2', 'e4');
    state = play(state, 'e7', 'e5');

    const restored = fromSaved({
      moves: state.moves.map((move) => move.san),
      userColor: 'w',
      level: 1,
    });

    expect(restored?.fen).toBe(state.fen);
    expect(restored?.moves.map((move) => move.san)).toEqual(['e4', 'e5']);
    expect(restored?.outcome).toBeNull();
    expect(restored?.mode).toBe('practice');
  });

  it('keeps the saved mode', () => {
    const restored = fromSaved({ moves: ['e4'], userColor: 'w', level: 2, mode: 'casual' });
    expect(restored?.mode).toBe('casual');
  });

  it('keeps valid saved hints', () => {
    const restored = fromSaved({
      moves: ['e4'],
      userColor: 'w',
      level: 2,
      hints: [{ ply: 0, level: 3 }],
    });
    expect(restored?.hints).toEqual([{ ply: 0, level: 3 }]);
  });

  it('treats saves without a mode as practice games', () => {
    const restored = fromSaved({ moves: ['e4'], userColor: 'w', level: 2 });
    expect(restored?.mode).toBe('practice');
  });

  it('returns null for a corrupt save', () => {
    expect(fromSaved({ moves: ['e4', 'not-a-move'], userColor: 'w', level: 1 })).toBeNull();
  });
});
