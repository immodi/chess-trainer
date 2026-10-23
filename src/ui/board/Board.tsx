import { Chess } from 'chess.js';
import type { Color, PieceSymbol, Square } from 'chess.js';
import { useMemo } from 'react';

export interface BoardProps {
  fen: string;
  orientation?: Color;
}

interface BoardCell {
  square: Square;
  type: PieceSymbol;
  color: Color;
}

const PIECE_NAME: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

function isLightSquare(square: string): boolean {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(square[1]);
  return (file + rank) % 2 !== 0;
}

function pieceSrc(cell: BoardCell): string {
  return `${import.meta.env.BASE_URL}pieces/cburnett/${cell.color}${cell.type.toUpperCase()}.svg`;
}

function describe(cell: BoardCell): string {
  return `${cell.color === 'w' ? 'White' : 'Black'} ${PIECE_NAME[cell.type]} on ${cell.square}`;
}

/**
 * Presentational board: FEN in, squares out. No interaction yet (Phase 1).
 */
export function Board({ fen, orientation = 'w' }: BoardProps) {
  const rows = useMemo<readonly (readonly (BoardCell | null)[])[]>(() => {
    try {
      return new Chess(fen).board();
    } catch {
      return [];
    }
  }, [fen]);

  if (rows.length === 0) {
    return <div className="board board--invalid">Cannot display this position.</div>;
  }

  const ordered = orientation === 'w' ? rows : [...rows].reverse().map((row) => [...row].reverse());

  return (
    <div className="board" role="grid" aria-label="Chess board">
      {ordered.map((row, rowIndex) => (
        <div className="board__row" role="row" key={rowIndex}>
          {row.map((cell, colIndex) => {
            const cellKey = cell?.square ?? `${rowIndex}-${colIndex}`;
            const light = cell ? isLightSquare(cell.square) : (rowIndex + colIndex) % 2 === 0;
            return (
              <div
                key={cellKey}
                role="gridcell"
                data-square={cell?.square}
                className={`board__square ${light ? 'board__square--light' : 'board__square--dark'}`}
              >
                {cell ? (
                  <img
                    className="board__piece"
                    src={pieceSrc(cell)}
                    alt={describe(cell)}
                    draggable={false}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
