import { describe, expect, it } from 'vitest';
import {
  consumeManualVideoCommandComplete,
  consumeManualVideoPendingNotify,
  markManualVideoCommandComplete,
} from '@/utils/manualVideoCommandNotify';

describe('manualVideoCommandNotify', () => {
  it('consumes command-complete once', () => {
    markManualVideoCommandComplete();

    expect(consumeManualVideoPendingNotify()).toBe(true);
    expect(consumeManualVideoPendingNotify()).toBe(false);
  });

  it('supports legacy consumeManualVideoCommandComplete', () => {
    markManualVideoCommandComplete();

    expect(consumeManualVideoCommandComplete()).toBe(true);
    expect(consumeManualVideoCommandComplete()).toBe(false);
  });
});
