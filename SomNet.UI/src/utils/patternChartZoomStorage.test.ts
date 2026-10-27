import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readPatternChartWindowSec,
  writePatternChartWindowSec,
} from '@/utils/patternChartZoomStorage';

describe('patternChartZoomStorage', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips zoom window per deviceId', () => {
    expect(readPatternChartWindowSec('esp32-abc')).toBeNull();
    writePatternChartWindowSec('esp32-abc', 45);
    expect(readPatternChartWindowSec('esp32-abc')).toBe(45);
    writePatternChartWindowSec('esp32-abc', null);
    expect(readPatternChartWindowSec('esp32-abc')).toBeNull();
    expect(readPatternChartWindowSec('esp32-other')).toBeNull();
  });
});
