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
import { isRehydratableAutomaticSession } from '@/utils/sessionProgress';

/**
 * Restores SessionProvider + running UI after browser refresh when the server
 * still has an in-progress automatic session (P13-D1–D6).
 */
export function AutomaticSessionRehydrator() {
  const { user } = useAuth();
  const { selectedSub } = useSubTarget();
  const { setMode } = useMode();
  const { isLoading, settings, updateAutomatic } = useOptions();
  const { activeSession, rehydrateSession } = useLiveSession();
  const attemptedKeyRef = useRef<string | null>(null);
  const automaticRef = useRef(settings.automatic);

  automaticRef.current = settings.automatic;

  const domTarget = user?.displayName ?? user?.username ?? '';

  useEffect(() => {
    attemptedKeyRef.current = null;
  }, [domTarget, selectedSub]);

  useEffect(() => {
    if (!domTarget || isLoading || activeSession) {
      return;
    }

    const attemptKey = `${domTarget}:${selectedSub}`;
    if (attemptedKeyRef.current === attemptKey) {
      return;
    }

    attemptedKeyRef.current = attemptKey;

    void (async () => {
      try {
        const entry = await fetchActiveSession(selectedSub);
        if (!entry || !isRehydratableAutomaticSession(entry)) {
          return;
        }

        const deviceActive = await probeDeviceAutomaticSessionActive(
          selectedSub,
          automaticRef.current,
        );

        if (deviceActive === false) {
          await endSession(entry.id, STALE_AUTOMATIC_SESSION_SUMMARY);
          return;
        }

        rehydrateSession(entry);
        setMode('automatic');

        const automatic = automaticRef.current;
        if (!automatic.running) {
          updateAutomatic({ ...automatic, running: true });
        }
      } catch {
        // Leave UI in default idle state.
      }
    })();
  }, [
    activeSession,
    domTarget,
    isLoading,
    rehydrateSession,
    selectedSub,
    setMode,
    updateAutomatic,
  ]);

  return null;
}
