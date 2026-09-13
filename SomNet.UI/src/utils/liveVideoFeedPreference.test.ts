import { describe, expect, it } from 'vitest';
import {
  applyLiveVideoFeedPreference,
  isFrontLiveFeedEnabled,
  isRearLiveFeedEnabled,
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
  });

  it('detects single-feed mode', () => {
    expect(usesSingleLiveFeed('both')).toBe(false);
    expect(usesSingleLiveFeed('monitor1')).toBe(true);
    expect(usesSingleLiveFeed('monitor2')).toBe(true);
  });
});

describe('normalizeMobileVideoExpandDefault', () => {
  it('accepts camelCase, PascalCase, and enum integers from API', () => {
    expect(normalizeMobileVideoExpandDefault('monitor2')).toBe('monitor2');
    expect(normalizeMobileVideoExpandDefault('Monitor2')).toBe('monitor2');
    expect(normalizeMobileVideoExpandDefault(2)).toBe('monitor2');
    expect(normalizeMobileVideoExpandDefault('both')).toBe('both');
    expect(normalizeMobileVideoExpandDefault(undefined)).toBe('both');
  });
});
