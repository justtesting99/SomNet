import { describe, expect, it } from 'vitest';
import { defaultAutomaticState } from '@/types/modes';
import {
  buildRelayAutomaticPowerSchedule,
  buildRelayPowerScheduleFromLiveSegments,
  powerAtScheduleTime,
} from '@/utils/relayPowerSchedule';

describe('buildRelayAutomaticPowerSchedule', () => {
  it('inserts burst clusters when burstsOn (cadence / noAutoEnd)', () => {
    const without = buildRelayAutomaticPowerSchedule({
      ...defaultAutomaticState,
      automaticMode: 'periodic',
      minimumPower: 0,
      maximumPower: 80,
      strokeMaxSeconds: 5,
      endSessionMode: 'noAutoEnd',
      burstsOn: false,
    });
    const withBursts = buildRelayAutomaticPowerSchedule({
      ...defaultAutomaticState,
      automaticMode: 'periodic',
      minimumPower: 0,
      maximumPower: 80,
      strokeMaxSeconds: 5,
      endSessionMode: 'noAutoEnd',
      burstsOn: true,
      burstPercent: 10,
      burstStyle: 'fixedPowerDelay',
      burstStrokePowerMax: 25,
      burstStrokesMin: 3,
      burstStrokesMax: 3,
      burstDelayMax: 1,
    });

    expect(withBursts.points.length).toBeGreaterThan(without.points.length);
    const minBurstPower = Math.min(...withBursts.points.map((p) => p.speedPercent));
    expect(minBurstPower).toBeLessThan(80);
  });

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

  it('extends horizon past configured end when burst segments arrive after 1 min', () => {
    const schedule = buildRelayPowerScheduleFromLiveSegments(
      [
        {
          segmentIndex: 10,
          phase: 'stroke',
          powerPercent: 50,
          durationMs: 150,
          programElapsedMs: 60_000,
        },
        {
          segmentIndex: 11,
          phase: 'gap',
          powerPercent: 0,
          durationMs: 1000,
          programElapsedMs: 60_150,
        },
        {
          segmentIndex: 12,
          phase: 'stroke',
          powerPercent: 50,
          durationMs: 150,
          programElapsedMs: 61_150,
        },
      ],
      60,
    );

    expect(schedule.horizonSec).toBeGreaterThan(60);
    expect(powerAtScheduleTime(schedule, 60.05)).toBe(50);
    expect(powerAtScheduleTime(schedule, 61.2)).toBe(50);
  });
});
