import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readVideoAsideTab, writeVideoAsideTab } from '@/utils/videoAsideTabStorage';

describe('videoAsideTabStorage', () => {
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
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips tab choice in localStorage', () => {
    expect(readVideoAsideTab()).toBeNull();
    writeVideoAsideTab('graph');
    expect(readVideoAsideTab()).toBe('graph');
    writeVideoAsideTab('feeds');
    expect(readVideoAsideTab()).toBe('feeds');
  });
});
