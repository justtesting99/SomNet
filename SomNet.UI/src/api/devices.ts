import type { SubTargetName } from '@/config/sessionUsers';
import type {
  ActuatorKind,
  DeviceRegistration,
  DeviceStatusResponse,
  PairDeviceResponse,
  SendHardwareCommandResponse,
  UnpairedDeviceResponse,
} from '@/types/device';
import { apiFetch } from '@/api/client';

export async function fetchDeviceRegistrations(
  subTarget: SubTargetName,
): Promise<DeviceRegistration[]> {
  const params = new URLSearchParams({ subTarget });
  return apiFetch<DeviceRegistration[]>(`/api/devices/registrations?${params.toString()}`);
}

export async function fetchDeviceStatus(
  subTarget: SubTargetName,
  deviceId: string,
): Promise<DeviceStatusResponse> {
  const params = new URLSearchParams({ subTarget, deviceId });
  return apiFetch<DeviceStatusResponse>(`/api/devices/status?${params.toString()}`);
}

export async function fetchUnpairedDevices(): Promise<UnpairedDeviceResponse[]> {
  return apiFetch<UnpairedDeviceResponse[]>('/api/devices/unpaired');
}

export async function pairDevice(
  subTarget: SubTargetName,
  deviceId: string,
  actuatorKind: ActuatorKind = 'relay',
): Promise<PairDeviceResponse> {
  const params = new URLSearchParams({ subTarget });
  return apiFetch<PairDeviceResponse>(`/api/devices/pair?${params.toString()}`, {
    method: 'POST',
    body: JSON.stringify({ deviceId: deviceId.trim(), actuatorKind }),
  });
}

export async function revokeDevicePairing(
  subTarget: SubTargetName,
  deviceId: string,
): Promise<void> {
  const params = new URLSearchParams({ subTarget, deviceId });
  await apiFetch<void>(`/api/devices/pair?${params.toString()}`, {
    method: 'DELETE',
  });
}

export async function sendHardwareCommand(
  subTarget: SubTargetName,
  deviceId: string,
  commandKey: string,
  payloadJson: string,
  snapshotActionIndex?: number,
): Promise<SendHardwareCommandResponse> {
  return apiFetch<SendHardwareCommandResponse>('/api/devices/commands', {
    method: 'POST',
    body: JSON.stringify({
      subTarget,
      deviceId,
      commandKey,
      payloadJson,
      snapshotActionIndex,
    }),
  });
}
