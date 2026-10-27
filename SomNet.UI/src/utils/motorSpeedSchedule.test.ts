import { describe, expect, it } from 'vitest';
import { defaultMotorAutomaticState, defaultMotorManualState } from '@/types/motorModes';
import {
  buildMotorAutomaticSpeedSchedule,
  buildMotorManualSpeedSchedule,
  buildMotorSpeedScheduleFromLiveSegments,
  MOTOR_PATTERN_PREVIEW_NO_AUTO_END_SEC,
  speedAtScheduleTime,
} from '@/utils/motorSpeedSchedule';

describe('buildMotorAutomaticSpeedSchedule', () => {
  it('ramps set speed then holds flat', () => {
    const schedule = buildMotorAutomaticSpeedSchedule({
      ...defaultMotorAutomaticState,
      automaticMode: 'periodic',
      delayBeforeStartSeconds: 0,
      rampMs: 1000,
      maximumSpeedPercent: 80,
      endSessionMode: 'minutes',
      endSessionValue: 5,
    });

    expect(speedAtScheduleTime(schedule, 0)).toBe(0);
    expect(speedAtScheduleTime(schedule, 0.5)).toBe(40);
    expect(speedAtScheduleTime(schedule, 1)).toBe(80);
    expect(speedAtScheduleTime(schedule, 60)).toBe(80);
  });

  it('uses three minute preview for no auto end', () => {
    const schedule = buildMotorAutomaticSpeedSchedule({
      ...defaultMotorAutomaticState,
      automaticMode: 'powerWave',
      endSessionMode: 'noAutoEnd',
    });

    expect(schedule.horizonSec).toBe(MOTOR_PATTERN_PREVIEW_NO_AUTO_END_SEC);
    expect(schedule.points.length).toBeGreaterThan(2);
  });
});

describe('buildMotorSpeedScheduleFromLiveSegments', () => {
  it('ramps between device-reported segment targets', () => {
    const schedule = buildMotorSpeedScheduleFromLiveSegments(
      [
        {
          segmentIndex: 0,
          fromSpeedPercent: 0,
          toSpeedPercent: 60,
          durationMs: 10_000,
          programElapsedMs: 5000,
        },
        {
          segmentIndex: 1,
          fromSpeedPercent: 60,
          toSpeedPercent: 30,
          durationMs: 10_000,
          programElapsedMs: 15_000,
        },
      ],
      60,
    );

    expect(speedAtScheduleTime(schedule, 5)).toBe(0);
    expect(speedAtScheduleTime(schedule, 10)).toBe(30);
    expect(speedAtScheduleTime(schedule, 15)).toBe(60);
    expect(speedAtScheduleTime(schedule, 20)).toBe(45);
  });
});

describe('buildMotorManualSpeedSchedule', () => {
  it('is flat at manual speed', () => {
    const schedule = buildMotorManualSpeedSchedule({
      ...defaultMotorManualState,
      speedPercent: 55,
    });

    expect(speedAtScheduleTime(schedule, 0)).toBe(55);
    expect(speedAtScheduleTime(schedule, 90)).toBe(55);
  });
});
