import type { MoveClassification, MoveLabel } from './classify';
import type { DetectCtx } from './detectors';
import { runDetectors } from './detectors';
import type { Finding } from './findings';

export interface Feedback {
  label: MoveLabel;
  /** Win% points lost. */
  loss: number;
  /** The reason shown first. */
  lead: Finding;
  /** Additional reasons behind the "More" toggle. */
  others: Finding[];
  /** True when no detector could name a reason. */
  fallback: boolean;
}

const MAX_OTHERS = 3;

/**
 * Turns detector output into one card (SPEC 6.5).
 *
 * The highest-severity finding leads. When nothing fires, the fallback states
 * the size of the mistake without naming the best move: in a game the user has
 * to find it, and hint level 3 is the only in-game reveal.
 */
export function buildFeedback(
  ctx: DetectCtx,
  classification: MoveClassification,
  cpBefore: number,
  cpAfterMover: number,
): Feedback {
  const findings = runDetectors(ctx).sort((a, b) => b.severity - a.severity);
  const unique = dedupe(findings);

  if (unique.length === 0) {
    return {
      label: classification.label,
      loss: classification.loss,
      lead: {
        kind: 'fallback',
        severity: 0,
        squares: [],
        text: fallbackText(cpBefore, cpAfterMover),
      },
      others: [],
      fallback: true,
    };
  }

  return {
    label: classification.label,
    loss: classification.loss,
    lead: unique[0]!,
    others: unique.slice(1, 1 + MAX_OTHERS),
    fallback: false,
  };
}

function fallbackText(cpBefore: number, cpAfterMover: number): string {
  if (cpAfterMover <= -9000) {
    return 'After your move the opponent has a forced mate, but I cannot point to a single clear reason.';
  }
  if (cpBefore >= 9000) {
    return 'You had a forced mate, and this move lets it slip, but I cannot point to a single clear reason.';
  }

  const pawns = Math.max(0, (cpBefore - cpAfterMover) / 100);
  if (pawns < 0.1) {
    return 'The engine preferred a different move, but the position is still roughly equal and I cannot point to a single clear reason.';
  }
  const amount = pawns >= 10 ? 'much worse' : `about ${pawns.toFixed(1)} pawns worse`;
  return `After your move the position is ${amount} for you, but I cannot point to a single clear reason.`;
}

function dedupe(findings: readonly Finding[]): Finding[] {
  const seen = new Set<string>();
  const unique: Finding[] = [];
  for (const finding of findings) {
    const key = `${finding.kind}:${finding.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(finding);
  }
  return unique;
}
