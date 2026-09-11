import { useEffect, useRef } from 'react';
import { endSession, fetchActiveSession } from '@/api/sessions';
import { useAuth } from '@/context/AuthProvider';
import { useMode } from '@/context/ModeProvider';
import { useOptions } from '@/context/OptionsProvider';
import { useLiveSession } from '@/context/SessionProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import {
  probeDeviceAutomaticSessionActive,
  STALE_AUTOMATIC_SESSION_SUMMARY,
} from '@/utils/automaticSessionReconcile';
import {
  isRehydratableAutomaticSession,
  isRehydratableManualSession,
} from '@/utils/sessionProgress';

/**
 * Restores SessionProvider after browser refresh when the server still has an
 * in-progress session (automatic: P13-D1–D8; manual: P14-D1–D4).
 */
export function SessionRehydrator() {
  const { user } = useAuth();
  const { selectedSub } = useSubTarget();
  const { setMode } = useMode();
  const { isLoading, settingsLoaded, settings, setAutomaticRunningLocal } = useOptions();
  const { activeSession, rehydrateSession } = useLiveSession();
  const settingsRef = useRef(settings);

  settingsRef.current = settings;

  const domTarget = user?.displayName ?? user?.username ?? '';

  useEffect(() => {
    if (!domTarget || isLoading || !settingsLoaded || activeSession) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const entry = await fetchActiveSession(selectedSub);
        if (cancelled || !entry) {
          return;
        }

        if (isRehydratableManualSession(entry)) {
          rehydrateSession(entry);
          setMode('manual');
          return;
        }

        if (!isRehydratableAutomaticSession(entry)) {
          return;
        }

        const deviceActive = await probeDeviceAutomaticSessionActive(
          selectedSub,
          settingsRef.current.automatic,
        );

        if (cancelled) {
          return;
        }

        if (deviceActive === false) {
          await endSession(entry.id, STALE_AUTOMATIC_SESSION_SUMMARY);
          return;
        }

        rehydrateSession(entry);
        setMode('automatic');

        if (!settingsRef.current.automatic.running) {
          setAutomaticRunningLocal(true);
        }
      } catch {
        // Leave UI in default idle state.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeSession,
    domTarget,
    isLoading,
    rehydrateSession,
    selectedSub,
    setAutomaticRunningLocal,
    setMode,
    settingsLoaded,
  ]);

  return null;
}
