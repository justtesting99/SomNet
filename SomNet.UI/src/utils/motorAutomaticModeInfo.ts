import type { MotorAutomaticRunMode } from '@/types/motorAutomaticModes';

export interface MotorAutomaticModeInfo {
  summary: string;
  endSessionNote?: string;
}

export const MOTOR_AUTOMATIC_MODE_INFO: Record<MotorAutomaticRunMode, MotorAutomaticModeInfo> =
  {
    periodic: {
      summary:
        'Runs continuously: each segment interval is the time to ramp from the current target speed to the next (Set Speed uses the same max target each segment). Minimum speed and minimum segment interval are ignored.',
    },
    randomSpeed: {
      summary:
        'Each segment interval ramps from the previous target to a new random target speed. Segment timing uses the maximum interval only.',
    },
    randomSpeedAndTiming: {
      summary:
        'Random target speed and random time until the next graph point; the motor stays running and ramps between targets.',
    },
    powerWave: {
      summary:
        'Target speed follows a repeating wave between minimum and maximum; ramps between graph points while segment timing stays at the maximum interval.',
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
