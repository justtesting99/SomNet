import {
  defaultMotorManualState,
  type MotorManualControlState,
} from '@/types/motorModes';

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.trunc(value)));
}

function clampRunSeconds(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(3600, Math.max(1, Math.trunc(value)));
}

export function normalizeMotorManualControlState(
  state: MotorManualControlState,
): MotorManualControlState {
  let minimumDutyPercent = clampPercent(state.minimumDutyPercent);
  let maximumDutyPercent = clampPercent(state.maximumDutyPercent);
  if (minimumDutyPercent > maximumDutyPercent) {
    [minimumDutyPercent, maximumDutyPercent] = [maximumDutyPercent, minimumDutyPercent];
  }

  let minimumRunSeconds = clampRunSeconds(state.minimumRunSeconds);
  let maximumRunSeconds = clampRunSeconds(state.maximumRunSeconds);
  if (minimumRunSeconds > maximumRunSeconds) {
    [minimumRunSeconds, maximumRunSeconds] = [maximumRunSeconds, minimumRunSeconds];
  }

  return {
    ...defaultMotorManualState,
    ...state,
    minimumDutyPercent,
    maximumDutyPercent,
    minimumRunSeconds,
    maximumRunSeconds,
    speedPercent: clampPercent(state.speedPercent),
  };
}
