import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_OPTIONS } from '@/types/options';
import { defaultMotorAutomaticState } from '@/types/motorModes';
import { buildMotorAutomaticStartPayload } from '@/utils/motorAutomaticStartPayload';

describe('buildMotorAutomaticStartPayload', () => {
  it('includes segmentTargetRampMs early and fits device buffer', () => {
    const payload = buildMotorAutomaticStartPayload(
      {
        ...defaultMotorAutomaticState,
        automaticMode: 'randomSpeedAndTiming',
        burstsOn: true,
      },
      {
        ...DEFAULT_APP_OPTIONS,
        motorSegmentTargetRampMode: 'instant',
      },
    );

    expect(payload.length).toBeLessThan(1536);
    expect(payload.indexOf('"segmentTargetRampMs":0')).toBeLessThan(80);
    expect(payload).toContain('"segmentTargetRampMs":0');
  });

  it('fits motor firmware session configJson buffer (1536)', () => {
    const payload = buildMotorAutomaticStartPayload(
      {
        ...defaultMotorAutomaticState,
        automaticMode: 'randomSpeed',
        burstsOn: true,
        burstStrokePowerMax: 1,
        burstStrokePowerMin: 1,
        minimumSpeedPercent: 23,
        maximumSpeedPercent: 55,
        burstPlacement: 'insteadOfAfterMainStroke',
      },
      {
        ...DEFAULT_APP_OPTIONS,
        motorSegmentTargetRampMode: 'fixedMs',
        motorSegmentTargetRampMs: 200,
      },
    );

    expect(payload.length).toBeLessThan(1536);
    expect(payload).toContain('"burstStrokePowerMax":1');
  });
});
