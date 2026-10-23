import { describe, expect, it } from 'vitest';
import { hasHangingPiece, hangingPieces, withSideToMove } from '../../src/coach/hanging';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('withSideToMove', () => {
  it('flips the active colour and clears en passant', () => {
    expect(withSideToMove('8/8/8/8/8/8/8/K6k w KQkq e3 0 1', 'b')).toBe('8/8/8/8/8/8/8/K6k b KQkq - 0 1');
  });

  it('rejects malformed FENs', () => {
    expect(() => withSideToMove('8/8/8', 'b')).toThrow(/Malformed FEN/);
  });
});

describe('hangingPieces', () => {
  it('finds nothing in the starting position (negative fixture)', () => {
    expect(hangingPieces(START)).toEqual([]);
  });

  it('finds an undefended queen (positive fixture)', () => {
    expect(hangingPieces('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1')).toEqual([
      { square: 'd5', color: 'b', type: 'q', value: 9 },
    ]);
  });

  it('finds a knight attacked by a pawn', () => {
    expect(hangingPieces('4k3/8/8/3n4/4P3/8/8/4K3 w - - 0 1')).toEqual([
      { square: 'd5', color: 'b', type: 'n', value: 3 },
    ]);
  });

  it('does not call a piece hanging when the recapture is illegal', () => {
    // The black queen on d5 is defended by a pinned bishop, so it is lost.
    expect(hangingPieces('4k3/4b3/8/3q4/8/8/8/3RR1K1 w - - 0 1')).toEqual([
      { square: 'd5', color: 'b', type: 'q', value: 9 },
    ]);
  });

  it('returns undefined when the null move is illegal', () => {
    // Black is in check while White is to move: there is no "other side to move".
    expect(hangingPieces('4k3/4R3/8/8/8/8/8/4K3 b - - 0 1')).toBeUndefined();
    expect(hasHangingPiece('4k3/4R3/8/8/8/8/8/4K3 b - - 0 1', 'w')).toBeUndefined();
  });

  it('survives an en-passant FEN', () => {
    expect(() => hangingPieces('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3')).not.toThrow();
  });
});
