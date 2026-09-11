import { describe, expect, it } from 'vitest';
import {
  getDashboardVideoSources,
  withGo2RtcViewerMode,
} from '@/config/videoSources';

describe('withGo2RtcViewerMode', () => {
  it('appends viewer mode when missing', () => {
    const url = withGo2RtcViewerMode('http://localhost:1984/stream.html?src=front', 'webrtc');
    expect(url).toBe('http://localhost:1984/stream.html?src=front&mode=webrtc');
  });

  it('does not override existing mode', () => {
    expect(withGo2RtcViewerMode('http://localhost:1984/stream.html?src=front&mode=mse', 'webrtc')).toBe(
      'http://localhost:1984/stream.html?src=front&mode=mse',
    );
  });
});

describe('getDashboardVideoSources', () => {
  it('returns front and rear URLs with viewer mode applied', () => {
    const [front, rear] = getDashboardVideoSources();
    if (front) {
      expect(front).toMatch(/mode=(webrtc|hls|mse|mp4|mjpeg)/);
    }
    if (rear) {
      expect(rear).toMatch(/mode=(webrtc|hls|mse|mp4|mjpeg)/);
    }
  });
});
