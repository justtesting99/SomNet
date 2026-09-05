export const HARDWARE_COMMAND_KEYS = {
  manualStroke: 'manual:stroke',
  manualBurst: 'manual:burst',
  manualAbort: 'manual:abort',
  automaticStart: 'automatic:start',
  automaticStop: 'automatic:stop',
} as const;

export type HardwareCommandKey =
  (typeof HARDWARE_COMMAND_KEYS)[keyof typeof HARDWARE_COMMAND_KEYS];

export type HardwareCommandStatus = 'idle' | 'pending';
