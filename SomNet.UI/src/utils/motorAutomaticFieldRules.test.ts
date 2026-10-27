import { describe, expect, it } from 'vitest';
import { MOTOR_AUTOMATIC_RUN_MODE_OPTIONS } from '@/types/motorAutomaticModes';
import { coerceMotorAutomaticRunMode } from '@/types/motorAutomaticModes';
import {
  getMotorAutomaticFieldRules,
  normalizeMotorAutomaticControlState,
} from '@/utils/motorAutomaticFieldRules';
import { defaultMotorAutomaticState } from '@/types/motorModes';

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
  it('locks minimum speed and segment timing for set-speed mode', () => {
    const rules = getMotorAutomaticFieldRules('periodic');
    expect(rules.disableMinimumSpeed).toBe(true);
    expect(rules.disableSegmentMinSeconds).toBe(true);
    expect(rules.disableSegmentMaxSeconds).toBe(true);
  });

  it('allows minimum segment interval for random speed and timing', () => {
    expect(getMotorAutomaticFieldRules('randomSpeedAndTiming').disableSegmentMinSeconds).toBe(
      false,
    );
    expect(getMotorAutomaticFieldRules('randomSpeed').disableSegmentMinSeconds).toBe(true);
  });

  it('maps strokes end session to noAutoEnd for motor', () => {
    const normalized = normalizeMotorAutomaticControlState({
      ...defaultMotorAutomaticState,
      endSessionMode: 'strokes',
    });
    expect(normalized.endSessionMode).toBe('noAutoEnd');
  });

  it('requires end session for wave and build-up', () => {
    expect(getMotorAutomaticFieldRules('powerWave').disableNoAutoEnd).toBe(true);
    expect(getMotorAutomaticFieldRules('buildUp').disableNoAutoEnd).toBe(true);
  });
});
