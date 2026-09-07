import type { OperationMode } from '@/types/modes';

const STORAGE_KEY = 'somnet.operationMode';

const VALID_MODES = new Set<OperationMode>(['manual', 'automatic']);

export function readLastOperationMode(): OperationMode | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && VALID_MODES.has(stored as OperationMode)) {
      return stored as OperationMode;
    }
  } catch {
    // Ignore storage errors and fall back to the mode picker.
  }

  return null;
}

export function writeLastOperationMode(mode: OperationMode | null): void {
  try {
    if (mode === null) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Ignore storage errors.
  }
}
