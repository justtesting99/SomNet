import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { useOptions } from '@/context/OptionsProvider';
import { useLiveSession } from '@/context/SessionProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { reconcileActiveSessionForMode } from '@/utils/sessionReconcile';
import { readDeviceSceneSessionActive } from '@/utils/sessionAccessoryStorage';
import { useSubDevice } from '@/context/SubDeviceProvider';
import { useDeviceOperationModeApi } from '@/context/DeviceOperationModeProvider';
import { sessionDeviceKey } from '@/utils/sessionDeviceKey';

/**
 * Restores SessionProvider per device when scene session is on (P13/P14).
 * Each device has its own operation mode and server session row.
 */
export function SessionRehydrator() {
  const { user } = useAuth();
  const { selectedSub } = useSubTarget();
  const { registrations } = useSubDevice();
  const { getDeviceOperationMode } = useDeviceOperationModeApi();
  const { isLoading, settingsLoaded, settings, setAutomaticRunningLocal, setMotorAutomaticRunningLocal } =
    useOptions();
  const { sessionsByKey, rehydrateSession } = useLiveSession();
  const settingsRef = useRef(settings);
  const attemptedKeysRef = useRef<Set<string>>(new Set());

  settingsRef.current = settings;

  const domTarget = user?.displayName ?? user?.username ?? '';

  useEffect(() => {
    if (!domTarget || isLoading || !settingsLoaded || registrations.length === 0) {
      return;
    }

    for (const registration of registrations) {
      const { deviceId, actuatorKind } = registration;
      if (!readDeviceSceneSessionActive(domTarget, selectedSub, deviceId)) {
        continue;
      }

      const mode = getDeviceOperationMode(deviceId, actuatorKind);
      const sessionKey = `${domTarget}:${selectedSub}:${deviceId}:${mode}`;
      if (attemptedKeysRef.current.has(sessionKey)) {
        continue;
      }

      if (sessionsByKey[sessionDeviceKey(selectedSub, deviceId)]) {
        attemptedKeysRef.current.add(sessionKey);
        continue;
      }

      const timer = window.setTimeout(() => {
        const panelSettings = settingsRef.current;
        const automaticSettings = panelSettings.automatic;
        const setRunningLocal =
          actuatorKind === 'hbridge' ? setMotorAutomaticRunningLocal : setAutomaticRunningLocal;

        void reconcileActiveSessionForMode({
          mode,
          selectedSub,
          deviceId,
          automaticSettings,
          rehydrateSession,
          setAutomaticRunningLocal: setRunningLocal,
          probeDevice: false,
        })
          .catch(() => {
            // Leave UI idle for this device.
          })
          .finally(() => {
            attemptedKeysRef.current.add(sessionKey);
          });
      }, 400);

      return () => {
        window.clearTimeout(timer);
      };
    }
  }, [
    domTarget,
    getDeviceOperationMode,
    isLoading,
    registrations,
    rehydrateSession,
    selectedSub,
    sessionsByKey,
    setAutomaticRunningLocal,
    setMotorAutomaticRunningLocal,
    settingsLoaded,
  ]);

  return null;
}
