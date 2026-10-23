import { Chess } from 'chess.js';
import type { Move, Square } from 'chess.js';
import { findKing, nullMovePosition, opposite } from './hanging';
import { seeFrom } from './see';

export type ThreatKind = 'capture' | 'mate';

export interface Threat {
  kind: ThreatKind;
  /** Squares the user has to mark. Mate threats mark the king and the mating square. */
  squares: Square[];
  /** Material at stake in pawns; mate is ranked above any material. */
  value: number;
  /** The move that would carry the threat out, in UCI. */
  move: string;
}

/** Mate outranks every material threat when sorting. */
const MATE_VALUE = 100;

function toUci(move: Move): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

/**
 * What the side *not* to move is threatening (SPEC 6.6).
 *
 * Built from the null-move position: flip the side to move, clear en passant,
 * then generate the opponent's legal moves. Returns `undefined` when the
 * question does not apply — the user is in check, or the flipped position is
 * illegal — so callers can skip the prompt instead of claiming "nothing".
 */
export function computeThreats(fen: string): Threat[] | undefined {
  const position = new Chess(fen);
  if (position.isCheck()) return undefined;

  const userColor = position.turn();
  const opponent = opposite(userColor);

  const nullMove = nullMovePosition(fen, opponent);
  if (!nullMove) return undefined;

  const kingSquare = findKing(nullMove, userColor);
  if (!kingSquare) return undefined;

  const capturesBySquare = new Map<Square, Threat>();
  const mates: Threat[] = [];

  for (const move of nullMove.moves({ verbose: true })) {
    if (move.captured !== undefined) {
      const gain = seeFrom(nullMove, move.to);
      if (gain > 0) {
        const existing = capturesBySquare.get(move.to);
        if (!existing || existing.value < gain) {
          capturesBySquare.set(move.to, {
            kind: 'capture',
            squares: [move.to],
            value: gain,
            move: toUci(move),
          });
        }
      }
    }

    nullMove.move({ from: move.from, to: move.to, promotion: move.promotion });
    const isMate = nullMove.isCheckmate();
    nullMove.undo();

    if (isMate) {
      mates.push({
        kind: 'mate',
        squares: [kingSquare, move.to],
        value: MATE_VALUE,
        move: toUci(move),
      });
    }
  }

  return [...mates, ...capturesBySquare.values()].sort((a, b) => b.value - a.value);
}

/** Every square a correct answer must include. */
export function threatTargets(threats: readonly Threat[]): Square[] {
  const squares = new Set<Square>();
  for (const threat of threats) for (const square of threat.squares) squares.add(square);
  return [...squares];
}

/**
 * Correct means: every threatened square is marked, and at most
 * `maxExtraSquares` marks are wrong (SPEC 6.6). "Nothing" is correct only when
 * there is nothing to mark.
 */
export function isThreatAnswerCorrect(
  threats: readonly Threat[],
  marked: readonly Square[],
  maxExtraSquares: number,
): boolean {
  const targets = new Set(threatTargets(threats));
  const marks = new Set(marked);

  if (targets.size === 0) return marks.size === 0;

  for (const target of targets) {
    if (!marks.has(target)) return false;
  }

  let extras = 0;
  for (const mark of marks) if (!targets.has(mark)) extras += 1;
  return extras <= maxExtraSquares;
}
