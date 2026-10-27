import type { MotorAutomaticRunMode } from '@/types/motorAutomaticModes';

export interface MotorAutomaticModeInfo {
  summary: string;
  endSessionNote?: string;
}

export const MOTOR_AUTOMATIC_MODE_INFO: Record<MotorAutomaticRunMode, MotorAutomaticModeInfo> =
  {
    periodic: {
      summary:
        'Runs continuously at maximum speed. Minimum speed and minimum segment interval are ignored — segment timing uses your maximum interval only.',
    },
    randomSpeed: {
      summary:
        'Speed changes at each segment boundary, chosen randomly between minimum and maximum speed. Segment timing stays at the maximum interval.',
    },
    randomSpeedAndTiming: {
      summary:
        'Both speed and time until the next graph point vary randomly within your minimum and maximum ranges.',
    },
    powerWave: {
      summary:
        'Speed follows a repeating wave between minimum and maximum while segment timing stays at the maximum interval.',
      endSessionNote:
        'Wave schedule is pre-calculated from your end session duration. No AutoEnd is not available.',
    },
    buildUp: {
      summary:
        'A single ramp from minimum to maximum speed over the session; segment timing uses the maximum interval.',
      endSessionNote:
        'Build-up schedule is pre-calculated from your end session duration. No AutoEnd is not available.',
    },
  };

export function getMotorAutomaticModeInfo(mode: MotorAutomaticRunMode): MotorAutomaticModeInfo {
  return MOTOR_AUTOMATIC_MODE_INFO[mode];
}
