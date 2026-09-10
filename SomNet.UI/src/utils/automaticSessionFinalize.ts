import type { AutomaticControlState } from '@/types/modes';
import type { AutomaticResultJson } from '@/utils/automaticResultJson';
import { MAX_BURST_DELAY_SEC, MAX_BURST_STROKES } from '@/utils/burstFieldRules';

/** Wait for SignalR `automatic-session-complete` before REST abort/stop fallback. */
export const AUTOMATIC_HUB_FINALIZE_GRACE_MS = 1500;
export const AUTOMATIC_HUB_FINALIZE_POLL_MS = 100;
export const AUTOMATIC_STOP_GRACE_CAP_MS = 600_000;
export const AUTOMATIC_STOP_GRACE_MIN_MS = 15_000;
export const AUTOMATIC_STOP_GRACE_MARGIN_MS = 5000;

/** Worst-case wait for cooperative stop while a burst finishes (P10-D3). */
export function computeAutomaticStopGraceMs(state: AutomaticControlState): number {
  const strokeMs = Math.max(0, state.maximumStrokeMs);

  if (!state.burstsOn) {
    const gapMs = Math.max(0, state.strokeMaxSeconds) * 1000;
    return Math.min(
      AUTOMATIC_STOP_GRACE_CAP_MS,
      Math.max(AUTOMATIC_STOP_GRACE_MIN_MS, strokeMs + gapMs + AUTOMATIC_STOP_GRACE_MARGIN_MS),
    );
  }

  const strokes = Math.min(MAX_BURST_STROKES, Math.max(1, state.burstStrokesMax));
  const delayMs = Math.min(MAX_BURST_DELAY_SEC, Math.max(0, state.burstDelayMax)) * 1000;
  const burstMs = strokes * strokeMs + Math.max(0, strokes - 1) * delayMs;

  return Math.min(
    AUTOMATIC_STOP_GRACE_CAP_MS,
    Math.max(AUTOMATIC_STOP_GRACE_MIN_MS, burstMs + AUTOMATIC_STOP_GRACE_MARGIN_MS),
  );
}

export async function waitForAutomaticHubFinalize(
  isStillRunning: () => boolean,
  fallbackFinalize: () => void | Promise<void>,
  graceMs = AUTOMATIC_HUB_FINALIZE_GRACE_MS,
  pollMs = AUTOMATIC_HUB_FINALIZE_POLL_MS,
): Promise<void> {
  const deadline = Date.now() + graceMs;

  while (Date.now() < deadline) {
    if (!isStillRunning()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  if (isStillRunning()) {
    await fallbackFinalize();
  }
}

export async function applyAutomaticDeviceComplete(
  automatic: AutomaticControlState,
  parsed: AutomaticResultJson,
  updateAutomatic: (next: AutomaticControlState) => void,
  endAutomaticSession: (
    reason: string,
    deviceResult?: AutomaticResultJson | null,
  ) => Promise<void>,
  sessionActive = false,
): Promise<void> {
  if (!automatic.running && !sessionActive) {
    return;
  }

  updateAutomatic({ ...automatic, running: false });
  await endAutomaticSession('', parsed);
}
