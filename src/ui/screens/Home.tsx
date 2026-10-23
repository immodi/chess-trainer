import { useEffect, useState } from 'react';
import type { GameMode } from '../../modes/play';
import { loadGame } from '../../storage/game';
import type { SavedGame } from '../../storage/game';

export interface HomeProps {
  onPlay: (mode: GameMode, resume: boolean) => void;
  onLearn: () => void;
  onSettings: () => void;
}

interface SavedGames {
  practice: SavedGame | null;
  casual: SavedGame | null;
}

const NO_SAVES: SavedGames = { practice: null, casual: null };

export function Home({ onPlay, onLearn, onSettings }: HomeProps) {
  const [saved, setSaved] = useState<SavedGames>(NO_SAVES);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadGame('practice'), loadGame('casual')]).then(([practice, casual]) => {
      if (cancelled) return;
      setSaved({ practice, casual });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="app app--home">
      <header className="home__header">
        <h1>Chess Trainer</h1>
        <p className="home__tagline">Learn why a move is good before you make it.</p>
      </header>

      <section className="home__modes">
        <ModeCard
          title="Practice game"
          body="Threat checks before every move, plus coaching."
          saved={saved.practice}
          onStart={() => onPlay('practice', false)}
          onContinue={() => onPlay('practice', true)}
        />
        <ModeCard
          title="Casual game"
          body="Just chess. No questions, no coaching."
          saved={saved.casual}
          onStart={() => onPlay('casual', false)}
          onContinue={() => onPlay('casual', true)}
        />
      </section>

      <button type="button" className="card card--link" onClick={onLearn}>
        <span className="card__title">Learn</span>
        <span className="card__body">
          Drills, the pre-move checklist, your progress, the glossary and mistakes to review.
        </span>
      </button>

      <button type="button" className="card card--link" onClick={onSettings}>
        <span className="card__title">Settings</span>
        <span className="card__body">Difficulty, touch-move, threat checks and hints.</span>
      </button>

      <p className="home__footnote">Works fully offline. No account, no ads.</p>
    </main>
  );
}

interface ModeCardProps {
  title: string;
  body: string;
  saved: SavedGame | null;
  onStart: () => void;
  onContinue: () => void;
}

function ModeCard({ title, body, saved, onStart, onContinue }: ModeCardProps) {
  return (
    <section className="mode-card">
      <div className="mode-card__text">
        <span className="card__title">{title}</span>
        <span className="card__body">{body}</span>
      </div>
      <div className="mode-card__actions">
        {saved ? (
          <>
            <button
              type="button"
              className="button button--primary button--wide"
              onClick={onContinue}
            >
              Continue
              <span className="button__hint">
                {saved.moves.length} {saved.moves.length === 1 ? 'move' : 'moves'} played
              </span>
            </button>
            <button type="button" className="button button--ghost button--wide" onClick={onStart}>
              New game
            </button>
          </>
        ) : (
          <button type="button" className="button button--primary button--wide" onClick={onStart}>
            Play
          </button>
        )}
      </div>
    </section>
  );
}
