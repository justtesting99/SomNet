import { endSession, fetchActiveSession } from '@/api/sessions';
import type { SubTargetName } from '@/config/sessionUsers';
import type { AutomaticControlState } from '@/types/modes';
import type { SessionHistoryEntry } from '@/types/sessionHistory';
import {
  probeDeviceAutomaticSessionActive,
  STALE_AUTOMATIC_SESSION_SUMMARY,
} from '@/utils/automaticSessionReconcile';
import {
  isRehydratableAutomaticSession,
  isRehydratableManualSession,
} from '@/utils/sessionProgress';
import type { OperationMode } from '@/types/modes';

export interface ReconcileActiveSessionOptions {
  mode: OperationMode;
  selectedSub: SubTargetName;
  automaticSettings: AutomaticControlState;
  rehydrateSession: (entry: SessionHistoryEntry) => void;
  setAutomaticRunningLocal: (running: boolean) => void;
  /** When false, trust server row (multi-tab sync). Probe only on cold load / refresh. */
  probeDevice?: boolean;
}

/** Restore in-progress server session when entering a mode or on page load (P13/P14). */
export async function reconcileActiveSessionForMode(
  options: ReconcileActiveSessionOptions,
): Promise<void> {
  const entry = await fetchActiveSession(options.selectedSub);
  if (!entry) {
    return;
  }

  if (options.mode === 'manual') {
    if (!isRehydratableManualSession(entry)) {
      return;
    }

    options.rehydrateSession(entry);
    return;
  }

  if (!isRehydratableAutomaticSession(entry)) {
    return;
  }

  if (options.probeDevice !== false) {
    const deviceActive = await probeDeviceAutomaticSessionActive(
      options.selectedSub,
      options.automaticSettings,
    );

    if (deviceActive === false) {
      await endSession(entry.id, STALE_AUTOMATIC_SESSION_SUMMARY);
      return;
    }
  }

  options.rehydrateSession(entry);

  if (!options.automaticSettings.running) {
    options.setAutomaticRunningLocal(true);
  }
}
