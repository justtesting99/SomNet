import type { VideoExpandMode } from '@/types/videoDisplay';

export type MobileVideoExpandDefault = Exclude<VideoExpandMode, 'none'>;

export type ActionSnapshotFeeds = 'both' | 'rear';

export interface AppOptions {
  enableSoundAlerts: boolean;
  confirmBeforeCommands: boolean;
  allowAutomaticModeOverrides: boolean;
  autoExpandVideoOnMobile: boolean;
  mobileVideoExpandDefault: MobileVideoExpandDefault;
  showSessionTimestamps: boolean;
  operatorDisplayName: string;
  defaultNotesPrefix: string;
  reconnectIntervalSeconds: number;
  videoFeedTimeoutSeconds: number;
  actionSnapshotFeeds: ActionSnapshotFeeds;
}

export const MOBILE_VIDEO_EXPAND_OPTIONS: {
  value: MobileVideoExpandDefault;
  label: string;
}[] = [
  { value: 'both', label: 'Both (front + rear)' },
  { value: 'monitor1', label: 'Front only' },
  { value: 'monitor2', label: 'Rear only' },
];

export const ACTION_SNAPSHOT_FEED_OPTIONS: {
  value: ActionSnapshotFeeds;
  label: string;
}[] = [
  { value: 'both', label: 'Front and rear' },
  { value: 'rear', label: 'Rear only' },
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
  | 'allowAutomaticModeOverrides'
  | 'autoExpandVideoOnMobile'
  | 'mobileVideoExpandDefault'
  | 'reconnectIntervalSeconds'
  | 'videoFeedTimeoutSeconds'
  | 'actionSnapshotFeeds'
  | 'operatorDisplayName'
  | 'defaultNotesPrefix'
> = {
  confirmBeforeCommands: false,
  allowAutomaticModeOverrides: false,
  autoExpandVideoOnMobile: true,
  mobileVideoExpandDefault: 'both',
  reconnectIntervalSeconds: 10,
  videoFeedTimeoutSeconds: 30,
  actionSnapshotFeeds: 'both',
  operatorDisplayName: '',
  defaultNotesPrefix: 'Session',
};

export const DEFAULT_APP_OPTIONS: AppOptions = {
  ...DEFAULT_NOTIFICATIONS_APP_OPTIONS,
  ...DEFAULT_GENERAL_APP_OPTIONS,
};
