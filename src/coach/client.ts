import type { HangingPiece } from './hanging';
import { hangingPieces } from './hanging';
import type { Threat } from './threats';
import { computeThreats } from './threats';
import type { CoachRequest, CoachResponse } from './worker';

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function failAll(error: Error): void {
  for (const entry of pending.values()) entry.reject(error);
  pending.clear();
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

function ensureWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;

  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }

  worker.onmessage = (event: MessageEvent<CoachResponse>) => {
    const response = event.data;
    const entry = pending.get(response.id);
    if (!entry) return;
    pending.delete(response.id);
    if (response.ok) entry.resolve(response.result);
    else entry.reject(new Error(response.error));
  };

  // A broken worker must not leave the UI waiting: reject, then fall back to
  // computing on the main thread for the next request.
  worker.onerror = () => failAll(new Error('Coach worker failed'));
  worker.onmessageerror = () => failAll(new Error('Coach worker message error'));

  return worker;
}

async function request(kind: CoachRequest['kind'], fen: string): Promise<unknown> {
  const active = ensureWorker();
  if (!active) throw new Error('No worker available');

  const id = (nextId += 1);
  const message: CoachRequest =
    kind === 'threats' ? { id, kind: 'threats', fen } : { id, kind: 'hanging', fen };

  return new Promise<unknown>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    active.postMessage(message);
  });
}

/**
 * Threat detection off the UI thread, with a synchronous fallback so an old
 * WebView (or a bundling problem) degrades instead of breaking.
 */
export async function computeThreatsAsync(fen: string): Promise<Threat[] | undefined> {
  try {
    return (await request('threats', fen)) as Threat[] | undefined;
  } catch {
    return computeThreats(fen);
  }
}

export async function hangingPiecesAsync(fen: string): Promise<HangingPiece[] | undefined> {
  try {
    return (await request('hanging', fen)) as HangingPiece[] | undefined;
  } catch {
    return hangingPieces(fen);
  }
}
