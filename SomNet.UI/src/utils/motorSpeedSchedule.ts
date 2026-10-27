import type { MotorAutomaticControlState, MotorManualControlState } from '@/types/motorModes';
import type { MotorAutomaticRunMode } from '@/types/motorAutomaticModes';

export const MOTOR_PATTERN_PREVIEW_NO_AUTO_END_SEC = 180;

export interface MotorSpeedSchedulePoint {
  tSec: number;
  speedPercent: number;
}

export interface MotorSpeedSchedule {
  points: MotorSpeedSchedulePoint[];
  horizonSec: number;
  /** Random modes use a stable illustrative path (device picks its own at runtime). */
  illustrativeRandom: boolean;
}

const WAVE_STEPS = 20;
const MAX_SEGMENTS = 5000;

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function speedBounds(state: MotorAutomaticControlState): { lo: number; hi: number } {
  const lo = Math.min(state.minimumSpeedPercent, state.maximumSpeedPercent);
  const hi = Math.max(state.minimumSpeedPercent, state.maximumSpeedPercent);
  return { lo, hi };
}

/** Mulberry32 PRNG — deterministic preview for random motor segments. */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashMotorAutomaticScheduleSeed(state: MotorAutomaticControlState): number {
  const payload = [
    state.automaticMode,
    state.minimumSpeedPercent,
    state.maximumSpeedPercent,
    state.segmentMinSeconds,
    state.segmentMaxSeconds,
    state.delayBeforeStartSeconds,
    state.rampMs,
    state.endSessionMode,
    state.endSessionValue,
  ].join('|');

  let hash = 2166136261;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function motorResolveSpeedPercentForSegment(
  mode: MotorAutomaticRunMode,
  segmentIndex: number,
  state: MotorAutomaticControlState,
  sessionStartSec: number,
  elapsedSinceSessionStartSec: number,
  randomUnit: () => number,
): number {
  const { lo, hi } = speedBounds(state);

  switch (mode) {
    case 'periodic':
      return hi;
    case 'randomSpeed':
    case 'randomSpeedAndTiming': {
      if (lo >= hi) {
        return hi;
      }
      const span = hi - lo + 1;
      return lo + Math.floor(randomUnit() * span);
    }
    case 'powerWave': {
      const step = segmentIndex % WAVE_STEPS;
      const half = WAVE_STEPS / 2;
      const tri = step < half ? step : WAVE_STEPS - step;
      const span = hi - lo;
      return lo + Math.floor((tri * span) / half);
    }
    case 'buildUp': {
      let progress = 0;
      if (
        state.endSessionMode === 'minutes' &&
        state.endSessionValue > 0 &&
        sessionStartSec >= 0
      ) {
        const targetSec = state.endSessionValue * 60;
        if (targetSec > 0) {
          progress = elapsedSinceSessionStartSec / targetSec;
        }
      } else if (segmentIndex > 0) {
        progress = segmentIndex / (segmentIndex + 10);
      }
      progress = Math.min(1, Math.max(0, progress));
      return lo + Math.floor(progress * (hi - lo));
    }
    default:
      return hi;
  }
}

function pickSegmentSeconds(
  mode: MotorAutomaticRunMode,
  state: MotorAutomaticControlState,
  randomUnit: () => number,
): number {
  if (
    mode === 'periodic' ||
    mode === 'randomSpeed' ||
    mode === 'powerWave' ||
    mode === 'buildUp'
  ) {
    return state.segmentMaxSeconds;
  }
  if (state.segmentMinSeconds >= state.segmentMaxSeconds) {
    return state.segmentMinSeconds;
  }
  const span = state.segmentMaxSeconds - state.segmentMinSeconds + 1;
  return state.segmentMinSeconds + Math.floor(randomUnit() * span);
}

function pushPoint(points: MotorSpeedSchedulePoint[], tSec: number, speedPercent: number) {
  const v = clampInt(speedPercent, 0, 100);
  const last = points[points.length - 1];
  if (last && last.tSec === tSec && last.speedPercent === v) {
    return;
  }
  points.push({ tSec, speedPercent: v });
}

export function buildMotorAutomaticSpeedSchedule(
  state: MotorAutomaticControlState,
): MotorSpeedSchedule {
  const horizonSec =
    state.endSessionMode === 'minutes'
      ? Math.max(1, state.endSessionValue * 60)
      : MOTOR_PATTERN_PREVIEW_NO_AUTO_END_SEC;

  const illustrativeRandom =
    state.automaticMode === 'randomSpeed' || state.automaticMode === 'randomSpeedAndTiming';

  const random = createSeededRandom(hashMotorAutomaticScheduleSeed(state));
  const points: MotorSpeedSchedulePoint[] = [];
  pushPoint(points, 0, 0);

  let tSec = 0;
  const delaySec = Math.max(0, state.delayBeforeStartSeconds);
  if (delaySec > 0) {
    pushPoint(points, delaySec, 0);
    tSec = delaySec;
  }

  const sessionStartSec = tSec;

  if (state.automaticMode === 'periodic') {
    const target = motorResolveSpeedPercentForSegment(
      state.automaticMode,
      0,
      state,
      sessionStartSec,
      0,
      random,
    );
    const rampSec = Math.max(state.rampMs / 1000, 0.001);
    pushPoint(points, tSec, 0);
    tSec += rampSec;
    pushPoint(points, tSec, target);
    pushPoint(points, horizonSec, target);
    return { points, horizonSec, illustrativeRandom };
  }

  let segmentIndex = 0;
  while (tSec < horizonSec && segmentIndex < MAX_SEGMENTS) {
    const durationSec = Math.max(pickSegmentSeconds(state.automaticMode, state, random), 0.001);
    const elapsedAtStart = Math.max(0, tSec - sessionStartSec);
    const fromSpeed =
      segmentIndex === 0
        ? 0
        : motorResolveSpeedPercentForSegment(
            state.automaticMode,
            segmentIndex - 1,
            state,
            sessionStartSec,
            elapsedAtStart,
            random,
          );
    const toSpeed = motorResolveSpeedPercentForSegment(
      state.automaticMode,
      segmentIndex,
      state,
      sessionStartSec,
      elapsedAtStart,
      random,
    );

    const segmentEnd = Math.min(tSec + durationSec, horizonSec);
    const fraction = (segmentEnd - tSec) / durationSec;
    const endSpeed = fromSpeed + (toSpeed - fromSpeed) * fraction;

    pushPoint(points, tSec, fromSpeed);
    pushPoint(points, segmentEnd, endSpeed);
    tSec = segmentEnd;
    segmentIndex += 1;
  }

  return { points, horizonSec, illustrativeRandom };
}

export function buildMotorManualSpeedSchedule(
  manual: MotorManualControlState,
  horizonSec = MOTOR_PATTERN_PREVIEW_NO_AUTO_END_SEC,
): MotorSpeedSchedule {
  const speed = clampInt(manual.speedPercent, 0, 100);
  return {
    points: [
      { tSec: 0, speedPercent: speed },
      { tSec: horizonSec, speedPercent: speed },
    ],
    horizonSec,
    illustrativeRandom: false,
  };
}

export function speedAtScheduleTime(
  schedule: MotorSpeedSchedule,
  tSec: number,
): number {
  const { points } = schedule;
  if (points.length === 0) {
    return 0;
  }
  if (tSec <= points[0].tSec) {
    return points[0].speedPercent;
  }
  const last = points[points.length - 1];
  if (tSec >= last.tSec) {
    return last.speedPercent;
  }

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const next = points[i];
    if (tSec <= next.tSec) {
      const span = next.tSec - prev.tSec;
      if (span <= 0) {
        return next.speedPercent;
      }
      const ratio = (tSec - prev.tSec) / span;
      return prev.speedPercent + (next.speedPercent - prev.speedPercent) * ratio;
    }
  }

  return last.speedPercent;
}
