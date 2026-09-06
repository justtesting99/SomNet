import type { SubTargetName } from '@/config/sessionUsers';
import type { PairingSettings } from '@/types/pairingSettings';
import type { StrokeMsLimits } from '@/utils/strokeMsLimits';
import { apiFetch } from '@/api/client';

interface PairingSettingsResponse {
  appOptions: PairingSettings['appOptions'];
  manual: PairingSettings['manual'];
  automatic: PairingSettings['automatic'];
}

function normalizeSettings(response: PairingSettingsResponse): PairingSettings {
  return {
    appOptions: response.appOptions,
    manual: response.manual,
    automatic: { ...response.automatic, running: false },
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
    }),
  });
  return normalizeSettings(response);
}
