import type { SubTargetName } from '@/config/sessionUsers';
import type { OperationMode } from '@/types/modes';
import { isValidOperationMode } from '@/config/operationMode';

const STORAGE_KEY = 'somnet-device-operation-mode';

type ModeStore = Record<string, OperationMode>;

function storeKey(domTarget: string, subTarget: SubTargetName, deviceId: string): string {
  return `${domTarget}::${subTarget}::${deviceId}`;
}

function readStore(): ModeStore {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as ModeStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: ModeStore): void {
  try {
    if (Object.keys(store).length === 0) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore quota errors.
  }
}

export function readDeviceOperationMode(
  domTarget: string,
  subTarget: SubTargetName,
  deviceId: string,
): OperationMode | null {
  if (!domTarget || !deviceId) {
    return null;
  }

  const value = readStore()[storeKey(domTarget, subTarget, deviceId)];
  if (value && isValidOperationMode(value)) {
    return value;
  }

  return null;
}

export function writeDeviceOperationMode(
  domTarget: string,
  subTarget: SubTargetName,
  deviceId: string,
  mode: OperationMode,
): void {
  if (!domTarget || !deviceId) {
    return;
  }

  const store = readStore();
  store[storeKey(domTarget, subTarget, deviceId)] = mode;
  writeStore(store);
}

export function clearDeviceOperationMode(
  domTarget: string,
  subTarget: SubTargetName,
  deviceId: string,
): void {
  if (!domTarget || !deviceId) {
    return;
  }

  const store = readStore();
  const key = storeKey(domTarget, subTarget, deviceId);
  if (!(key in store)) {
    return;
  }

  delete store[key];
  writeStore(store);
}

/** Test helper */
export function clearAllDeviceOperationModes(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
