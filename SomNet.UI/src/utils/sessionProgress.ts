import type { SessionHistoryEntry } from '@/types/sessionHistory';

export function isSessionInProgress(summary: string): boolean {
  const trimmed = summary.trim();
  return (
    trimmed.toLowerCase() === 'in progress' ||
    trimmed.toLowerCase().startsWith('in progress:')
  );
}

/** Automatic sessions stay at the exact start summary until end. */
export function isRehydratableAutomaticSession(entry: SessionHistoryEntry): boolean {
  return entry.mode === 'automatic' && entry.summary.trim().toLowerCase() === 'in progress';
}

/** Manual sessions PATCH aggregated progress into the summary while in progress. */
export function isRehydratableManualSession(entry: SessionHistoryEntry): boolean {
  return entry.mode === 'manual' && isSessionInProgress(entry.summary);
}

export function normalizeSessionMode(mode: string): SessionHistoryEntry['mode'] {
  return mode.toLowerCase() === 'automatic' ? 'automatic' : 'manual';
}
