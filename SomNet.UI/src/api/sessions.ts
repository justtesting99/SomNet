import type { OperationMode } from '@/types/modes';
import type { SubTargetName } from '@/config/sessionUsers';
import type { SessionHistoryEntry } from '@/types/sessionHistory';
import { apiFetch } from '@/api/client';

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

export async function endSession(sessionId: string, summary: string): Promise<SessionHistoryEntry> {
  return apiFetch<SessionHistoryEntry>(`/api/sessions/${encodeURIComponent(sessionId)}/end`, {
    method: 'POST',
    body: JSON.stringify({ summary }),
  });
}
