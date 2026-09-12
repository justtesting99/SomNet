import type { SubTargetName } from '@/config/sessionUsers';
import type { OperationMode } from '@/types/modes';

const STORAGE_KEY = 'somnet-video-feed-restore';

export interface VideoFeedRestoreHint {
  sessionId: string;
  subTarget: SubTargetName;
  mode: OperationMode;
  /** True when feeds were started via Start feeds preview (2× timeout on restore). */
  preview: boolean;
}

export function writeVideoFeedRestoreHint(hint: VideoFeedRestoreHint): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(hint));
  } catch {
    // Ignore quota / private mode errors.
  }
}

export function readVideoFeedRestoreHint(): VideoFeedRestoreHint | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<VideoFeedRestoreHint>;
    if (
      typeof parsed.sessionId !== 'string' ||
      typeof parsed.subTarget !== 'string' ||
      (parsed.mode !== 'manual' && parsed.mode !== 'automatic') ||
      typeof parsed.preview !== 'boolean'
    ) {
      return null;
    }

    return {
      sessionId: parsed.sessionId,
      subTarget: parsed.subTarget as SubTargetName,
      mode: parsed.mode,
      preview: parsed.preview,
    };
  } catch {
    return null;
  }
}

export function clearVideoFeedRestoreHint(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}

export function matchesVideoFeedRestoreHint(
  hint: VideoFeedRestoreHint,
  sessionId: string,
  subTarget: SubTargetName,
  mode: OperationMode,
): boolean {
  return hint.sessionId === sessionId && hint.subTarget === subTarget && hint.mode === mode;
}
