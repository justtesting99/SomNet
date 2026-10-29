import type { SubTargetName } from '@/config/sessionUsers';

const STORAGE_KEY = 'somnet-automatic-device-running-by-device';

export interface AutomaticDeviceRunningHint {
  sessionId: string;
  subTarget: SubTargetName;
  deviceId: string;
}

type HintStore = Record<string, AutomaticDeviceRunningHint>;

function deviceHintKey(subTarget: SubTargetName, deviceId: string): string {
  return `${subTarget}::${deviceId}`;
}

function readStore(): HintStore {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as HintStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: HintStore): void {
  try {
    if (Object.keys(store).length === 0) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore quota / private mode errors.
  }
}

/** @deprecated Legacy single-key storage — cleared on read when migrating. */
const LEGACY_STORAGE_KEY = 'somnet-automatic-device-running';

function migrateLegacyHint(store: HintStore): HintStore {
  try {
    const raw = sessionStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) {
      return store;
    }

    sessionStorage.removeItem(LEGACY_STORAGE_KEY);
    const parsed = JSON.parse(raw) as Partial<AutomaticDeviceRunningHint>;
    if (
      typeof parsed.sessionId === 'string' &&
      typeof parsed.subTarget === 'string' &&
      typeof parsed.deviceId === 'string' &&
      parsed.deviceId.length > 0
    ) {
      const key = deviceHintKey(parsed.subTarget as SubTargetName, parsed.deviceId);
      return { ...store, [key]: parsed as AutomaticDeviceRunningHint };
    }
  } catch {
    sessionStorage.removeItem(LEGACY_STORAGE_KEY);
  }

  return store;
}

export function writeAutomaticDeviceRunningHint(hint: AutomaticDeviceRunningHint): void {
  if (!hint.deviceId) {
    return;
  }

  const store = migrateLegacyHint(readStore());
  const key = deviceHintKey(hint.subTarget, hint.deviceId);
  store[key] = hint;
  writeStore(store);
}

export function readAutomaticDeviceRunningHint(
  subTarget: SubTargetName,
  deviceId: string,
): AutomaticDeviceRunningHint | null {
  const store = migrateLegacyHint(readStore());
  return store[deviceHintKey(subTarget, deviceId)] ?? null;
}

export function clearAutomaticDeviceRunningHint(
  subTarget: SubTargetName,
  deviceId: string,
): void {
  if (!deviceId) {
    return;
  }

  const store = migrateLegacyHint(readStore());
  const key = deviceHintKey(subTarget, deviceId);
  if (!(key in store)) {
    return;
  }

  delete store[key];
  writeStore(store);
}

export function clearAllAutomaticDeviceRunningHints(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}

export function shouldRestoreAutomaticDeviceRunning(
  sessionId: string,
  subTarget: SubTargetName,
  deviceId: string,
): boolean {
  if (!deviceId) {
    return false;
  }

  const hint = readAutomaticDeviceRunningHint(subTarget, deviceId);
  if (hint === null) {
    return false;
  }

  return hint.sessionId === sessionId && hint.subTarget === subTarget && hint.deviceId === deviceId;
}
