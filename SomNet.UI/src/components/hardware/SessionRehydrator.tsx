import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { useMode } from '@/context/ModeProvider';
import { useOptions } from '@/context/OptionsProvider';
import { useLiveSession } from '@/context/SessionProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { reconcileActiveSessionForMode } from '@/utils/sessionReconcile';

/**
 * Restores SessionProvider when entering a mode or after browser refresh (P13/P14).
 * Re-runs when returning to Manual mode or Automatic mode from Choose operation mode.
 */
export function SessionRehydrator() {
  const { user } = useAuth();
  const { mode } = useMode();
  const { selectedSub } = useSubTarget();
  const { isLoading, settingsLoaded, settings, setAutomaticRunningLocal } = useOptions();
  const { activeSession, rehydrateSession } = useLiveSession();
  const settingsRef = useRef(settings);
  const activeSessionRef = useRef(activeSession);
  const attemptedRehydrationKeyRef = useRef<string | null>(null);

  settingsRef.current = settings;
  activeSessionRef.current = activeSession;

  const domTarget = user?.displayName ?? user?.username ?? '';

  useEffect(() => {
    if (!domTarget || isLoading || !settingsLoaded || activeSession) {
      return;
    }

    if (mode === null) {
      attemptedRehydrationKeyRef.current = null;
      return;
    }

    const rehydrationKey = `${domTarget}:${selectedSub}:${mode}`;
    if (attemptedRehydrationKeyRef.current === rehydrationKey) {
      return;
    }

    // Let TabSyncProvider answer request-sync before cold probe (avoids automatic-update storm).
    const timer = window.setTimeout(() => {
      if (activeSessionRef.current) {
        attemptedRehydrationKeyRef.current = rehydrationKey;
        return;
      }

      void reconcileActiveSessionForMode({
        mode,
        selectedSub,
        automaticSettings: settingsRef.current.automatic,
        rehydrateSession,
        setAutomaticRunningLocal,
        // Trust server row on refresh (same as TabSync) — probing sends automatic-update.
        probeDevice: false,
      })
        .catch(() => {
          // Leave UI in default idle state.
        })
        .finally(() => {
          if (!activeSessionRef.current) {
            attemptedRehydrationKeyRef.current = rehydrationKey;
          }
        });
    }, 400);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    activeSession,
    domTarget,
    isLoading,
    mode,
    rehydrateSession,
    selectedSub,
    setAutomaticRunningLocal,
    settingsLoaded,
  ]);

  return null;
}
