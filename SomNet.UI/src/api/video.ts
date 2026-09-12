import { apiFetch, ApiError } from '@/api/client';
import type { SubTargetName } from '@/config/sessionUsers';

export interface VideoStreamFeedToken {
  feed: string;
  token: string;
  url: string;
  expiresAt: string;
}

export interface SessionVideoTokensResponse {
  front: VideoStreamFeedToken;
  rear: VideoStreamFeedToken;
}

export async function fetchSessionVideoTokens(
  sessionId: string,
  subTarget: SubTargetName,
): Promise<SessionVideoTokensResponse> {
  const params = new URLSearchParams({ subTarget });
  return apiFetch<SessionVideoTokensResponse>(
    `/api/video/sessions/${encodeURIComponent(sessionId)}/tokens?${params.toString()}`,
    { method: 'POST' },
  );
}

export function isVideoConfigured(): boolean {
  const front = import.meta.env.VITE_VIDEO_FRONT_URL?.trim();
  return Boolean(front);
}

export async function fetchSessionVideoTokensSafe(
  sessionId: string,
  subTarget: SubTargetName,
): Promise<SessionVideoTokensResponse | null> {
  if (!isVideoConfigured()) {
    return null;
  }

  try {
    return await fetchSessionVideoTokens(sessionId, subTarget);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
      return null;
    }

    throw error;
  }
}
