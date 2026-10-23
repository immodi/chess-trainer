import { useEffect, useState } from 'react';
import type { Progress } from '../../storage/progress';
import { EMPTY_PROGRESS, loadProgress } from '../../storage/progress';
import { dueMistakes } from '../../storage/mistakes';

export interface LearnProps {
  onChecklist: () => void;
  onGlossary: () => void;
  onMistakes: () => void;
  onProgress: () => void;
  onThreatDrill: () => void;
  onHangingDrill: () => void;
  onTactics: () => void;
  onEndgames: () => void;
  onBack: () => void;
}

export function Learn({
  onChecklist,
  onGlossary,
  onMistakes,
  onProgress,
  onThreatDrill,
  onHangingDrill,
  onTactics,
  onEndgames,
  onBack,
}: LearnProps) {
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

      <p className="screen__lead">The ideas behind the coach, drills to train them, and your record.</p>

      <section>
        <h2 className="settings__title">Drills</h2>
        <button type="button" className="card card--link" onClick={onThreatDrill}>
          <span className="card__title">Find the threat</span>
          <span className="card__body">
            Tap what the opponent is threatening. Quiet positions are mixed in.
          </span>
        </button>
        <button type="button" className="card card--link" onClick={onHangingDrill}>
          <span className="card__title">Hanging pieces</span>
          <span className="card__body">Tap every loose piece, for both colours.</span>
        </button>
        <button type="button" className="card card--link" onClick={onTactics}>
          <span className="card__title">Tactics by pattern</span>
          <span className="card__body">
            Puzzles by theme, with a rating band that adapts to your results.
          </span>
        </button>
        <button type="button" className="card card--link" onClick={onEndgames}>
          <span className="card__title">Endgame drills</span>
          <span className="card__body">
            Convert winning endings or hold the draw against full-strength Stockfish.
          </span>
        </button>
      </section>

      <section>
        <h2 className="settings__title">Your record</h2>
        <button type="button" className="card card--link" onClick={onProgress}>
          <span className="card__title">Progress</span>
          <span className="card__body">
            {accuracy === null
              ? 'Threat checks, hanging pieces, tactics and endgames.'
              : `Threat checks ${accuracy}% · ${due} mistakes due today.`}
          </span>
        </button>
      </section>

      <button type="button" className="card card--link" onClick={onMistakes}>
        <span className="card__title">Mistakes to review</span>
        <span className="card__body">
          {due > 0
            ? `${due} ${due === 1 ? 'position is' : 'positions are'} due today.`
            : 'Positions from finished games, spaced out over time.'}
        </span>
      </button>

      <button type="button" className="card card--link" onClick={onChecklist}>
        <span className="card__title">Before every move</span>
        <span className="card__body">The four questions that catch most beginner mistakes.</span>
      </button>

      <button type="button" className="card card--link" onClick={onGlossary}>
        <span className="card__title">Glossary</span>
        <span className="card__body">Forks, pins, skewers and the rest, in plain language.</span>
      </button>
    </main>
  );
}
