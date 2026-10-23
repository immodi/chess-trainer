/**
 * Coach computations run here so the UI thread never blocks on capture
 * search (SPEC 4: the coach stays off the main thread while remaining pure).
 */
import { hangingPieces } from './hanging';
import { computeThreats } from './threats';

export type CoachRequest =
  | { id: number; kind: 'threats'; fen: string }
  | { id: number; kind: 'hanging'; fen: string };

export type CoachResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

interface WorkerScope {
  onmessage: ((event: MessageEvent<CoachRequest>) => void) | null;
  postMessage: (message: CoachResponse) => void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  const request = event.data;
  try {
    const result =
      request.kind === 'threats' ? computeThreats(request.fen) : hangingPieces(request.fen);
    scope.postMessage({ id: request.id, ok: true, result });
  } catch (error) {
    scope.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
