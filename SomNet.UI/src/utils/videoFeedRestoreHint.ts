import type { SubTargetName } from '@/config/sessionUsers';
import type { OperationMode } from '@/types/modes';

const STORAGE_KEY_PREFIX = 'somnet-video-feed-restore';

export interface VideoFeedRestoreHint {
  sessionId: string;
  subTarget: SubTargetName;
  deviceId: string;
  mode: OperationMode;
  /** True when feeds were started via Start feeds preview (2× timeout on restore). */
  preview: boolean;
}

function storageKey(deviceId: string): string {
  return `${STORAGE_KEY_PREFIX}::${deviceId}`;
}

export function writeVideoFeedRestoreHint(hint: VideoFeedRestoreHint): void {
  try {
    sessionStorage.setItem(storageKey(hint.deviceId), JSON.stringify(hint));
  } catch {
    // Ignore quota / private mode errors.
  }
}

export function readVideoFeedRestoreHint(deviceId: string): VideoFeedRestoreHint | null {
  try {
    const raw = sessionStorage.getItem(storageKey(deviceId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<VideoFeedRestoreHint>;
    if (
      typeof parsed.sessionId !== 'string' ||
      typeof parsed.subTarget !== 'string' ||
      typeof parsed.deviceId !== 'string' ||
      parsed.deviceId !== deviceId ||
      (parsed.mode !== 'manual' && parsed.mode !== 'automatic') ||
      typeof parsed.preview !== 'boolean'
    ) {
      return null;
    }

    return {
      sessionId: parsed.sessionId,
      subTarget: parsed.subTarget as SubTargetName,
      deviceId: parsed.deviceId,
      mode: parsed.mode,
      preview: parsed.preview,
    };
  } catch {
    return null;
  }
}

export function clearVideoFeedRestoreHint(deviceId: string): void {
  try {
    sessionStorage.removeItem(storageKey(deviceId));
  } catch {
    // Ignore storage errors.
  }
}

export function matchesVideoFeedRestoreHint(
  hint: VideoFeedRestoreHint,
  sessionId: string,
  subTarget: SubTargetName,
  deviceId: string,
  mode: OperationMode,
): boolean {
  return (
    hint.sessionId === sessionId &&
    hint.subTarget === subTarget &&
    hint.deviceId === deviceId &&
    hint.mode === mode
  );
}
