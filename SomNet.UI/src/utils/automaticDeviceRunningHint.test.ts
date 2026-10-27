import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAllAutomaticDeviceRunningHints,
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
    clearAllAutomaticDeviceRunningHints();
    vi.unstubAllGlobals();
  });

  it('round-trips a per-device running hint', () => {
    writeAutomaticDeviceRunningHint({
      sessionId: 'sess-010',
      subTarget: 'Slv66',
      deviceId: 'esp32-relay',
    });

    expect(readAutomaticDeviceRunningHint('Slv66', 'esp32-relay')).toEqual({
      sessionId: 'sess-010',
      subTarget: 'Slv66',
      deviceId: 'esp32-relay',
    });
    expect(readAutomaticDeviceRunningHint('Slv66', 'esp32-motor')).toBeNull();
  });

  it('matches only the same session, sub, and device', () => {
    writeAutomaticDeviceRunningHint({
      sessionId: 'sess-010',
      subTarget: 'Slv66',
      deviceId: 'esp32-relay',
    });

    expect(shouldRestoreAutomaticDeviceRunning('sess-010', 'Slv66', 'esp32-relay')).toBe(true);
    expect(shouldRestoreAutomaticDeviceRunning('sess-011', 'Slv66', 'esp32-relay')).toBe(false);
    expect(shouldRestoreAutomaticDeviceRunning('sess-010', 'Slv66', 'esp32-motor')).toBe(false);
  });

  it('clears only the targeted device hint', () => {
    writeAutomaticDeviceRunningHint({
      sessionId: 'sess-a',
      subTarget: 'Slv66',
      deviceId: 'esp32-relay',
    });
    writeAutomaticDeviceRunningHint({
      sessionId: 'sess-b',
      subTarget: 'Slv66',
      deviceId: 'esp32-motor',
    });

    clearAutomaticDeviceRunningHint('Slv66', 'esp32-relay');

    expect(readAutomaticDeviceRunningHint('Slv66', 'esp32-relay')).toBeNull();
    expect(readAutomaticDeviceRunningHint('Slv66', 'esp32-motor')?.sessionId).toBe('sess-b');
  });
});
