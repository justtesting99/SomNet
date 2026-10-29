export const HARDWARE_COMMAND_KEYS = {
  manualStroke: 'manual:stroke',
  manualBurst: 'manual:burst',
  manualAbort: 'manual:abort',
  manualMotorStop: 'manual:motor-stop',
  automaticStart: 'automatic-start',
  automaticStop: 'automatic-stop',
  automaticUpdate: 'automatic-update',
  sessionAccessory: 'session-accessory',
  sceneSession: 'scene-session',
} as const;

export const DEVICE_COMMAND_KEYS = {
  sessionAccessory: 'session-accessory',
  sceneSession: 'scene-session',
} as const;

export type HardwareCommandKey =
  (typeof HARDWARE_COMMAND_KEYS)[keyof typeof HARDWARE_COMMAND_KEYS];

export type HardwareCommandStatus = 'idle' | 'pending';
