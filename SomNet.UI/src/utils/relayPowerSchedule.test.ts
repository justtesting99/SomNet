import { describe, expect, it } from 'vitest';
import { defaultAutomaticState } from '@/types/modes';
import {
  buildRelayAutomaticPowerSchedule,
  buildRelayPowerScheduleFromLiveSegments,
  powerAtScheduleTime,
} from '@/utils/relayPowerSchedule';

describe('buildRelayAutomaticPowerSchedule', () => {
  it('draws periodic stroke pulses at max power', () => {
    const schedule = buildRelayAutomaticPowerSchedule({
      ...defaultAutomaticState,
      automaticMode: 'periodic',
      maximumPower: 80,
      strokeMaxSeconds: 2,
      minimumStrokeMs: 100,
      maximumStrokeMs: 200,
      delayBeforeStartSeconds: 0,
      endSessionMode: 'minutes',
      endSessionValue: 1,
    });

    expect(powerAtScheduleTime(schedule, 0)).toBe(0);
    expect(powerAtScheduleTime(schedule, 0.05)).toBeGreaterThan(0);
    expect(powerAtScheduleTime(schedule, 0.15)).toBe(80);
    expect(powerAtScheduleTime(schedule, 0.2)).toBe(0);
  });
});

describe('buildRelayPowerScheduleFromLiveSegments', () => {
  it('builds rectangular stroke from device segments', () => {
    const schedule = buildRelayPowerScheduleFromLiveSegments(
      [
        {
          segmentIndex: 0,
          phase: 'stroke',
          powerPercent: 60,
          durationMs: 100,
          programElapsedMs: 0,
        },
        {
          segmentIndex: 1,
          phase: 'gap',
          powerPercent: 0,
          durationMs: 1000,
          programElapsedMs: 100,
        },
      ],
      30,
    );

    expect(powerAtScheduleTime(schedule, 0)).toBe(0);
    expect(powerAtScheduleTime(schedule, 0.05)).toBe(60);
    expect(powerAtScheduleTime(schedule, 0.15)).toBe(0);
  });
});
