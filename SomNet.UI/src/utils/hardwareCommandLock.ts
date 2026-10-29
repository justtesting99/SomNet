import type { HardwareCommandKey } from '@/types/hardwareCommand';

export function hardwareCommandLockKey(
  deviceId: string,
  commandKey: HardwareCommandKey,
): string {
  return `${deviceId}::${commandKey}`;
}

export function isRemoteLockForCommand(
  remoteLockKeys: ReadonlySet<string>,
  deviceId: string,
  commandKey: HardwareCommandKey,
): boolean {
  const scoped = hardwareCommandLockKey(deviceId, commandKey);
  if (remoteLockKeys.has(scoped)) {
    return true;
  }

  // Legacy tab-sync payloads used bare command keys (pre device scope).
  return remoteLockKeys.has(commandKey);
}

export function hasRemoteLockForDevice(
  remoteLockKeys: ReadonlySet<string>,
  deviceId: string,
): boolean {
  const prefix = `${deviceId}::`;
  for (const key of remoteLockKeys) {
    if (key.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

/** Device ids with at least one remote tab-sync command lock (subset of known roster). */
export function remoteLockedDeviceIds(
  remoteLockKeys: ReadonlySet<string>,
  knownDeviceIds: readonly string[],
): string[] {
  return knownDeviceIds.filter((deviceId) => hasRemoteLockForDevice(remoteLockKeys, deviceId));
}
