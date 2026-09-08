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

  it('includes burst settings when burstsOn is true (Phase 10)', () => {
    const payload = JSON.parse(
      buildAutomaticStartPayload({
        ...defaultAutomaticState,
        burstsOn: true,
        burstPercent: 25,
        burstStyle: 'randomPowerOnly',
      }),
    );

    expect(payload.burstsOn).toBe(true);
    expect(payload.burstPercent).toBe(25);
    expect(payload.burstStyle).toBe('randomPowerOnly');
    expect(payload.burstStrokePowerMin).toBe(defaultAutomaticState.burstStrokePowerMin);
    expect(payload.burstStrokesMax).toBe(defaultAutomaticState.burstStrokesMax);
  });

  it('keeps burstsOn false for Part 2 regression (Phase E)', () => {
    const payload = JSON.parse(
      buildAutomaticStartPayload({
        ...defaultAutomaticState,
        automaticMode: 'periodic',
        burstsOn: false,
      }),
    );

    expect(payload.burstsOn).toBe(false);
    expect(payload.automaticMode).toBe('periodic');
  });

  it('allows burstsOn true with burstPercent 0 (no schedule — Phase E)', () => {
    const payload = JSON.parse(
      buildAutomaticStartPayload({
        ...defaultAutomaticState,
        burstsOn: true,
        burstPercent: 0,
      }),
    );

    expect(payload.burstsOn).toBe(true);
    expect(payload.burstPercent).toBe(0);
  });
});
