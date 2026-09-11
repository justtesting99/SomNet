/** Live iframe URLs for dashboard monitors (Phase 2 — env; Phase 3 — session tokens).
 *  Use same-origin paths (/go2rtc/...) so embedded players can autoplay; direct :1984 iframes fail on Windows. */

export type VideoSourcePair = [string | undefined, string | undefined];

/**
 * Default viewer mode for go2rtc stream.html (Chrome/Edge on Windows).
 * Do not use hls alone — browsers without native HLS leave no active player (camera on/off, blank page).
 * Override: VITE_VIDEO_VIEWER_MODE (mse | webrtc | webrtc,mse | hls on Safari, etc.).
 */
export const DEFAULT_GO2RTC_VIEWER_MODE = 'mse';

/** Stagger rear iframe so the shared camera producer starts cleanly (ms). */
export const REAR_VIDEO_LOAD_DELAY_MS = 800;

export function getGo2RtcViewerMode(): string {
  const mode = import.meta.env.VITE_VIDEO_VIEWER_MODE?.trim();
  return mode && mode.length > 0 ? mode : DEFAULT_GO2RTC_VIEWER_MODE;
}

export function withGo2RtcViewerMode(url: string, mode = getGo2RtcViewerMode()): string {
  if (/[?&]mode=/i.test(url)) {
    return url;
  }
  const joiner = url.includes('?') ? '&' : '?';
  return `${url}${joiner}mode=${mode}`;
}

function readEnvUrl(key: keyof ImportMetaEnv): string | undefined {
  const raw = import.meta.env[key];
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  return withGo2RtcViewerMode(trimmed);
}

/** Monitor 1 = front, Monitor 2 = rear. Empty when env unset (placeholder UI). */
export function getDashboardVideoSources(): VideoSourcePair {
  return [readEnvUrl('VITE_VIDEO_FRONT_URL'), readEnvUrl('VITE_VIDEO_REAR_URL')];
}
