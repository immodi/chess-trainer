import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normaliseSettings } from '../../src/storage/settings';

describe('settings', () => {
  it('defaults tactics to Learn for old saves', () => {
    expect(normaliseSettings({ touchMove: false }).tacticsMode).toBe('learn');
    expect(DEFAULT_SETTINGS.tacticsMode).toBe('learn');
  });

  it('accepts Test and rejects unknown tactics modes', () => {
    expect(normaliseSettings({ tacticsMode: 'test' }).tacticsMode).toBe('test');
    expect(normaliseSettings({ tacticsMode: 'exam' }).tacticsMode).toBe('learn');
  });
});
