import { useEffect, useState } from 'react';
import type { Progress } from '../../storage/progress';
import { EMPTY_PROGRESS, loadProgress } from '../../storage/progress';
import { dueMistakes } from '../../storage/mistakes';

export interface LearnProps {
  onChecklist: () => void;
  onGlossary: () => void;
  onMistakes: () => void;
  onBack: () => void;
}

export function Learn({ onChecklist, onGlossary, onMistakes, onBack }: LearnProps) {
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS);
  const [due, setDue] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadProgress(), dueMistakes()]).then(([stored, cards]) => {
      if (cancelled) return;
      setProgress(stored);
      setDue(cards.length);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const accuracy =
    progress.threatAnswers > 0
      ? Math.round((progress.threatCorrect / progress.threatAnswers) * 100)
      : null;

  return (
    <main className="app">
      <header className="screen__header">
        <button type="button" className="button button--ghost" onClick={onBack}>
          Back
        </button>
        <h1>Learn</h1>
      </header>

      <p className="screen__lead">The ideas behind the coach, plus the positions you got wrong.</p>

      <button type="button" className="card card--link" onClick={onChecklist}>
        <span className="card__title">Before every move</span>
        <span className="card__body">The four questions that catch most beginner mistakes.</span>
      </button>

      <section className="card">
        <span className="card__title">Your threat checks</span>
        {accuracy === null ? (
          <span className="card__body">
            No answers yet. A practice game asks you before every move.
          </span>
        ) : (
          <span className="card__body">
            {accuracy}% correct over {progress.threatAnswers}{' '}
            {progress.threatAnswers === 1 ? 'answer' : 'answers'}.
            {progress.threatRushed > 0
              ? ` ${progress.threatRushed} answered in under 2 seconds.`
              : ' No rushed answers.'}
          </span>
        )}
      </section>

      <button type="button" className="card card--link" onClick={onMistakes}>
        <span className="card__title">Mistakes to review</span>
        <span className="card__body">
          {due > 0
            ? `${due} ${due === 1 ? 'position is' : 'positions are'} due today.`
            : 'Positions from finished games, spaced out over time.'}
        </span>
      </button>

      <button type="button" className="card card--link" onClick={onGlossary}>
        <span className="card__title">Glossary</span>
        <span className="card__body">Forks, pins, skewers and the rest, in plain language.</span>
      </button>
    </main>
  );
}
