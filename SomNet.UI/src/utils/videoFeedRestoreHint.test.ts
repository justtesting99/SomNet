import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearVideoFeedRestoreHint,
  matchesVideoFeedRestoreHint,
  readVideoFeedRestoreHint,
  writeVideoFeedRestoreHint,
} from '@/utils/videoFeedRestoreHint';

describe('videoFeedRestoreHint', () => {
  const store = new Map<string, string>();
  const deviceId = 'dev-abc';

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
    clearVideoFeedRestoreHint(deviceId);
    vi.unstubAllGlobals();
  });

  it('round-trips a manual preview hint', () => {
    writeVideoFeedRestoreHint({
      sessionId: 'sess-001',
      subTarget: 'SubA',
      deviceId,
      mode: 'manual',
      preview: true,
    });

    expect(readVideoFeedRestoreHint(deviceId)).toEqual({
      sessionId: 'sess-001',
      subTarget: 'SubA',
      deviceId,
      mode: 'manual',
      preview: true,
    });
  });

  it('matches the active session', () => {
    const hint = {
      sessionId: 'sess-002',
      subTarget: 'SubB' as const,
      deviceId,
      mode: 'manual' as const,
      preview: false,
    };

    expect(matchesVideoFeedRestoreHint(hint, 'sess-002', 'SubB', deviceId, 'manual')).toBe(true);
    expect(matchesVideoFeedRestoreHint(hint, 'sess-003', 'SubB', deviceId, 'manual')).toBe(false);
  });

  it('clears stored hints', () => {
    writeVideoFeedRestoreHint({
      sessionId: 'sess-003',
      subTarget: 'SubA',
      deviceId,
      mode: 'automatic',
      preview: false,
    });

    clearVideoFeedRestoreHint(deviceId);

    expect(readVideoFeedRestoreHint(deviceId)).toBeNull();
  });
});
