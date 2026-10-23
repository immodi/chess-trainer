import { Chess } from 'chess.js';
import type { Move, Square } from 'chess.js';
import { findKing, nullMovePosition, opposite } from './hanging';
import { PIECE_VALUES } from './pieceValues';
import { seeFrom } from './see';
import { findFork, findPins, findSkewers } from './tactics';

export type ThreatKind = 'capture' | 'mate' | 'fork' | 'pin' | 'skewer';

export interface Threat {
  kind: ThreatKind;
  /** Squares the user has to mark. Mate threats mark the king and the mating square. */
  squares: Square[];
  /** Material at stake in pawns; mate is ranked above any material. */
  value: number;
  /** The move that would carry the threat out, in UCI. */
  move: string;
  /** The forking or sliding piece, when the threat is not a simple capture. */
  actor?: Square;
  /** Every piece involved in a fork/pin/skewer, for the explanation text. */
  targets?: Square[];
}

/** Mate outranks every material threat when sorting. */
const MATE_VALUE = 100;

function toUci(move: Move): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

function pinKey(pin: { slider: Square; front: Square; back: Square }): string {
  return `${pin.slider}:${pin.front}:${pin.back}`;
}

/**
 * What the side *not* to move is threatening (SPEC 6.6).
 *
 * Built from the null-move position: flip the side to move, clear en passant,
 * then generate the opponent's legal moves. Returns `undefined` when the
 * question does not apply — the user is in check, or the flipped position is
 * illegal — so callers can skip the prompt instead of claiming "nothing".
 *
 * Captures and mate are direct threats. Forks, pins and skewers are threats
 * that the opponent can create with their next move; we compare the position
 * before and after each candidate move so a pin that already existed is not
 * reported as a new threat.
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
  const forks = new Map<string, Threat>();
  const pins = new Map<string, Threat>();
  const skewers = new Map<string, Threat>();

  const existingPins = new Set(findPins(nullMove, userColor).map(pinKey));
  const existingSkewers = new Set(findSkewers(nullMove, userColor).map(pinKey));

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

    if (isMate) {
      mates.push({
        kind: 'mate',
        squares: [kingSquare, move.to],
        value: MATE_VALUE,
        move: toUci(move),
      });
    }

    const fork = findFork(nullMove, move.to);
    if (fork) {
      const key = `${fork.square}:${fork.piece}:${[...fork.targets].sort().join(',')}`;
      const existing = forks.get(key);
      const threat: Threat = {
        kind: 'fork',
        squares: [...fork.targets],
        value: fork.value,
        move: toUci(move),
        actor: fork.square,
        targets: [...fork.targets],
      };
      if (!existing || existing.value < threat.value) forks.set(key, threat);
    }

    for (const pin of findPins(nullMove, userColor)) {
      // Pawn pins are common and rarely the point of a threat prompt; they
      // would flood the answer set with low-value squares. Report pins of
      // pieces (knight and up) only.
      if (PIECE_VALUES[pin.frontType] < 3) continue;
      const key = pinKey(pin);
      if (existingPins.has(key)) continue;
      const threat: Threat = {
        kind: 'pin',
        squares: [pin.front],
        value: PIECE_VALUES[pin.frontType],
        move: toUci(move),
        actor: pin.slider,
        targets: [pin.front, pin.back],
      };
      const existing = pins.get(key);
      if (!existing || existing.value < threat.value) pins.set(key, threat);
    }

    for (const skewer of findSkewers(nullMove, userColor)) {
      // A skewer that wins only a pawn is not worth adding to the prompt.
      if (PIECE_VALUES[skewer.backType] < 3) continue;
      const key = pinKey(skewer);
      if (existingSkewers.has(key)) continue;
      const threat: Threat = {
        kind: 'skewer',
        squares: [skewer.back],
        value: PIECE_VALUES[skewer.backType],
        move: toUci(move),
        actor: skewer.slider,
        targets: [skewer.front, skewer.back],
      };
      const existing = skewers.get(key);
      if (!existing || existing.value < threat.value) skewers.set(key, threat);
    }

    nullMove.undo();
  }

  return [
    ...mates,
    ...capturesBySquare.values(),
    ...forks.values(),
    ...pins.values(),
    ...skewers.values(),
  ].sort((a, b) => b.value - a.value);
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
