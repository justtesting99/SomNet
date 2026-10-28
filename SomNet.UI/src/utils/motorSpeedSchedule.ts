import type { MotorAutomaticControlState, MotorManualControlState } from '@/types/motorModes';
import type { AppOptions } from '@/types/options';
import type { MotorAutomaticRunMode } from '@/types/motorAutomaticModes';
import type { MotorAutomaticSegmentEvent } from '@/utils/motorAutomaticSegmentJson';
import { resolveMotorSegmentTargetRampMs } from '@/utils/motorSegmentTargetRamp';

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

function segmentSeed(scheduleSeed: number, segmentIndex: number, channel: number): number {
  return (scheduleSeed + segmentIndex * 9973 + channel * 0x9e3779b9) >>> 0;
}

/** Stable per-segment random unit (preview + Now dot); not shared across segments. */
function segmentRandomUnit(scheduleSeed: number, segmentIndex: number, channel: number): () => number {
  return createSeededRandom(segmentSeed(scheduleSeed, segmentIndex, channel));
}

function previewSegmentDurationSec(
  state: MotorAutomaticControlState,
  segmentIndex: number,
  scheduleSeed: number,
): number {
  const mode = state.automaticMode;
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
  const random = segmentRandomUnit(scheduleSeed, segmentIndex, 1);
  return state.segmentMinSeconds + Math.floor(random() * span);
}

function previewSegmentTargetSpeedPercent(
  state: MotorAutomaticControlState,
  segmentIndex: number,
  sessionStartSec: number,
  elapsedSinceSessionStartSec: number,
  scheduleSeed: number,
): number {
  const random = segmentRandomUnit(scheduleSeed, segmentIndex, 2);
  return motorResolveSpeedPercentForSegment(
    state.automaticMode,
    segmentIndex,
    state,
    sessionStartSec,
    elapsedSinceSessionStartSec,
    random,
  );
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
  appOptions?: Pick<AppOptions, 'motorSegmentTargetRampMode' | 'motorSegmentTargetRampMs'>,
): MotorSpeedSchedule {
  const segmentTargetRampMs = appOptions
    ? resolveMotorSegmentTargetRampMs(state.automaticMode, appOptions)
    : -1;
  const horizonSec =
    state.endSessionMode === 'minutes'
      ? Math.max(1, state.endSessionValue * 60)
      : MOTOR_PATTERN_PREVIEW_NO_AUTO_END_SEC;

  const illustrativeRandom =
    state.automaticMode === 'randomSpeed' || state.automaticMode === 'randomSpeedAndTiming';

  const scheduleSeed = hashMotorAutomaticScheduleSeed(state);
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
    const target = previewSegmentTargetSpeedPercent(
      state,
      0,
      sessionStartSec,
      0,
      scheduleSeed,
    );
    const rampSec =
      segmentTargetRampMs === 0
        ? 0.001
        : segmentTargetRampMs > 0
          ? Math.max(segmentTargetRampMs / 1000, 0.001)
          : Math.max(state.rampMs / 1000, 0.001);
    pushPoint(points, tSec, 0);
    tSec += rampSec;
    pushPoint(points, tSec, target);
    pushPoint(points, horizonSec, target);
    return { points, horizonSec, illustrativeRandom };
  }

  let segmentIndex = 0;
  let commandedSpeed = 0;
  while (tSec < horizonSec && segmentIndex < MAX_SEGMENTS) {
    const durationSec = Math.max(
      previewSegmentDurationSec(state, segmentIndex, scheduleSeed),
      0.001,
    );
    const elapsedAtStart = Math.max(0, tSec - sessionStartSec);
    const fromSpeed = commandedSpeed;
    const toSpeed = previewSegmentTargetSpeedPercent(
      state,
      segmentIndex,
      sessionStartSec,
      elapsedAtStart,
      scheduleSeed,
    );

    const segmentEnd = Math.min(tSec + durationSec, horizonSec);

    if (segmentTargetRampMs < 0) {
      const fraction = (segmentEnd - tSec) / durationSec;
      const endSpeed = fromSpeed + (toSpeed - fromSpeed) * fraction;
      pushPoint(points, tSec, fromSpeed);
      pushPoint(points, segmentEnd, endSpeed);
      commandedSpeed = endSpeed;
    } else if (segmentTargetRampMs === 0) {
      pushPoint(points, tSec, fromSpeed);
      if (fromSpeed !== toSpeed) {
        pushPoint(points, tSec, toSpeed);
      }
      pushPoint(points, segmentEnd, toSpeed);
      commandedSpeed = toSpeed;
    } else {
      const transitionSec = Math.min(durationSec, segmentTargetRampMs / 1000);
      const rampEnd = Math.min(tSec + transitionSec, segmentEnd);
      pushPoint(points, tSec, fromSpeed);
      pushPoint(points, rampEnd, toSpeed);
      if (rampEnd < segmentEnd) {
        pushPoint(points, segmentEnd, toSpeed);
      }
      commandedSpeed = toSpeed;
    }

    tSec = segmentEnd;
    segmentIndex += 1;
  }

  return { points, horizonSec, illustrativeRandom };
}

/** Build commanded-speed graph from device-reported segment ramps (live automatic session). */
export function buildMotorSpeedScheduleFromLiveSegments(
  segments: MotorAutomaticSegmentEvent[],
  horizonSec: number,
): MotorSpeedSchedule {
  const sorted = [...segments].sort(
    (left, right) => left.programElapsedMs - right.programElapsedMs,
  );

  const points: MotorSpeedSchedulePoint[] = [];
  pushPoint(points, 0, 0);

  if (sorted.length === 0) {
    return { points, horizonSec, illustrativeRandom: false };
  }

  const firstStartSec = sorted[0].programElapsedMs / 1000;
  if (firstStartSec > 0) {
    pushPoint(points, firstStartSec, 0);
  }

  for (const segment of sorted) {
    const tStartSec = segment.programElapsedMs / 1000;
    const durationSec = Math.max(segment.durationMs / 1000, 0);
    const tEndSec = tStartSec + durationSec;
    if (
      durationSec <= 0.05 &&
      segment.fromSpeedPercent !== segment.toSpeedPercent
    ) {
      pushPoint(points, tStartSec, segment.fromSpeedPercent);
      pushPoint(points, tStartSec, segment.toSpeedPercent);
      if (tEndSec > tStartSec) {
        pushPoint(points, tEndSec, segment.toSpeedPercent);
      }
      continue;
    }
    pushPoint(points, tStartSec, segment.fromSpeedPercent);
    pushPoint(points, tEndSec, segment.toSpeedPercent);
  }

  const last = points[points.length - 1];
  if (last.tSec < horizonSec) {
    pushPoint(points, horizonSec, last.speedPercent);
  }

  return { points, horizonSec, illustrativeRandom: false };
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
