import { useEffect, useState } from 'react';
import type { Square } from 'chess.js';
import { computeThreatsAsync } from '../../coach/client';
import { isThreatAnswerCorrect, threatTargets } from '../../coach/threats';
import { loadPuzzles } from '../../data/puzzles';
import { buildThreatDrillQueue } from '../../modes/drills';
import type { ThreatDrillPosition } from '../../modes/drills';
import { turnOf } from '../../modes/play';
import { loadProgress, recordThreatDrillAnswer } from '../../storage/progress';
import { Board } from '../board/Board';
import { describeThreats } from '../threatText';

export interface ThreatDrillProps {
  onBack: () => void;
}

interface Answer {
  correct: boolean;
  threats: ThreatDrillPosition['threats'];
  marked: Square[];
}

export function ThreatDrill({ onBack }: ThreatDrillProps) {
  const [queue, setQueue] = useState<ThreatDrillPosition[] | null>(null);
  const [index, setIndex] = useState(0);
  const [marked, setMarked] = useState<Square[]>([]);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [score, setScore] = useState({ correct: 0, answered: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [puzzles, progress] = await Promise.all([loadPuzzles(), loadProgress()]);
        const failed = progress.recentThreatChecks
          .filter((entry) => !entry.correct)
          .map((entry) => entry.fen)
          .reverse();
        const built = await buildThreatDrillQueue(puzzles, failed, computeThreatsAsync, 12);
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
          <h1>Find the threat</h1>
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

  const targets = answer ? threatTargets(answer.threats) : [];
  const wrong = answer ? answer.marked.filter((square) => !targets.includes(square)) : [];

  const toggleMark = (square: Square): void => {
    if (answer) return;
    setMarked((current) =>
      current.includes(square) ? current.filter((entry) => entry !== square) : [...current, square],
    );
  };

  const submit = (squares: Square[]): void => {
    if (answer) return;
    const correct = isThreatAnswerCorrect(position.threats, squares, 1);
    setAnswer({ correct, threats: position.threats, marked: squares });
    setScore((current) => ({
      correct: current.correct + (correct ? 1 : 0),
      answered: current.answered + 1,
    }));
    void recordThreatDrillAnswer(correct);
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
        <h1>Find the threat</h1>
      </header>

      <p className="screen__lead">
        What is the opponent threatening? Position {index + 1} of {queue.length} · Score{' '}
        {score.correct}/{score.answered}.
      </p>

      <Board
        fen={position.fen}
        orientation={turnOf(position.fen)}
        mode="tapSquares"
        markedSquares={answer ? [] : marked}
        correctSquares={targets}
        wrongSquares={wrong}
        onToggleSquare={toggleMark}
      />

      {!answer ? (
        <section className="panel panel--threat">
          <h2 className="panel__title">Tap every square the opponent could win</h2>
          <p className="panel__body">
            Include pieces and mating squares. If nothing is threatened, choose Nothing.
          </p>
          <div className="panel__row">
            <button type="button" className="button button--wide" onClick={() => submit([])}>
              Nothing
            </button>
            <button
              type="button"
              className="button button--primary button--wide"
              onClick={() => submit(marked)}
            >
              Done
            </button>
          </div>
        </section>
      ) : (
        <section className={`panel ${answer.correct ? 'panel--good' : 'panel--bad'}`}>
          <h2 className="panel__title">{answer.correct ? 'Correct.' : 'Not quite.'}</h2>
          {answer.threats.length === 0 ? (
            <p className="panel__body">Nothing was threatened. Safe to continue.</p>
          ) : (
            <ul className="threat-list">
              {describeThreats(position.fen, answer.threats).map((line) => (
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
