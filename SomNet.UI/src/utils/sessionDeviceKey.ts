import type { SubTargetName } from '@/config/sessionUsers';

export function sessionDeviceKey(subTarget: SubTargetName, deviceId: string): string {
  return `${subTarget}::${deviceId}`;
}
