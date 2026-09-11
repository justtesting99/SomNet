import type { OperationMode } from '@/types/modes';

export const OPERATION_MODE_STORAGE_KEY = 'somnet.operationMode';

const VALID_MODES = new Set<OperationMode>(['manual', 'automatic']);

export function isValidOperationMode(value: string): value is OperationMode {
  return VALID_MODES.has(value as OperationMode);
}

export function readLastOperationMode(): OperationMode | null {
  try {
    const stored = localStorage.getItem(OPERATION_MODE_STORAGE_KEY);
    if (stored && isValidOperationMode(stored)) {
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
      localStorage.removeItem(OPERATION_MODE_STORAGE_KEY);
      return;
    }

    localStorage.setItem(OPERATION_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage errors.
  }
}
