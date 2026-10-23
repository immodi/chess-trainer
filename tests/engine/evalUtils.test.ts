import { describe, expect, it } from 'vitest';
import type { EngineLine } from '../../src/engine/uci';
import {
  isMateScore,
  lineToCp,
  mateToCp,
  toWhiteCp,
  whiteWinPercent,
  winPercentFromCp,
} from '../../src/engine/evalUtils';

const line = (over: Partial<EngineLine>): EngineLine => ({ multipv: 1, pv: [], depth: 10, ...over });

describe('winPercentFromCp', () => {
  it('is 50% for a level position', () => {
    expect(winPercentFromCp(0)).toBe(50);
  });

  it('is symmetric around 50%', () => {
    for (const cp of [10, 100, 500, 1200, 5000]) {
      expect(winPercentFromCp(cp) + winPercentFromCp(-cp)).toBeCloseTo(100, 9);
    }
  });

  it('increases monotonically', () => {
    expect(winPercentFromCp(300)).toBeGreaterThan(winPercentFromCp(100));
    expect(winPercentFromCp(100)).toBeGreaterThan(winPercentFromCp(0));
  });

  it('stays inside 0..100', () => {
    expect(winPercentFromCp(9999)).toBeLessThanOrEqual(100);
    expect(winPercentFromCp(-9999)).toBeGreaterThanOrEqual(0);
  });
});

describe('mateToCp', () => {
  it('maps mate in 1 above mate in 2 for the same side', () => {
    expect(mateToCp(1)).toBe(9999);
    expect(mateToCp(2)).toBe(9998);
    expect(mateToCp(1)).toBeGreaterThan(mateToCp(2));
  });

  it('maps negative mates symmetrically', () => {
    expect(mateToCp(-1)).toBe(-9999);
    expect(mateToCp(-5)).toBe(-9995);
  });

  it('rejects a zero mate distance', () => {
    expect(() => mateToCp(0)).toThrow();
  });
});

describe('lineToCp', () => {
  it('prefers cp when present', () => {
    expect(lineToCp(line({ cp: 42 }))).toBe(42);
  });

  it('falls back to a mate score', () => {
    expect(lineToCp(line({ mate: 3 }))).toBe(9997);
  });

  it('returns undefined when a line carries no score', () => {
    expect(lineToCp(line({}))).toBeUndefined();
  });
});

describe('toWhiteCp', () => {
  it('leaves White-to-move scores alone', () => {
    expect(toWhiteCp(line({ cp: 120 }), 'w')).toBe(120);
  });

  it('flips Black-to-move scores', () => {
    expect(toWhiteCp(line({ cp: 120 }), 'b')).toBe(-120);
    expect(toWhiteCp(line({ mate: 2 }), 'b')).toBe(-9998);
  });

  it('passes through missing scores', () => {
    expect(toWhiteCp(line({}), 'b')).toBeUndefined();
  });
});

describe('whiteWinPercent', () => {
  it('gives White the complement of a Black-favourable score', () => {
    const win = whiteWinPercent(line({ cp: 300 }), 'b');
    expect(win).toBeCloseTo(winPercentFromCp(-300), 9);
    expect(win).toBeLessThan(50);
  });
});

describe('isMateScore', () => {
  it('detects mate lines only', () => {
    expect(isMateScore(line({ mate: 4 }))).toBe(true);
    expect(isMateScore(line({ cp: 900 }))).toBe(false);
  });
});
