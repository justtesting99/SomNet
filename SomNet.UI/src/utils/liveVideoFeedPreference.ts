import type { VideoSourcePair } from '@/config/videoSources';
import type { LiveVideoFeeds, MobileVideoExpandDefault } from '@/types/options';

/** Apply Options → live video feeds (none | both | front | rear). */
export function applyLiveVideoFeedPreference(
  sources: VideoSourcePair,
  preference: LiveVideoFeeds,
): VideoSourcePair {
  switch (preference) {
    case 'none':
      return [undefined, undefined];
    case 'monitor1':
      return [sources[0], undefined];
    case 'monitor2':
      return [undefined, sources[1]];
    default:
      return sources;
  }
}

export function isFrontLiveFeedEnabled(preference: LiveVideoFeeds): boolean {
  return preference !== 'none' && preference !== 'monitor2';
}

export function isRearLiveFeedEnabled(preference: LiveVideoFeeds): boolean {
  return preference !== 'none' && preference !== 'monitor1';
}

export function usesSingleLiveFeed(preference: LiveVideoFeeds): boolean {
  return isFrontLiveFeedEnabled(preference) !== isRearLiveFeedEnabled(preference);
}

export function areLiveVideoFeedsHidden(preference: LiveVideoFeeds): boolean {
  return preference === 'none';
}

export function normalizeLiveVideoFeeds(value: unknown): LiveVideoFeeds {
  if (value === 'none' || value === 'None' || value === 0) {
    return 'none';
  }
  if (value === 'monitor1' || value === 'Monitor1' || value === 1) {
    return 'monitor1';
  }
  if (value === 'monitor2' || value === 'Monitor2' || value === 2) {
    return 'monitor2';
  }
  if (value === 'both' || value === 'Both' || value === 3) {
    return 'both';
  }
  return 'both';
}

export function normalizeMobileVideoExpandDefault(value: unknown): MobileVideoExpandDefault {
  const normalized = normalizeLiveVideoFeeds(value);
  if (normalized === 'none') {
    return 'both';
  }
  return normalized;
}

/** Mobile expand must not use none — fall back to both. */
export function mobileExpandFromLiveFeeds(preference: LiveVideoFeeds): MobileVideoExpandDefault {
  if (preference === 'none') {
    return 'both';
  }
  return preference;
}
