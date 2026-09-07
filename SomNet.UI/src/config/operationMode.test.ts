import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readLastOperationMode, writeLastOperationMode } from '@/config/operationMode';

const STORAGE_KEY = 'somnet.operationMode';

function createStorageMock(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

describe('operationMode storage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorageMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null when nothing is stored', () => {
    expect(readLastOperationMode()).toBeNull();
  });

  it('round-trips manual and automatic modes', () => {
    writeLastOperationMode('automatic');
    expect(readLastOperationMode()).toBe('automatic');

    writeLastOperationMode('manual');
    expect(readLastOperationMode()).toBe('manual');
  });

  it('clears storage when mode is null', () => {
    writeLastOperationMode('automatic');
    writeLastOperationMode(null);

    expect(readLastOperationMode()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('ignores invalid stored values', () => {
    localStorage.setItem(STORAGE_KEY, 'invalid');

    expect(readLastOperationMode()).toBeNull();
  });
});
