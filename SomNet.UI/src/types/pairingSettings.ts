import { DEFAULT_APP_OPTIONS, type AppOptions } from '@/types/options';
import { defaultManualState, defaultAutomaticState, type ManualControlState, type AutomaticControlState } from '@/types/modes';
import {
  defaultMotorAutomaticState,
  defaultMotorManualState,
  type MotorAutomaticControlState,
  type MotorManualControlState,
} from '@/types/motorModes';

export interface VideoSettings {
  tunnelBaseUrl: string;
}

export interface PairingSettings {
  appOptions: AppOptions;
  manual: ManualControlState;
  automatic: AutomaticControlState;
  motorAutomatic: MotorAutomaticControlState;
  motorManual: MotorManualControlState;
  video: VideoSettings;
}

export const DEFAULT_VIDEO_SETTINGS: VideoSettings = {
  tunnelBaseUrl: '',
};

export const DEFAULT_PAIRING_SETTINGS: PairingSettings = {
  appOptions: DEFAULT_APP_OPTIONS,
  manual: defaultManualState,
  automatic: defaultAutomaticState,
  motorAutomatic: defaultMotorAutomaticState,
  motorManual: defaultMotorManualState,
  video: DEFAULT_VIDEO_SETTINGS,
};
