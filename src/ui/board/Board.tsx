import { Chess } from 'chess.js';
import type { Color, PieceSymbol, Square } from 'chess.js';
import { useEffect, useMemo, useState } from 'react';
import { findKing } from '../../coach/hanging';

export type BoardMode = 'play' | 'tapSquares' | 'puzzle' | 'readonly';

export interface BoardMove {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
}

export interface BoardProps {
  fen: string;
  orientation?: Color;
  mode?: BoardMode;
  /** Colour the user controls. Defaults to the side to move. */
  movableColor?: Color;
  touchMove?: boolean;
  lastMove?: { from: Square; to: Square } | null;
  markedSquares?: readonly Square[];
  correctSquares?: readonly Square[];
  wrongSquares?: readonly Square[];
  disabled?: boolean;
  onMove?: (move: BoardMove) => void;
  onToggleSquare?: (square: Square) => void;
}

const PIECE_NAME: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

const PROMOTION_CHOICES: readonly PieceSymbol[] = ['q', 'r', 'b', 'n'];

function isLightSquare(square: Square): boolean {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(square[1]);
  return (file + rank) % 2 !== 0;
}

function pieceSrc(piece: { color: Color; type: PieceSymbol }): string {
  return `${import.meta.env.BASE_URL}pieces/cburnett/${piece.color}${piece.type.toUpperCase()}.svg`;
}

function describe(piece: { color: Color; type: PieceSymbol }, square: Square): string {
  return `${piece.color === 'w' ? 'White' : 'Black'} ${PIECE_NAME[piece.type]} on ${square}`;
}

function parse(fen: string): Chess | null {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

/**
 * The board (SPEC 6.1). Presentational in `readonly`, a move machine in `play`,
 * and a square toggler in `tapSquares`. Touch-move rules live here because they
 * are about the board, not the mode.
 */
export function Board({
  fen,
  orientation = 'w',
  mode = 'readonly',
  movableColor,
  touchMove = true,
  lastMove = null,
  markedSquares = [],
  correctSquares = [],
  wrongSquares = [],
  disabled = false,
  onMove,
  onToggleSquare,
}: BoardProps) {
  const position = useMemo(() => parse(fen), [fen]);
  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null);

  // A new position, or a mode switch, always drops the selection.
  useEffect(() => {
    setSelected(null);
    setPendingPromotion(null);
  }, [fen, mode]);

  const movable = movableColor ?? position?.turn() ?? 'w';

  const legalMoves = useMemo(() => {
    if (!position || !selected || mode !== 'play' || disabled) return [];
    try {
      return position.moves({ square: selected, verbose: true });
    } catch {
      return [];
    }
  }, [position, selected, mode, disabled]);

  const targets = useMemo(() => {
    const map = new Map<Square, boolean>();
    for (const move of legalMoves) map.set(move.to, move.captured !== undefined);
    return map;
  }, [legalMoves]);

  const checkSquare = useMemo(() => {
    if (!position || !position.isCheck()) return null;
    return findKing(position, position.turn()) ?? null;
  }, [position]);

  if (!position) {
    return <div className="board board--invalid">Cannot display this position.</div>;
  }

  // Squares come from the orientation, not from occupied cells: empty squares
  // still need an identity so they can be tapped.
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
  const ranks = [8, 7, 6, 5, 4, 3, 2, 1] as const;
  const ordered: Square[] = [];
  for (const rank of ranks) {
    for (const file of files) ordered.push(`${file}${rank}` as Square);
  }
  if (orientation === 'b') ordered.reverse();

  const marked = new Set(markedSquares);
  const correct = new Set(correctSquares);
  const wrong = new Set(wrongSquares);

  const selectSquare = (square: Square): void => {
    const piece = position.get(square);
    if (!piece || piece.color !== movable) return;
    if (position.moves({ square, verbose: true }).length === 0) return;
    setSelected(square);
  };

  const handleTap = (square: Square): void => {
    if (mode === 'tapSquares') {
      onToggleSquare?.(square);
      return;
    }
    if (mode === 'readonly' || disabled || pendingPromotion) return;

    if (selected) {
      if (targets.has(square)) {
        const move = legalMoves.find((candidate) => candidate.to === square);
        if (move?.promotion) {
          setPendingPromotion({ from: selected, to: square });
          return;
        }
        setSelected(null);
        onMove?.({ from: selected, to: square });
        return;
      }

      const piece = position.get(square);
      if (piece && piece.color === movable) {
        // SPEC 2.5: touch-move means the picked piece must move.
        if (touchMove) return;
        if (square === selected) {
          setSelected(null);
          return;
        }
        selectSquare(square);
        return;
      }

      // SPEC 2.3: tapping an illegal square is ignored.
      return;
    }

    selectSquare(square);
  };

  const choosePromotion = (piece: PieceSymbol): void => {
    if (!pendingPromotion) return;
    const { from, to } = pendingPromotion;
    setPendingPromotion(null);
    setSelected(null);
    onMove?.({ from, to, promotion: piece });
  };

  return (
    <div className="board-frame">
      <div className="board" role="grid" aria-label="Chess board">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((rowIndex) => (
          <div className="board__row" role="row" key={rowIndex}>
            {ordered.slice(rowIndex * 8, rowIndex * 8 + 8).map((square) => {
              const piece = position.get(square);
              const light = isLightSquare(square);
              const isTarget = targets.has(square);
              const isCapture = targets.get(square) === true;

              const classes = ['board__square', light ? 'board__square--light' : 'board__square--dark'];
              if (square === selected) classes.push('board__square--selected');
              if (lastMove && (square === lastMove.from || square === lastMove.to)) {
                classes.push('board__square--last');
              }
              if (square === checkSquare) classes.push('board__square--check');
              if (isTarget) classes.push(isCapture ? 'board__square--capture' : 'board__square--target');
              if (marked.has(square)) classes.push('board__square--marked');
              if (correct.has(square)) classes.push('board__square--correct');
              if (wrong.has(square)) classes.push('board__square--wrong');

              return (
                <div
                  key={square}
                  role="gridcell"
                  data-square={square}
                  aria-label={piece ? describe(piece, square) : `Empty square ${square}`}
                  className={classes.join(' ')}
                  onClick={() => handleTap(square)}
                >
                  {piece ? (
                    <img
                      className="board__piece"
                      src={pieceSrc(piece)}
                      alt=""
                      draggable={false}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {pendingPromotion ? (
        <div className="promotion" role="dialog" aria-label="Choose a promotion piece">
          <p className="promotion__title">Promote to</p>
          <div className="promotion__choices">
            {PROMOTION_CHOICES.map((piece) => (
              <button
                key={piece}
                type="button"
                className="promotion__choice"
                onClick={() => choosePromotion(piece)}
              >
                <img
                  src={`${import.meta.env.BASE_URL}pieces/cburnett/${movable}${piece.toUpperCase()}.svg`}
                  alt={PIECE_NAME[piece]}
                />
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
