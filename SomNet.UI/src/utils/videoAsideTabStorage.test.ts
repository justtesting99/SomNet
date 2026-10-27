import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readVideoAsideTab, writeVideoAsideTab } from '@/utils/videoAsideTabStorage';

describe('videoAsideTabStorage', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('sessionStorage', {
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

  it('round-trips tab choice', () => {
    expect(readVideoAsideTab()).toBeNull();
    writeVideoAsideTab('graph');
    expect(readVideoAsideTab()).toBe('graph');
    writeVideoAsideTab('feeds');
    expect(readVideoAsideTab()).toBe('feeds');
  });
});
