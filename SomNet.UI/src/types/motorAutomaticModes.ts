/** Motor automatic programs — speed waveform on a continuous run (not relay stroke modes). */
export type MotorAutomaticRunMode =
  | 'periodic'
  | 'randomSpeed'
  | 'randomSpeedAndTiming'
  | 'powerWave'
  | 'buildUp';

export const MOTOR_AUTOMATIC_RUN_MODE_OPTIONS: {
  value: MotorAutomaticRunMode;
  label: string;
}[] = [
  { value: 'periodic', label: 'Set Speed' },
  { value: 'randomSpeed', label: 'Random Speed' },
  { value: 'randomSpeedAndTiming', label: 'Random Speed and Timing' },
  { value: 'powerWave', label: 'Speed Wave' },
  { value: 'buildUp', label: 'Build-Up' },
];

const MOTOR_AUTOMATIC_RUN_MODE_SET = new Set<MotorAutomaticRunMode>(
  MOTOR_AUTOMATIC_RUN_MODE_OPTIONS.map((option) => option.value),
);

/** Map relay / legacy stored modes onto the motor program set. */
export function coerceMotorAutomaticRunMode(mode: string): MotorAutomaticRunMode {
  switch (mode) {
    case 'periodic':
      return 'periodic';
    case 'randomSpeed':
    case 'randomPowerOnly':
      return 'randomSpeed';
    case 'randomSpeedAndTiming':
    case 'randomPowerAndTiming':
      return 'randomSpeedAndTiming';
    case 'powerWave':
      return 'powerWave';
    case 'buildUp':
      return 'buildUp';
    default:
      return 'periodic';
  }
}

export function isMotorAutomaticRunMode(mode: string): mode is MotorAutomaticRunMode {
  return MOTOR_AUTOMATIC_RUN_MODE_SET.has(mode as MotorAutomaticRunMode);
}
