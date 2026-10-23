import { useEffect, useRef, useState } from 'react';
import type { Square } from 'chess.js';
import { loadPuzzles } from '../../data/puzzles';
import type { Puzzle } from '../../data/puzzles';
import { firstMove } from '../../data/puzzles';
import { themeInfo, themeName, THEMES } from '../../data/themes';
import type { PuzzleAttempt } from '../../modes/tactics';
import {
  bandFor,
  pickPuzzle,
  playPuzzleMove,
  startAttempt,
  tacticsStats,
} from '../../modes/tactics';
import type { Progress } from '../../storage/progress';
import { loadProgress, recordTacticsResult } from '../../storage/progress';
import type { Settings } from '../../storage/settings';
import { Board } from '../board/Board';
import type { BoardArrow, BoardMove } from '../board/Board';

export interface TacticsProps {
  settings: Settings;
  onBack: () => void;
}

interface Result {
  correct: boolean;
  attempt: PuzzleAttempt;
}

function uciOf(move: BoardMove): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

export function Tactics({ settings, onBack }: TacticsProps) {
  const [puzzles, setPuzzles] = useState<Puzzle[] | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [theme, setTheme] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<PuzzleAttempt | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [retry, setRetry] = useState<Puzzle[]>([]);
  const [freshSinceRetry, setFreshSinceRetry] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadPuzzles(), loadProgress()]).then(
      ([loadedPuzzles, loadedProgress]) => {
        if (cancelled) return;
        setPuzzles(loadedPuzzles);
        setProgress(loadedProgress);
      },
      (caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const start = (puzzle: Puzzle): void => {
    const started = startAttempt(puzzle);
    if (!started) {
      setError('That puzzle could not be loaded. Try another one.');
      return;
    }
    setError(null);
    setAttempt(started);
    setResult(null);
  };

  const pickNext = (
    themeId: string,
    sourceProgress: Progress,
    retryList: readonly Puzzle[],
    freshCount: number,
    preferRetry: boolean,
  ): void => {
    if (!puzzles) return;

    if (preferRetry && retryList.length > 0 && freshCount >= 1) {
      const [next, ...rest] = retryList;
      setRetry(rest);
      setFreshSinceRetry(0);
      if (next) start(next);
      return;
    }

    const band = bandFor(sourceProgress, themeId);
    let picked = pickPuzzle(puzzles, themeId, band, seen.current);
    if (!picked) {
      seen.current.clear();
      picked = pickPuzzle(puzzles, themeId, band);
    }
    if (!picked) {
      setError(`No ${themeName(themeId)} puzzles are available.`);
      return;
    }
    seen.current.add(picked.id);
    setFreshSinceRetry(freshCount + 1);
    start(picked);
  };

  const chooseTheme = (themeId: string): void => {
    if (!progress) return;
    setTheme(themeId);
    setAttempt(null);
    setResult(null);
    setRetry([]);
    setFreshSinceRetry(0);
    seen.current.clear();
    pickNext(themeId, progress, [], 0, false);
  };

  const backToThemes = (): void => {
    setTheme(null);
    setAttempt(null);
    setResult(null);
    setError(null);
  };

  const handleMove = (move: BoardMove): void => {
    if (!attempt || result || !theme) return;
    const next = playPuzzleMove(attempt, uciOf(move));
    if (next === attempt) return;

    setAttempt(next);
    if (!next.done) return;

    setResult({ correct: next.solved, attempt: next });
    if (!next.solved) {
      setRetry((current) => [...current, next.prepared.puzzle]);
      setFreshSinceRetry(0);
    }
    void recordTacticsResult(theme, next.solved).then(setProgress);
  };

  const nextPuzzle = (): void => {
    if (!theme || !progress) return;
    pickNext(theme, progress, retry, freshSinceRetry, true);
  };

  if (!puzzles || !progress) {
    return (
      <main className="app">
        <header className="screen__header">
          <button type="button" className="button button--ghost" onClick={onBack}>
            Back
          </button>
          <h1>Tactics</h1>
        </header>
        <p className="screen__note">{error ?? 'Loading puzzles…'}</p>
      </main>
    );
  }

  if (!theme) {
    return (
      <main className="app">
        <header className="screen__header">
          <button type="button" className="button button--ghost" onClick={onBack}>
            Back
          </button>
          <h1>Tactics</h1>
        </header>
        <p className="screen__lead">
          Pick a pattern. The rating band starts at 600–900 and adapts to your recent results.
        </p>

        <div className="theme-grid">
          {THEMES.map((entry) => {
            const stats = tacticsStats(progress, entry.id);
            const accuracy =
              stats.attempts > 0 ? Math.round((stats.correct / stats.attempts) * 100) : null;
            return (
              <button
                key={entry.id}
                type="button"
                className="theme-button"
                onClick={() => chooseTheme(entry.id)}
              >
                <span className="theme-button__name">{entry.name}</span>
                <span className="theme-button__meta">
                  {accuracy === null
                    ? `Band ${stats.bandLow}–${stats.bandHigh}`
                    : `${accuracy}% · ${stats.attempts} tried`}
                </span>
              </button>
            );
          })}
        </div>

        {error ? <p className="error">{error}</p> : null}
      </main>
    );
  }

  if (!attempt) {
    return (
      <main className="app">
        <header className="screen__header">
          <button type="button" className="button button--ghost" onClick={backToThemes}>
            Themes
          </button>
          <h1>{themeName(theme)}</h1>
        </header>
        <p className="screen__note">{error ?? 'Finding a puzzle…'}</p>
      </main>
    );
  }

  const info = themeInfo(theme);
  const first = firstMove(attempt.prepared.puzzle);
  const arrows: BoardArrow[] = [];
  if (result && !result.correct && result.attempt.expected) {
    arrows.push({
      from: result.attempt.expected.slice(0, 2) as Square,
      to: result.attempt.expected.slice(2, 4) as Square,
      color: 'green',
    });
  }

  const solution = result?.attempt.remainingSan.join(' ') ?? '';
  const patterns = attempt.prepared.puzzle.themes.map(themeName).join(', ');

  return (
    <main className="app">
      <header className="screen__header">
        <button type="button" className="button button--ghost" onClick={backToThemes}>
          Themes
        </button>
        <h1>{settings.tacticsMode === 'learn' || result ? themeName(theme) : 'Tactics test'}</h1>
      </header>

      <p className="screen__lead">
        {settings.tacticsMode === 'learn' || result
          ? `Puzzle rating ${attempt.prepared.puzzle.rating}. Find the winning move.`
          : `Puzzle rating ${attempt.prepared.puzzle.rating}. Which pattern is this?`}
      </p>

      <Board
        fen={attempt.fen}
        orientation={attempt.prepared.userColor}
        mode="play"
        movableColor={attempt.prepared.userColor}
        touchMove={settings.touchMove}
        disabled={result !== null}
        lastMove={first ? { from: first.from, to: first.to } : null}
        arrows={arrows}
        onMove={handleMove}
      />

      {settings.tacticsMode === 'learn' && !result && info ? (
        <section className="panel panel--hint">
          <h2 className="panel__title">{info.name}</h2>
          <p className="panel__body">{info.lookFor}</p>
        </section>
      ) : null}

      {result ? (
        <section className={`panel ${result.correct ? 'panel--good' : 'panel--bad'}`}>
          <h2 className="panel__title">{result.correct ? 'Solved.' : 'Not quite.'}</h2>
          <p className="panel__body">
            {result.correct
              ? `Pattern: ${patterns}.`
              : `The solution was ${solution || 'the move shown by the arrow'}. Pattern: ${patterns}.`}
          </p>
          {info ? <p className="panel__body">{info.lookFor}</p> : null}
          <button type="button" className="button button--primary button--wide" onClick={nextPuzzle}>
            Next puzzle
          </button>
        </section>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
