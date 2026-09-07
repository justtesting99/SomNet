import type { AutomaticControlState } from '@/types/modes';
import type { AutomaticResultJson } from '@/utils/automaticResultJson';

/** Wait for SignalR `automatic-session-complete` before REST abort fallback. */
export const AUTOMATIC_HUB_FINALIZE_GRACE_MS = 1500;
export const AUTOMATIC_HUB_FINALIZE_POLL_MS = 100;

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

export function applyAutomaticDeviceComplete(
  automatic: AutomaticControlState,
  parsed: AutomaticResultJson,
  updateAutomatic: (next: AutomaticControlState) => void,
  endAutomaticSession: (
    reason: string,
    deviceResult?: AutomaticResultJson | null,
  ) => Promise<void>,
): void {
  if (!automatic.running) {
    return;
  }

  updateAutomatic({ ...automatic, running: false });
  void endAutomaticSession('', parsed);
}
