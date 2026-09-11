import { DEFAULT_SUB_TARGET, type SubTargetName } from '@/config/sessionUsers';

export const SELECTED_SUB_STORAGE_KEY = 'somnet.selectedSub';

export function readSelectedSub(): SubTargetName {
  try {
    const stored = localStorage.getItem(SELECTED_SUB_STORAGE_KEY);
    if (stored && stored.trim().length > 0) {
      return stored;
    }
  } catch {
    // Ignore storage errors.
  }

  return DEFAULT_SUB_TARGET;
}

export function writeSelectedSub(subTarget: SubTargetName): void {
  try {
    localStorage.setItem(SELECTED_SUB_STORAGE_KEY, subTarget);
  } catch {
    // Ignore storage errors.
  }
}
