import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_OPTIONS } from '@/types/options';
import {
  motorModeUsesFullSegmentRamp,
  resolveMotorSegmentTargetRampMs,
} from '@/utils/motorSegmentTargetRamp';

describe('motorSegmentTargetRamp', () => {
  it('forces full-segment ramp for wave and build-up', () => {
    expect(motorModeUsesFullSegmentRamp('powerWave')).toBe(true);
    expect(
      resolveMotorSegmentTargetRampMs('powerWave', {
        ...DEFAULT_APP_OPTIONS,
        motorSegmentTargetRampMode: 'instant',
      }),
    ).toBe(-1);
  });

  it('maps instant and fixed modes for random programs', () => {
    expect(
      resolveMotorSegmentTargetRampMs('randomSpeed', {
        ...DEFAULT_APP_OPTIONS,
        motorSegmentTargetRampMode: 'instant',
      }),
    ).toBe(0);

    expect(
      resolveMotorSegmentTargetRampMs('randomSpeedAndTiming', {
        ...DEFAULT_APP_OPTIONS,
        motorSegmentTargetRampMode: 'fixedMs',
        motorSegmentTargetRampMs: 250,
      }),
    ).toBe(250);
  });
});
