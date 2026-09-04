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

export const DEFAULT_APP_OPTIONS: AppOptions = {
  enableSoundAlerts: true,
  confirmBeforeCommands: false,
  autoExpandVideoOnMobile: true,
  mobileVideoExpandDefault: 'both',
  showSessionTimestamps: true,
  operatorDisplayName: '',
  defaultNotesPrefix: 'Session',
  reconnectIntervalSeconds: 10,
};
