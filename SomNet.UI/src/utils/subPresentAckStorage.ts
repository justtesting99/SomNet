import type { SubTargetName } from '@/config/sessionUsers';

const STORAGE_PREFIX = 'somnet-sub-present-ack';
const DEVICE_STORAGE_PREFIX = 'somnet-device-present-ack';

function storageKey(subTarget: SubTargetName): string {
  return `${STORAGE_PREFIX}:${subTarget.trim().toLowerCase()}`;
}

function deviceStorageKey(subTarget: SubTargetName, deviceId: string): string {
  return `${DEVICE_STORAGE_PREFIX}:${subTarget.trim().toLowerCase()}:${deviceId.trim()}`;
}

/** @deprecated V1 Sub-wide ack — use readDevicePresentAck (V2). */
export function readSubPresentAck(subTarget: SubTargetName): boolean {
  if (typeof sessionStorage === 'undefined') {
    return false;
  }

  try {
    return sessionStorage.getItem(storageKey(subTarget)) === '1';
  } catch {
    return false;
  }
}

/** @deprecated V1 Sub-wide ack — use writeDevicePresentAck (V2). */
export function writeSubPresentAck(subTarget: SubTargetName, acknowledged: boolean): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }

  try {
    const key = storageKey(subTarget);
    if (acknowledged) {
      sessionStorage.setItem(key, '1');
    } else {
      sessionStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

/** Copy legacy Sub-wide ack onto each device once, then clear Sub-wide key. */
export function migrateSubPresentAckToDeviceIds(
  subTarget: SubTargetName,
  deviceIds: string[],
): void {
  if (typeof sessionStorage === 'undefined' || deviceIds.length === 0) {
    return;
  }

  try {
    if (!readSubPresentAck(subTarget)) {
      return;
    }

    for (const deviceId of deviceIds) {
      sessionStorage.setItem(deviceStorageKey(subTarget, deviceId), '1');
    }
    sessionStorage.removeItem(storageKey(subTarget));
  } catch {
    // ignore
  }
}

export function readDevicePresentAck(
  subTarget: SubTargetName,
  deviceId: string | null | undefined,
): boolean {
  if (typeof sessionStorage === 'undefined' || !deviceId) {
    return false;
  }

  try {
    if (sessionStorage.getItem(deviceStorageKey(subTarget, deviceId)) === '1') {
      return true;
    }

    return readSubPresentAck(subTarget);
  } catch {
    return false;
  }
}

export function writeDevicePresentAck(
  subTarget: SubTargetName,
  deviceId: string,
  acknowledged: boolean,
): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }

  try {
    const key = deviceStorageKey(subTarget, deviceId);
    if (acknowledged) {
      sessionStorage.setItem(key, '1');
    } else {
      sessionStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}
