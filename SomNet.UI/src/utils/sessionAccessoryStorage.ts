const STORAGE_PREFIX = 'somnet-session-accessory';

function storageKey(domTarget: string, subTarget: string): string {
  return `${STORAGE_PREFIX}:${domTarget}:${subTarget}`;
}

export function readSessionAccessoryInProgress(
  domTarget: string,
  subTarget: string,
): boolean {
  if (typeof sessionStorage === 'undefined') {
    return false;
  }

  try {
    return sessionStorage.getItem(storageKey(domTarget, subTarget)) === '1';
  } catch {
    return false;
  }
}

export function writeSessionAccessoryInProgress(
  domTarget: string,
  subTarget: string,
  inProgress: boolean,
): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }

  try {
    const key = storageKey(domTarget, subTarget);
    if (inProgress) {
      sessionStorage.setItem(key, '1');
    } else {
      sessionStorage.removeItem(key);
    }
  } catch {
    // ignore quota / private mode
  }
}
