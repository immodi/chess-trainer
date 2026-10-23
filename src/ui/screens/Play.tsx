import { useCallback, useEffect, useRef, useState } from 'react';
import type { Color, Square } from 'chess.js';
import { computeThreatsAsync } from '../../coach/client';
import { ADAPTIVE, THREAT_CHECK } from '../../coach/config';
import { isThreatAnswerCorrect, threatTargets } from '../../coach/threats';
import type { Threat } from '../../coach/threats';
import { getEngine } from '../../engine/engine';
import { chooseOpponentMove, nextAdaptiveLevel } from '../../engine/opponent';
import {
  applyMove,
  applyUci,
  fromSaved,
  isUserTurn,
  newGame,
  resign,
  resultFor,
  resultText,
  turnOf,
} from '../../modes/play';
import type { GameState } from '../../modes/play';
import { clearGame, loadGame, saveGame } from '../../storage/game';
import {
  loadProgress,
  recordGameFinished,
  recordThreatCheck,
  setAdaptiveLevel,
} from '../../storage/progress';
import type { Settings } from '../../storage/settings';
import { Board } from '../board/Board';
import type { BoardMove } from '../board/Board';
import { describeThreats } from '../threatText';

export interface PlayProps {
  settings: Settings;
  resume: boolean;
  onExit: () => void;
}

type ThreatPrompt =
  | { status: 'idle' }
  | { status: 'asking'; threats: Threat[]; marked: Square[]; startedAt: number }
  | { status: 'reveal'; threats: Threat[]; marked: Square[]; correct: boolean };

export function Play({ settings, resume, onExit }: PlayProps) {
  const [game, setGame] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(resume);
  const [engineReady, setEngineReady] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adaptiveLevel, setAdaptiveLevelState] = useState<number>(ADAPTIVE.startLevel);
  const [threat, setThreat] = useState<ThreatPrompt>({ status: 'idle' });

  const gameRef = useRef<GameState | null>(null);
  const finishedRef = useRef(false);
  const promptedFor = useRef<string | null>(null);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const commit = useCallback((next: GameState) => {
    gameRef.current = next;
    setGame(next);

    if (next.outcome) {
      if (finishedRef.current) return;
      finishedRef.current = true;
      const outcome = next.outcome;
      void clearGame();
      void (async () => {
        await recordGameFinished();
        if (settingsRef.current.opponentLevel !== 'adaptive') return;
        const updated = nextAdaptiveLevel({
          level: next.level,
          // Classification arrives in Phase 2; until then a win promotes and a
          // loss demotes, which is the documented adaptive stub.
          blundersPer100: 0,
          result: resultFor(outcome, next.userColor),
        });
        setAdaptiveLevelState(updated);
        await setAdaptiveLevel(updated);
      })();
      return;
    }

    void saveGame({
      fen: next.fen,
      moves: next.moves.map((move) => move.san),
      userColor: next.userColor,
      level: next.level,
      updatedAt: Date.now(),
    });
  }, []);

  // Engine handshake and, when resuming, the saved game.
  useEffect(() => {
    let cancelled = false;

    getEngine()
      .ready.then(
        () => {
          if (!cancelled) setEngineReady(true);
        },
        (caught: unknown) => {
          if (cancelled) return;
          setError(caught instanceof Error ? caught.message : String(caught));
        },
      );

    void loadProgress().then((progress) => {
      if (!cancelled) setAdaptiveLevelState(progress.adaptiveLevel);
    });

    if (resume) {
      void loadGame().then((saved) => {
        if (cancelled) return;
        if (saved) {
          const restored = fromSaved(saved);
          if (restored) {
            finishedRef.current = restored.outcome !== null;
            gameRef.current = restored;
            setGame(restored);
          }
        }
        setLoading(false);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [resume]);

  useEffect(
    () => () => {
      if (revealTimer.current) clearTimeout(revealTimer.current);
    },
    [],
  );

  // Threat check before each user move (SPEC 2.7 / 6.6).
  useEffect(() => {
    if (!game || game.outcome) return;
    if (turnOf(game.fen) !== game.userColor) return;
    if (settings.threatCheck === 'off') return;
    if (promptedFor.current === game.fen) return;

    const fen = game.fen;
    let cancelled = false;
    void computeThreatsAsync(fen).then((threats) => {
      if (cancelled || !threats) return;
      if (promptedFor.current === fen) return;
      if (settings.threatCheck === 'whenThreatExists' && threats.length === 0) return;
      promptedFor.current = fen;
      setThreat({ status: 'asking', threats, marked: [], startedAt: performance.now() });
    });

    return () => {
      cancelled = true;
    };
  }, [game, settings.threatCheck]);

  // Opponent's turn.
  useEffect(() => {
    if (!game || game.outcome || !engineReady) return;
    if (turnOf(game.fen) === game.userColor) return;

    let cancelled = false;
    setThinking(true);
    const level = settings.opponentLevel === 'adaptive' ? game.level : settings.opponentLevel;

    chooseOpponentMove(game.fen, level, (fen, options) => getEngine().analyze(fen, options))
      .then((result) => {
        if (cancelled || !result) return;
        const latest = gameRef.current;
        if (!latest || latest.outcome || turnOf(latest.fen) === latest.userColor) return;
        const next = applyUci(latest, result.move);
        if (next) commit(next);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      })
      .finally(() => {
        if (!cancelled) setThinking(false);
      });

    return () => {
      cancelled = true;
      // Also runs when the opponent's move landed, so the spinner never sticks.
      setThinking(false);
    };
  }, [game, engineReady, settings.opponentLevel, commit]);

  const startGame = (color: Color): void => {
    finishedRef.current = false;
    promptedFor.current = null;
    setThreat({ status: 'idle' });
    const level = settings.opponentLevel === 'adaptive' ? adaptiveLevel : settings.opponentLevel;
    commit(newGame(color, level));
  };

  const handleMove = (move: BoardMove): void => {
    const current = gameRef.current;
    if (!current || threat.status === 'asking') return;
    const next = applyMove(current, move);
    if (next) commit(next);
  };

  const answerThreat = (marked: Square[]): void => {
    const current = gameRef.current;
    if (!current || threat.status !== 'asking') return;

    const correct = isThreatAnswerCorrect(threat.threats, marked, THREAT_CHECK.maxExtraSquares);
    const ms = performance.now() - threat.startedAt;

    setThreat({ status: 'reveal', threats: threat.threats, marked, correct });
    void recordThreatCheck({
      fen: current.fen,
      correct,
      ms,
      targets: threatTargets(threat.threats).length,
      marked: marked.length,
      at: Date.now(),
    });

    if (revealTimer.current) clearTimeout(revealTimer.current);
    revealTimer.current = setTimeout(() => setThreat({ status: 'idle' }), THREAT_CHECK.revealMs);
  };

  const toggleMark = (square: Square): void => {
    setThreat((current) => {
      if (current.status !== 'asking') return current;
      const marked = current.marked.includes(square)
        ? current.marked.filter((entry) => entry !== square)
        : [...current.marked, square];
      return { ...current, marked };
    });
  };

  const doResign = (): void => {
    const current = gameRef.current;
    if (!current || current.outcome) return;
    commit(resign(current));
  };

  const backToSetup = (): void => {
    gameRef.current = null;
    finishedRef.current = false;
    promptedFor.current = null;
    setGame(null);
    setThreat({ status: 'idle' });
  };

  if (loading) {
    return (
      <main className="app">
        <p className="screen__note">Loading your game…</p>
      </main>
    );
  }

  if (!game) {
    return (
      <main className="app app--home">
        <header className="screen__header">
          <button type="button" className="button button--ghost" onClick={onExit}>
            Back
          </button>
          <h1>New game</h1>
        </header>
        <p className="screen__lead">Which colour do you want to play?</p>
        <div className="home__actions">
          <button
            type="button"
            className="button button--primary button--wide"
            onClick={() => startGame('w')}
          >
            White
          </button>
          <button type="button" className="button button--wide" onClick={() => startGame('b')}>
            Black
          </button>
          <button
            type="button"
            className="button button--wide"
            onClick={() => startGame(Math.random() < 0.5 ? 'w' : 'b')}
          >
            Random
          </button>
        </div>
        <p className="screen__note">
          Level {settings.opponentLevel === 'adaptive' ? adaptiveLevel : settings.opponentLevel}.
          Untimed game.
        </p>
      </main>
    );
  }

  const targets = threat.status === 'reveal' ? threatTargets(threat.threats) : [];
  const wrongMarks =
    threat.status === 'reveal' ? threat.marked.filter((square) => !targets.includes(square)) : [];
  const canMove = engineReady && !thinking && isUserTurn(game);
  const boardMode = threat.status === 'asking' ? 'tapSquares' : 'play';

  return (
    <main className="app app--play">
      <header className="play__header">
        <button type="button" className="button button--ghost" onClick={onExit}>
          Home
        </button>
        <div className="play__meta">
          <span>{game.userColor === 'w' ? 'You are White' : 'You are Black'}</span>
          <span className="play__level">Level {game.level}</span>
        </div>
        {!game.outcome ? (
          <button type="button" className="button button--ghost" onClick={doResign}>
            Resign
          </button>
        ) : (
          <span />
        )}
      </header>

      <Board
        fen={game.fen}
        orientation={game.userColor}
        mode={boardMode}
        movableColor={game.userColor}
        touchMove={settings.touchMove}
        disabled={!canMove}
        lastMove={game.moves.at(-1) ?? null}
        markedSquares={threat.status === 'asking' ? threat.marked : []}
        correctSquares={targets}
        wrongSquares={wrongMarks}
        onMove={handleMove}
        onToggleSquare={toggleMark}
      />

      {threat.status === 'asking' ? (
        <section className="panel panel--threat">
          <h2 className="panel__title">What is the opponent threatening?</h2>
          <p className="panel__body">
            Tap the squares they could win, then tap Done. If nothing is threatened, tap Nothing.
          </p>
          <div className="panel__row">
            <button type="button" className="button button--wide" onClick={() => answerThreat([])}>
              Nothing
            </button>
            <button
              type="button"
              className="button button--primary button--wide"
              onClick={() => answerThreat(threat.marked)}
            >
              Done
            </button>
          </div>
        </section>
      ) : null}

      {threat.status === 'reveal' ? (
        <section className={`panel ${threat.correct ? 'panel--good' : 'panel--bad'}`}>
          <h2 className="panel__title">{threat.correct ? 'Correct.' : 'Not quite.'}</h2>
          {threat.threats.length === 0 ? (
            <p className="panel__body">Nothing was threatened. Safe to continue.</p>
          ) : (
            <ul className="threat-list">
              {describeThreats(game.fen, threat.threats).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {game.outcome ? (
        <section className="panel">
          <h2 className="panel__title">{resultText(game.outcome, game.userColor)}</h2>
          <div className="panel__row">
            <button type="button" className="button button--primary button--wide" onClick={backToSetup}>
              New game
            </button>
            <button type="button" className="button button--wide" onClick={onExit}>
              Home
            </button>
          </div>
        </section>
      ) : null}

      {!game.outcome && threat.status === 'idle' ? (
        <p className="play__status">
          {!engineReady
            ? 'Starting the engine…'
            : thinking
              ? 'The computer is thinking…'
              : 'Your move.'}
        </p>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
