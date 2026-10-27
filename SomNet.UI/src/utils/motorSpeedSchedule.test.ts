import { describe, expect, it } from 'vitest';
import { defaultMotorAutomaticState, defaultMotorManualState } from '@/types/motorModes';
import {
  buildMotorAutomaticSpeedSchedule,
  buildMotorManualSpeedSchedule,
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
