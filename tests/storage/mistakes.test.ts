import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => new Map<string, unknown>());

vi.mock('../../src/storage/db', () => ({
  readValue: async (key: string) => store.get(key),
  writeValue: async (key: string, value: unknown) => {
    store.set(key, value);
    return true;
  },
  removeValue: async (key: string) => {
    store.delete(key);
  },
}));

import {
  addMistakes,
  answerMistake,
  dueMistakes,
  intervalForBox,
  loadMistakes,
  mistakeId,
} from '../../src/storage/mistakes';

const DAY = 24 * 60 * 60 * 1000;

const mistake = {
  fen: '4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1',
  played: 'e1e2',
  best: 'e4d5',
  label: 'blunder' as const,
  loss: 30,
};

describe('mistake intervals', () => {
  it('uses the 1, 3, 7, 14 day Leitner ladder', () => {
    expect(intervalForBox(0)).toBe(1);
    expect(intervalForBox(1)).toBe(1);
    expect(intervalForBox(2)).toBe(3);
    expect(intervalForBox(3)).toBe(7);
    expect(intervalForBox(4)).toBe(14);
    expect(intervalForBox(99)).toBe(14);
  });
});

describe('mistakes storage', () => {
  beforeEach(() => {
    store.clear();
  });

  it('adds a card due tomorrow in box 1', async () => {
    const cards = await addMistakes([mistake], 1000);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.id).toBe(mistakeId(mistake.fen, mistake.played));
    expect(cards[0]?.box).toBe(1);
    expect(cards[0]?.dueAt).toBe(1000 + DAY);
  });

  it('keeps one card per position and move, restarting at box 1', async () => {
    await addMistakes([mistake], 1000);
    await answerMistake(mistakeId(mistake.fen, mistake.played), true, 2000);
    const cards = await addMistakes([{ ...mistake, loss: 40 }], 3000);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.box).toBe(1);
    expect(cards[0]?.loss).toBe(40);
    expect(cards[0]?.dueAt).toBe(3000 + DAY);
  });

  it('promotes on correct answers and caps at box 4', async () => {
    await addMistakes([mistake], 0);
    const id = mistakeId(mistake.fen, mistake.played);

    let cards = await answerMistake(id, true, 10);
    expect(cards[0]?.box).toBe(2);
    expect(cards[0]?.dueAt).toBe(10 + 3 * DAY);

    cards = await answerMistake(id, true, 20);
    expect(cards[0]?.box).toBe(3);
    expect(cards[0]?.dueAt).toBe(20 + 7 * DAY);

    cards = await answerMistake(id, true, 30);
    expect(cards[0]?.box).toBe(4);
    expect(cards[0]?.dueAt).toBe(30 + 14 * DAY);

    cards = await answerMistake(id, true, 40);
    expect(cards[0]?.box).toBe(4);
    expect(cards[0]?.dueAt).toBe(40 + 14 * DAY);
  });

  it('drops back to box 1 on a wrong answer', async () => {
    await addMistakes([mistake], 0);
    const id = mistakeId(mistake.fen, mistake.played);
    await answerMistake(id, true, 10);
    const cards = await answerMistake(id, false, 20);
    expect(cards[0]?.box).toBe(1);
    expect(cards[0]?.dueAt).toBe(20 + DAY);
    expect(cards[0]?.lastSeenAt).toBe(20);
  });

  it('returns only cards whose due date has passed', async () => {
    await addMistakes([mistake], 0);
    expect(await dueMistakes(DAY - 1)).toHaveLength(0);
    expect(await dueMistakes(DAY)).toHaveLength(1);
  });

  it('ignores malformed stored cards', async () => {
    store.set('mistakes', [null, { fen: 'x' }, { ...mistake, id: 'ok' }]);
    const cards = await loadMistakes();
    expect(cards).toHaveLength(1);
    expect(cards[0]?.id).toBe('ok');
  });
});
