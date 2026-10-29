import type { SubTargetName } from '@/config/sessionUsers';
import type { PairingSettings } from '@/types/pairingSettings';

function cacheKey(subTarget: SubTargetName, deviceId: string): string {
  return `${subTarget}::${deviceId}`;
}

const settingsByDevice = new Map<string, PairingSettings>();

export function cacheDeviceSettings(
  subTarget: SubTargetName,
  deviceId: string,
  settings: PairingSettings,
): void {
  if (!deviceId) {
    return;
  }

  settingsByDevice.set(cacheKey(subTarget, deviceId), settings);
}

export function readCachedDeviceSettings(
  subTarget: SubTargetName,
  deviceId: string,
): PairingSettings | null {
  if (!deviceId) {
    return null;
  }

  return settingsByDevice.get(cacheKey(subTarget, deviceId)) ?? null;
}

/** Test helper */
export function clearDeviceSettingsCache(): void {
  settingsByDevice.clear();
}
