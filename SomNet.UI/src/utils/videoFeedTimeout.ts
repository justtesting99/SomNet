export const DEFAULT_VIDEO_FEED_TIMEOUT_SECONDS = 30;
export const MIN_VIDEO_FEED_TIMEOUT_SECONDS = 5;
export const MAX_VIDEO_FEED_TIMEOUT_SECONDS = 600;

export function clampVideoFeedTimeoutSeconds(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_VIDEO_FEED_TIMEOUT_SECONDS;
  }

  return Math.min(
    MAX_VIDEO_FEED_TIMEOUT_SECONDS,
    Math.max(MIN_VIDEO_FEED_TIMEOUT_SECONDS, Math.trunc(value)),
  );
}

/** "Start feeds" preview uses 2× the configured action timeout (same clamp bounds). */
export function computeManualPreviewTimeoutSeconds(actionTimeoutSeconds: number): number {
  const base = clampVideoFeedTimeoutSeconds(actionTimeoutSeconds);
  return clampVideoFeedTimeoutSeconds(base * 2);
}

export const computeVideoPreviewTimeoutSeconds = computeManualPreviewTimeoutSeconds;

export function buildManualActivityKey(
  sessionId: string,
  eventCount: number,
  abortCount: number,
): string {
  return `${sessionId}:${eventCount}:${abortCount}`;
}
