const LEGACY_PREFIX = 'somnet-session-accessory';
const SCENE_PREFIX = 'somnet-scene-session';
const DEVICE_SCENE_PREFIX = 'somnet-device-scene-session';
const LEGACY_RELAY_LOCK_PREFIX = 'somnet-relay-lock';
const ACCESSORY_PREFIX = 'somnet-device-accessory';
const LEGACY_RELAY_DEVICE_SUFFIX = ':relay-device';

function legacyKey(domTarget: string, subTarget: string): string {
  return `${LEGACY_PREFIX}:${domTarget}:${subTarget}`;
}

function sceneKey(domTarget: string, subTarget: string): string {
  return `${SCENE_PREFIX}:${domTarget}:${subTarget}`;
}

function deviceSceneKey(domTarget: string, subTarget: string, deviceId: string): string {
  return `${DEVICE_SCENE_PREFIX}:${domTarget}:${subTarget}:${deviceId}`;
}

function legacyRelayLockKey(domTarget: string, subTarget: string): string {
  return `${LEGACY_RELAY_LOCK_PREFIX}:${domTarget}:${subTarget}`;
}

function legacyRelayDeviceKey(domTarget: string, subTarget: string): string {
  return `${legacyRelayLockKey(domTarget, subTarget)}${LEGACY_RELAY_DEVICE_SUFFIX}`;
}

function deviceAccessoryKey(domTarget: string, subTarget: string, deviceId: string): string {
  return `${ACCESSORY_PREFIX}:${domTarget}:${subTarget}:${deviceId}`;
}

const deviceSceneSessionListeners = new Set<() => void>();

/** Same-tab listeners (BroadcastChannel does not echo to the posting tab). */
export function subscribeDeviceSceneSessionStorage(listener: () => void): () => void {
  deviceSceneSessionListeners.add(listener);
  return () => {
    deviceSceneSessionListeners.delete(listener);
  };
}

function notifyDeviceSceneSessionStorage(): void {
  for (const listener of deviceSceneSessionListeners) {
    listener();
  }
}

function migrateLegacyIfNeeded(domTarget: string, subTarget: string): void {
  try {
    const legacy = sessionStorage.getItem(legacyKey(domTarget, subTarget));
    if (legacy === '1') {
      sessionStorage.setItem(sceneKey(domTarget, subTarget), '1');
      const boundRelay = sessionStorage.getItem(legacyRelayDeviceKey(domTarget, subTarget));
      if (boundRelay) {
        sessionStorage.setItem(deviceAccessoryKey(domTarget, subTarget, boundRelay), '1');
      } else {
        sessionStorage.setItem(legacyRelayLockKey(domTarget, subTarget), '1');
      }
      sessionStorage.removeItem(legacyKey(domTarget, subTarget));
      sessionStorage.removeItem(legacyRelayDeviceKey(domTarget, subTarget));
    }

    const legacyLock = sessionStorage.getItem(legacyRelayLockKey(domTarget, subTarget));
    if (legacyLock === '1') {
      const boundRelay = sessionStorage.getItem(legacyRelayDeviceKey(domTarget, subTarget));
      if (boundRelay) {
        sessionStorage.setItem(deviceAccessoryKey(domTarget, subTarget, boundRelay), '1');
      }
      sessionStorage.removeItem(legacyRelayLockKey(domTarget, subTarget));
      sessionStorage.removeItem(legacyRelayDeviceKey(domTarget, subTarget));
    }
  } catch {
    // ignore
  }
}

/** Copy Sub-wide scene flag (pre-V2) onto each device, then clear Sub-wide key. */
export function migrateSubSceneToDeviceIds(
  domTarget: string,
  subTarget: string,
  deviceIds: string[],
): void {
  if (typeof sessionStorage === 'undefined' || deviceIds.length === 0) {
    return;
  }

  try {
    migrateLegacyIfNeeded(domTarget, subTarget);
    if (sessionStorage.getItem(sceneKey(domTarget, subTarget)) !== '1') {
      return;
    }

    for (const deviceId of deviceIds) {
      sessionStorage.setItem(deviceSceneKey(domTarget, subTarget, deviceId), '1');
      notifyDeviceSceneSessionStorage();
    }
    sessionStorage.removeItem(sceneKey(domTarget, subTarget));
  } catch {
    // ignore
  }
}

export function readDeviceSceneSessionActive(
  domTarget: string,
  subTarget: string,
  deviceId: string | null | undefined,
): boolean {
  if (typeof sessionStorage === 'undefined' || !deviceId) {
    return false;
  }

  try {
    migrateLegacyIfNeeded(domTarget, subTarget);
    if (sessionStorage.getItem(deviceSceneKey(domTarget, subTarget, deviceId)) === '1') {
      return true;
    }

    return sessionStorage.getItem(sceneKey(domTarget, subTarget)) === '1';
  } catch {
    return false;
  }
}

export function writeDeviceSceneSessionActive(
  domTarget: string,
  subTarget: string,
  deviceId: string,
  active: boolean,
): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }

  try {
    const key = deviceSceneKey(domTarget, subTarget, deviceId);
    if (active) {
      sessionStorage.setItem(key, '1');
    } else {
      sessionStorage.removeItem(key);
    }

    notifyDeviceSceneSessionStorage();
  } catch {
    // ignore
  }
}

/** @deprecated Sub-wide scene — use readDeviceSceneSessionActive (V2). */
export function readSceneSessionActive(domTarget: string, subTarget: string): boolean {
  if (typeof sessionStorage === 'undefined') {
    return false;
  }

  try {
    migrateLegacyIfNeeded(domTarget, subTarget);
    return sessionStorage.getItem(sceneKey(domTarget, subTarget)) === '1';
  } catch {
    return false;
  }
}

/** @deprecated Sub-wide scene — use writeDeviceSceneSessionActive (V2). */
export function writeSceneSessionActive(
  domTarget: string,
  subTarget: string,
  active: boolean,
): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }

  try {
    const key = sceneKey(domTarget, subTarget);
    if (active) {
      sessionStorage.setItem(key, '1');
    } else {
      sessionStorage.removeItem(key);
    }

    notifyDeviceSceneSessionStorage();
  } catch {
    // ignore
  }
}

export function readDeviceAccessoryEngaged(
  domTarget: string,
  subTarget: string,
  deviceId: string | null | undefined,
): boolean {
  if (typeof sessionStorage === 'undefined' || !deviceId) {
    return false;
  }

  try {
    migrateLegacyIfNeeded(domTarget, subTarget);
    return sessionStorage.getItem(deviceAccessoryKey(domTarget, subTarget, deviceId)) === '1';
  } catch {
    return false;
  }
}

export function writeDeviceAccessoryEngaged(
  domTarget: string,
  subTarget: string,
  deviceId: string,
  engaged: boolean,
): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }

  try {
    const key = deviceAccessoryKey(domTarget, subTarget, deviceId);
    if (engaged) {
      sessionStorage.setItem(key, '1');
    } else {
      sessionStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

/** @deprecated Use readDeviceAccessoryEngaged */
export function readRelayLockEngaged(
  domTarget: string,
  subTarget: string,
  deviceId?: string | null,
): boolean {
  return readDeviceAccessoryEngaged(domTarget, subTarget, deviceId);
}

/** @deprecated Use writeDeviceAccessoryEngaged */
export function writeRelayLockEngaged(
  domTarget: string,
  subTarget: string,
  engaged: boolean,
  deviceId?: string | null,
): void {
  if (!deviceId) {
    return;
  }
  writeDeviceAccessoryEngaged(domTarget, subTarget, deviceId, engaged);
}

/** @deprecated Use readDeviceSceneSessionActive / readDeviceAccessoryEngaged */
export function readSessionAccessoryInProgress(
  domTarget: string,
  subTarget: string,
  deviceId?: string | null,
): boolean {
  return (
    readDeviceSceneSessionActive(domTarget, subTarget, deviceId) ||
    readDeviceAccessoryEngaged(domTarget, subTarget, deviceId)
  );
}

/** @deprecated */
export function writeSessionAccessoryInProgress(
  domTarget: string,
  subTarget: string,
  inProgress: boolean,
  deviceId?: string | null,
): void {
  if (deviceId) {
    writeDeviceSceneSessionActive(domTarget, subTarget, deviceId, inProgress);
  } else {
    writeSceneSessionActive(domTarget, subTarget, inProgress);
  }
  if (deviceId) {
    writeDeviceAccessoryEngaged(domTarget, subTarget, deviceId, inProgress);
  }
}
