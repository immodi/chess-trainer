import { UciEngine } from './uci';
import type { EnginePort } from './uci';

/** Copied there by scripts/copy-stockfish.mjs. */
const ENGINE_PATH = 'stockfish/engine.js';

/** Resolves against the document so it works on a dev server and in Capacitor. */
export function engineWorkerUrl(): string {
  return new URL(ENGINE_PATH, document.baseURI).href;
}

/** Adapts the DOM Worker to the small port interface `UciEngine` needs. */
export function workerPort(worker: Worker): EnginePort {
  return {
    postMessage: (command) => worker.postMessage(command),
    onMessage: (handler) =>
      worker.addEventListener('message', (event: MessageEvent<unknown>) => {
        if (typeof event.data === 'string') handler(event.data);
      }),
    onError: (handler) => worker.addEventListener('error', (event: ErrorEvent) => handler(event.message)),
    terminate: () => worker.terminate(),
  };
}

export function createEngine(options: { onLine?: (line: string) => void } = {}): UciEngine {
  const worker = new Worker(engineWorkerUrl());
  return new UciEngine(workerPort(worker), options);
}
