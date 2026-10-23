import { Chess } from 'chess.js';
import type { Color, Move, PieceSymbol, Square } from 'chess.js';
import type { Finding } from './findings';
import { describePiece, pieceName } from './findings';
import { findKing, hangingPieces, opposite } from './hanging';
import { PIECE_VALUES } from './pieceValues';
import { seeFrom } from './see';
import {
  findBackRankWeakness,
  findDiscovered,
  findFork,
  findPins,
  findSkewers,
} from './tactics';
import type { RayPiece } from './tactics';

export interface DetectCtx {
  fenBefore: string;
  fenAfter: string;
  playedUci: string;
  mover: Color;
  /** Engine's best move in the position before the move. */
  bestMove: string | null;
  /** Engine's best reply for the opponent in the position after the move. */
  opponentBestMove: string | null;
}

function playUci(chess: Chess, uci: string): Move | null {
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const promotion = uci.length > 4 ? (uci.slice(4, 5) as PieceSymbol) : undefined;
  try {
    return chess.move(promotion ? { from, to, promotion } : { from, to });
  } catch {
    return null;
  }
}

function uciOf(move: Move): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

function bestAttacker(chess: Chess, square: Square, color: Color): RayPiece | null {
  const pieces = chess
    .attackers(square, color)
    .map((attackerSquare) => {
      const piece = chess.get(attackerSquare);
      return piece
        ? { square: attackerSquare, color: piece.color, type: piece.type }
        : null;
    })
    .filter((piece): piece is RayPiece => piece !== null);

  pieces.sort((a, b) => PIECE_VALUES[a.type] - PIECE_VALUES[b.type]);
  return pieces[0] ?? null;
}

function hangingText(
  attacker: RayPiece | null,
  target: RayPiece,
  kind: 'moved' | 'defender' | 'ignored',
  movedPiece: PieceSymbol | null,
): string {
  const targetText = `your ${pieceName(target.type)} on ${target.square}`;
  const attackerText = attacker
    ? `the ${pieceName(attacker.type)} on ${attacker.square}`
    : 'the opponent';

  if (kind === 'moved') {
    return `Your ${pieceName(target.type)} on ${target.square} can be won by ${attackerText}.`;
  }
  if (kind === 'defender') {
    const moved = movedPiece ? `the ${pieceName(movedPiece)} you moved` : 'your last move';
    return `Your ${pieceName(target.type)} on ${target.square} lost its defender when you moved ${moved}. ${capitalise(attackerText)} can take it.`;
  }
  return `${capitalise(targetText)} was already under attack, and you left it there. ${capitalise(attackerText)} can take it.`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** SPEC 6.5: moved into attack, removed a defender, or ignored an existing threat. */
export function findLeftHanging(ctx: DetectCtx): Finding[] {
  const after = hangingPieces(ctx.fenAfter);
  if (!after) return [];

  const before = hangingPieces(ctx.fenBefore);
  const hangingBefore = new Set(
    (before ?? []).filter((piece) => piece.color === ctx.mover).map((piece) => piece.square),
  );

  const movedFrom = ctx.playedUci.slice(0, 2) as Square;
  const movedTo = ctx.playedUci.slice(2, 4) as Square;
  const movedPiece = new Chess(ctx.fenAfter).get(movedTo)?.type ?? null;
  const beforePosition = new Chess(ctx.fenBefore);
  const afterPosition = new Chess(ctx.fenAfter);

  const findings: Finding[] = [];

  for (const piece of after) {
    if (piece.color !== ctx.mover) continue;

    const attacker = bestAttacker(afterPosition, piece.square, opposite(ctx.mover));
    const target: RayPiece = {
      square: piece.square,
      color: piece.color,
      type: piece.type,
    };

    if (piece.square === movedTo) {
      findings.push({
        kind: 'leftHanging',
        severity: 40 + piece.value,
        squares: [piece.square, ...(attacker ? [attacker.square] : [])],
        text: hangingText(attacker, target, 'moved', movedPiece),
      });
      continue;
    }

    if (!hangingBefore.has(piece.square)) {
      const wasDefendedByMovedPiece = beforePosition
        .attackers(piece.square, ctx.mover)
        .includes(movedFrom);
      if (!wasDefendedByMovedPiece) continue;
      findings.push({
        kind: 'leftHanging',
        severity: 30 + piece.value,
        squares: [piece.square, movedFrom, ...(attacker ? [attacker.square] : [])],
        text: hangingText(attacker, target, 'defender', movedPiece),
      });
      continue;
    }

    findings.push({
      kind: 'leftHanging',
      severity: 20 + piece.value,
      squares: [piece.square, ...(attacker ? [attacker.square] : [])],
      text: hangingText(attacker, target, 'ignored', movedPiece),
    });
  }

  return findings;
}

/** SPEC 6.5: a profitable capture was available and the engine's best move takes it. */
export function findMissedCapture(ctx: DetectCtx): Finding | null {
  if (!ctx.bestMove || ctx.bestMove === ctx.playedUci) return null;

  const before = new Chess(ctx.fenBefore);
  const targetSquare = ctx.bestMove.slice(2, 4) as Square;
  const target = before.get(targetSquare);
  if (!target || target.color !== opposite(ctx.mover)) return null;

  const legal = playUci(new Chess(ctx.fenBefore), ctx.bestMove);
  if (!legal) return null;

  const gain = seeFrom(before, targetSquare);
  if (gain <= 0) return null;

  const attacker = before.get(legal.from);
  const attackerText = attacker ? ` with your ${pieceName(attacker.type)} on ${legal.from}` : '';

  return {
    kind: 'missedCapture',
    severity: 35 + gain,
    squares: [targetSquare, legal.from],
    text: `You could have won ${describePiece(target.type, targetSquare)} (${gain} ${
      gain === 1 ? 'pawn' : 'pawns'
    })${attackerText}.`,
  };
}

/** SPEC 6.5: after the move the opponent has a legal mate in one. */
export function findAllowedMate(ctx: DetectCtx): Finding | null {
  const after = new Chess(ctx.fenAfter);
  if (after.turn() !== opposite(ctx.mover)) return null;

  const king = findKing(after, ctx.mover);

  for (const move of after.moves({ verbose: true })) {
    after.move({ from: move.from, to: move.to, promotion: move.promotion });
    const mate = after.isCheckmate();
    after.undo();
    if (!mate) continue;

    return {
      kind: 'allowedMate',
      severity: 1000,
      squares: king ? [king, move.to] : [move.to],
      text: `After your move, the opponent has mate in one with ${move.san}.`,
    };
  }

  return null;
}

/** SPEC 6.5: the mover had mate in one and played something else. */
export function findMissedMate(ctx: DetectCtx): Finding | null {
  const before = new Chess(ctx.fenBefore);
  if (before.turn() !== ctx.mover) return null;

  let first: Square | null = null;

  for (const move of before.moves({ verbose: true })) {
    before.move({ from: move.from, to: move.to, promotion: move.promotion });
    const mate = before.isCheckmate();
    before.undo();
    if (!mate) continue;
    if (uciOf(move) === ctx.playedUci) return null;
    if (!first) first = move.to;
  }

  if (!first) return null;

  return {
    kind: 'missedMate',
    severity: 900,
    squares: [first],
    text: 'You had mate in one, but you played something else.',
  };
}

/** SPEC 6.5: a fork was available (missed) or is now allowed. */
export function findForkFinding(ctx: DetectCtx): Finding | null {
  if (ctx.bestMove && ctx.bestMove !== ctx.playedUci) {
    const chess = new Chess(ctx.fenBefore);
    const move = playUci(chess, ctx.bestMove);
    if (move) {
      const fork = findFork(chess, move.to);
      if (fork) {
        return {
          kind: 'fork',
          severity: 40 + fork.value,
          squares: [fork.square, ...fork.targets],
          text: `You could have forked ${describeTargets(chess, fork.targets)} with ${describePiece(fork.piece, move.from)} (one piece attacking two targets at once).`,
        };
      }
    }
  }

  if (ctx.opponentBestMove) {
    const chess = new Chess(ctx.fenAfter);
    const move = playUci(chess, ctx.opponentBestMove);
    if (move) {
      const fork = findFork(chess, move.to);
      if (fork) {
        return {
          kind: 'fork',
          severity: 40 + fork.value,
          squares: [fork.square, ...fork.targets],
          text: `Your move allows a fork: ${describePiece(fork.piece, fork.square)} attacks ${describeTargets(chess, fork.targets)} (one piece attacking two at once).`,
        };
      }
    }
  }

  return null;
}

function describeTargets(chess: Chess, targets: readonly Square[]): string {
  const names = targets
    .map((square) => {
      const piece = chess.get(square);
      return piece ? describePiece(piece.type, square) : null;
    })
    .filter((name): name is string => name !== null);
  if (names.length === 0) return 'two targets';
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]!}`;
}

/** SPEC 6.5: the mover's own piece is pinned. */
export function findPinFinding(ctx: DetectCtx): Finding | null {
  const after = new Chess(ctx.fenAfter);
  const pins = findPins(after, ctx.mover);
  if (pins.length === 0) return null;

  pins.sort((a, b) => PIECE_VALUES[b.frontType] - PIECE_VALUES[a.frontType]);
  const pin = pins[0]!;
  const back = pin.absolute ? 'king' : pieceName(pin.backType);

  return {
    kind: 'pin',
    severity: 30 + PIECE_VALUES[pin.frontType],
    squares: [pin.front, pin.back, pin.slider],
    text: `Your ${pieceName(pin.frontType)} on ${pin.front} is pinned to your ${back} on ${pin.back} by the ${pieceName(pin.sliderType)} on ${pin.slider} (a pin: moving it would expose the ${back}).`,
  };
}

/** SPEC 6.5: the mover's own piece is skewered. */
export function findSkewerFinding(ctx: DetectCtx): Finding | null {
  const after = new Chess(ctx.fenAfter);
  const skewers = findSkewers(after, ctx.mover);
  if (skewers.length === 0) return null;

  skewers.sort((a, b) => PIECE_VALUES[b.backType] - PIECE_VALUES[a.backType]);
  const skewer = skewers[0]!;

  return {
    kind: 'skewer',
    severity: 30 + PIECE_VALUES[skewer.backType],
    squares: [skewer.front, skewer.back, skewer.slider],
    text: `The ${pieceName(skewer.sliderType)} on ${skewer.slider} skewers your ${pieceName(skewer.frontType)} on ${skewer.front} and your ${pieceName(skewer.backType)} on ${skewer.back} (a skewer: the front piece must move, and the back one falls).`,
  };
}

/** SPEC 6.5: the mover's king is on a weak back rank. */
export function findBackRankFinding(ctx: DetectCtx): Finding | null {
  const after = new Chess(ctx.fenAfter);
  const weakness = findBackRankWeakness(after, ctx.mover);
  if (!weakness) return null;

  return {
    kind: 'backRank',
    severity: 55,
    squares: [weakness.king, ...weakness.sliders],
    text: `Your king on ${weakness.king} has no escape square on the back rank. An enemy rook or queen can attack along that rank (the back rank is the rank your king started on).`,
  };
}

/** SPEC 6.5: a move uncovers a slider's attack on a valuable target. */
export function findDiscoveredFinding(ctx: DetectCtx): Finding | null {
  if (ctx.opponentBestMove) {
    const chess = new Chess(ctx.fenAfter);
    const move = playUci(chess, ctx.opponentBestMove);
    if (move) {
      const discovered = findDiscovered(chess, opposite(ctx.mover), move.from, move.to);
      if (discovered) {
        return {
          kind: 'discovered',
          severity: 35 + PIECE_VALUES[discovered.targetType],
          squares: [discovered.slider, discovered.target],
          text: `Your move lets the opponent uncover an attack: the ${pieceName(discovered.sliderType)} on ${discovered.slider} now hits your ${pieceName(discovered.targetType)} on ${discovered.target} (a discovered attack).`,
        };
      }
    }
  }

  if (ctx.bestMove && ctx.bestMove !== ctx.playedUci) {
    const chess = new Chess(ctx.fenBefore);
    const move = playUci(chess, ctx.bestMove);
    if (move) {
      const discovered = findDiscovered(chess, ctx.mover, move.from, move.to);
      if (discovered) {
        return {
          kind: 'discovered',
          severity: 30 + PIECE_VALUES[discovered.targetType],
          squares: [discovered.slider, discovered.target],
          text: `You could have uncovered an attack from your ${pieceName(discovered.sliderType)} on ${discovered.slider} against the ${pieceName(discovered.targetType)} on ${discovered.target} (a discovered attack).`,
        };
      }
    }
  }

  // The user's own move may have uncovered an attack (positive finding).
  const own = findDiscovered(
    new Chess(ctx.fenAfter),
    ctx.mover,
    ctx.playedUci.slice(0, 2) as Square,
    ctx.playedUci.slice(2, 4) as Square,
  );
  if (own) {
    return {
      kind: 'discovered',
      severity: 25 + PIECE_VALUES[own.targetType],
      squares: [own.slider, own.target],
      text: `Your move uncovered an attack from your ${pieceName(own.sliderType)} on ${own.slider} against the ${pieceName(own.targetType)} on ${own.target} (a discovered attack).`,
    };
  }

  return null;
}

/** Every detector, in no particular order; feedback sorts by severity. */
export function runDetectors(ctx: DetectCtx): Finding[] {
  const findings: Finding[] = [
    findAllowedMate(ctx),
    findMissedMate(ctx),
    findForkFinding(ctx),
    findBackRankFinding(ctx),
    findPinFinding(ctx),
    findSkewerFinding(ctx),
    findDiscoveredFinding(ctx),
    findMissedCapture(ctx),
    ...findLeftHanging(ctx),
  ].filter((finding): finding is Finding => finding !== null);

  return findings;
}
