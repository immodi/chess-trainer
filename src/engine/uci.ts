/**
 * Minimal UCI client for the Stockfish WASM worker (SPEC 6.2).
 *
 * Scores stay side-to-move relative here; `evalUtils` converts them to White's
 * perspective. One search runs at a time: a queued search stops the previous
 * one first and waits for its `bestmove` so results can never be attributed to
 * the wrong position.
 *
 * The transport is injected (`EnginePort`) so the parser, queue and stop logic
 * can be unit-tested with canned engine output.
 */

export interface EngineLine {
  multipv: number;
  cp?: number;
  mate?: number;
  pv: string[];
  depth: number;
}

export interface AnalyzeOptions {
  depth?: number;
  movetime?: number;
  multipv?: number;
}

export interface AnalyzeResult {
  lines: EngineLine[];
  bestMove: string | null;
  stopped: boolean;
}

/** The minimum of the Worker API this client needs. */
export interface EnginePort {
  postMessage(command: string): void;
  onMessage(handler: (line: string) => void): void;
  onError(handler: (message: string) => void): void;
  terminate(): void;
}

const DEFAULT_DEPTH = 12;
const DEFAULT_TIMEOUT_MS = 60_000;

function toNumber(token: string | undefined): number | undefined {
  if (token === undefined) return undefined;
  const value = Number(token);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Parses one UCI `info` line. Returns null for lines that carry neither a
 * score nor a principal variation (progress chatter, `info string ...`).
 */
export function parseInfoLine(line: string): EngineLine | null {
  const tokens = line.trim().split(/\s+/);
  if (tokens[0] !== 'info') return null;

  let depth = 0;
  let multipv = 1;
  let cp: number | undefined;
  let mate: number | undefined;
  let pv: string[] = [];

  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i];

    switch (token) {
      case 'depth':
        depth = toNumber(tokens[(i += 1)]) ?? depth;
        break;
      case 'multipv':
        multipv = toNumber(tokens[(i += 1)]) ?? multipv;
        break;
      case 'score': {
        const kind = tokens[(i += 1)];
        const value = toNumber(tokens[(i += 1)]);
        if (kind === 'cp' && value !== undefined) cp = value;
        if (kind === 'mate' && value !== undefined) mate = value;
        break;
      }
      case 'pv':
        pv = tokens.slice(i + 1);
        i = tokens.length;
        break;
      // Everything from here on is free text or irrelevant to the result.
      case 'string':
      case 'currmove':
      case 'currmovenumber':
        i = tokens.length;
        break;
      default:
        // seldepth, nodes, nps, hashfull, tbhits, time, wdl, lowerbound, ...
        break;
    }
  }

  if (cp === undefined && mate === undefined && pv.length === 0) return null;

  const parsed: EngineLine = { multipv, pv, depth };
  if (cp !== undefined) parsed.cp = cp;
  if (mate !== undefined) parsed.mate = mate;
  return parsed;
}

/** Parses `bestmove e2e4 ponder e7e5`. Returns null for `bestmove (none)`. */
export function parseBestMove(line: string): string | null {
  const tokens = line.trim().split(/\s+/);
  if (tokens[0] !== 'bestmove') return null;
  const move = tokens[1];
  if (move === undefined || move === '(none)' || move === '0000') return null;
  return move;
}

interface PendingSearch {
  lines: Map<number, EngineLine>;
  resolve: (result: AnalyzeResult) => void;
  reject: (error: Error) => void;
  done: Promise<void>;
  markDone: () => void;
  stopped: boolean;
  timer: ReturnType<typeof setTimeout>;
}

export class UciEngine {
  private readonly port: EnginePort;
  private readonly onLine?: (line: string) => void;
  private readonly readyPromise: Promise<void>;
  private readonly timeoutMs: number;
  private resolveReady?: () => void;
  private rejectReady?: (error: Error) => void;
  private pending: PendingSearch | null = null;
  private multipv = 0;
  private chain: Promise<void> = Promise.resolve();
  private generation = 0;
  private disposed = false;

  constructor(port: EnginePort, options: { onLine?: (line: string) => void; timeoutMs?: number } = {}) {
    this.port = port;
    this.onLine = options.onLine;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    // A failed handshake must surface, not leave callers waiting forever.
    this.readyPromise.catch(() => undefined);

    this.port.onMessage((line) => this.handleMessage(line));
    this.port.onError((message) => this.fail(new Error(`Stockfish worker error: ${message || 'unknown'}`)));

    this.send('uci');
  }

  get ready(): Promise<void> {
    return this.readyPromise;
  }

  /**
   * Queues a search. The newest request wins: whatever is searching now is
   * stopped, and any earlier request still waiting in the queue resolves as
   * stopped without ever reaching the engine (SPEC 6.2).
   */
  analyze(fen: string, options: AnalyzeOptions = {}): Promise<AnalyzeResult> {
    const token = (this.generation += 1);
    this.stop();

    const run = (): Promise<AnalyzeResult> => {
      if (token !== this.generation) {
        return Promise.resolve({ lines: [], bestMove: null, stopped: true });
      }
      return this.runSearch(fen, options);
    };

    const next = this.chain.then(run, run);
    this.chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  /** Stops the running search. Its promise resolves with `stopped: true`. */
  stop(): void {
    const pending = this.pending;
    if (!pending || pending.stopped) return;
    pending.stopped = true;
    this.send('stop');
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.fail(new Error('Stockfish engine disposed'));
    this.port.terminate();
  }

  private send(command: string): void {
    if (this.disposed) return;
    this.onLine?.(`>> ${command}`);
    this.port.postMessage(command);
  }

  private handleMessage(line: string): void {
    if (this.disposed) return;
    this.onLine?.(line);
    const trimmed = line.trim();

    if (trimmed === 'uciok') {
      this.send('setoption name Threads value 1');
      this.send('setoption name Hash value 16');
      this.send('isready');
      return;
    }

    if (trimmed === 'readyok') {
      this.resolveReady?.();
      this.resolveReady = undefined;
      this.rejectReady = undefined;
      return;
    }

    if (trimmed.startsWith('bestmove')) {
      this.finish(parseBestMove(trimmed));
      return;
    }

    const info = parseInfoLine(trimmed);
    if (info) this.record(info);
  }

  private record(info: EngineLine): void {
    const pending = this.pending;
    if (!pending || pending.stopped) return;
    const existing = pending.lines.get(info.multipv);
    // Keep the deepest line per multipv; at equal depth the newest wins.
    if (!existing || info.depth >= existing.depth) {
      pending.lines.set(info.multipv, info);
    }
  }

  private async runSearch(fen: string, options: AnalyzeOptions): Promise<AnalyzeResult> {
    if (this.disposed) throw new Error('Stockfish engine disposed');
    await this.readyPromise;
    await this.cancelInFlight();

    const multipv = Math.max(1, Math.trunc(options.multipv ?? 1));
    if (multipv !== this.multipv) {
      this.send(`setoption name MultiPV value ${multipv}`);
      this.multipv = multipv;
    }

    const result = new Promise<AnalyzeResult>((resolve, reject) => {
      let markDone: () => void = () => undefined;
      const done = new Promise<void>((resolveDone) => {
        markDone = resolveDone;
      });
      const timer = setTimeout(() => {
        this.fail(new Error(`Stockfish search timed out after ${this.timeoutMs} ms`));
      }, this.timeoutMs);
      this.pending = { lines: new Map(), resolve, reject, done, markDone, stopped: false, timer };
    });

    this.send(`position fen ${fen}`);
    const go =
      options.movetime !== undefined
        ? `go movetime ${Math.max(1, Math.trunc(options.movetime))}`
        : `go depth ${Math.max(1, Math.trunc(options.depth ?? DEFAULT_DEPTH))}`;
    this.send(go);

    return result;
  }

  private async cancelInFlight(): Promise<void> {
    const pending = this.pending;
    if (!pending) return;
    if (!pending.stopped) {
      pending.stopped = true;
      this.send('stop');
    }
    await pending.done;
  }

  private finish(bestMove: string | null): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    clearTimeout(pending.timer);

    if (pending.stopped) {
      pending.resolve({ lines: [], bestMove: null, stopped: true });
    } else {
      const lines = [...pending.lines.values()].sort((a, b) => a.multipv - b.multipv);
      pending.resolve({ lines, bestMove, stopped: false });
    }
    pending.markDone();
  }

  private fail(error: Error): void {
    this.rejectReady?.(error);
    this.rejectReady = undefined;
    this.resolveReady = undefined;

    const pending = this.pending;
    this.pending = null;
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      pending.markDone();
    }
  }
}
