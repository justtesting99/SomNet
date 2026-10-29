import type { AutomaticControlState } from '@/types/modes';
import { defaultAutomaticState } from '@/types/modes';
import type { MotorAutomaticControlState, MotorManualControlState } from '@/types/motorModes';
import type { AppOptions } from '@/types/options';
import type { MotorAutomaticRunMode } from '@/types/motorAutomaticModes';
import type { MotorAutomaticSegmentEvent } from '@/utils/motorAutomaticSegmentJson';
import { resolveMotorBurstGraphSpeedPercent } from '@/utils/motorBurstEffectiveSpeed';
import { resolveMotorSegmentTargetRampMs } from '@/utils/motorSegmentTargetRamp';
import {
  advanceBurstPlan,
  buildRelayBurstPlan,
  previewBurstDelaySec,
  previewBurstRelativePower,
  previewBurstStrokeCount,
  shouldPreviewBurstAfterMainStroke,
  shouldPreviewBurstBeforeMainStroke,
} from '@/utils/relayBurstPlan';

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
/** Matches firmware `kMotorBurstMicroHoldMs` (doc 31 MA-D26). */
const MOTOR_BURST_MICRO_HOLD_SEC = 0.3;

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
    state.burstsOn,
    state.burstPlacement,
    state.burstPercent,
    state.burstStrokePowerMax,
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

function motorAutomaticBurstPlanInput(state: MotorAutomaticControlState): AutomaticControlState {
  return {
    ...defaultAutomaticState,
    minimumPower: Math.min(state.minimumSpeedPercent, state.maximumSpeedPercent),
    maximumPower: Math.max(state.minimumSpeedPercent, state.maximumSpeedPercent),
    endSessionMode: state.endSessionMode === 'minutes' ? 'minutes' : 'noAutoEnd',
    endSessionValue: state.endSessionValue,
    delayBeforeStartSeconds: state.delayBeforeStartSeconds,
    burstsOn: state.burstsOn,
    burstPlacement: state.burstPlacement,
    burstPercent: state.burstPercent,
    burstStyle: state.burstStyle,
    burstStrokePowerMin: state.burstStrokePowerMin,
    burstStrokePowerMax: state.burstStrokePowerMax,
    burstDelayMin: state.burstDelayMin,
    burstDelayMax: state.burstDelayMax,
    burstStrokesMin: state.burstStrokesMin,
    burstStrokesMax: state.burstStrokesMax,
  };
}

function transitionRampSec(
  segmentTargetRampMs: number,
  state: MotorAutomaticControlState,
  durationSec: number,
): number {
  if (segmentTargetRampMs === 0) {
    return 0.001;
  }
  if (segmentTargetRampMs > 0) {
    return Math.min(durationSec, Math.max(segmentTargetRampMs / 1000, 0.001));
  }
  return Math.min(durationSec, Math.max(state.rampMs / 1000, 0.001));
}

function appendMotorBurstCluster(
  relayState: AutomaticControlState,
  motorState: MotorAutomaticControlState,
  scheduleSeed: number,
  burstEventIndex: number,
  points: MotorSpeedSchedulePoint[],
  tSec: number,
  level: number,
  horizonSec: number,
  rampSec: number,
): { tSec: number; level: number; burstEventIndex: number } {
  const strokeCount = previewBurstStrokeCount(relayState, burstEventIndex, scheduleSeed);
  let cursor = tSec;
  let currentLevel = level;

  for (let strokeInBurst = 0; strokeInBurst < strokeCount; strokeInBurst += 1) {
    if (cursor >= horizonSec) {
      break;
    }

    const relativePower = previewBurstRelativePower(
      relayState,
      burstEventIndex,
      strokeInBurst,
      scheduleSeed,
    );
    const target = resolveMotorBurstGraphSpeedPercent(relativePower, motorState);

    pushPoint(points, cursor, currentLevel);
    const rampEnd = Math.min(cursor + rampSec, horizonSec);
    pushPoint(points, rampEnd, target);
    currentLevel = target;
    cursor = rampEnd;

    const holdEnd = Math.min(cursor + MOTOR_BURST_MICRO_HOLD_SEC, horizonSec);
    pushPoint(points, holdEnd, target);
    cursor = holdEnd;

    if (strokeInBurst < strokeCount - 1 && cursor < horizonSec) {
      const delaySec = previewBurstDelaySec(
        relayState,
        burstEventIndex,
        strokeInBurst,
        scheduleSeed,
      );
      cursor = Math.min(cursor + Math.max(0, delaySec), horizonSec);
      pushPoint(points, cursor, currentLevel);
    }
  }

  return { tSec: cursor, level: currentLevel, burstEventIndex: burstEventIndex + 1 };
}

function appendMotorProgramSegment(
  points: MotorSpeedSchedulePoint[],
  tSec: number,
  fromSpeed: number,
  toSpeed: number,
  durationSec: number,
  segmentTargetRampMs: number,
  state: MotorAutomaticControlState,
  horizonSec: number,
): { tSec: number; level: number } {
  const segmentEnd = Math.min(tSec + durationSec, horizonSec);

  if (segmentTargetRampMs < 0) {
    const fraction = durationSec > 0 ? (segmentEnd - tSec) / durationSec : 1;
    const endSpeed = fromSpeed + (toSpeed - fromSpeed) * fraction;
    pushPoint(points, tSec, fromSpeed);
    pushPoint(points, segmentEnd, endSpeed);
    return { tSec: segmentEnd, level: endSpeed };
  }

  if (segmentTargetRampMs === 0) {
    pushPoint(points, tSec, fromSpeed);
    if (fromSpeed !== toSpeed) {
      pushPoint(points, tSec, toSpeed);
    }
    pushPoint(points, segmentEnd, toSpeed);
    return { tSec: segmentEnd, level: toSpeed };
  }

  const transitionSec = transitionRampSec(segmentTargetRampMs, state, durationSec);
  const rampEnd = Math.min(tSec + transitionSec, segmentEnd);
  pushPoint(points, tSec, fromSpeed);
  pushPoint(points, rampEnd, toSpeed);
  if (rampEnd < segmentEnd) {
    pushPoint(points, segmentEnd, toSpeed);
  }
  return { tSec: segmentEnd, level: toSpeed };
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
  const burstRelayState = motorAutomaticBurstPlanInput(state);
  const burstPlan = state.burstsOn ? buildRelayBurstPlan(burstRelayState) : null;
  const burstRampSec = transitionRampSec(segmentTargetRampMs, state, state.segmentMaxSeconds);
  let mainStrokesCompleted = 0;
  let burstEventIndex = 0;

  while (tSec < horizonSec && segmentIndex < MAX_SEGMENTS) {
    if (
      burstPlan?.active &&
      shouldPreviewBurstBeforeMainStroke(
        burstRelayState,
        burstPlan,
        mainStrokesCompleted,
        scheduleSeed,
      )
    ) {
      const burst = appendMotorBurstCluster(
        burstRelayState,
        state,
        scheduleSeed,
        burstEventIndex,
        points,
        tSec,
        commandedSpeed,
        horizonSec,
        burstRampSec,
      );
      tSec = burst.tSec;
      commandedSpeed = burst.level;
      burstEventIndex = burst.burstEventIndex;
      advanceBurstPlan(burstPlan);
      mainStrokesCompleted += 1;
      segmentIndex += 1;
      continue;
    }

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

    const segment = appendMotorProgramSegment(
      points,
      tSec,
      fromSpeed,
      toSpeed,
      durationSec,
      segmentTargetRampMs,
      state,
      horizonSec,
    );
    tSec = segment.tSec;
    commandedSpeed = segment.level;
    mainStrokesCompleted += 1;
    segmentIndex += 1;

    if (
      burstPlan?.active &&
      shouldPreviewBurstAfterMainStroke(
        burstRelayState,
        burstPlan,
        mainStrokesCompleted,
        scheduleSeed,
      )
    ) {
      const burst = appendMotorBurstCluster(
        burstRelayState,
        state,
        scheduleSeed,
        burstEventIndex,
        points,
        tSec,
        commandedSpeed,
        horizonSec,
        burstRampSec,
      );
      tSec = burst.tSec;
      commandedSpeed = burst.level;
      burstEventIndex = burst.burstEventIndex;
      advanceBurstPlan(burstPlan);
    }
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
  let effectiveHorizonSec = Math.max(1, horizonSec);
  for (const segment of sorted) {
    const endSec = segment.programElapsedMs / 1000 + Math.max(segment.durationMs / 1000, 0);
    effectiveHorizonSec = Math.max(effectiveHorizonSec, endSec);
  }
  if (last.tSec < effectiveHorizonSec) {
    pushPoint(points, effectiveHorizonSec, last.speedPercent);
  }

  return { points, horizonSec: effectiveHorizonSec, illustrativeRandom: false };
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
