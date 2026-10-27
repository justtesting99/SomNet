const LEGACY_PREFIX = 'somnet-session-accessory';
const SCENE_PREFIX = 'somnet-scene-session';
const RELAY_LOCK_PREFIX = 'somnet-relay-lock';
const RELAY_DEVICE_SUFFIX = ':relay-device';

function legacyKey(domTarget: string, subTarget: string): string {
  return `${LEGACY_PREFIX}:${domTarget}:${subTarget}`;
}

function sceneKey(domTarget: string, subTarget: string): string {
  return `${SCENE_PREFIX}:${domTarget}:${subTarget}`;
}

function relayLockKey(domTarget: string, subTarget: string): string {
  return `${RELAY_LOCK_PREFIX}:${domTarget}:${subTarget}`;
}

function relayDeviceKey(domTarget: string, subTarget: string): string {
  return `${relayLockKey(domTarget, subTarget)}${RELAY_DEVICE_SUFFIX}`;
}

function migrateLegacyIfNeeded(domTarget: string, subTarget: string): void {
  try {
    const legacy = sessionStorage.getItem(legacyKey(domTarget, subTarget));
    if (legacy !== '1') {
      return;
    }

    sessionStorage.setItem(sceneKey(domTarget, subTarget), '1');
    sessionStorage.setItem(relayLockKey(domTarget, subTarget), '1');
    const boundRelay = sessionStorage.getItem(`${legacyKey(domTarget, subTarget)}:relay-device`);
    if (boundRelay) {
      sessionStorage.setItem(relayDeviceKey(domTarget, subTarget), boundRelay);
    }
    sessionStorage.removeItem(legacyKey(domTarget, subTarget));
    sessionStorage.removeItem(`${legacyKey(domTarget, subTarget)}:relay-device`);
  } catch {
    // ignore
  }
}

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
  } catch {
    // ignore
  }
}

export function readRelayLockEngaged(
  domTarget: string,
  subTarget: string,
  relayDeviceId?: string | null,
): boolean {
  if (typeof sessionStorage === 'undefined') {
    return false;
  }

  try {
    migrateLegacyIfNeeded(domTarget, subTarget);
    const engaged = sessionStorage.getItem(relayLockKey(domTarget, subTarget)) === '1';
    if (!engaged) {
      return false;
    }

    if (!relayDeviceId) {
      return true;
    }

    const boundRelay = sessionStorage.getItem(relayDeviceKey(domTarget, subTarget));
    if (boundRelay && boundRelay !== relayDeviceId) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function writeRelayLockEngaged(
  domTarget: string,
  subTarget: string,
  engaged: boolean,
  relayDeviceId?: string | null,
): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }

  try {
    const key = relayLockKey(domTarget, subTarget);
    const relayKey = relayDeviceKey(domTarget, subTarget);
    if (engaged) {
      sessionStorage.setItem(key, '1');
      if (relayDeviceId) {
        sessionStorage.setItem(relayKey, relayDeviceId);
      }
    } else {
      sessionStorage.removeItem(key);
      sessionStorage.removeItem(relayKey);
    }
  } catch {
    // ignore
  }
}

/** @deprecated Use readSceneSessionActive / readRelayLockEngaged */
export function readSessionAccessoryInProgress(
  domTarget: string,
  subTarget: string,
  relayDeviceId?: string | null,
): boolean {
  return (
    readSceneSessionActive(domTarget, subTarget) ||
    readRelayLockEngaged(domTarget, subTarget, relayDeviceId)
  );
}

/** @deprecated Use writeSceneSessionActive / writeRelayLockEngaged */
export function writeSessionAccessoryInProgress(
  domTarget: string,
  subTarget: string,
  inProgress: boolean,
  relayDeviceId?: string | null,
): void {
  writeSceneSessionActive(domTarget, subTarget, inProgress);
  writeRelayLockEngaged(domTarget, subTarget, inProgress, relayDeviceId);
}
