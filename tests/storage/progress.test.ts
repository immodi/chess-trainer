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
  EMPTY_PROGRESS,
  emptyTacticsProgress,
  loadProgress,
  normaliseProgress,
  recordEndgameResult,
  recordHangingAnswer,
  recordTacticsResult,
  recordThreatDrillAnswer,
} from '../../src/storage/progress';

describe('progress normalisation', () => {
  it('fills new drill fields for old stored progress', () => {
    const progress = normaliseProgress({
      threatAnswers: 4,
      threatCorrect: 3,
      gamesPlayed: 2,
      adaptiveLevel: 3,
    });

    expect(progress.threatAnswers).toBe(4);
    expect(progress.threatCorrect).toBe(3);
    expect(progress.threatDrillAnswers).toBe(0);
    expect(progress.threatDrillCorrect).toBe(0);
    expect(progress.hangingAnswers).toBe(0);
    expect(progress.tacticsByTheme).toEqual({});
    expect(progress.endgames).toEqual({});
  });

  it('ignores malformed drill stats and clamps correct counts', () => {
    const progress = normaliseProgress({
      threatAnswers: 2,
      threatCorrect: 9,
      threatDrillAnswers: 3,
      threatDrillCorrect: 9,
      hangingAnswers: 1,
      hangingCorrect: 9,
      tacticsByTheme: {
        fork: {
          attempts: 5,
          correct: 9,
          recent: [true, 'nope', false],
          bandLow: 900,
          bandHigh: 1200,
        },
        broken: null,
      },
      endgames: {
        kq: { attempts: 3, successes: 9 },
        broken: null,
      },
    });

    expect(progress.threatCorrect).toBe(2);
    expect(progress.threatDrillCorrect).toBe(3);
    expect(progress.hangingCorrect).toBe(1);
    expect(progress.tacticsByTheme.fork).toEqual({
      attempts: 5,
      correct: 5,
      recent: [true, false],
      bandLow: 900,
      bandHigh: 1200,
    });
    expect(progress.tacticsByTheme.broken).toEqual(emptyTacticsProgress());
    expect(progress.endgames.kq).toEqual({ attempts: 3, successes: 3 });
    expect(progress.endgames.broken).toBeUndefined();
  });

  it('returns a clean copy when storage is empty', () => {
    expect(normaliseProgress(undefined)).toEqual(EMPTY_PROGRESS);
  });
});

describe('drill progress', () => {
  beforeEach(() => {
    store.clear();
  });

  it('counts threat and hanging drill answers separately', async () => {
    await recordThreatDrillAnswer(true);
    await recordThreatDrillAnswer(false);
    const progress = await recordHangingAnswer(true);

    expect(progress.threatDrillAnswers).toBe(2);
    expect(progress.threatDrillCorrect).toBe(1);
    expect(progress.hangingAnswers).toBe(1);
    expect(progress.hangingCorrect).toBe(1);
    expect(progress.threatAnswers).toBe(0);
  });

  it('moves the tactics band up after five strong results', async () => {
    for (let i = 0; i < 5; i += 1) await recordTacticsResult('fork', true);
    const progress = await loadProgress();
    const fork = progress.tacticsByTheme.fork;

    expect(fork?.attempts).toBe(5);
    expect(fork?.correct).toBe(5);
    expect(fork?.recent).toEqual([]);
    expect(fork?.bandLow).toBe(700);
    expect(fork?.bandHigh).toBe(1000);
  });

  it('moves the tactics band down after five weak results', async () => {
    for (let i = 0; i < 5; i += 1) await recordTacticsResult('pin', false);
    const progress = await loadProgress();
    const pin = progress.tacticsByTheme.pin;

    expect(pin?.attempts).toBe(5);
    expect(pin?.correct).toBe(0);
    expect(pin?.bandLow).toBe(500);
    expect(pin?.bandHigh).toBe(800);
  });

  it('keeps the band unchanged with a mixed recent sample', async () => {
    for (const result of [true, false, true, false, true]) {
      await recordTacticsResult('skewer', result);
    }
    const progress = await loadProgress();
    const skewer = progress.tacticsByTheme.skewer;

    expect(skewer?.bandLow).toBe(600);
    expect(skewer?.bandHigh).toBe(900);
    expect(skewer?.recent).toEqual([true, false, true, false, true]);
  });

  it('records endgame attempts and successes', async () => {
    await recordEndgameResult('kq-vs-k', true);
    const progress = await recordEndgameResult('kq-vs-k', false);

    expect(progress.endgames['kq-vs-k']).toEqual({ attempts: 2, successes: 1 });
  });
});
