import { describe, expect, it } from 'vitest';
import { UciEngine, parseBestMove, parseInfoLine } from '../../src/engine/uci';
import type { EnginePort } from '../../src/engine/uci';

class FakePort implements EnginePort {
  readonly sent: string[] = [];
  private messageHandler: ((line: string) => void) | null = null;
  private errorHandler: ((message: string) => void) | null = null;

  postMessage(command: string): void {
    this.sent.push(command);
  }

  onMessage(handler: (line: string) => void): void {
    this.messageHandler = handler;
  }

  onError(handler: (message: string) => void): void {
    this.errorHandler = handler;
  }

  terminate(): void {
    // nothing to release in tests
  }

  emit(line: string): void {
    this.messageHandler?.(line);
  }

  emitError(message: string): void {
    this.errorHandler?.(message);
  }
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function bootedEngine(): Promise<{ engine: UciEngine; port: FakePort }> {
  const port = new FakePort();
  const engine = new UciEngine(port, { timeoutMs: 5_000 });
  port.emit('Stockfish 19 by the Stockfish developers (see AUTHORS file)');
  port.emit('uciok');
  port.emit('readyok');
  await engine.ready;
  return { engine, port };
}

describe('parseInfoLine', () => {
  it('parses a normal multipv line', () => {
    const info = parseInfoLine(
      'info depth 12 seldepth 15 multipv 1 score cp 34 nodes 120000 nps 90000 hashfull 12 tbhits 0 time 1330 pv e2e4 e7e5 g1f3',
    );
    expect(info).toEqual({
      multipv: 1,
      depth: 12,
      cp: 34,
      pv: ['e2e4', 'e7e5', 'g1f3'],
    });
  });

  it('parses mate scores', () => {
    const info = parseInfoLine('info depth 9 multipv 1 score mate 3 pv h5f7 g8f7 d1f3');
    expect(info?.mate).toBe(3);
    expect(info?.cp).toBeUndefined();
  });

  it('parses negative mate scores', () => {
    expect(parseInfoLine('info depth 9 score mate -2 pv a1a2')?.mate).toBe(-2);
  });

  it('ignores bound tokens and keeps the score', () => {
    expect(parseInfoLine('info depth 5 score cp 20 lowerbound pv e2e4')?.cp).toBe(20);
  });

  it('ignores info string chatter', () => {
    expect(parseInfoLine('info string NNUE evaluation using nn-1111.nnue')).toBeNull();
  });

  it('ignores progress lines without a score or pv', () => {
    expect(parseInfoLine('info depth 4 currmove e2e4 currmovenumber 1')).toBeNull();
  });

  it('ignores non-info lines', () => {
    expect(parseInfoLine('bestmove e2e4')).toBeNull();
  });
});

describe('parseBestMove', () => {
  it('returns the move', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toBe('e2e4');
  });

  it('returns null when no move was produced', () => {
    expect(parseBestMove('bestmove (none)')).toBeNull();
    expect(parseBestMove('bestmove 0000')).toBeNull();
  });
});

describe('UciEngine handshake', () => {
  it('sets single-thread options and checks readiness', async () => {
    const port = new FakePort();
    new UciEngine(port);
    port.emit('uciok');
    expect(port.sent).toContain('setoption name Threads value 1');
    expect(port.sent).toContain('setoption name Hash value 16');
    expect(port.sent).toContain('isready');
  });

  it('resolves ready on readyok', async () => {
    const { engine } = await bootedEngine();
    await expect(engine.ready).resolves.toBeUndefined();
  });

  it('rejects ready when the worker errors', async () => {
    const port = new FakePort();
    const engine = new UciEngine(port, { timeoutMs: 5_000 });
    port.emitError('wasm boom');
    await expect(engine.ready).rejects.toThrow(/wasm boom/);
  });
});

describe('UciEngine.analyze', () => {
  it('returns the deepest line per multipv, sorted by index', async () => {
    const { engine, port } = await bootedEngine();
    const pending = engine.analyze('8/8/8/8/8/8/8/K6k w - - 0 1', { depth: 10, multipv: 2 });
    await flush();

    port.emit('info depth 1 multipv 1 score cp 5 pv a1a2');
    port.emit('info depth 1 multipv 2 score cp 4 pv a1b1');
    port.emit('info depth 5 multipv 2 score cp 12 pv a1b1 h1g1');
    port.emit('info depth 6 multipv 1 score cp 30 pv a1a2 h1g1');
    port.emit('bestmove a1a2 ponder h1g1');

    const result = await pending;
    expect(result.stopped).toBe(false);
    expect(result.bestMove).toBe('a1a2');
    expect(result.lines.map((line) => line.multipv)).toEqual([1, 2]);
    expect(result.lines[0]?.depth).toBe(6);
    expect(result.lines[1]?.cp).toBe(12);
  });

  it('sends MultiPV only when it changes', async () => {
    const { engine, port } = await bootedEngine();

    const first = engine.analyze('8/8/8/8/8/8/8/K6k w - - 0 1', { depth: 3, multipv: 3 });
    await flush();
    port.emit('bestmove a1a2');
    await first;

    const second = engine.analyze('8/8/8/8/8/8/8/K6k w - - 0 1', { depth: 3, multipv: 3 });
    await flush();
    port.emit('bestmove a1a2');
    await second;

    const multipvCommands = port.sent.filter((command) => command.startsWith('setoption name MultiPV'));
    expect(multipvCommands).toEqual(['setoption name MultiPV value 3']);
  });

  it('resolves a stopped search as stopped and empty', async () => {
    const { engine, port } = await bootedEngine();
    const pending = engine.analyze('8/8/8/8/8/8/8/K6k w - - 0 1', { depth: 20 });
    await flush();

    port.emit('info depth 5 score cp 10 pv a1a2');
    engine.stop();
    port.emit('bestmove a1a2');

    const result = await pending;
    expect(result.stopped).toBe(true);
    expect(result.lines).toEqual([]);
    expect(result.bestMove).toBeNull();
    expect(port.sent).toContain('stop');
  });

  it('queues searches so they never overlap', async () => {
    const { engine, port } = await bootedEngine();

    const first = engine.analyze('fen-one', { depth: 20 });
    await flush();
    port.emit('info depth 2 score cp 1 pv a1a2');

    // A second request preempts the first one immediately.
    const second = engine.analyze('fen-two', { depth: 4 });
    await flush();
    expect(port.sent).toContain('stop');

    // The second search cannot start until the engine has answered the stop.
    expect(port.sent).not.toContain('position fen fen-two');
    port.emit('bestmove a1a2');

    const firstResult = await first;
    expect(firstResult.stopped).toBe(true);
    expect(firstResult.lines).toEqual([]);

    await flush();
    expect(port.sent).toContain('position fen fen-two');

    port.emit('info depth 4 score cp 2 pv a1a3');
    port.emit('bestmove a1a3');
    const secondResult = await second;
    expect(secondResult.stopped).toBe(false);
    expect(secondResult.bestMove).toBe('a1a3');
  });

  it('drops a queued request that a newer request superseded', async () => {
    const { engine, port } = await bootedEngine();

    const first = engine.analyze('fen-one', { depth: 20 });
    await flush();
    const second = engine.analyze('fen-two', { depth: 4 });
    const third = engine.analyze('fen-three', { depth: 4 });
    await flush();

    port.emit('bestmove a1a2');
    await first;

    expect(await second).toEqual({ lines: [], bestMove: null, stopped: true });

    await flush();
    expect(port.sent).toContain('position fen fen-three');
    expect(port.sent).not.toContain('position fen fen-two');

    port.emit('bestmove a1a3');
    expect((await third).bestMove).toBe('a1a3');
  });
});
