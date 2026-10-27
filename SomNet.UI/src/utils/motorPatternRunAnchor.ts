import type { SubTargetName } from '@/config/sessionUsers';

const STORAGE_KEY = 'somnet-motor-pattern-run-anchor';

interface MotorPatternRunAnchor {
  subTarget: SubTargetName;
  deviceId: string;
  startedAtMs: number;
}

type AnchorStore = Record<string, MotorPatternRunAnchor>;

function anchorKey(subTarget: SubTargetName, deviceId: string): string {
  return `${subTarget}::${deviceId}`;
}

function readStore(): AnchorStore {
  if (typeof sessionStorage === 'undefined') {
    return {};
  }

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as AnchorStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: AnchorStore): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }

  try {
    if (Object.keys(store).length === 0) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

/** Graph time t=0 when the device automatic program started (UI Start / running true). */
export function writeMotorPatternRunAnchor(
  subTarget: SubTargetName,
  deviceId: string,
  startedAtMs = Date.now(),
): void {
  if (!deviceId) {
    return;
  }

  const store = readStore();
  store[anchorKey(subTarget, deviceId)] = { subTarget, deviceId, startedAtMs };
  writeStore(store);
}

export function readMotorPatternRunAnchor(
  subTarget: SubTargetName,
  deviceId: string,
): number | null {
  if (!deviceId) {
    return null;
  }

  const row = readStore()[anchorKey(subTarget, deviceId)];
  if (!row || row.subTarget !== subTarget || row.deviceId !== deviceId) {
    return null;
  }

  return typeof row.startedAtMs === 'number' && Number.isFinite(row.startedAtMs)
    ? row.startedAtMs
    : null;
}

export function clearMotorPatternRunAnchor(subTarget: SubTargetName, deviceId: string): void {
  if (!deviceId) {
    return;
  }

  const store = readStore();
  const key = anchorKey(subTarget, deviceId);
  if (!(key in store)) {
    return;
  }

  delete store[key];
  writeStore(store);
}
