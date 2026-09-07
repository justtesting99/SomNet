import type { VideoExpandMode } from '@/types/videoDisplay';

export type MobileVideoExpandDefault = Exclude<VideoExpandMode, 'none'>;

export interface AppOptions {
  enableSoundAlerts: boolean;
  confirmBeforeCommands: boolean;
  autoExpandVideoOnMobile: boolean;
  mobileVideoExpandDefault: MobileVideoExpandDefault;
  showSessionTimestamps: boolean;
  operatorDisplayName: string;
  defaultNotesPrefix: string;
  reconnectIntervalSeconds: number;
}

export const MOBILE_VIDEO_EXPAND_OPTIONS: {
  value: MobileVideoExpandDefault;
  label: string;
}[] = [
  { value: 'both', label: 'Both feeds' },
  { value: 'monitor1', label: 'Feed 1' },
  { value: 'monitor2', label: 'Feed 2' },
];

export const DEFAULT_NOTIFICATIONS_APP_OPTIONS: Pick<
  AppOptions,
  'enableSoundAlerts' | 'showSessionTimestamps'
> = {
  enableSoundAlerts: true,
  showSessionTimestamps: true,
};

export const DEFAULT_GENERAL_APP_OPTIONS: Pick<
  AppOptions,
  | 'confirmBeforeCommands'
  | 'autoExpandVideoOnMobile'
  | 'mobileVideoExpandDefault'
  | 'reconnectIntervalSeconds'
  | 'operatorDisplayName'
  | 'defaultNotesPrefix'
> = {
  confirmBeforeCommands: false,
  autoExpandVideoOnMobile: true,
  mobileVideoExpandDefault: 'both',
  reconnectIntervalSeconds: 10,
  operatorDisplayName: '',
  defaultNotesPrefix: 'Session',
};

export const DEFAULT_APP_OPTIONS: AppOptions = {
  ...DEFAULT_NOTIFICATIONS_APP_OPTIONS,
  ...DEFAULT_GENERAL_APP_OPTIONS,
};
