import { describe, expect, it } from 'vitest';
import { defaultAutomaticState } from '@/types/modes';
import {
  buildRelayBurstPlan,
  describeRelayBurstScheduleHint,
  resolveBurstEffectivePower,
  shouldTriggerBurstAfterMainStroke,
} from '@/utils/relayBurstPlan';

describe('buildRelayBurstPlan', () => {
  it('builds cadence stride for noAutoEnd', () => {
    const plan = buildRelayBurstPlan({
      ...defaultAutomaticState,
      burstsOn: true,
      burstPercent: 10,
      endSessionMode: 'noAutoEnd',
    });
    expect(plan.active).toBe(true);
    expect(plan.kind).toBe('cadenceStride');
    expect(plan.nextCadenceTriggerStroke).toBe(10);
    expect(shouldTriggerBurstAfterMainStroke(plan, 10)).toBe(true);
    expect(shouldTriggerBurstAfterMainStroke(plan, 9)).toBe(false);
  });

  it('schedules zero wall-clock events for 1 min at 25% (user rounding case)', () => {
    const plan = buildRelayBurstPlan({
      ...defaultAutomaticState,
      burstsOn: true,
      burstPercent: 25,
      endSessionMode: 'minutes',
      endSessionValue: 1,
    });
    expect(plan.active).toBe(false);
    const hint = describeRelayBurstScheduleHint({
      ...defaultAutomaticState,
      burstsOn: true,
      burstPercent: 25,
      endSessionMode: 'minutes',
      endSessionValue: 1,
    });
    expect(hint).toContain('rounds to 0 burst events');
    expect(hint).toContain('50%');
  });

  it('afterMainStroke uses cadence on minutes (not wall clock)', () => {
    const plan = buildRelayBurstPlan({
      ...defaultAutomaticState,
      burstsOn: true,
      burstPlacement: 'afterMainStroke',
      burstPercent: 50,
      endSessionMode: 'minutes',
      endSessionValue: 1,
    });
    expect(plan.active).toBe(true);
    expect(plan.kind).toBe('cadenceStride');
    expect(plan.cadenceStride).toBe(2);
  });

  it('chanceAfterMainStroke activates without envelope', () => {
    const plan = buildRelayBurstPlan({
      ...defaultAutomaticState,
      burstsOn: true,
      burstPlacement: 'chanceAfterMainStroke',
      burstPercent: 25,
      endSessionMode: 'minutes',
      endSessionValue: 1,
    });
    expect(plan.kind).toBe('chancePerMainStroke');
    expect(plan.active).toBe(true);
  });

  it('maps burst relative power into session envelope', () => {
    expect(
      resolveBurstEffectivePower(100, {
        ...defaultAutomaticState,
        minimumPower: 40,
        maximumPower: 80,
      }),
    ).toBe(80);
    expect(
      resolveBurstEffectivePower(0, {
        ...defaultAutomaticState,
        minimumPower: 40,
        maximumPower: 80,
      }),
    ).toBe(40);
  });
});
