import type { EndSessionMode } from '@/types/modes';
import {
  defaultMotorAutomaticState,
  type MotorAutomaticControlState,
} from '@/types/motorModes';

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizeEndSessionMode(mode: EndSessionMode): EndSessionMode {
  if (mode === 'minutes' || mode === 'noAutoEnd') {
    return mode;
  }
  return 'noAutoEnd';
}

/** Clamp motor automatic form state (per-sub pairing settings). */
export function normalizeMotorAutomaticControlState(
  state: MotorAutomaticControlState,
): MotorAutomaticControlState {
  let minimumDutyPercent = clampInt(state.minimumDutyPercent, 0, 100);
  let maximumDutyPercent = clampInt(state.maximumDutyPercent, 0, 100);
  if (minimumDutyPercent > maximumDutyPercent) {
    [minimumDutyPercent, maximumDutyPercent] = [maximumDutyPercent, minimumDutyPercent];
  }

  let segmentMinSeconds = clampInt(state.segmentMinSeconds, 1, 3600);
  let segmentMaxSeconds = clampInt(state.segmentMaxSeconds, 1, 3600);
  if (segmentMinSeconds > segmentMaxSeconds) {
    [segmentMinSeconds, segmentMaxSeconds] = [segmentMaxSeconds, segmentMinSeconds];
  }

  const endSessionMode = normalizeEndSessionMode(state.endSessionMode);

  return {
    ...defaultMotorAutomaticState,
    ...state,
    running: false,
    automaticMode: 'periodic',
    minimumDutyPercent,
    maximumDutyPercent,
    segmentMinSeconds,
    segmentMaxSeconds,
    delayBeforeStartSeconds: clampInt(state.delayBeforeStartSeconds, 0, 3600),
    rampMs: clampInt(state.rampMs, 0, 30_000),
    endSessionMode,
    endSessionValue: clampInt(state.endSessionValue, 1, 1440),
  };
}
