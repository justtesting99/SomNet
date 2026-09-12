import type { SubTargetName } from '@/config/sessionUsers';

const STORAGE_KEY = 'somnet-automatic-device-running';

export interface AutomaticDeviceRunningHint {
  sessionId: string;
  subTarget: SubTargetName;
}

export function writeAutomaticDeviceRunningHint(hint: AutomaticDeviceRunningHint): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(hint));
  } catch {
    // Ignore quota / private mode errors.
  }
}

export function readAutomaticDeviceRunningHint(): AutomaticDeviceRunningHint | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<AutomaticDeviceRunningHint>;
    if (typeof parsed.sessionId !== 'string' || typeof parsed.subTarget !== 'string') {
      return null;
    }

    return {
      sessionId: parsed.sessionId,
      subTarget: parsed.subTarget as SubTargetName,
    };
  } catch {
    return null;
  }
}

export function clearAutomaticDeviceRunningHint(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}

export function shouldRestoreAutomaticDeviceRunning(
  sessionId: string,
  subTarget: SubTargetName,
): boolean {
  const hint = readAutomaticDeviceRunningHint();
  return hint !== null && hint.sessionId === sessionId && hint.subTarget === subTarget;
}
