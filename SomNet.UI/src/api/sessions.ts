import type { OperationMode } from '@/types/modes';
import type { SubTargetName } from '@/config/sessionUsers';
import type { SessionHistoryEntry } from '@/types/sessionHistory';
import { apiFetch, ApiError } from '@/api/client';
import { normalizeSessionMode } from '@/utils/sessionProgress';

function normalizeSessionEntry(entry: SessionHistoryEntry): SessionHistoryEntry {
  return {
    ...entry,
    mode: normalizeSessionMode(String(entry.mode)),
  };
}

export async function fetchActiveSession(
  subTarget: SubTargetName,
): Promise<SessionHistoryEntry | null> {
  const params = new URLSearchParams({ subTarget });

  try {
    const entry = await apiFetch<SessionHistoryEntry>(`/api/sessions/active?${params.toString()}`);
    return normalizeSessionEntry(entry);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }

    throw error;
  }
}

export async function startSession(
  subTarget: SubTargetName,
  mode: OperationMode,
): Promise<SessionHistoryEntry> {
  return apiFetch<SessionHistoryEntry>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ subTarget, mode }),
  });
}

export async function updateSession(
  sessionId: string,
  summary: string,
): Promise<SessionHistoryEntry> {
  return apiFetch<SessionHistoryEntry>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ summary }),
  });
}

export async function patchSessionMode(
  sessionId: string,
  mode: OperationMode,
): Promise<SessionHistoryEntry> {
  return apiFetch<SessionHistoryEntry>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ mode }),
  });
}

export async function endSession(sessionId: string, summary: string): Promise<SessionHistoryEntry> {
  return apiFetch<SessionHistoryEntry>(`/api/sessions/${encodeURIComponent(sessionId)}/end`, {
    method: 'POST',
    body: JSON.stringify({ summary }),
  });
}

/** P16 — remove placeholder row when Session in Progress ends with no strokes / no automatic Start. */
export async function discardInProgressSession(sessionId: string): Promise<void> {
  await apiFetch<void>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
}
