import type { MoveLabel } from '../coach/classify';
import { readValue, writeValue } from './db';

/** A position the user got wrong, kept for spaced repetition (SPEC 6.7 Mode 5). */
export interface MistakeCard {
  /** `fen|played`; one card per distinct mistake. */
  id: string;
  /** Position before the mistake, with the user to move. */
  fen: string;
  /** The move the user played, in UCI. */
  played: string;
  /** The engine's move, in UCI. */
  best: string;
  label: Extract<MoveLabel, 'mistake' | 'blunder'>;
  /** Win% points lost. */
  loss: number;
  /** Leitner box, 1-4. */
  box: number;
  dueAt: number;
  addedAt: number;
  lastSeenAt?: number;
}

export interface NewMistake {
  fen: string;
  played: string;
  best: string;
  label: Extract<MoveLabel, 'mistake' | 'blunder'>;
  loss: number;
}

const MISTAKES_KEY = 'mistakes';
const DAY_MS = 24 * 60 * 60 * 1000;
/** Leitner intervals in days, indexed by box - 1. */
export const MISTAKE_INTERVALS_DAYS = [1, 3, 7, 14] as const;
const MAX_BOX = MISTAKE_INTERVALS_DAYS.length;

export function intervalForBox(box: number): number {
  const index = Math.min(MAX_BOX, Math.max(1, Math.trunc(box))) - 1;
  return MISTAKE_INTERVALS_DAYS[index]!;
}

export function mistakeId(fen: string, played: string): string {
  return `${fen}|${played}`;
}

function normalise(raw: unknown): MistakeCard | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Partial<MistakeCard>;
  if (typeof value.fen !== 'string' || typeof value.played !== 'string') return null;
  if (typeof value.best !== 'string') return null;
  if (value.label !== 'mistake' && value.label !== 'blunder') return null;
  return {
    id: typeof value.id === 'string' ? value.id : mistakeId(value.fen, value.played),
    fen: value.fen,
    played: value.played,
    best: value.best,
    label: value.label,
    loss: typeof value.loss === 'number' && Number.isFinite(value.loss) ? value.loss : 0,
    box: Math.min(MAX_BOX, Math.max(1, Math.trunc(value.box ?? 1))),
    dueAt: typeof value.dueAt === 'number' ? value.dueAt : 0,
    addedAt: typeof value.addedAt === 'number' ? value.addedAt : 0,
    ...(typeof value.lastSeenAt === 'number' ? { lastSeenAt: value.lastSeenAt } : {}),
  };
}

export async function loadMistakes(): Promise<MistakeCard[]> {
  const raw = await readValue<unknown>(MISTAKES_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.map(normalise).filter((card): card is MistakeCard => card !== null);
}

export async function saveMistakes(cards: readonly MistakeCard[]): Promise<void> {
  await writeValue(MISTAKES_KEY, cards);
}

/**
 * Adds new mistakes. A repeated mistake restarts at box 1 so it comes back
 * tomorrow instead of being treated as already learned.
 */
export async function addMistakes(
  incoming: readonly NewMistake[],
  now: number = Date.now(),
): Promise<MistakeCard[]> {
  if (incoming.length === 0) return loadMistakes();

  const existing = await loadMistakes();
  const byId = new Map(existing.map((card) => [card.id, card]));

  for (const mistake of incoming) {
    const id = mistakeId(mistake.fen, mistake.played);
    byId.set(id, {
      id,
      fen: mistake.fen,
      played: mistake.played,
      best: mistake.best,
      label: mistake.label,
      loss: mistake.loss,
      box: 1,
      dueAt: now + intervalForBox(1) * DAY_MS,
      addedAt: byId.get(id)?.addedAt ?? now,
    });
  }

  const next = [...byId.values()];
  await saveMistakes(next);
  return next;
}

export async function dueMistakes(now: number = Date.now()): Promise<MistakeCard[]> {
  const cards = await loadMistakes();
  return cards
    .filter((card) => card.dueAt <= now)
    .sort((a, b) => a.dueAt - b.dueAt);
}

/** Records an answer and moves the card through the Leitner boxes. */
export async function answerMistake(
  id: string,
  correct: boolean,
  now: number = Date.now(),
): Promise<MistakeCard[]> {
  const cards = await loadMistakes();
  const next = cards.map((card) => {
    if (card.id !== id) return card;
    const box = correct ? Math.min(MAX_BOX, card.box + 1) : 1;
    return {
      ...card,
      box,
      dueAt: now + intervalForBox(box) * DAY_MS,
      lastSeenAt: now,
    };
  });
  await saveMistakes(next);
  return next;
}
