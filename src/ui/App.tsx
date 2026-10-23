import { useCallback, useEffect, useRef, useState } from 'react';
import { createEngine } from '../engine/engine';
import { whiteWinPercent } from '../engine/evalUtils';
import type { EngineLine, UciEngine } from '../engine/uci';
import { Board } from './board/Board';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const SELF_TEST_DEPTH = 8;
const MAX_LOG_LINES = 200;

type Status = 'booting' | 'ready' | 'searching' | 'error';

interface SelfTestResult {
  bestMove: string;
  depth: number;
  evaluation: string;
  winPercent: number | undefined;
  pv: string[];
  elapsedMs: number;
}

function formatEvaluation(line: EngineLine): string {
  if (line.mate !== undefined) return `#${line.mate}`;
  if (line.cp !== undefined) return `${(line.cp / 100).toFixed(2)}`;
  return '—';
}

export function App() {
  const [status, setStatus] = useState<Status>('booting');
  const [result, setResult] = useState<SelfTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const engineRef = useRef<UciEngine | null>(null);
  const logRef = useRef<string[]>([]);

  const runSelfTest = useCallback(async (engine: UciEngine) => {
    setStatus('searching');
    setError(null);
    logRef.current = [];
    const started = performance.now();

    try {
      const analysis = await engine.analyze(START_FEN, { depth: SELF_TEST_DEPTH });
      const best = analysis.lines[0];
      if (!best) throw new Error('Engine returned no lines.');

      setResult({
        bestMove: analysis.bestMove ?? '(none)',
        depth: best.depth,
        evaluation: formatEvaluation(best),
        winPercent: whiteWinPercent(best, 'w'),
        pv: best.pv.slice(0, 6),
        elapsedMs: Math.round(performance.now() - started),
      });
      setStatus('ready');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus('error');
    } finally {
      setLog([...logRef.current]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const engine = createEngine({
      onLine: (line) => {
        if (logRef.current.length < MAX_LOG_LINES) logRef.current.push(line);
      },
    });
    engineRef.current = engine;

    engine.ready.then(
      () => {
        if (!cancelled) void runSelfTest(engine);
      },
      (caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : String(caught));
        setStatus('error');
      },
    );

    return () => {
      cancelled = true;
      engine.dispose();
      engineRef.current = null;
    };
  }, [runSelfTest]);

  const rerun = (): void => {
    const engine = engineRef.current;
    if (engine) void runSelfTest(engine);
  };

  return (
    <main className="app">
      <header className="app__header">
        <h1>Chess Trainer</h1>
        <p className="app__subtitle">Phase 0 · board and engine self-test</p>
      </header>

      <Board fen={START_FEN} />

      <section className="panel">
        <div className="panel__row">
          <span className={`status status--${status}`}>
            {status === 'booting' && 'Loading engine…'}
            {status === 'ready' && 'Engine ready'}
            {status === 'searching' && 'Searching…'}
            {status === 'error' && 'Engine failed'}
          </span>
          <button type="button" className="button" onClick={rerun} disabled={status !== 'ready' && status !== 'error'}>
            Run depth {SELF_TEST_DEPTH} again
          </button>
        </div>

        {result ? (
          <dl className="results">
            <div>
              <dt>Best move</dt>
              <dd>{result.bestMove}</dd>
            </div>
            <div>
              <dt>Depth</dt>
              <dd>{result.depth}</dd>
            </div>
            <div>
              <dt>Eval (side to move)</dt>
              <dd>{result.evaluation}</dd>
            </div>
            <div>
              <dt>White win%</dt>
              <dd>{result.winPercent === undefined ? '—' : result.winPercent.toFixed(1)}</dd>
            </div>
            <div>
              <dt>Took</dt>
              <dd>{result.elapsedMs} ms</dd>
            </div>
            <div className="results__wide">
              <dt>Principal variation</dt>
              <dd>{result.pv.join(' ') || '—'}</dd>
            </div>
          </dl>
        ) : null}

        {error ? <p className="error">{error}</p> : null}

        {log.length > 0 ? (
          <details className="log">
            <summary>Engine output ({log.length} lines)</summary>
            <pre>{log.join('\n')}</pre>
          </details>
        ) : null}
      </section>
    </main>
  );
}
