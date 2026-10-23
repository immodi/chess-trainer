import { describe, expect, it } from 'vitest';
import { see } from '../../src/coach/see';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('see', () => {
  it('wins a free queen (positive fixture)', () => {
    expect(see('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1', 'd5')).toBe(9);
  });

  it('declines a pawn defended by a cheaper piece (negative fixture)', () => {
    // Nxd5 wins a pawn but cxd5 wins the knight back: 1 - 3 < 0, so stand pat.
    expect(see('4k3/8/2p5/3p4/8/2N5/8/4K3 w - - 0 1', 'd5')).toBe(0);
  });

  it('sees the second attacker behind the first (x-ray battery)', () => {
    // Rxa5, Rxa5, Rxa5: the queen plus the recaptured rook is a net +9.
    expect(see('r3k3/8/8/q7/8/R7/8/R6K w - - 0 1', 'a5')).toBe(9);
  });

  it('ignores a recapture by a pinned defender', () => {
    // The e7 bishop cannot take on d5 without exposing the e8 king.
    expect(see('4k3/4b3/8/3q4/8/8/8/3RR1K1 w - - 0 1', 'd5')).toBe(9);
  });

  it('is 0 on empty squares and on the starting position', () => {
    expect(see(START, 'e4')).toBe(0);
    expect(see(START, 'd5')).toBe(0);
  });

  it('is 0 when nothing attacks the square', () => {
    expect(see('4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'e4')).toBe(0);
  });
});
