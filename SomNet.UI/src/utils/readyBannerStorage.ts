import type { SubTargetName } from '@/config/sessionUsers';

const DISMISS_PREFIX = 'somnet-ready-banner-dismissed';

function dismissKey(subTarget: SubTargetName): string {
  return `${DISMISS_PREFIX}:${subTarget}`;
}

export function readReadyBannerDismissed(subTarget: SubTargetName): boolean {
  if (typeof sessionStorage === 'undefined') {
    return false;
  }

  try {
    return sessionStorage.getItem(dismissKey(subTarget)) === '1';
  } catch {
    return false;
  }
}

export function writeReadyBannerDismissed(subTarget: SubTargetName, dismissed: boolean): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }

  try {
    const key = dismissKey(subTarget);
    if (dismissed) {
      sessionStorage.setItem(key, '1');
    } else {
      sessionStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

export function subTargetsMatch(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}
