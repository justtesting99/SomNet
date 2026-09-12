import { apiFetch } from '@/api/client';
import type { SubTargetName } from '@/config/sessionUsers';
import { isVideoConfigured } from '@/api/video';

export interface SessionActionSnapshot {
  id: number;
  sessionId: string;
  actionIndex: number;
  feed: string;
  imageUrl: string;
  capturedAt: string;
  commandKey?: string;
  correlationId?: string;
}

export interface CaptureSessionSnapshotsResponse {
  snapshots: SessionActionSnapshot[];
}

export async function captureSessionSnapshots(
  sessionId: string,
  subTarget: SubTargetName,
  actionIndex: number,
  commandKey: string,
): Promise<CaptureSessionSnapshotsResponse> {
  const params = new URLSearchParams({ subTarget });
  return apiFetch<CaptureSessionSnapshotsResponse>(
    `/api/video/sessions/${encodeURIComponent(sessionId)}/snapshots?${params.toString()}`,
    {
      method: 'POST',
      body: JSON.stringify({ actionIndex, commandKey }),
    },
  );
}

export async function fetchSessionSnapshots(
  sessionId: string,
): Promise<SessionActionSnapshot[]> {
  return apiFetch<SessionActionSnapshot[]>(
    `/api/video/sessions/${encodeURIComponent(sessionId)}/snapshots`,
  );
}

export function queueCaptureActionSnapshots(options: {
  sessionId: string;
  subTarget: SubTargetName;
  actionIndex: number;
  commandKey: string;
}): void {
  if (!isVideoConfigured()) {
    return;
  }

  void captureSessionSnapshots(
    options.sessionId,
    options.subTarget,
    options.actionIndex,
    options.commandKey,
  ).catch(() => {
    // Snapshots are best-effort; live feeds must not block on capture failures.
  });
}
