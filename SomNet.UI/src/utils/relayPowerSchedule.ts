import type { AutomaticControlState, ManualControlState } from '@/types/modes';
import type { AutomaticRunMode } from '@/types/modes';
import type { RelayAutomaticSegmentEvent } from '@/utils/relayAutomaticSegmentJson';
import { computeStrokeMs } from '@/utils/stroke';
import {
  createSeededRandom,
  type MotorSpeedSchedule,
  type MotorSpeedSchedulePoint,
  MOTOR_PATTERN_PREVIEW_NO_AUTO_END_SEC,
  speedAtScheduleTime,
} from '@/utils/motorSpeedSchedule';

export const RELAY_PATTERN_PREVIEW_NO_AUTO_END_SEC = MOTOR_PATTERN_PREVIEW_NO_AUTO_END_SEC;

export type RelayPowerSchedule = MotorSpeedSchedule;

function pushPoint(points: MotorSpeedSchedulePoint[], tSec: number, powerPercent: number): void {
  const last = points[points.length - 1];
  if (last && last.tSec === tSec && last.speedPercent === powerPercent) {
    return;
  }
  points.push({ tSec, speedPercent: powerPercent });
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function sampleTriangle01(phase01: number): number {
  let phase = phase01 - Math.floor(phase01);
  if (phase < 0) {
    phase += 1;
  }
  if (phase < 0.5) {
    return phase * 2;
  }
  return 2 - phase * 2;
}

function lerpInt(from: number, to: number, t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return from + Math.round((to - from) * clamped);
}

function sampleTrianglePower(minimumPower: number, maximumPower: number, phase01: number): number {
  return lerpInt(minimumPower, maximumPower, sampleTriangle01(phase01));
}

function sampleInverseTriangleGapSec(
  strokeMinSeconds: number,
  strokeMaxSeconds: number,
  phase01: number,
): number {
  const inverse = 1 - sampleTriangle01(phase01);
  return lerpInt(strokeMinSeconds, strokeMaxSeconds, inverse);
}

function automaticHorizonSec(state: AutomaticControlState): number {
  if (state.endSessionMode === 'minutes') {
    return Math.max(1, state.endSessionValue * 60);
  }
  if (state.endSessionMode === 'strokes') {
    const avgGap = (state.strokeMinSeconds + state.strokeMaxSeconds) / 2;
    const strokeMs = computeStrokeMs(
      state.maximumPower,
      state.minimumStrokeMs,
      state.maximumStrokeMs,
    );
    return Math.max(30, state.endSessionValue * (avgGap + strokeMs / 1000));
  }
  return RELAY_PATTERN_PREVIEW_NO_AUTO_END_SEC;
}

export function hashRelayAutomaticScheduleSeed(state: AutomaticControlState): number {
  const payload = [
    state.automaticMode,
    state.minimumPower,
    state.maximumPower,
    state.strokeMinSeconds,
    state.strokeMaxSeconds,
    state.minimumStrokeMs,
    state.maximumStrokeMs,
    state.delayBeforeStartSeconds,
    state.endSessionMode,
    state.endSessionValue,
    state.burstsOn,
  ].join('|');

  let hash = 2166136261;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

interface StrokeRow {
  powerPercent: number;
  gapSec: number;
}

function resolvePeriodicStroke(state: AutomaticControlState): StrokeRow {
  return {
    powerPercent: state.maximumPower,
    gapSec: state.strokeMaxSeconds,
  };
}

function resolveRandomStroke(
  state: AutomaticControlState,
  strokeIndex: number,
  scheduleSeed: number,
): StrokeRow {
  const lo = Math.min(state.minimumPower, state.maximumPower);
  const hi = Math.max(state.minimumPower, state.maximumPower);
  const rand = createSeededRandom((scheduleSeed + strokeIndex * 9973) >>> 0);

  switch (state.automaticMode) {
    case 'randomPowerOnly':
      return {
        powerPercent: lo + Math.floor(rand() * (hi - lo + 1)),
        gapSec: state.strokeMaxSeconds,
      };
    case 'randomTimingOnly':
      return {
        powerPercent: hi,
        gapSec:
          state.strokeMinSeconds +
          Math.floor(rand() * (state.strokeMaxSeconds - state.strokeMinSeconds + 1)),
      };
    case 'randomPowerAndTiming':
      return {
        powerPercent: lo + Math.floor(rand() * (hi - lo + 1)),
        gapSec:
          state.strokeMinSeconds +
          Math.floor(rand() * (state.strokeMaxSeconds - state.strokeMinSeconds + 1)),
      };
    default:
      return resolvePeriodicStroke(state);
  }
}

function estimateStrokeCount(state: AutomaticControlState, nominalGapSec: number): number {
  if (state.endSessionMode === 'strokes' && state.endSessionValue > 0) {
    return state.endSessionValue;
  }
  if (state.endSessionMode === 'minutes' && state.endSessionValue > 0 && nominalGapSec > 0) {
    return Math.floor((state.endSessionValue * 60) / nominalGapSec) + 1;
  }
  return Math.floor(RELAY_PATTERN_PREVIEW_NO_AUTO_END_SEC / Math.max(1, nominalGapSec));
}

function buildTableRows(state: AutomaticControlState, scheduleSeed: number): StrokeRow[] {
  const avgGap = (state.strokeMinSeconds + state.strokeMaxSeconds) / 2;
  const fixedGap = state.strokeMaxSeconds;
  const count = estimateStrokeCount(
    state,
    state.automaticMode === 'powerWave' ? fixedGap : avgGap,
  );
  if (count <= 0) {
    return [];
  }

  const rows: StrokeRow[] = [];

  if (state.automaticMode === 'powerWave') {
    const tWaveSec =
      state.endSessionMode === 'minutes' && state.endSessionValue > 0
        ? state.endSessionValue * 60 * 2
        : Math.max(2, count * fixedGap);
    for (let i = 0; i < count; i += 1) {
      const elapsedSec = i * fixedGap;
      const phase = (elapsedSec / tWaveSec + scheduleSeed / 4294967296) % 1;
      rows.push({
        powerPercent: sampleTrianglePower(state.minimumPower, state.maximumPower, phase),
        gapSec: fixedGap,
      });
    }
    return rows;
  }

  if (state.automaticMode === 'powerAndTimingWave') {
    const tWaveSec =
      state.endSessionMode === 'minutes' && state.endSessionValue > 0
        ? state.endSessionValue * 60 * 2
        : Math.max(2, count * state.strokeMaxSeconds);
    let elapsedSec = 0;
    for (let i = 0; i < count; i += 1) {
      const phase = (elapsedSec / tWaveSec + scheduleSeed / 4294967296) % 1;
      const gapSec = sampleInverseTriangleGapSec(
        state.strokeMinSeconds,
        state.strokeMaxSeconds,
        phase,
      );
      rows.push({
        powerPercent: sampleTrianglePower(state.minimumPower, state.maximumPower, phase),
        gapSec,
      });
      elapsedSec += gapSec;
    }
    return rows;
  }

  if (state.automaticMode === 'buildUp') {
    for (let i = 0; i < count; i += 1) {
      const rowPhase = count > 1 ? i / (count - 1) : 0;
      const t = Math.min(1, rowPhase + scheduleSeed / 4294967296);
      const powerPercent = lerpInt(state.minimumPower, state.maximumPower, t);
      const gapSec = lerpInt(state.strokeMaxSeconds, state.strokeMinSeconds, t);
      rows.push({ powerPercent, gapSec });
    }
  }

  return rows;
}

function resolveStrokeRow(
  state: AutomaticControlState,
  strokeIndex: number,
  scheduleSeed: number,
  tableRows: StrokeRow[] | null,
): StrokeRow {
  if (tableRows && strokeIndex < tableRows.length) {
    return tableRows[strokeIndex]!;
  }

  if (
    state.automaticMode === 'randomPowerOnly' ||
    state.automaticMode === 'randomTimingOnly' ||
    state.automaticMode === 'randomPowerAndTiming'
  ) {
    return resolveRandomStroke(state, strokeIndex, scheduleSeed);
  }

  return resolvePeriodicStroke(state);
}

function isRandomMode(mode: AutomaticRunMode): boolean {
  return (
    mode === 'randomPowerOnly' ||
    mode === 'randomTimingOnly' ||
    mode === 'randomPowerAndTiming'
  );
}

function usesTableSchedule(mode: AutomaticRunMode): boolean {
  return mode === 'powerWave' || mode === 'powerAndTimingWave' || mode === 'buildUp';
}

export function buildRelayAutomaticPowerSchedule(state: AutomaticControlState): RelayPowerSchedule {
  const horizonSec = automaticHorizonSec(state);
  const scheduleSeed = hashRelayAutomaticScheduleSeed(state);
  const illustrativeRandom = isRandomMode(state.automaticMode);
  const tableRows = usesTableSchedule(state.automaticMode)
    ? buildTableRows(state, scheduleSeed)
    : null;

  const points: MotorSpeedSchedulePoint[] = [];
  let tSec = 0;

  if (state.delayBeforeStartSeconds > 0) {
    pushPoint(points, 0, 0);
    tSec = state.delayBeforeStartSeconds;
    pushPoint(points, tSec, 0);
  } else {
    pushPoint(points, 0, 0);
  }

  let strokeIndex = 0;
  let level = 0;

  while (tSec < horizonSec) {
    const row = resolveStrokeRow(state, strokeIndex, scheduleSeed, tableRows);
    const strokeMs = computeStrokeMs(
      row.powerPercent,
      state.minimumStrokeMs,
      state.maximumStrokeMs,
    );
    const strokeSec = Math.max(0.001, strokeMs / 1000);
    const gapSec = Math.max(0, row.gapSec);

    const strokeEnd = Math.min(tSec + strokeSec, horizonSec);
    if (row.powerPercent !== level) {
      pushPoint(points, tSec, level);
      pushPoint(points, tSec, row.powerPercent);
    } else {
      pushPoint(points, tSec, level);
    }
    pushPoint(points, strokeEnd, row.powerPercent);
    level = row.powerPercent;
    tSec = strokeEnd;

    if (tSec >= horizonSec) {
      break;
    }

    const gapEnd = Math.min(tSec + gapSec, horizonSec);
    if (level !== 0) {
      pushPoint(points, tSec, level);
      pushPoint(points, tSec, 0);
    }
    pushPoint(points, gapEnd, 0);
    level = 0;
    tSec = gapEnd;
    strokeIndex += 1;

    if (state.endSessionMode === 'strokes' && strokeIndex >= state.endSessionValue) {
      break;
    }
  }

  if (points[points.length - 1]?.tSec !== horizonSec) {
    pushPoint(points, horizonSec, level);
  }

  return { points, horizonSec, illustrativeRandom };
}

export function buildRelayPowerScheduleFromLiveSegments(
  segments: RelayAutomaticSegmentEvent[],
  horizonSec: number,
): RelayPowerSchedule {
  const sorted = [...segments].sort(
    (left, right) => left.programElapsedMs - right.programElapsedMs,
  );

  const points: MotorSpeedSchedulePoint[] = [];
  pushPoint(points, 0, 0);

  let level = 0;
  for (const segment of sorted) {
    const tStartSec = segment.programElapsedMs / 1000;
    const tEndSec = tStartSec + segment.durationMs / 1000;
    const target =
      segment.phase === 'stroke' ? segment.powerPercent : 0;

    if (tStartSec > points[points.length - 1].tSec) {
      pushPoint(points, tStartSec, level);
    }

    if (target !== level) {
      pushPoint(points, tStartSec, level);
      pushPoint(points, tStartSec, target);
    }

    pushPoint(points, tEndSec, target);
    level = target;
  }

  const last = points[points.length - 1];
  if (last.tSec < horizonSec) {
    pushPoint(points, horizonSec, last.speedPercent);
  }

  return { points, horizonSec, illustrativeRandom: false };
}

export function buildRelayManualPowerSchedule(
  manual: ManualControlState,
  horizonSec = RELAY_PATTERN_PREVIEW_NO_AUTO_END_SEC,
): RelayPowerSchedule {
  const power = clampInt(manual.powerPercent, 0, 100);
  return {
    points: [
      { tSec: 0, speedPercent: power },
      { tSec: horizonSec, speedPercent: power },
    ],
    horizonSec,
    illustrativeRandom: false,
  };
}

export function powerAtScheduleTime(schedule: RelayPowerSchedule, tSec: number): number {
  return speedAtScheduleTime(schedule, tSec);
}
