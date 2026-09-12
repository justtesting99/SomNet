import { describe, expect, it } from 'vitest';
import {
  buildManualActivityKey,
  clampVideoFeedTimeoutSeconds,
  computeManualPreviewTimeoutSeconds,
  DEFAULT_VIDEO_FEED_TIMEOUT_SECONDS,
} from '@/utils/videoFeedTimeout';

describe('clampVideoFeedTimeoutSeconds', () => {
  it('defaults invalid values to 30 seconds', () => {
    expect(clampVideoFeedTimeoutSeconds(0)).toBe(DEFAULT_VIDEO_FEED_TIMEOUT_SECONDS);
    expect(clampVideoFeedTimeoutSeconds(Number.NaN)).toBe(DEFAULT_VIDEO_FEED_TIMEOUT_SECONDS);
  });

  it('clamps to configured bounds', () => {
    expect(clampVideoFeedTimeoutSeconds(3)).toBe(5);
    expect(clampVideoFeedTimeoutSeconds(45)).toBe(45);
    expect(clampVideoFeedTimeoutSeconds(999)).toBe(600);
  });
});

describe('computeManualPreviewTimeoutSeconds', () => {
  it('doubles the action timeout within clamp bounds', () => {
    expect(computeManualPreviewTimeoutSeconds(10)).toBe(20);
    expect(computeManualPreviewTimeoutSeconds(30)).toBe(60);
    expect(computeManualPreviewTimeoutSeconds(400)).toBe(600);
  });
});

describe('buildManualActivityKey', () => {
  it('includes session id, events, and abort count', () => {
    expect(buildManualActivityKey('sess-001', 2, 1)).toBe('sess-001:2:1');
  });
});
