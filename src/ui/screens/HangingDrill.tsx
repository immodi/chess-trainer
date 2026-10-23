import { useEffect, useState } from 'react';
import type { Square } from 'chess.js';
import { hangingPiecesAsync } from '../../coach/client';
import { loadPuzzles } from '../../data/puzzles';
import { buildHangingDrillQueue } from '../../modes/drills';
import type { HangingDrillPosition } from '../../modes/drills';
import { turnOf } from '../../modes/play';
import { recordHangingAnswer } from '../../storage/progress';
import { Board } from '../board/Board';
import { describeHangingPieces } from '../hangingText';

export interface HangingDrillProps {
  onBack: () => void;
}

interface Answer {
  correct: boolean;
  pieces: HangingDrillPosition['pieces'];
  marked: Square[];
}

export function HangingDrill({ onBack }: HangingDrillProps) {
  const [queue, setQueue] = useState<HangingDrillPosition[] | null>(null);
  const [index, setIndex] = useState(0);
  const [marked, setMarked] = useState<Square[]>([]);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [score, setScore] = useState({ correct: 0, answered: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const puzzles = await loadPuzzles();
        const built = await buildHangingDrillQueue(puzzles, hangingPiecesAsync, 12);
        if (!cancelled) setQueue(built);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
          setQueue([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (queue === null) {
    return (
      <main className="app">
        <p className="screen__note">Finding positions…</p>
      </main>
    );
  }

  const position = queue[index];

  if (!position) {
    return (
      <main className="app">
        <header className="screen__header">
          <button type="button" className="button button--ghost" onClick={onBack}>
            Back
          </button>
          <h1>Hanging pieces</h1>
        </header>
        <p className="screen__lead">
          {queue.length === 0
            ? 'No positions were available. Play a practice game first, then come back.'
            : `Session complete. ${score.correct} of ${score.answered} correct.`}
        </p>
        {queue.length > 0 ? (
          <button
            type="button"
            className="button button--primary button--wide"
            onClick={() => {
              setIndex(0);
              setScore({ correct: 0, answered: 0 });
              setMarked([]);
              setAnswer(null);
            }}
          >
            Another round
          </button>
        ) : null}
      </main>
    );
  }

  const correctSquares = answer ? answer.pieces.map((piece) => piece.square) : [];
  const wrong = answer ? answer.marked.filter((square) => !correctSquares.includes(square)) : [];

  const toggleMark = (square: Square): void => {
    if (answer) return;
    setMarked((current) =>
      current.includes(square) ? current.filter((entry) => entry !== square) : [...current, square],
    );
  };

  const submit = (): void => {
    if (answer) return;
    const expected = new Set(position.pieces.map((piece) => piece.square));
    const given = new Set(marked);
    const correct =
      expected.size === given.size && [...expected].every((square) => given.has(square));
    setAnswer({ correct, pieces: position.pieces, marked });
    setScore((current) => ({
      correct: current.correct + (correct ? 1 : 0),
      answered: current.answered + 1,
    }));
    void recordHangingAnswer(correct);
  };

  const next = (): void => {
    setIndex((value) => value + 1);
    setMarked([]);
    setAnswer(null);
  };

  return (
    <main className="app">
      <header className="screen__header">
        <button type="button" className="button button--ghost" onClick={onBack}>
          Back
        </button>
        <h1>Hanging pieces</h1>
      </header>

      <p className="screen__lead">
        Tap every hanging piece, for both colours. Position {index + 1} of {queue.length} · Score{' '}
        {score.correct}/{score.answered}.
      </p>

      <Board
        fen={position.fen}
        orientation={turnOf(position.fen)}
        mode="tapSquares"
        markedSquares={answer ? [] : marked}
        correctSquares={correctSquares}
        wrongSquares={wrong}
        onToggleSquare={toggleMark}
      />

      {!answer ? (
        <section className="panel">
          <h2 className="panel__title">Which pieces can be won?</h2>
          <p className="panel__body">
            Include loose pieces of either colour. If every piece is safe, leave the board empty.
          </p>
          <button
            type="button"
            className="button button--primary button--wide"
            onClick={submit}
          >
            Done
          </button>
        </section>
      ) : (
        <section className={`panel ${answer.correct ? 'panel--good' : 'panel--bad'}`}>
          <h2 className="panel__title">{answer.correct ? 'Correct.' : 'Not quite.'}</h2>
          {answer.pieces.length === 0 ? (
            <p className="panel__body">No piece was hanging. Good scan.</p>
          ) : (
            <ul className="threat-list">
              {describeHangingPieces(answer.pieces).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          <button type="button" className="button button--primary button--wide" onClick={next}>
            {index + 1 < queue.length ? 'Next' : 'Finish'}
          </button>
        </section>
      )}

      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
