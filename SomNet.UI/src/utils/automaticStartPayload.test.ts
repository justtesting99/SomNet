import { describe, expect, it } from 'vitest';
import { defaultAutomaticState } from '@/types/modes';
import { buildAutomaticStartPayload } from '@/utils/automaticStartPayload';

describe('buildAutomaticStartPayload', () => {
  it('omits running and includes automaticMode', () => {
    const payload = JSON.parse(buildAutomaticStartPayload({ ...defaultAutomaticState, running: true }));

    expect(payload.running).toBeUndefined();
    expect(payload.automaticMode).toBe('randomPowerAndTiming');
    expect(payload.burstsOn).toBe(false);
  });
});
