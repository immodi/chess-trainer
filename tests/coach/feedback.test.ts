import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { describe, expect, it } from 'vitest';
import type { MoveClassification } from '../../src/coach/classify';
import type { DetectCtx } from '../../src/coach/detectors';
import { buildFeedback } from '../../src/coach/feedback';

function context(fenBefore: string, playedUci: string): DetectCtx {
  const chess = new Chess(fenBefore);
  const mover = chess.turn();
  const from = playedUci.slice(0, 2) as Square;
  const to = playedUci.slice(2, 4) as Square;
  chess.move({ from, to });
  return {
    fenBefore,
    fenAfter: chess.fen(),
    playedUci,
    mover,
    bestMove: null,
    opponentBestMove: null,
  };
}

const classification: MoveClassification = {
  label: 'mistake',
  loss: 12,
  best: false,
  winBefore: 60,
  winAfter: 48,
};

describe('buildFeedback', () => {
  it('leads with the most severe detector finding', () => {
    const ctx = context('r3k3/8/8/8/8/7R/5PPP/6K1 w - - 0 1', 'h3h4');
    const feedback = buildFeedback(ctx, classification, 50, 0);
    expect(feedback.fallback).toBe(false);
    expect(feedback.lead.kind).toBe('allowedMate');
    expect(feedback.lead.text).toContain('mate in one');
  });

  it('uses the fallback when no detector can name a reason', () => {
    const ctx = context('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e4');
    const feedback = buildFeedback(ctx, classification, 50, 20);
    expect(feedback.fallback).toBe(true);
    expect(feedback.lead.kind).toBe('fallback');
    expect(feedback.lead.text).toContain('cannot point to a single clear reason');
  });

  it('never names the best move in the fallback', () => {
    const ctx = context('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e4');
    const feedback = buildFeedback(ctx, classification, 50, 20);
    expect(feedback.lead.text).not.toMatch(/Nf3|e4|engine preferred \w/);
  });
});
