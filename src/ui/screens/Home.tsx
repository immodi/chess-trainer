import { useEffect, useState } from 'react';
import type { Progress } from '../../storage/progress';
import { EMPTY_PROGRESS, loadProgress } from '../../storage/progress';
import { loadGame } from '../../storage/game';
import type { SavedGame } from '../../storage/game';

export interface HomeProps {
  onPlay: (resume: boolean) => void;
  onChecklist: () => void;
  onSettings: () => void;
}

export function Home({ onPlay, onChecklist, onSettings }: HomeProps) {
  const [saved, setSaved] = useState<SavedGame | null>(null);
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadGame(), loadProgress()]).then(([game, stored]) => {
      if (cancelled) return;
      setSaved(game);
      setProgress(stored);
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
    <main className="app app--home">
      <header className="home__header">
        <h1>Chess Trainer</h1>
        <p className="home__tagline">Learn why a move is good before you make it.</p>
      </header>

      <section className="home__actions">
        <button type="button" className="button button--primary button--wide" onClick={() => onPlay(false)}>
          Play a game
        </button>

        {saved ? (
          <button type="button" className="button button--wide" onClick={() => onPlay(true)}>
            Continue game
            <span className="button__hint">
              {saved.moves.length} {saved.moves.length === 1 ? 'move' : 'moves'} played
            </span>
          </button>
        ) : null}
      </section>

      <button type="button" className="card card--link" onClick={onChecklist}>
        <span className="card__title">Before every move</span>
        <span className="card__body">The four questions that catch most beginner mistakes.</span>
      </button>

      {accuracy !== null ? (
        <section className="card">
          <span className="card__title">Your threat checks</span>
          <span className="card__body">
            {accuracy}% correct over {progress.threatAnswers}{' '}
            {progress.threatAnswers === 1 ? 'answer' : 'answers'}.
          </span>
        </section>
      ) : null}

      <button type="button" className="card card--link" onClick={onSettings}>
        <span className="card__title">Settings</span>
        <span className="card__body">Difficulty, touch-move and the threat check.</span>
      </button>

      <p className="home__footnote">Works fully offline. No account, no ads.</p>
    </main>
  );
}
