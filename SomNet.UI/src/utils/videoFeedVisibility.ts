import { clampVideoFeedTimeoutSeconds } from '@/utils/videoFeedTimeout';

export const FEED_HIDE_CHECK_INTERVAL_MS = 250;

export function computeFeedHideDeadlineMs(
  nowMs: number,
  timeoutSeconds: number,
): number {
  return nowMs + clampVideoFeedTimeoutSeconds(timeoutSeconds) * 1000;
}

export function shouldHideFeedsAt(nowMs: number, hideAtMs: number | null): boolean {
  return hideAtMs !== null && nowMs >= hideAtMs;
}
