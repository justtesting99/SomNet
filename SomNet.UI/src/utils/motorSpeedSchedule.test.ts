import { describe, expect, it } from 'vitest';
import { defaultMotorAutomaticState, defaultMotorManualState } from '@/types/motorModes';
import type { MotorAutomaticControlState } from '@/types/motorModes';
import {
  buildMotorAutomaticSpeedSchedule,
  buildMotorManualSpeedSchedule,
  buildMotorSpeedScheduleFromLiveSegments,
  MOTOR_PATTERN_PREVIEW_NO_AUTO_END_SEC,
  speedAtScheduleTime,
} from '@/utils/motorSpeedSchedule';
import { resolveMotorBurstGraphSpeedPercent } from '@/utils/motorBurstEffectiveSpeed';

function maxSpeedInSchedule(points: { speedPercent: number }[]): number {
  return points.reduce((max, p) => Math.max(max, p.speedPercent), 0);
}

/** Segmented preview path (non-periodic) with tight segments for burst placement tests. */
function burstPreviewMotorState(
  overrides: Partial<MotorAutomaticControlState> = {},
): MotorAutomaticControlState {
  return {
    ...defaultMotorAutomaticState,
    automaticMode: 'randomSpeed',
    minimumSpeedPercent: 30,
    maximumSpeedPercent: 50,
    minimumDutyPercent: 20,
    maximumDutyPercent: 80,
    segmentMinSeconds: 5,
    segmentMaxSeconds: 5,
    endSessionMode: 'minutes',
    endSessionValue: 2,
    delayBeforeStartSeconds: 0,
    rampMs: 500,
    burstsOn: true,
    burstPercent: 50,
    burstStyle: 'fixedPowerDelay',
    burstStrokePowerMin: 100,
    burstStrokePowerMax: 100,
    burstDelayMin: 0,
    burstDelayMax: 0,
    burstStrokesMin: 1,
    burstStrokesMax: 1,
    ...overrides,
  };
}

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

describe('buildMotorAutomaticSpeedSchedule — burst preview (M1d-T2)', () => {
  it('mainPlusAfterMainStroke raises graph above main speed band (MA-D28 duty axis)', () => {
    const state = burstPreviewMotorState({
      burstPlacement: 'mainPlusAfterMainStroke',
    });
    const withoutBursts = buildMotorAutomaticSpeedSchedule({ ...state, burstsOn: false });
    const withBursts = buildMotorAutomaticSpeedSchedule(state);

    const mainBandMax = 50;
    const burstPeak = resolveMotorBurstGraphSpeedPercent(100, state);

    expect(maxSpeedInSchedule(withoutBursts.points)).toBeLessThanOrEqual(mainBandMax);
    expect(burstPeak).toBe(100);
    expect(maxSpeedInSchedule(withBursts.points)).toBeGreaterThan(mainBandMax);
    expect(maxSpeedInSchedule(withBursts.points)).toBe(burstPeak);
  });

  it('insteadOfAfterMainStroke preview differs from mainPlus (shared placement plan)', () => {
    const base = burstPreviewMotorState({ burstPercent: 50 });
    const mainPlus = buildMotorAutomaticSpeedSchedule({
      ...base,
      burstPlacement: 'mainPlusAfterMainStroke',
    });
    const insteadOf = buildMotorAutomaticSpeedSchedule({
      ...base,
      burstPlacement: 'insteadOfAfterMainStroke',
    });

    expect(mainPlus.points.length).not.toBe(insteadOf.points.length);
    expect(maxSpeedInSchedule(insteadOf.points)).toBe(100);
  });

  it('is stable for the same settings (seeded preview)', () => {
    const state = burstPreviewMotorState({ burstPlacement: 'mainPlusAfterMainStroke' });
    const a = buildMotorAutomaticSpeedSchedule(state);
    const b = buildMotorAutomaticSpeedSchedule(state);

    expect(a.points).toEqual(b.points);
    expect(a.horizonSec).toBe(b.horizonSec);
  });

  it('periodic preview stays flat without burst clusters (bursts on segmented modes only)', () => {
    const state = burstPreviewMotorState({
      automaticMode: 'periodic',
      maximumSpeedPercent: 40,
      burstsOn: true,
      burstPlacement: 'mainPlusAfterMainStroke',
      endSessionValue: 1,
    });
    const schedule = buildMotorAutomaticSpeedSchedule(state);

    expect(maxSpeedInSchedule(schedule.points)).toBe(40);
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
