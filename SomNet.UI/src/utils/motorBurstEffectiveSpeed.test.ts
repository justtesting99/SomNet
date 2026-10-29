import { describe, expect, it } from 'vitest';
import { defaultMotorAutomaticState } from '@/types/motorModes';
import {
  describeMotorBurstEffectiveSpeed,
  resolveMotorBurstDutyPercent,
  resolveMotorBurstGraphSpeedPercent,
} from '@/utils/motorBurstEffectiveSpeed';

describe('motorBurstEffectiveSpeed', () => {
  it('maps relative power into duty band (not speed band)', () => {
    const state = {
      ...defaultMotorAutomaticState,
      minimumDutyPercent: 20,
      maximumDutyPercent: 80,
      minimumSpeedPercent: 23,
      maximumSpeedPercent: 55,
      burstStyle: 'fixedPowerDelay' as const,
      burstStrokePowerMax: 1,
      burstStrokePowerMin: 1,
    };
    expect(resolveMotorBurstDutyPercent(1, state)).toBe(20);
    expect(resolveMotorBurstGraphSpeedPercent(100, state)).toBe(100);
    expect(resolveMotorBurstGraphSpeedPercent(1, state)).toBe(0);
    expect(describeMotorBurstEffectiveSpeed(state)).toContain('duty 20%');
  });
});
