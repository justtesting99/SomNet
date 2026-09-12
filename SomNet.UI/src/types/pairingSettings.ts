import { DEFAULT_APP_OPTIONS, type AppOptions } from '@/types/options';
import { defaultManualState, defaultAutomaticState, type ManualControlState, type AutomaticControlState } from '@/types/modes';

export interface VideoSettings {
  tunnelBaseUrl: string;
}

export interface PairingSettings {
  appOptions: AppOptions;
  manual: ManualControlState;
  automatic: AutomaticControlState;
  video: VideoSettings;
}

export const DEFAULT_VIDEO_SETTINGS: VideoSettings = {
  tunnelBaseUrl: '',
};

export const DEFAULT_PAIRING_SETTINGS: PairingSettings = {
  appOptions: DEFAULT_APP_OPTIONS,
  manual: defaultManualState,
  automatic: defaultAutomaticState,
  video: DEFAULT_VIDEO_SETTINGS,
};
