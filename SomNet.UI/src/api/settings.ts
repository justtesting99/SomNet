import type { SubTargetName } from '@/config/sessionUsers';
import type { PairingSettings } from '@/types/pairingSettings';
import { DEFAULT_VIDEO_SETTINGS } from '@/types/pairingSettings';
import {
  DEFAULT_APP_OPTIONS,
  type ActionSnapshotFeeds,
  type AppOptions,
} from '@/types/options';
import type { StrokeMsLimits } from '@/utils/strokeMsLimits';
import { clampVideoFeedTimeoutSeconds } from '@/utils/videoFeedTimeout';
import { apiFetch } from '@/api/client';

interface PairingSettingsResponse {
  appOptions: PairingSettings['appOptions'];
  manual: PairingSettings['manual'];
  automatic: PairingSettings['automatic'];
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
  };
}

function normalizeSettings(response: PairingSettingsResponse): PairingSettings {
  return {
    appOptions: normalizeAppOptions(response.appOptions),
    manual: response.manual,
    automatic: { ...response.automatic, running: false },
    video: response.video ?? DEFAULT_VIDEO_SETTINGS,
  };
}

export async function fetchPairingSettings(subTarget: SubTargetName): Promise<PairingSettings> {
  const params = new URLSearchParams({ subTarget });
  const response = await apiFetch<PairingSettingsResponse>(`/api/settings?${params.toString()}`);
  return normalizeSettings(response);
}

export async function fetchStrokeLimits(): Promise<StrokeMsLimits> {
  return apiFetch<StrokeMsLimits>('/api/settings/stroke-limits');
}

export async function savePairingSettings(
  subTarget: SubTargetName,
  settings: PairingSettings,
): Promise<PairingSettings> {
  const params = new URLSearchParams({ subTarget });
  const response = await apiFetch<PairingSettingsResponse>(`/api/settings?${params.toString()}`, {
    method: 'PUT',
    body: JSON.stringify({
      appOptions: settings.appOptions,
      manual: settings.manual,
      automatic: { ...settings.automatic, running: false },
      video: settings.video,
    }),
  });
  return normalizeSettings(response);
}
