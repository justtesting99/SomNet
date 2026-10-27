import type { SubTargetName } from '@/config/sessionUsers';
import type { PairingSettings } from '@/types/pairingSettings';
import { DEFAULT_PAIRING_SETTINGS, DEFAULT_VIDEO_SETTINGS } from '@/types/pairingSettings';
import {
  DEFAULT_APP_OPTIONS,
  type ActionSnapshotFeeds,
  type AppOptions,
} from '@/types/options';
import type { StrokeMsLimits } from '@/utils/strokeMsLimits';
import { clampVideoFeedTimeoutSeconds } from '@/utils/videoFeedTimeout';
import { normalizeMobileVideoExpandDefault } from '@/utils/liveVideoFeedPreference';
import { normalizeVideoFeedBandwidth } from '@/utils/videoFeedBandwidth';
import { apiFetch } from '@/api/client';
import { normalizeMotorAutomaticControlState } from '@/utils/motorAutomaticFieldRules';

interface PairingSettingsResponse {
  appOptions: PairingSettings['appOptions'];
  manual: PairingSettings['manual'];
  automatic: PairingSettings['automatic'];
  motorAutomatic?: PairingSettings['motorAutomatic'];
  video?: PairingSettings['video'];
}

function normalizeActionSnapshotFeeds(value: unknown): ActionSnapshotFeeds {
  return value === 'rear' ? 'rear' : 'both';
}

function normalizeAppOptions(appOptions: PairingSettingsResponse['appOptions']): AppOptions {
  return {
    ...DEFAULT_APP_OPTIONS,
    ...appOptions,
    videoFeedTimeoutSeconds: clampVideoFeedTimeoutSeconds(
      appOptions.videoFeedTimeoutSeconds ?? DEFAULT_APP_OPTIONS.videoFeedTimeoutSeconds,
    ),
    actionSnapshotFeeds: normalizeActionSnapshotFeeds(appOptions.actionSnapshotFeeds),
    mobileVideoExpandDefault: normalizeMobileVideoExpandDefault(
      appOptions.mobileVideoExpandDefault,
    ),
    videoFeedBandwidth: normalizeVideoFeedBandwidth(appOptions.videoFeedBandwidth),
  };
}

function normalizeSettings(response: PairingSettingsResponse): PairingSettings {
  return {
    appOptions: normalizeAppOptions(response.appOptions),
    manual: response.manual,
    automatic: { ...response.automatic, running: false },
    motorAutomatic: normalizeMotorAutomaticControlState(
      response.motorAutomatic ?? DEFAULT_PAIRING_SETTINGS.motorAutomatic,
    ),
    video: response.video ?? DEFAULT_VIDEO_SETTINGS,
  };
}

export async function fetchPairingSettings(
  subTarget: SubTargetName,
  deviceId: string,
): Promise<PairingSettings> {
  const params = new URLSearchParams({ subTarget, deviceId });
  const response = await apiFetch<PairingSettingsResponse>(`/api/settings?${params.toString()}`);
  return normalizeSettings(response);
}

export async function fetchStrokeLimits(): Promise<StrokeMsLimits> {
  return apiFetch<StrokeMsLimits>('/api/settings/stroke-limits');
}

export async function savePairingSettings(
  subTarget: SubTargetName,
  deviceId: string,
  settings: PairingSettings,
): Promise<PairingSettings> {
  const params = new URLSearchParams({ subTarget, deviceId });
  const response = await apiFetch<PairingSettingsResponse>(`/api/settings?${params.toString()}`, {
    method: 'PUT',
    body: JSON.stringify({
      appOptions: settings.appOptions,
      manual: settings.manual,
      automatic: { ...settings.automatic, running: false },
      motorAutomatic: { ...settings.motorAutomatic, running: false },
      video: settings.video,
    }),
  });
  return normalizeSettings(response);
}
