import type { SubTargetName } from '@/config/sessionUsers';
import type {
  DeviceStatusResponse,
  PairDeviceResponse,
  SendHardwareCommandResponse,
  UnpairedDeviceResponse,
} from '@/types/device';
import { apiFetch } from '@/api/client';

export async function fetchDeviceStatus(subTarget: SubTargetName): Promise<DeviceStatusResponse> {
  const params = new URLSearchParams({ subTarget });
  return apiFetch<DeviceStatusResponse>(`/api/devices/status?${params.toString()}`);
}

export async function fetchUnpairedDevices(): Promise<UnpairedDeviceResponse[]> {
  return apiFetch<UnpairedDeviceResponse[]>('/api/devices/unpaired');
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

export async function sendHardwareCommand(
  subTarget: SubTargetName,
  commandKey: string,
  payloadJson: string,
): Promise<SendHardwareCommandResponse> {
  return apiFetch<SendHardwareCommandResponse>('/api/devices/commands', {
    method: 'POST',
    body: JSON.stringify({
      subTarget,
      commandKey,
      payloadJson,
    }),
  });
}
