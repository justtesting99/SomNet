import { describe, expect, it } from 'vitest';
import { MOTOR_AUTOMATIC_RUN_MODE_OPTIONS } from '@/types/motorAutomaticModes';
import { coerceMotorAutomaticRunMode } from '@/types/motorAutomaticModes';
import { getMotorAutomaticFieldRules } from '@/utils/motorAutomaticFieldRules';

describe('motor automatic modes', () => {
  it('exposes only motor waveform programs', () => {
    expect(MOTOR_AUTOMATIC_RUN_MODE_OPTIONS.map((o) => o.value)).toEqual([
      'periodic',
      'randomSpeed',
      'randomSpeedAndTiming',
      'powerWave',
      'buildUp',
    ]);
  });

  it('maps legacy relay modes onto motor programs', () => {
    expect(coerceMotorAutomaticRunMode('randomPowerOnly')).toBe('randomSpeed');
    expect(coerceMotorAutomaticRunMode('randomPowerAndTiming')).toBe('randomSpeedAndTiming');
    expect(coerceMotorAutomaticRunMode('randomTimingOnly')).toBe('periodic');
    expect(coerceMotorAutomaticRunMode('powerAndTimingWave')).toBe('periodic');
  });
});

describe('getMotorAutomaticFieldRules', () => {
  it('locks minimum speed for set-speed mode', () => {
    expect(getMotorAutomaticFieldRules('periodic').disableMinimumSpeed).toBe(true);
  });

  it('allows minimum segment interval for random speed and timing', () => {
    expect(getMotorAutomaticFieldRules('randomSpeedAndTiming').disableSegmentMinSeconds).toBe(
      false,
    );
    expect(getMotorAutomaticFieldRules('randomSpeed').disableSegmentMinSeconds).toBe(true);
  });

  it('requires end session for wave and build-up', () => {
    expect(getMotorAutomaticFieldRules('powerWave').disableNoAutoEnd).toBe(true);
    expect(getMotorAutomaticFieldRules('buildUp').disableNoAutoEnd).toBe(true);
  });
});
