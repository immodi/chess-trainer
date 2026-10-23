import { useEffect, useState } from 'react';
import { ENDGAMES } from '../../data/endgames';
import { THEMES } from '../../data/themes';
import { dueMistakes } from '../../storage/mistakes';
import type { Progress } from '../../storage/progress';
import { EMPTY_PROGRESS, loadProgress } from '../../storage/progress';
import type { Settings } from '../../storage/settings';
import { DEFAULT_SETTINGS, loadSettings } from '../../storage/settings';

export interface ProgressScreenProps {
  onBack: () => void;
}

function percent(correct: number, total: number): string {
  if (total === 0) return '—';
  return `${Math.round((correct / total) * 100)}%`;
}

function blundersPer100(progress: Progress): number | null {
  const games = progress.recentGames;
  if (games.length === 0) return null;
  const moves = games.reduce((sum, game) => sum + game.userMoves, 0);
  if (moves === 0) return null;
  const weighted = games.reduce(
    (sum, game) => sum + game.blundersPer100 * game.userMoves,
    0,
  );
  return weighted / moves;
}

export function ProgressScreen({ onBack }: ProgressScreenProps) {
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [due, setDue] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadProgress(), loadSettings(), dueMistakes()]).then(
      ([loadedProgress, loadedSettings, cards]) => {
        if (cancelled) return;
        setProgress(loadedProgress);
        setSettings(loadedSettings);
        setDue(cards.length);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const level =
    settings.opponentLevel === 'adaptive'
      ? `Adaptive (level ${progress.adaptiveLevel})`
      : `Level ${settings.opponentLevel}`;
  const blunderRate = blundersPer100(progress);

  return (
    <main className="app">
      <header className="screen__header">
        <button type="button" className="button button--ghost" onClick={onBack}>
          Back
        </button>
        <h1>Progress</h1>
      </header>

      <section className="stat-grid">
        <div className="stat">
          <span className="stat__label">Opponent</span>
          <span className="stat__value">{level}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Blunders / 100 moves</span>
          <span className="stat__value">
            {blunderRate === null ? '—' : blunderRate.toFixed(1)}
          </span>
          <span className="stat__hint">
            {progress.recentGames.length === 0
              ? 'No finished practice games yet.'
              : `Last ${progress.recentGames.length} practice ${
                  progress.recentGames.length === 1 ? 'game' : 'games'
                }.`}
          </span>
        </div>
        <div className="stat">
          <span className="stat__label">Threat checks</span>
          <span className="stat__value">
            {percent(progress.threatCorrect, progress.threatAnswers)}
          </span>
          <span className="stat__hint">
            {progress.threatAnswers === 0
              ? 'No answers yet.'
              : `${progress.threatCorrect} of ${progress.threatAnswers} correct.`}
          </span>
        </div>
        <div className="stat">
          <span className="stat__label">Hanging pieces</span>
          <span className="stat__value">
            {percent(progress.hangingCorrect, progress.hangingAnswers)}
          </span>
          <span className="stat__hint">
            {progress.hangingAnswers === 0
              ? 'No drill answers yet.'
              : `${progress.hangingCorrect} of ${progress.hangingAnswers} correct.`}
          </span>
        </div>
        <div className="stat">
          <span className="stat__label">Find-the-threat drill</span>
          <span className="stat__value">
            {percent(progress.threatDrillCorrect, progress.threatDrillAnswers)}
          </span>
          <span className="stat__hint">
            {progress.threatDrillAnswers === 0
              ? 'No drill answers yet.'
              : `${progress.threatDrillCorrect} of ${progress.threatDrillAnswers} correct.`}
          </span>
        </div>
        <div className="stat">
          <span className="stat__label">Mistakes due today</span>
          <span className="stat__value">{due}</span>
          <span className="stat__hint">Spaced review from finished games.</span>
        </div>
      </section>

      <section>
        <h2 className="settings__title">Tactics by pattern</h2>
        <div className="theme-stats">
          {THEMES.map((theme) => {
            const stats = progress.tacticsByTheme[theme.id];
            const attempts = stats?.attempts ?? 0;
            const correct = stats?.correct ?? 0;
            const accuracy = attempts > 0 ? Math.round((correct / attempts) * 100) : 0;
            return (
              <div className="theme-stat" key={theme.id}>
                <div className="theme-stat__head">
                  <span>{theme.name}</span>
                  <span className="theme-stat__value">
                    {attempts === 0 ? '—' : `${accuracy}%`}
                  </span>
                </div>
                <div className="progress-bar" aria-hidden="true">
                  <span style={{ width: `${accuracy}%` }} />
                </div>
                <span className="theme-stat__hint">
                  {attempts === 0
                    ? 'Not tried yet'
                    : `${correct} of ${attempts} correct · band ${stats?.bandLow ?? 600}–${stats?.bandHigh ?? 900}`}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="settings__title">Endgame drills</h2>
        <div className="theme-stats">
          {ENDGAMES.map((drill) => {
            const stats = progress.endgames[drill.id];
            return (
              <div className="theme-stat" key={drill.id}>
                <div className="theme-stat__head">
                  <span>{drill.name}</span>
                  <span className="theme-stat__value">
                    {stats ? `${stats.successes}/${stats.attempts}` : '—'}
                  </span>
                </div>
                <span className="theme-stat__hint">
                  {stats && stats.attempts > 0
                    ? `${Math.round((stats.successes / stats.attempts) * 100)}% successful`
                    : 'Not tried yet'}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
