import type { SubTargetName } from '@/config/sessionUsers';
import type { HistoryTimelineEntry, SessionHistoryEntry } from '@/types/sessionHistory';
import { apiFetch } from '@/api/client';

export async function fetchHistoryTimeline(
  domTarget: string,
  subTarget: SubTargetName,
  deviceId?: string | null,
): Promise<HistoryTimelineEntry[]> {
  const params = new URLSearchParams({
    domTarget,
    subTarget,
  });
  if (deviceId) {
    params.set('deviceId', deviceId);
  }

  return apiFetch<HistoryTimelineEntry[]>(`/api/history/timeline?${params.toString()}`);
}

export async function fetchSessionHistory(
  domTarget: string,
  subTarget?: SubTargetName,
  deviceId?: string | null,
): Promise<SessionHistoryEntry[]> {
  const params = new URLSearchParams({ domTarget });
  if (subTarget) {
    params.set('subTarget', subTarget);
  }
  if (deviceId) {
    params.set('deviceId', deviceId);
  }

  return apiFetch<SessionHistoryEntry[]>(`/api/history/sessions?${params.toString()}`);
}
