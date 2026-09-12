import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAutomaticDeviceRunningHint,
  readAutomaticDeviceRunningHint,
  shouldRestoreAutomaticDeviceRunning,
  writeAutomaticDeviceRunningHint,
} from '@/utils/automaticDeviceRunningHint';

describe('automaticDeviceRunningHint', () => {
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
    clearAutomaticDeviceRunningHint();
    vi.unstubAllGlobals();
  });

  it('round-trips a device-running hint', () => {
    writeAutomaticDeviceRunningHint({ sessionId: 'sess-010', subTarget: 'Slv66' });

    expect(readAutomaticDeviceRunningHint()).toEqual({
      sessionId: 'sess-010',
      subTarget: 'Slv66',
    });
  });

  it('matches only the same session and sub', () => {
    writeAutomaticDeviceRunningHint({ sessionId: 'sess-010', subTarget: 'Slv66' });

    expect(shouldRestoreAutomaticDeviceRunning('sess-010', 'Slv66')).toBe(true);
    expect(shouldRestoreAutomaticDeviceRunning('sess-011', 'Slv66')).toBe(false);
  });
});
