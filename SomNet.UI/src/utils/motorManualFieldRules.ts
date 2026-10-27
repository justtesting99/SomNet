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

export function normalizeMotorManualControlState(
  state: MotorManualControlState,
): MotorManualControlState {
  let minimumDutyPercent = clampPercent(state.minimumDutyPercent);
  let maximumDutyPercent = clampPercent(state.maximumDutyPercent);
  if (minimumDutyPercent > maximumDutyPercent) {
    [minimumDutyPercent, maximumDutyPercent] = [maximumDutyPercent, minimumDutyPercent];
  }

  return {
    ...defaultMotorManualState,
    ...state,
    minimumDutyPercent,
    maximumDutyPercent,
    speedPercent: clampPercent(state.speedPercent),
  };
}

/** Strip legacy persisted run-second fields from API payloads. */
export function normalizeMotorManualFromApi(
  value: MotorManualControlState & {
    minimumRunSeconds?: number;
    maximumRunSeconds?: number;
  },
): MotorManualControlState {
  const { minimumRunSeconds: _minRun, maximumRunSeconds: _maxRun, ...rest } = value;
  return normalizeMotorManualControlState(rest);
}
