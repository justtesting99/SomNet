import { describe, expect, it } from 'vitest';
import {
  applyLiveVideoFeedPreference,
  areLiveVideoFeedsHidden,
  isFrontLiveFeedEnabled,
  isRearLiveFeedEnabled,
  normalizeLiveVideoFeeds,
  normalizeMobileVideoExpandDefault,
  usesSingleLiveFeed,
} from '@/utils/liveVideoFeedPreference';

const sources: [string, string] = [
  '/go2rtc/stream.html?src=front&token=front-token',
  '/go2rtc/stream.html?src=rear&token=rear-token',
];

describe('applyLiveVideoFeedPreference', () => {
  it('returns both feeds when preference is both', () => {
    expect(applyLiveVideoFeedPreference(sources, 'both')).toEqual(sources);
  });

  it('hides all feeds when preference is none', () => {
    expect(applyLiveVideoFeedPreference(sources, 'none')).toEqual([undefined, undefined]);
  });

  it('returns front only for monitor1', () => {
    expect(applyLiveVideoFeedPreference(sources, 'monitor1')).toEqual([
      sources[0],
      undefined,
    ]);
  });

  it('returns rear only for monitor2', () => {
    expect(applyLiveVideoFeedPreference(sources, 'monitor2')).toEqual([
      undefined,
      sources[1],
    ]);
  });
});

describe('feed enable helpers', () => {
  it('reflects front and rear availability per preference', () => {
    expect(isFrontLiveFeedEnabled('both')).toBe(true);
    expect(isRearLiveFeedEnabled('both')).toBe(true);
    expect(isFrontLiveFeedEnabled('monitor1')).toBe(true);
    expect(isRearLiveFeedEnabled('monitor1')).toBe(false);
    expect(isFrontLiveFeedEnabled('monitor2')).toBe(false);
    expect(isRearLiveFeedEnabled('monitor2')).toBe(true);
    expect(isFrontLiveFeedEnabled('none')).toBe(false);
    expect(isRearLiveFeedEnabled('none')).toBe(false);
    expect(areLiveVideoFeedsHidden('none')).toBe(true);
    expect(areLiveVideoFeedsHidden('both')).toBe(false);
  });

  it('detects single-feed mode', () => {
    expect(usesSingleLiveFeed('both')).toBe(false);
    expect(usesSingleLiveFeed('monitor1')).toBe(true);
    expect(usesSingleLiveFeed('monitor2')).toBe(true);
    expect(usesSingleLiveFeed('none')).toBe(false);
  });
});

describe('normalizeLiveVideoFeeds', () => {
  it('accepts camelCase, PascalCase, and enum integers from API', () => {
    expect(normalizeLiveVideoFeeds('none')).toBe('none');
    expect(normalizeLiveVideoFeeds('None')).toBe('none');
    expect(normalizeLiveVideoFeeds(0)).toBe('none');
    expect(normalizeLiveVideoFeeds('monitor2')).toBe('monitor2');
    expect(normalizeLiveVideoFeeds('Monitor2')).toBe('monitor2');
    expect(normalizeLiveVideoFeeds(2)).toBe('monitor2');
    expect(normalizeLiveVideoFeeds('both')).toBe('both');
    expect(normalizeLiveVideoFeeds(3)).toBe('both');
    expect(normalizeLiveVideoFeeds(undefined)).toBe('both');
  });
});

describe('normalizeMobileVideoExpandDefault', () => {
  it('maps none to both for mobile expand', () => {
    expect(normalizeMobileVideoExpandDefault('none')).toBe('both');
  });
});
