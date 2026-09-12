import { describe, expect, it } from 'vitest';
import {
  consumeManualVideoCommandComplete,
  markManualVideoCommandComplete,
} from '@/utils/manualVideoCommandNotify';

describe('manualVideoCommandNotify', () => {
  it('consumes a pending notify once', () => {
    markManualVideoCommandComplete();

    expect(consumeManualVideoCommandComplete()).toBe(true);
    expect(consumeManualVideoCommandComplete()).toBe(false);
  });
});
