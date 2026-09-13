import type { VideoSourcePair } from '@/config/videoSources';
import type { MobileVideoExpandDefault } from '@/types/options';

/** Apply Options → live video feeds (both | front | rear). */
export function applyLiveVideoFeedPreference(
  sources: VideoSourcePair,
  preference: MobileVideoExpandDefault,
): VideoSourcePair {
  switch (preference) {
    case 'monitor1':
      return [sources[0], undefined];
    case 'monitor2':
      return [undefined, sources[1]];
    default:
      return sources;
  }
}

export function isFrontLiveFeedEnabled(preference: MobileVideoExpandDefault): boolean {
  return preference !== 'monitor2';
}

export function isRearLiveFeedEnabled(preference: MobileVideoExpandDefault): boolean {
  return preference !== 'monitor1';
}

export function usesSingleLiveFeed(preference: MobileVideoExpandDefault): boolean {
  return isFrontLiveFeedEnabled(preference) !== isRearLiveFeedEnabled(preference);
}

export function normalizeMobileVideoExpandDefault(value: unknown): MobileVideoExpandDefault {
  if (value === 'monitor1' || value === 'Monitor1' || value === 1) {
    return 'monitor1';
  }
  if (value === 'monitor2' || value === 'Monitor2' || value === 2) {
    return 'monitor2';
  }
  return 'both';
}
