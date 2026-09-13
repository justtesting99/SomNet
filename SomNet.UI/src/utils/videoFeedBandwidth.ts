import type { VideoSourcePair } from '@/config/videoSources';

export type VideoFeedBandwidth = 'high' | 'medium' | 'low';

export const VIDEO_FEED_BANDWIDTH_OPTIONS: {
  value: VideoFeedBandwidth;
  label: string;
}[] = [
  { value: 'high', label: 'High (native webcam)' },
  { value: 'medium', label: 'Medium (~720p / 1.5 Mbps)' },
  { value: 'low', label: 'Low (~360p / 500 kbps)' },
];

export function normalizeVideoFeedBandwidth(value: unknown): VideoFeedBandwidth {
  if (value === 'medium' || value === 'Medium') {
    return 'medium';
  }
  if (value === 'low' || value === 'Low') {
    return 'low';
  }
  return 'high';
}

export function resolveStreamSrc(
  baseFeed: 'front' | 'rear',
  bandwidth: VideoFeedBandwidth,
): string {
  if (bandwidth === 'high') {
    return baseFeed;
  }
  return `${baseFeed}_${bandwidth}`;
}

/** Rewrite go2rtc embed URL src= for medium/low bandwidth tiers. */
export function applyVideoFeedBandwidth(
  url: string,
  bandwidth: VideoFeedBandwidth,
): string {
  if (bandwidth === 'high' || !url) {
    return url;
  }

  const match = /([?&])src=(front|rear)(?=&|$|[#?])/i.exec(url);
  if (!match) {
    return url;
  }

  const joiner = match[1];
  const baseFeed = match[2].toLowerCase() as 'front' | 'rear';
  const nextSrc = resolveStreamSrc(baseFeed, bandwidth);
  return url.replace(`${joiner}src=${match[2]}`, `${joiner}src=${nextSrc}`);
}

export function applyVideoFeedBandwidthToPair(
  sources: VideoSourcePair,
  bandwidth: VideoFeedBandwidth,
): VideoSourcePair {
  return [
    sources[0] ? applyVideoFeedBandwidth(sources[0], bandwidth) : undefined,
    sources[1] ? applyVideoFeedBandwidth(sources[1], bandwidth) : undefined,
  ];
}
