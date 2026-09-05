import type { SubTargetName } from '@/config/sessionUsers';
import type { DeviceStatusResponse, PairDeviceResponse } from '@/types/device';
import { apiFetch } from '@/api/client';

export async function fetchDeviceStatus(subTarget: SubTargetName): Promise<DeviceStatusResponse> {
  const params = new URLSearchParams({ subTarget });
  return apiFetch<DeviceStatusResponse>(`/api/devices/status?${params.toString()}`);
}

export async function pairDevice(
  subTarget: SubTargetName,
  deviceId: string,
): Promise<PairDeviceResponse> {
  const params = new URLSearchParams({ subTarget });
  return apiFetch<PairDeviceResponse>(`/api/devices/pair?${params.toString()}`, {
    method: 'POST',
    body: JSON.stringify({ deviceId: deviceId.trim() }),
  });
}

export async function revokeDevicePairing(subTarget: SubTargetName): Promise<void> {
  const params = new URLSearchParams({ subTarget });
  await apiFetch<void>(`/api/devices/pair?${params.toString()}`, {
    method: 'DELETE',
  });
}
