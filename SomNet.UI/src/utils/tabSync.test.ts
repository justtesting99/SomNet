import { describe, expect, it } from 'vitest';
import {
  getTabId,
  isFromSelf,
  parseTabSyncMessage,
  shouldBroadcastLocalChange,
  withRemoteSyncApply,
} from '@/utils/tabSync';

describe('tabSync', () => {
  it('returns stable tab id', () => {
    const first = getTabId();
    const second = getTabId();
    expect(first).toBe(second);
  });

  it('detects self-originated messages', () => {
    const tabId = getTabId();
    expect(isFromSelf({ type: 'request-sync', tabId })).toBe(true);
    expect(isFromSelf({ type: 'request-sync', tabId: 'other-tab' })).toBe(false);
  });

  it('suppresses broadcast while applying remote sync', () => {
    expect(shouldBroadcastLocalChange()).toBe(true);

    withRemoteSyncApply(() => {
      expect(shouldBroadcastLocalChange()).toBe(false);
    });

    expect(shouldBroadcastLocalChange()).toBe(true);
  });

  it('parses valid messages', () => {
    expect(
      parseTabSyncMessage({
        type: 'running',
        tabId: 'a',
        running: true,
      }),
    ).toEqual({
      type: 'running',
      tabId: 'a',
      running: true,
    });
  });

  it('rejects invalid messages', () => {
    expect(parseTabSyncMessage(null)).toBeNull();
    expect(parseTabSyncMessage({ type: 'running' })).toBeNull();
  });
});
