import type { SubTargetName } from '@/config/sessionUsers';

export function sessionDeviceKey(subTarget: SubTargetName, deviceId: string): string {
  return `${subTarget}::${deviceId}`;
}

export function deviceIdFromSessionKey(subTarget: SubTargetName, key: string): string | null {
  const prefix = `${subTarget}::`;
  if (!key.startsWith(prefix)) {
    return null;
  }

  const deviceId = key.slice(prefix.length);
  return deviceId.length > 0 ? deviceId : null;
}
