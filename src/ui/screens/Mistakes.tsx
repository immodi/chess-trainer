import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { useEffect, useState } from 'react';
import { turnOf } from '../../modes/play';
import type { MistakeCard } from '../../storage/mistakes';
import { answerMistake, dueMistakes } from '../../storage/mistakes';
import { Board } from '../board/Board';
import type { BoardArrow, BoardMove } from '../board/Board';

export interface MistakesProps {
  onBack: () => void;
  touchMove: boolean;
}

interface Answer {
  correct: boolean;
  played: string;
  bestSan: string | null;
}

function uciOf(move: BoardMove): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

function sanFor(fen: string, uci: string): string | null {
  const chess = new Chess(fen);
  try {
    const move = chess.move({
      from: uci.slice(0, 2) as Square,
      to: uci.slice(2, 4) as Square,
      promotion: uci.length > 4 ? (uci.slice(4, 5) as 'q' | 'r' | 'b' | 'n') : undefined,
    });
    return move.san;
  } catch {
    return null;
  }
}

export function Mistakes({ onBack, touchMove }: MistakesProps) {
  const [cards, setCards] = useState<MistakeCard[] | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [played, setPlayed] = useState<BoardMove | null>(null);

  useEffect(() => {
    let cancelled = false;
    void dueMistakes().then((due) => {
      if (!cancelled) setCards(due);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!cards) {
    return (
      <main className="app">
        <p className="screen__note">Loading your mistakes…</p>
      </main>
    );
  }

  const card = cards[index];

  if (!card) {
    return (
      <main className="app">
        <header className="screen__header">
          <button type="button" className="button button--ghost" onClick={onBack}>
            Back
          </button>
          <h1>Mistakes</h1>
        </header>
        <p className="screen__lead">
          {cards.length === 0
            ? 'Nothing is due today. Mistakes from finished games come back here after 1, 3, 7 and 14 days.'
            : 'All done for today. Come back tomorrow for the next review.'}
        </p>
      </main>
    );
  }

  const userColor = turnOf(card.fen);
  const bestSan = sanFor(card.fen, card.best);

  const arrows: BoardArrow[] = [];
  if (answer) {
    arrows.push({
      from: played?.from ?? (card.played.slice(0, 2) as Square),
      to: played?.to ?? (card.played.slice(2, 4) as Square),
      color: 'red',
    });
    arrows.push({
      from: card.best.slice(0, 2) as Square,
      to: card.best.slice(2, 4) as Square,
      color: 'green',
    });
  }

  const handleMove = (move: BoardMove): void => {
    if (answer) return;
    const uci = uciOf(move);
    const correct = uci === card.best;
    setPlayed(move);
    setAnswer({ correct, played: uci, bestSan });
    void answerMistake(card.id, correct);
  };

  const next = (): void => {
    setAnswer(null);
    setPlayed(null);
    setIndex((value) => value + 1);
  };

  return (
    <main className="app">
      <header className="screen__header">
        <button type="button" className="button button--ghost" onClick={onBack}>
          Back
        </button>
        <h1>Mistakes</h1>
      </header>

      <p className="screen__lead">
        Find a better move than the one you played. {index + 1} of {cards.length}.
      </p>

      <Board
        fen={card.fen}
        orientation={userColor}
        mode="play"
        movableColor={userColor}
        touchMove={touchMove}
        disabled={answer !== null}
        lastMove={played}
        arrows={arrows}
        onMove={handleMove}
      />

      {answer ? (
        <section className={`panel ${answer.correct ? 'panel--good' : 'panel--bad'}`}>
          <h2 className="panel__title">{answer.correct ? 'Correct.' : 'Not quite.'}</h2>
          <p className="panel__body">
            {answer.correct
              ? 'That is the engine’s move. This position will come back later.'
              : `The engine preferred ${answer.bestSan ?? 'another move'}. This one comes back tomorrow.`}
          </p>
          <button type="button" className="button button--primary button--wide" onClick={next}>
            {index + 1 < cards.length ? 'Next' : 'Done'}
          </button>
        </section>
      ) : (
        <p className="screen__note">
          This was a {card.label} in your game, losing {card.loss.toFixed(1)}% of your winning
          chances.
        </p>
      )}
    </main>
  );
}
