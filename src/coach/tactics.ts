import type { Chess, Color, PieceSymbol, Square } from 'chess.js';
import { findKing, opposite } from './hanging';
import { PIECE_VALUES } from './pieceValues';
import { seeFrom } from './see';

const FILES = 'abcdefgh';

export function squareAt(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return `${FILES[file]}${rank + 1}` as Square;
}

export function squareCoords(square: Square): { file: number; rank: number } {
  return { file: FILES.indexOf(square[0] ?? ''), rank: Number(square[1]) - 1 };
}

const ORTHOGONAL: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIAGONAL: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export function sliderDirections(type: PieceSymbol): ReadonlyArray<readonly [number, number]> {
  if (type === 'b') return DIAGONAL;
  if (type === 'r') return ORTHOGONAL;
  if (type === 'q') return [...ORTHOGONAL, ...DIAGONAL];
  return [];
}

export interface RayPiece {
  square: Square;
  color: Color;
  type: PieceSymbol;
}

/** The first two occupied squares along one ray from `from`, ignoring `from`. */
export function firstTwoOnRay(
  chess: Chess,
  from: Square,
  delta: readonly [number, number],
): [RayPiece | null, RayPiece | null] {
  const { file, rank } = squareCoords(from);
  const found: RayPiece[] = [];

  for (let f = file + delta[0], r = rank + delta[1]; ; f += delta[0], r += delta[1]) {
    const square = squareAt(f, r);
    if (!square) break;
    const piece = chess.get(square);
    if (piece) {
      found.push({ square, color: piece.color, type: piece.type });
      if (found.length === 2) break;
    }
  }

  return [found[0] ?? null, found[1] ?? null];
}

export interface PinInfo {
  slider: Square;
  sliderType: PieceSymbol;
  front: Square;
  frontType: PieceSymbol;
  back: Square;
  backType: PieceSymbol;
  /** True when the king is behind the front piece. */
  absolute: boolean;
}

/**
 * Pins against `color`: an enemy slider, one of `color`'s pieces, and a more
 * valuable `color` piece (or the king) directly behind it on the same ray.
 */
export function findPins(chess: Chess, color: Color): PinInfo[] {
  const enemy = opposite(color);
  const pins: PinInfo[] = [];

  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== enemy) continue;
      if (cell.type !== 'b' && cell.type !== 'r' && cell.type !== 'q') continue;

      for (const delta of sliderDirections(cell.type)) {
        const [front, back] = firstTwoOnRay(chess, cell.square, delta);
        if (!front || !back) continue;
        if (front.color !== color || back.color !== color) continue;

        // A king in front is in check, not pinned. A legal position after the
        // mover's move cannot have that, but keep the guard explicit.
        if (front.type === 'k') continue;

        const absolute = back.type === 'k';
        const relative =
          !absolute && PIECE_VALUES[back.type] > PIECE_VALUES[front.type];
        if (!absolute && !relative) continue;

        pins.push({
          slider: cell.square,
          sliderType: cell.type,
          front: front.square,
          frontType: front.type,
          back: back.square,
          backType: back.type,
          absolute,
        });
      }
    }
  }

  return pins;
}

export interface SkewerInfo {
  slider: Square;
  sliderType: PieceSymbol;
  front: Square;
  frontType: PieceSymbol;
  back: Square;
  backType: PieceSymbol;
}

/**
 * Skewers against `color`: an enemy slider hits a valuable front piece, and a
 * lesser-or-equal piece sits behind it. A king in front counts as the most
 * valuable piece (a check forces it to move).
 */
export function findSkewers(chess: Chess, color: Color): SkewerInfo[] {
  const enemy = opposite(color);
  const skewers: SkewerInfo[] = [];

  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== enemy) continue;
      if (cell.type !== 'b' && cell.type !== 'r' && cell.type !== 'q') continue;

      for (const delta of sliderDirections(cell.type)) {
        const [front, back] = firstTwoOnRay(chess, cell.square, delta);
        if (!front || !back) continue;
        if (front.color !== color || back.color !== color) continue;
        if (back.type === 'k') continue;

        const frontValue = front.type === 'k' ? 100 : PIECE_VALUES[front.type];
        const backValue = PIECE_VALUES[back.type];
        if (backValue <= 0 || frontValue < backValue) continue;

        skewers.push({
          slider: cell.square,
          sliderType: cell.type,
          front: front.square,
          frontType: front.type,
          back: back.square,
          backType: back.type,
        });
      }
    }
  }

  return skewers;
}

export interface ForkInfo {
  square: Square;
  piece: PieceSymbol;
  /** Enemy pieces (or the king) the forker attacks. */
  targets: Square[];
  /** Material at stake in pawns; the king counts as 0 but still as a target. */
  value: number;
}

/**
 * A fork on `square` in a position where the opponent is to move (SPEC 6.5):
 * at least two targets, each undefended or worth more than the forker, and the
 * forker cannot be captured at a net profit.
 */
export function findFork(chess: Chess, square: Square): ForkInfo | null {
  const forker = chess.get(square);
  if (!forker) return null;

  const enemy = opposite(forker.color);
  if (chess.turn() !== enemy) return null;

  const targets: Square[] = [];
  let value = 0;

  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== enemy) continue;
      if (!chess.attackers(cell.square, forker.color).includes(square)) continue;

      if (cell.type === 'k') {
        targets.push(cell.square);
        continue;
      }

      const defended = chess.attackers(cell.square, enemy).length > 0;
      const worthMore = PIECE_VALUES[cell.type] > PIECE_VALUES[forker.type];
      if (defended && !worthMore) continue;

      targets.push(cell.square);
      value += PIECE_VALUES[cell.type];
    }
  }

  if (targets.length < 2) return null;
  // The opponent is to move; if taking the forker wins material, it is not a fork.
  if (seeFrom(chess, square) > 0) return null;

  return { square, piece: forker.type, targets, value };
}

export interface BackRankInfo {
  king: Square;
  /** Enemy rooks/queens that can reach the king's back rank. */
  sliders: Square[];
}

/**
 * A king on its back rank with every escape square blocked by its own pawns,
 * and an enemy rook or queen able to reach that rank (SPEC 6.5).
 */
export function findBackRankWeakness(chess: Chess, color: Color): BackRankInfo | null {
  const king = findKing(chess, color);
  if (!king) return null;

  const { file, rank } = squareCoords(king);
  const homeRank = color === 'w' ? 0 : 7;
  if (rank !== homeRank) return null;

  const escapeRank = color === 'w' ? 1 : 6;
  for (const escapeFile of [file - 1, file, file + 1]) {
    const square = squareAt(escapeFile, escapeRank);
    if (!square) continue;
    const piece = chess.get(square);
    if (!piece || piece.color !== color || piece.type !== 'p') return null;
  }

  const enemy = opposite(color);
  const sliders: Square[] = [];

  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== enemy) continue;
      if (cell.type !== 'r' && cell.type !== 'q') continue;

      for (let f = 0; f < 8; f += 1) {
        const square = squareAt(f, homeRank);
        if (!square) continue;
        if (chess.attackers(square, enemy).includes(cell.square)) {
          sliders.push(cell.square);
          break;
        }
      }
    }
  }

  if (sliders.length === 0) return null;
  return { king, sliders };
}

export interface DiscoveredInfo {
  slider: Square;
  sliderType: PieceSymbol;
  target: Square;
  targetType: PieceSymbol;
}

/**
 * An attack uncovered by moving the piece that was on `through`: a friendly
 * slider now hits a valuable enemy piece (or the king) along that ray.
 * `except` is the moved piece's destination; a slider that just moved cannot
 * "discover" its own direct attack.
 */
export function findDiscovered(
  chess: Chess,
  color: Color,
  through: Square,
  except?: Square,
): DiscoveredInfo | null {
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== color) continue;
      if (cell.type !== 'b' && cell.type !== 'r' && cell.type !== 'q') continue;
      if (cell.square === except) continue;

      for (const delta of sliderDirections(cell.type)) {
        const { file, rank } = squareCoords(cell.square);
        let passedThrough = false;

        for (let f = file + delta[0], r = rank + delta[1]; ; f += delta[0], r += delta[1]) {
          const square = squareAt(f, r);
          if (!square) break;
          if (square === through) {
            passedThrough = true;
            continue;
          }

          const piece = chess.get(square);
          if (!piece) continue;

          if (
            passedThrough &&
            piece.color === opposite(color) &&
            (piece.type === 'k' || PIECE_VALUES[piece.type] >= 3)
          ) {
            return {
              slider: cell.square,
              sliderType: cell.type,
              target: square,
              targetType: piece.type,
            };
          }
          break;
        }
      }
    }
  }

  return null;
}
