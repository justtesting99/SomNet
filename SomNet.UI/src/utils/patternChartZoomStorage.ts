const STORAGE_PREFIX = 'somnet-pattern-chart-window-sec:';
const FIT_VALUE = 'fit';

function storageKey(deviceId: string): string {
  return `${STORAGE_PREFIX}${deviceId}`;
}

/** Persisted visible window in seconds, or null = fit full horizon. */
export function readPatternChartWindowSec(deviceId: string): number | null {
  if (!deviceId || typeof localStorage === 'undefined') {
    return null;
  }

  try {
    const raw = localStorage.getItem(storageKey(deviceId));
    if (raw == null || raw === FIT_VALUE) {
      return null;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writePatternChartWindowSec(deviceId: string, windowSec: number | null): void {
  if (!deviceId || typeof localStorage === 'undefined') {
    return;
  }

  try {
    if (windowSec == null) {
      localStorage.setItem(storageKey(deviceId), FIT_VALUE);
      return;
    }
    localStorage.setItem(storageKey(deviceId), String(windowSec));
  } catch {
    // ignore
  }
}
