import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { useEffect, useState } from 'react';
import type { MoveLabel } from '../../coach/classify';
import { analyzePosition } from '../../engine/analysis';
import { getEngine } from '../../engine/engine';
import type { GameState } from '../../modes/play';
import type { ReviewMove, ReviewSummary } from '../../modes/review';
import { buildReview } from '../../modes/review';
import { addMistakes } from '../../storage/mistakes';
import { loadProgress } from '../../storage/progress';
import { Board } from '../board/Board';
import type { BoardArrow } from '../board/Board';

export interface ReviewProps {
  game: GameState;
  onExit: () => void;
  onNewGame: () => void;
}

const LABEL_TEXT: Record<MoveLabel, string> = {
  best: 'best',
  good: 'good',
  ok: 'ok',
  inaccuracy: 'inaccuracy',
  mistake: 'mistake',
  blunder: 'blunder',
};

function sanFor(fen: string, uci: string | null): string | null {
  if (!uci) return null;
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

export function Review({ game, onExit, onNewGame }: ReviewProps) {
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [progress, setProgress] = useState(0);
  const [selected, setSelected] = useState<ReviewMove | null>(null);
  const [showBest, setShowBest] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const stored = await loadProgress();
      const result = await buildReview(
        game,
        analyzePosition,
        stored.recentThreatChecks,
        (done, total) => {
          if (!cancelled) setProgress(Math.round((done / total) * 100));
        },
        () => cancelled,
      );
      if (cancelled) return;
      setSummary(result);
      const worst = result.moves
        .filter(
          (move) =>
            move.color === game.userColor &&
            (move.label === 'inaccuracy' ||
              move.label === 'mistake' ||
              move.label === 'blunder'),
        )
        .sort((a, b) => b.loss - a.loss);
      setSelected(worst[0] ?? null);
      void addMistakes(result.mistakes);
    })();

    return () => {
      cancelled = true;
      getEngine().stop();
    };
  }, [game]);

  if (!summary) {
    return (
      <main className="app app--review">
        <header className="screen__header">
          <button type="button" className="button button--ghost" onClick={onExit}>
            Home
          </button>
          <h1>Game review</h1>
        </header>
        <p className="screen__lead">Checking every move with the engine…</p>
        <div className="progress-bar" role="progressbar" aria-valuenow={progress}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <p className="screen__note">{progress}%</p>
      </main>
    );
  }

  const worst = summary.moves
    .filter(
      (move) =>
        move.color === game.userColor &&
        (move.label === 'inaccuracy' || move.label === 'mistake' || move.label === 'blunder'),
    )
    .sort((a, b) => b.loss - a.loss);

  const arrows: BoardArrow[] = [];
  if (selected) {
    arrows.push({
      from: selected.uci.slice(0, 2) as Square,
      to: selected.uci.slice(2, 4) as Square,
      color: 'red',
    });
    if (showBest && selected.bestMove) {
      arrows.push({
        from: selected.bestMove.slice(0, 2) as Square,
        to: selected.bestMove.slice(2, 4) as Square,
        color: 'green',
      });
    }
  }

  const bestSan = selected ? sanFor(selected.fenBefore, selected.bestMove) : null;

  return (
    <main className="app app--review">
      <header className="screen__header">
        <button type="button" className="button button--ghost" onClick={onExit}>
          Home
        </button>
        <h1>Game review</h1>
      </header>

      <section className="review__summary">
        <p className="review__headline">
          {summary.userMoves === 0
            ? 'No moves to review.'
            : `You gave away an average of ${summary.averageLoss.toFixed(1)}% per move.`}
        </p>
        <p className="review__counts">
          {plural(summary.counts.inaccuracy, 'inaccuracy', 'inaccuracies')} ·{' '}
          {plural(summary.counts.mistake, 'mistake', 'mistakes')} ·{' '}
          {plural(summary.counts.blunder, 'blunder', 'blunders')}
        </p>
      </section>

      <EvalGraph points={summary.evalGraph} />

      {selected ? (
        <section className="review__detail">
          <div className="review__detail-head">
            <span className="review__detail-title">
              {selected.moveNumber}
              {selected.color === 'w' ? '.' : '…'} {selected.san}
            </span>
            <span className={`review__label review__label--${selected.label}`}>
              {LABEL_TEXT[selected.label]} · −{selected.loss.toFixed(1)}%
            </span>
          </div>

          <Board
            fen={selected.fenBefore}
            orientation={game.userColor}
            mode="readonly"
            arrows={arrows}
          />

          {selected.feedback ? (
            <p className="review__reason">{selected.feedback.lead.text}</p>
          ) : null}

          {selected.hinted ? <p className="screen__note">You used a hint here.</p> : null}
          {selected.rushed ? (
            <p className="screen__note">You answered the threat check in under 2 seconds.</p>
          ) : null}

          <div className="panel__row">
            <button
              type="button"
              className="button button--wide"
              onClick={() => setShowBest((value) => !value)}
              disabled={!selected.bestMove}
            >
              {showBest ? 'Hide best move' : 'Show best move'}
            </button>
            <button type="button" className="button button--ghost button--wide" onClick={onExit}>
              Home
            </button>
          </div>

          {showBest && bestSan ? (
            <p className="screen__note">The engine preferred {bestSan}.</p>
          ) : null}
        </section>
      ) : null}

      <section className="review__list">
        <h2 className="settings__title">Worst moves</h2>
        {worst.length === 0 ? (
          <p className="screen__note">No inaccuracies in this game. Nice play.</p>
        ) : (
          worst.map((move) => (
            <button
              key={move.ply}
              type="button"
              className={`review__entry ${selected?.ply === move.ply ? 'review__entry--selected' : ''}`}
              onClick={() => {
                setSelected(move);
                setShowBest(false);
              }}
            >
              <span className="review__entry-move">
                {move.moveNumber}
                {move.color === 'w' ? '.' : '…'} {move.san}
              </span>
              <span className={`review__label review__label--${move.label}`}>
                {LABEL_TEXT[move.label]} · −{move.loss.toFixed(1)}%
              </span>
              {move.hinted ? <span className="review__flag">hint</span> : null}
              {move.rushed ? <span className="review__flag">rushed</span> : null}
            </button>
          ))
        )}
      </section>

      <div className="panel__row">
        <button type="button" className="button button--primary button--wide" onClick={onNewGame}>
          New game
        </button>
        <button type="button" className="button button--wide" onClick={onExit}>
          Home
        </button>
      </div>
    </main>
  );
}

function EvalGraph({ points }: { points: readonly number[] }) {
  if (points.length < 2) return null;

  const width = 320;
  const height = 84;
  const step = width / (points.length - 1);
  const y = (value: number): number => height - (value / 100) * height;
  const line = points.map((value, index) => `${index * step},${y(value)}`).join(' ');

  return (
    <section className="eval-graph" aria-label="Evaluation graph">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <rect x={0} y={0} width={width} height={height} className="eval-graph__bg" />
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} className="eval-graph__mid" />
        <polyline points={line} className="eval-graph__line" />
      </svg>
      <div className="eval-graph__legend">
        <span>White</span>
        <span>Black</span>
      </div>
    </section>
  );
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
