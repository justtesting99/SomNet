import { describe, expect, it } from 'vitest';
import {
  applyVideoFeedBandwidth,
  normalizeVideoFeedBandwidth,
  resolveStreamSrc,
} from '@/utils/videoFeedBandwidth';

describe('normalizeVideoFeedBandwidth', () => {
  it('defaults unknown values to high', () => {
    expect(normalizeVideoFeedBandwidth(undefined)).toBe('high');
    expect(normalizeVideoFeedBandwidth('invalid')).toBe('high');
  });

  it('normalizes medium and low', () => {
    expect(normalizeVideoFeedBandwidth('medium')).toBe('medium');
    expect(normalizeVideoFeedBandwidth('low')).toBe('low');
  });
});

describe('resolveStreamSrc', () => {
  it('returns base feed for high bandwidth', () => {
    expect(resolveStreamSrc('front', 'high')).toBe('front');
    expect(resolveStreamSrc('rear', 'high')).toBe('rear');
  });

  it('appends tier suffix for medium and low', () => {
    expect(resolveStreamSrc('front', 'medium')).toBe('front_medium');
    expect(resolveStreamSrc('rear', 'low')).toBe('rear_low');
  });
});

describe('applyVideoFeedBandwidth', () => {
  const frontUrl = '/go2rtc/stream.html?src=front&token=abc&mode=mse';

  it('leaves high-bandwidth URLs unchanged', () => {
    expect(applyVideoFeedBandwidth(frontUrl, 'high')).toBe(frontUrl);
  });

  it('rewrites src for medium and low', () => {
    expect(applyVideoFeedBandwidth(frontUrl, 'medium')).toBe(
      '/go2rtc/stream.html?src=front_medium&token=abc&mode=mse',
    );
    expect(applyVideoFeedBandwidth(frontUrl, 'low')).toBe(
      '/go2rtc/stream.html?src=front_low&token=abc&mode=mse',
    );
  });

  it('rewrites rear feeds', () => {
    const rearUrl = '/go2rtc/stream.html?src=rear&token=xyz';
    expect(applyVideoFeedBandwidth(rearUrl, 'low')).toBe(
      '/go2rtc/stream.html?src=rear_low&token=xyz',
    );
  });
});
