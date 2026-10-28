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
});
