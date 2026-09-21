import type { SubTargetName } from '@/config/sessionUsers';

const STORAGE_PREFIX = 'somnet-sub-present-ack';

function storageKey(subTarget: SubTargetName): string {
  return `${STORAGE_PREFIX}:${subTarget}`;
}

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
