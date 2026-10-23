import { Chess } from 'chess.js';
import type { Color, PieceSymbol, Square } from 'chess.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { classifyMove, isProblem } from '../../coach/classify';
import type { MoveLabel } from '../../coach/classify';
import { computeThreatsAsync } from '../../coach/client';
import { ADAPTIVE, THREAT_CHECK } from '../../coach/config';
import { buildFeedback } from '../../coach/feedback';
import type { Feedback } from '../../coach/feedback';
import { isThreatAnswerCorrect, threatTargets } from '../../coach/threats';
import type { Threat } from '../../coach/threats';
import { analyzePosition } from '../../engine/analysis';
import type { AnalysisResult } from '../../engine/analysis';
import { getEngine } from '../../engine/engine';
import { chooseOpponentMove, nextAdaptiveLevel } from '../../engine/opponent';
import {
  applyMove,
  applyUci,
  fromSaved,
  isUserTurn,
  newGame,
  playedUci,
  resign,
  resultFor,
  resultText,
  turnOf,
} from '../../modes/play';
import type { GameMode, GameState } from '../../modes/play';
import { clearGame, loadGame, saveGame } from '../../storage/game';
import {
  loadProgress,
  recordGameFinished,
  recordThreatCheck,
  setAdaptiveLevel,
} from '../../storage/progress';
import type { Settings } from '../../storage/settings';
import { Board } from '../board/Board';
import type { BoardArrow, BoardMove } from '../board/Board';
import { GlossaryList } from './Glossary';
import { Review } from './Review';
import { describeThreats } from '../threatText';

export interface PlayProps {
  settings: Settings;
  mode: GameMode;
  resume: boolean;
  onExit: () => void;
}

type ThreatPrompt =
  | { status: 'idle' }
  | { status: 'asking'; threats: Threat[]; marked: Square[]; startedAt: number }
  | { status: 'reveal'; threats: Threat[]; marked: Square[]; correct: boolean };

interface HintState {
  level: number;
  text: string;
  squares: Square[];
  move: { from: Square; to: Square } | null;
}

const LABEL_TEXT: Record<MoveLabel, string> = {
  best: 'Best',
  good: 'Good',
  ok: 'OK',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
};

function sanFor(fen: string, uci: string): string | null {
  const chess = new Chess(fen);
  try {
    const move = chess.move({
      from: uci.slice(0, 2) as Square,
      to: uci.slice(2, 4) as Square,
      promotion: uci.length > 4 ? (uci.slice(4, 5) as PieceSymbol) : undefined,
    });
    return move.san;
  } catch {
    return null;
  }
}

export function Play({ settings, mode, resume, onExit }: PlayProps) {
  const [game, setGame] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(resume);
  const [engineReady, setEngineReady] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adaptiveLevel, setAdaptiveLevelState] = useState<number>(ADAPTIVE.startLevel);
  const [threat, setThreat] = useState<ThreatPrompt>({ status: 'idle' });
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [hint, setHint] = useState<HintState | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [glossaryOpen, setGlossaryOpen] = useState(false);

  const gameRef = useRef<GameState | null>(null);
  const promptedFor = useRef<string | null>(null);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analysisCache = useRef(new Map<string, Promise<AnalysisResult | null>>());
  const statsRef = useRef({ userMoves: 0, blunders: 0 });
  const progressRecorded = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const commit = useCallback((next: GameState) => {
    gameRef.current = next;
    setGame(next);

    if (next.outcome) {
      void clearGame(next.mode);
      return;
    }

    void saveGame({
      fen: next.fen,
      moves: next.moves.map((move) => move.san),
      userColor: next.userColor,
      level: next.level,
      mode: next.mode,
      hints: next.hints,
      updatedAt: Date.now(),
    });
  }, []);

  /** One in-memory analysis per FEN; IndexedDB backs it across sessions. */
  const ensureAnalysis = useCallback((fen: string): Promise<AnalysisResult | null> => {
    const cache = analysisCache.current;
    const existing = cache.get(fen);
    if (existing) return existing;

    const promise = analyzePosition(fen).then((result) => {
      if (!result) cache.delete(fen);
      return result;
    });
    cache.set(fen, promise);
    return promise;
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
      void loadGame(mode).then((saved) => {
        if (cancelled) return;
        if (saved) {
          const restored = fromSaved(saved);
          if (restored) {
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
  }, [mode, resume]);

  useEffect(
    () => () => {
      if (revealTimer.current) clearTimeout(revealTimer.current);
      // Leaving the screen must not leave a search running in the worker.
      getEngine().stop();
    },
    [],
  );

  // Threat check before each user move (SPEC 2.7 / 6.6). Practice only.
  useEffect(() => {
    if (mode !== 'practice') return;
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
  }, [game, mode, settings.threatCheck]);

  // Warm the fixed-profile analysis while the user thinks, so feedback is quick.
  useEffect(() => {
    if (mode !== 'practice' || !game || game.outcome) return;
    if (turnOf(game.fen) !== game.userColor) return;
    void ensureAnalysis(game.fen);
  }, [game, mode, ensureAnalysis]);

  // Opponent's turn. In practice it waits for the user's move to be classified,
  // so the two engine searches never stop each other.
  useEffect(() => {
    if (!game || game.outcome || !engineReady) return;
    if (mode === 'practice' && classifying) return;
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
  }, [game, engineReady, settings.opponentLevel, commit, classifying, mode]);

  // Record the finished practice game once its last move has been classified.
  const finishGame = useCallback(() => {
    const current = gameRef.current;
    if (!current || !current.outcome || current.mode !== 'practice') return;
    if (progressRecorded.current) return;
    progressRecorded.current = true;

    const result = resultFor(current.outcome, current.userColor);
    const blundersPer100 =
      statsRef.current.userMoves > 0
        ? (statsRef.current.blunders * 100) / statsRef.current.userMoves
        : 0;

    void (async () => {
      await recordGameFinished({
        result,
        blundersPer100,
        userMoves: statsRef.current.userMoves,
      });
      if (settingsRef.current.opponentLevel !== 'adaptive') return;
      const updated = nextAdaptiveLevel({
        level: current.level,
        blundersPer100,
        result,
      });
      setAdaptiveLevelState(updated);
      await setAdaptiveLevel(updated);
    })();
  }, []);

  useEffect(() => {
    if (!game?.outcome || classifying) return;
    finishGame();
  }, [game, classifying, finishGame]);

  const startGame = (color: Color): void => {
    promptedFor.current = null;
    progressRecorded.current = false;
    statsRef.current = { userMoves: 0, blunders: 0 };
    setClassifying(false);
    setThreat({ status: 'idle' });
    setFeedback(null);
    setHint(null);
    setReviewing(false);
    const level = settings.opponentLevel === 'adaptive' ? adaptiveLevel : settings.opponentLevel;
    commit(newGame(color, level, mode));
  };

  const classifyAndFeedback = async (
    fenBefore: string,
    next: GameState,
    played: string,
  ): Promise<void> => {
    try {
      const before = await ensureAnalysis(fenBefore);
      const after = await ensureAnalysis(next.fen);
      if (!before || !after) return;
      // A new game may have replaced this one while the engine was thinking.
      if (gameRef.current !== next) return;

      const classification = classifyMove(before, after, played);
      statsRef.current.userMoves += 1;
      if (classification.label === 'blunder') statsRef.current.blunders += 1;

      if (isProblem(classification.label)) {
        setFeedback(
          buildFeedback(
            {
              fenBefore,
              fenAfter: next.fen,
              playedUci: played,
              mover: next.userColor,
              bestMove: before.bestMove,
              opponentBestMove: after.bestMove,
            },
            classification,
            before.cp,
            -after.cp,
          ),
        );
      }
    } catch {
      // Coaching is best-effort; a failed search must never block the game.
    } finally {
      if (gameRef.current === next) setClassifying(false);
    }
  };

  const handleMove = (move: BoardMove): void => {
    const current = gameRef.current;
    if (!current || current.outcome || threat.status === 'asking') return;
    const next = applyMove(current, move);
    if (!next) return;

    // A new position gets its own threat prompt, even if the FEN repeats.
    promptedFor.current = null;
    setFeedback(null);
    setHint(null);

    if (current.mode === 'practice') {
      const played = next.moves.at(-1);
      if (played) {
        setClassifying(true);
        void classifyAndFeedback(current.fen, next, playedUci(played));
      }
    }
    commit(next);
  };

  const requestHint = async (): Promise<void> => {
    const current = gameRef.current;
    if (!current || current.outcome || current.mode !== 'practice') return;
    if (turnOf(current.fen) !== current.userColor) return;

    const level = current.hints.length + 1;
    if (level > settingsRef.current.hintsPerGame) return;

    setHintBusy(true);
    try {
      let text: string;
      let squares: Square[] = [];
      let move: { from: Square; to: Square } | null = null;

      if (level === 1) {
        const threats = await computeThreatsAsync(current.fen);
        if (threats === undefined) {
          text = 'You are in check. Deal with the check first.';
        } else if (threats.length === 0) {
          text = 'Nothing is threatened right now. Look for your own chances.';
        } else {
          text = `There is a threat. ${describeThreats(current.fen, threats).join(' ')}`;
          squares = threatTargets(threats);
        }
      } else {
        const analysis = await ensureAnalysis(current.fen);
        if (gameRef.current !== current) return;
        if (!analysis?.bestMove) {
          setHint({
            level,
            text: 'The engine is still thinking. Try again in a moment.',
            squares: [],
            move: null,
          });
          return;
        }
        const from = analysis.bestMove.slice(0, 2) as Square;
        const to = analysis.bestMove.slice(2, 4) as Square;
        if (level === 2) {
          text = `Look at the piece on ${from}. It has a better move.`;
          squares = [from];
        } else {
          text = `The engine likes ${sanFor(current.fen, analysis.bestMove) ?? analysis.bestMove}.`;
          squares = [from, to];
          move = { from, to };
        }
      }

      // The user may have moved while the hint was being prepared; never
      // commit the old position over the new one.
      if (gameRef.current !== current) return;

      const next: GameState = {
        ...current,
        hints: [...current.hints, { ply: current.moves.length, level }],
      };
      commit(next);
      setHint({ level, text, squares, move });
    } catch {
      if (gameRef.current === current) {
        setHint({ level, text: 'The hint is not available right now.', squares: [], move: null });
      }
    } finally {
      setHintBusy(false);
    }
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
    promptedFor.current = null;
    progressRecorded.current = false;
    statsRef.current = { userMoves: 0, blunders: 0 };
    setClassifying(false);
    setGame(null);
    setThreat({ status: 'idle' });
    setFeedback(null);
    setHint(null);
    setReviewing(false);
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
          <h1>{mode === 'casual' ? 'New casual game' : 'New practice game'}</h1>
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
          {mode === 'casual'
            ? 'Plain chess: no threat checks, no coaching.'
            : 'Practice game: threat checks and coaching are on.'}
          <br />
          Level {settings.opponentLevel === 'adaptive' ? adaptiveLevel : settings.opponentLevel}.
          Untimed game.
        </p>
      </main>
    );
  }

  if (reviewing) {
    return <Review game={game} onExit={onExit} onNewGame={backToSetup} />;
  }

  const targets = threat.status === 'reveal' ? threatTargets(threat.threats) : [];
  const wrongMarks =
    threat.status === 'reveal' ? threat.marked.filter((square) => !targets.includes(square)) : [];
  const canMove = engineReady && !thinking && !hintBusy && isUserTurn(game);
  const boardMode = threat.status === 'asking' ? 'tapSquares' : 'play';
  const remainingHints = Math.max(0, settings.hintsPerGame - game.hints.length);
  const hintArrows: BoardArrow[] = [];
  if (hint?.move) {
    hintArrows.push({ from: hint.move.from, to: hint.move.to, color: 'blue' });
  }

  return (
    <main className="app app--play">
      <header className="play__header">
        <button type="button" className="button button--ghost" onClick={onExit}>
          Home
        </button>
        <div className="play__meta">
          <span>{game.userColor === 'w' ? 'You are White' : 'You are Black'}</span>
          <span className="play__level">
            {game.mode === 'casual' ? 'Casual' : 'Practice'} · Level {game.level}
          </span>
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
        hintSquares={hint?.squares ?? []}
        arrows={hintArrows}
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

      {hint ? (
        <section className="panel panel--hint">
          <div className="feedback__head">
            <h2 className="panel__title">
              Hint {hint.level} of {settings.hintsPerGame}
            </h2>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setHint(null)}
            >
              Dismiss
            </button>
          </div>
          <p className="panel__body">{hint.text}</p>
        </section>
      ) : null}

      {feedback && isUserTurn(game) && threat.status === 'idle' ? (
        <FeedbackCard
          feedback={feedback}
          onDismiss={() => setFeedback(null)}
          onGlossary={() => setGlossaryOpen(true)}
        />
      ) : null}

      {game.outcome ? (
        <section className="panel">
          <h2 className="panel__title">{resultText(game.outcome, game.userColor)}</h2>
          {classifying ? (
            <p className="screen__note">Checking your last move before the review…</p>
          ) : null}
          <div className="home__actions">
            {game.mode === 'practice' ? (
              <button
                type="button"
                className="button button--primary button--wide"
                onClick={() => setReviewing(true)}
                disabled={classifying}
              >
                Review game
              </button>
            ) : null}
            <button
              type="button"
              className="button button--wide"
              onClick={backToSetup}
              disabled={classifying}
            >
              New game
            </button>
            <button type="button" className="button button--wide" onClick={onExit}>
              Home
            </button>
          </div>
        </section>
      ) : null}

      {!game.outcome && threat.status === 'idle' ? (
        <div className="play__status-row">
          <p className="play__status">
            {!engineReady
              ? 'Starting the engine…'
              : classifying
                ? 'Checking your move…'
                : thinking
                  ? 'The computer is thinking…'
                  : 'Your move.'}
          </p>
          {game.mode === 'practice' && settings.hintsPerGame > 0 ? (
            <button
              type="button"
              className="button button--ghost"
              onClick={() => void requestHint()}
              disabled={!canMove || classifying || hintBusy || remainingHints <= 0}
            >
              Hint ({remainingHints})
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="error">{error}</p> : null}

      {glossaryOpen ? (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Glossary">
          <div className="modal__panel">
            <header className="screen__header">
              <h2>Glossary</h2>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => setGlossaryOpen(false)}
              >
                Close
              </button>
            </header>
            <GlossaryList />
          </div>
        </div>
      ) : null}
    </main>
  );
}

function FeedbackCard({
  feedback,
  onDismiss,
  onGlossary,
}: {
  feedback: Feedback;
  onDismiss: () => void;
  onGlossary: () => void;
}) {
  const [showMore, setShowMore] = useState(false);

  return (
    <section className={`panel feedback feedback--${feedback.label}`}>
      <div className="feedback__head">
        <h2 className="panel__title">
          {LABEL_TEXT[feedback.label]} · you gave away {feedback.loss.toFixed(0)}% of your winning
          chances
        </h2>
        <button type="button" className="button button--ghost" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
      <p className="panel__body">{feedback.lead.text}</p>
      {feedback.others.length > 0 ? (
        <>
          <button
            type="button"
            className="link-button"
            onClick={() => setShowMore((value) => !value)}
          >
            {showMore ? 'Fewer reasons' : `More reasons (${feedback.others.length})`}
          </button>
          {showMore ? (
            <ul className="feedback__others">
              {feedback.others.map((finding) => (
                <li key={`${finding.kind}:${finding.text}`}>{finding.text}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
      <button type="button" className="link-button" onClick={onGlossary}>
        Glossary
      </button>
    </section>
  );
}
