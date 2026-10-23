import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { useEffect, useRef, useState } from 'react';
import { ENDGAMES } from '../../data/endgames';
import type { EndgameDrill } from '../../data/endgames';
import { getEngine } from '../../engine/engine';
import {
  applyEndgameMove,
  budgetExceeded,
  chooseEndgameMove,
  endgameResult,
  fullMove,
  goalMet,
} from '../../modes/endgame';
import type { EndgameResult } from '../../modes/endgame';
import { turnOf } from '../../modes/play';
import type { Progress } from '../../storage/progress';
import { EMPTY_PROGRESS, loadProgress, recordEndgameResult } from '../../storage/progress';
import { Board } from '../board/Board';
import type { BoardMove } from '../board/Board';

export interface EndgamesProps {
  touchMove: boolean;
  onBack: () => void;
}

const RESULT_TEXT: Record<EndgameResult, string> = {
  win: 'you won',
  draw: 'a draw',
  loss: 'the computer won',
};

export function Endgames({ touchMove, onBack }: EndgamesProps) {
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS);
  const [engineReady, setEngineReady] = useState(false);
  const [drill, setDrill] = useState<EndgameDrill | null>(null);
  const [fen, setFen] = useState('');
  const [plies, setPlies] = useState(0);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [outcome, setOutcome] = useState<EndgameResult | null>(null);
  const [success, setSuccess] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const thinking = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void loadProgress().then((loaded) => {
      if (!cancelled) setProgress(loaded);
    });
    getEngine()
      .ready.then(
        () => {
          if (!cancelled) setEngineReady(true);
        },
        (caught: unknown) => {
          if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
        },
      );
    return () => {
      cancelled = true;
      getEngine().stop();
    };
  }, []);

  const start = (next: EndgameDrill): void => {
    setDrill(next);
    setFen(next.fen);
    setPlies(0);
    setLastMove(null);
    setOutcome(null);
    setSuccess(false);
    setExhausted(false);
    setBusy(false);
    setHintOpen(false);
    setError(null);
    thinking.current = false;
  };

  const finish = (result: EndgameResult): void => {
    if (!drill) return;
    const met = goalMet(drill, result);
    setOutcome(result);
    setSuccess(met);
    setBusy(false);
    thinking.current = false;
    void recordEndgameResult(drill.id, met).then(setProgress);
  };

  // Full-strength Stockfish replies while it is not the user's turn.
  useEffect(() => {
    if (!drill || !engineReady || outcome || !fen) return;
    if (turnOf(fen) === drill.userColor) return;
    if (thinking.current) return;

    let cancelled = false;
    thinking.current = true;
    setBusy(true);

    chooseEndgameMove(fen, (position, options) => getEngine().analyze(position, options))
      .then((move) => {
        if (cancelled) return;
        if (!move) {
          setError('Stockfish did not return a move. Go back to the drill list and try again.');
          return;
        }
        const from = move.slice(0, 2) as Square;
        const to = move.slice(2, 4) as Square;
        const promotion = move.length > 4 ? (move.slice(4, 5) as 'q' | 'r' | 'b' | 'n') : undefined;
        const applied = applyEndgameMove(fen, promotion ? { from, to, promotion } : { from, to });
        if (!applied) {
          setError('Stockfish returned an illegal move. Go back to the drill list and try again.');
          return;
        }

        setFen(applied.fen);
        setPlies((value) => value + 1);
        setLastMove({ from, to });

        const result = endgameResult(new Chess(applied.fen), drill.userColor);
        if (result) finish(result);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        thinking.current = false;
        if (!cancelled) setBusy(false);
      });

    return () => {
      cancelled = true;
      getEngine().stop();
    };
  }, [drill, engineReady, fen, outcome]);

  const handleMove = (move: BoardMove): void => {
    if (!drill || outcome || busy) return;
    const applied = applyEndgameMove(fen, move);
    if (!applied) return;

    const nextPlies = plies + 1;
    setFen(applied.fen);
    setPlies(nextPlies);
    setLastMove({ from: move.from, to: move.to });

    const result = endgameResult(new Chess(applied.fen), drill.userColor);
    if (result) {
      finish(result);
      return;
    }
    if (budgetExceeded(drill, nextPlies)) {
      setExhausted(true);
      finish(drill.goal === 'draw' ? 'draw' : 'loss');
    }
  };

  if (!drill) {
    return (
      <main className="app">
        <header className="screen__header">
          <button type="button" className="button button--ghost" onClick={onBack}>
            Back
          </button>
          <h1>Endgame drills</h1>
        </header>
        <p className="screen__lead">
          Play the ending out against full-strength Stockfish. Each drill has a goal and a move
          budget.
        </p>

        {ENDGAMES.map((entry) => {
          const stats = progress.endgames[entry.id];
          return (
            <button
              key={entry.id}
              type="button"
              className="card card--link"
              onClick={() => start(entry)}
            >
              <span className="card__title">{entry.name}</span>
              <span className="card__body">
                {entry.goal === 'win' ? 'Win' : 'Hold the draw'} within {entry.moveBudget} moves.
                {stats
                  ? ` ${stats.successes}/${stats.attempts} successful.`
                  : ' Not tried yet.'}
              </span>
            </button>
          );
        })}

        {error ? <p className="error">{error}</p> : null}
      </main>
    );
  }

  const goalText = drill.goal === 'win' ? 'Win' : 'Hold the draw';
  const status = !engineReady
    ? 'Starting the engine…'
    : busy
      ? 'Stockfish is thinking…'
      : 'Your move.';

  return (
    <main className="app">
      <header className="screen__header">
        <button
          type="button"
          className="button button--ghost"
          onClick={() => {
            setDrill(null);
            setOutcome(null);
            setBusy(false);
            thinking.current = false;
            getEngine().stop();
          }}
        >
          Drills
        </button>
        <h1>{drill.name}</h1>
      </header>

      <p className="screen__lead">
        {goalText} within {drill.moveBudget} moves. Move {Math.min(fullMove(plies), drill.moveBudget)}{' '}
        of {drill.moveBudget}.
      </p>

      <Board
        fen={fen}
        orientation={drill.userColor}
        mode="play"
        movableColor={drill.userColor}
        touchMove={touchMove}
        disabled={!engineReady || busy || outcome !== null}
        lastMove={lastMove}
        onMove={handleMove}
      />

      {!outcome ? (
        <div className="play__status-row">
          <p className="play__status">{status}</p>
          <div className="panel__row">
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setHintOpen((value) => !value)}
            >
              {hintOpen ? 'Hide hint' : 'Hint'}
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => finish('loss')}
              disabled={busy}
            >
              Resign
            </button>
          </div>
        </div>
      ) : (
        <section className={`panel ${success ? 'panel--good' : 'panel--bad'}`}>
          <h2 className="panel__title">{success ? 'Goal met.' : 'Not this time.'}</h2>
          <p className="panel__body">
            {success
              ? drill.goal === 'win'
                ? 'You converted the ending.'
                : 'You held the draw.'
              : exhausted
                ? 'You used the move budget without reaching the goal.'
                : `The result was ${RESULT_TEXT[outcome]}.`}
          </p>
          <div className="panel__row">
            <button
              type="button"
              className="button button--primary button--wide"
              onClick={() => start(drill)}
            >
              Try again
            </button>
            <button
              type="button"
              className="button button--wide"
              onClick={() => setDrill(null)}
            >
              Another drill
            </button>
          </div>
        </section>
      )}

      {hintOpen && !outcome ? (
        <section className="panel panel--hint">
          <h2 className="panel__title">Hint</h2>
          <p className="panel__body">{drill.hint}</p>
        </section>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
