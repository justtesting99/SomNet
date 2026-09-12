import { describe, expect, it } from 'vitest';
import {
  computeFeedHideDeadlineMs,
  shouldHideFeedsAt,
} from '@/utils/videoFeedVisibility';

describe('computeFeedHideDeadlineMs', () => {
  it('adds clamped timeout seconds to now', () => {
    expect(computeFeedHideDeadlineMs(1_000, 10)).toBe(11_000);
    expect(computeFeedHideDeadlineMs(1_000, 3)).toBe(6_000);
  });
});

describe('shouldHideFeedsAt', () => {
  it('returns false when no deadline is set', () => {
    expect(shouldHideFeedsAt(5_000, null)).toBe(false);
  });

  it('returns true once the deadline is reached', () => {
    expect(shouldHideFeedsAt(10_000, 10_000)).toBe(true);
    expect(shouldHideFeedsAt(9_999, 10_000)).toBe(false);
  });
});
