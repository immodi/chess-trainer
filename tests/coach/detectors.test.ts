import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { DetectCtx } from '../../src/coach/detectors';
import {
  findAllowedMate,
  findBackRankFinding,
  findDiscoveredFinding,
  findForkFinding,
  findLeftHanging,
  findMissedCapture,
  findMissedMate,
  findPinFinding,
  findSkewerFinding,
} from '../../src/coach/detectors';
import { findFork } from '../../src/coach/tactics';

/** Builds the detector context from a legal move, so fixtures cannot drift. */
function context(
  fenBefore: string,
  playedUci: string,
  options: { bestMove?: string; opponentBestMove?: string } = {},
): DetectCtx {
  const before = new Chess(fenBefore);
  const mover = before.turn();
  const from = playedUci.slice(0, 2) as Square;
  const to = playedUci.slice(2, 4) as Square;
  const promotion = playedUci.length > 4 ? (playedUci.slice(4, 5) as 'q' | 'r' | 'b' | 'n') : undefined;
  before.move(promotion ? { from, to, promotion } : { from, to });

  return {
    fenBefore,
    fenAfter: before.fen(),
    playedUci,
    mover,
    bestMove: options.bestMove ?? null,
    opponentBestMove: options.opponentBestMove ?? null,
  };
}

describe('leftHanging', () => {
  it('reports the moved piece landing on an attacked square', () => {
    const ctx = context('4k3/8/8/8/8/2N2q2/8/4K3 w - - 0 1', 'c3e4');
    const findings = findLeftHanging(ctx);
    expect(findings.some((finding) => finding.squares.includes('e4'))).toBe(true);
    expect(findings[0]?.text).toContain('e4');
  });

  it('reports a piece that lost its defender', () => {
    const ctx = context('r3k3/8/8/8/8/8/P7/R3K3 w - - 0 1', 'a1b1');
    const findings = findLeftHanging(ctx);
    expect(findings.some((finding) => finding.squares.includes('a2'))).toBe(true);
  });

  it('reports a threat that was already there and ignored', () => {
    const ctx = context('3rk3/8/8/8/8/8/8/3QK3 w - - 0 1', 'e1f1');
    const findings = findLeftHanging(ctx);
    expect(findings.some((finding) => finding.squares.includes('d1'))).toBe(true);
    expect(findings[0]?.text).toContain('already under attack');
  });

  it('stays quiet when the move is safe', () => {
    const ctx = context('4k3/8/8/8/8/2N2q2/8/4K3 w - - 0 1', 'c3b1');
    expect(findLeftHanging(ctx)).toEqual([]);
  });
});

describe('missedCapture', () => {
  it('names a free capture the engine wanted', () => {
    const ctx = context('4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1', 'e1e2', {
      bestMove: 'e4d5',
    });
    const finding = findMissedCapture(ctx);
    expect(finding?.kind).toBe('missedCapture');
    expect(finding?.text).toContain('d5');
  });

  it('stays quiet when the best move is not a capture', () => {
    const ctx = context('4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1', 'e1e2', {
      bestMove: 'e1e2',
    });
    expect(findMissedCapture(ctx)).toBeNull();
  });
});

describe('mates', () => {
  it('finds the mate the opponent gets after the move', () => {
    const ctx = context('r3k3/8/8/8/8/7R/5PPP/6K1 w - - 0 1', 'h3h4');
    const finding = findAllowedMate(ctx);
    expect(finding?.kind).toBe('allowedMate');
    expect(finding?.text).toContain('mate in one');
  });

  it('stays quiet when the move creates luft', () => {
    const ctx = context('r3k3/8/8/8/8/7R/5PPP/6K1 w - - 0 1', 'g2g3');
    expect(findAllowedMate(ctx)).toBeNull();
  });

  it('finds a mate in one the user missed', () => {
    const ctx = context('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', 'a1a2', {
      bestMove: 'a1a8',
    });
    const finding = findMissedMate(ctx);
    expect(finding?.kind).toBe('missedMate');
    expect(finding?.text).toContain('mate in one');
  });

  it('stays quiet when the user played the mate', () => {
    const ctx = context('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', 'a1a8');
    expect(findMissedMate(ctx)).toBeNull();
  });
});

describe('fork', () => {
  it('finds the fork the user could have played', () => {
    const ctx = context('4k3/3q4/8/8/6N1/8/8/4K3 w - - 0 1', 'e1e2', {
      bestMove: 'g4f6',
    });
    const finding = findForkFinding(ctx);
    expect(finding?.kind).toBe('fork');
    expect(finding?.text).toContain('fork');
    expect(finding?.text).toContain('g4');
  });

  it('rejects a fork whose forker can be taken', () => {
    const chess = new Chess('4k3/3q2p1/8/8/6N1/8/8/4K3 w - - 0 1');
    chess.move({ from: 'g4', to: 'f6' });
    expect(findFork(chess, 'f6')).toBeNull();
  });

  it('stays quiet when there is no fork', () => {
    const ctx = context('4k3/8/8/8/8/2N2q2/8/4K3 w - - 0 1', 'c3b1', {
      bestMove: 'c3b1',
    });
    expect(findForkFinding(ctx)).toBeNull();
  });
});

describe('pin', () => {
  it('reports an absolute pin against the mover', () => {
    const ctx = context('4k3/8/8/8/1b6/2N5/7P/4K3 w - - 0 1', 'h2h3');
    const finding = findPinFinding(ctx);
    expect(finding?.kind).toBe('pin');
    expect(finding?.text).toContain('c3');
    expect(finding?.text).toContain('king');
  });

  it('stays quiet when the king steps off the line', () => {
    const ctx = context('4k3/8/8/8/1b6/2N5/7P/4K3 w - - 0 1', 'e1f1');
    expect(findPinFinding(ctx)).toBeNull();
  });
});

describe('skewer', () => {
  it('reports a skewer against the mover', () => {
    const ctx = context('r3k3/8/8/Q7/8/8/8/R3K3 w - - 0 1', 'e1f1');
    const finding = findSkewerFinding(ctx);
    expect(finding?.kind).toBe('skewer');
    expect(finding?.text).toContain('a5');
    expect(finding?.text).toContain('a1');
  });

  it('does not call a more-valuable piece behind a lesser one a skewer', () => {
    const ctx = context('r3k3/8/8/R7/8/8/8/Q3K3 w - - 0 1', 'e1f1');
    expect(findSkewerFinding(ctx)).toBeNull();
  });
});

describe('back rank', () => {
  it('warns about a king with no luft and an enemy rook on the rank', () => {
    const ctx = context('r3k3/8/8/8/8/7R/5PPP/6K1 w - - 0 1', 'h3h4');
    const finding = findBackRankFinding(ctx);
    expect(finding?.kind).toBe('backRank');
    expect(finding?.text).toContain('g1');
  });

  it('stays quiet after a pawn move creates luft', () => {
    const ctx = context('r3k3/8/8/8/8/7R/5PPP/6K1 w - - 0 1', 'g2g3');
    expect(findBackRankFinding(ctx)).toBeNull();
  });
});

describe('discovered attack', () => {
  it('finds an attack uncovered by the move', () => {
    const ctx = context('4q2k/8/8/8/4N3/8/8/4R1K1 w - - 0 1', 'e4c5');
    const finding = findDiscoveredFinding(ctx);
    expect(finding?.kind).toBe('discovered');
    expect(finding?.text).toContain('e1');
    expect(finding?.text).toContain('e8');
  });

  it('stays quiet when nothing was uncovered', () => {
    const ctx = context('4q2k/8/8/8/4N3/8/8/4R1K1 w - - 0 1', 'g1f1');
    expect(findDiscoveredFinding(ctx)).toBeNull();
  });

  it('does not call a slider moving onto the line a discovered attack', () => {
    const ctx = context('4q2k/8/8/8/4R3/8/8/6K1 w - - 0 1', 'e4e1');
    expect(findDiscoveredFinding(ctx)).toBeNull();
  });
});
