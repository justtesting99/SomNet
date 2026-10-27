import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { useDevicePairingSettings } from '@/context/DevicePairingSettingsProvider';
import { useLiveSession } from '@/context/SessionProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { reconcileActiveSessionForMode } from '@/utils/sessionReconcile';
import { readDeviceSceneSessionActive } from '@/utils/sessionAccessoryStorage';
import { useDeviceOperationModeApi } from '@/context/DeviceOperationModeProvider';
import { useSubDevice } from '@/context/SubDeviceProvider';
import { sessionDeviceKey } from '@/utils/sessionDeviceKey';
import type { ActuatorKind } from '@/types/device';
import { automaticRunningKindForActuator } from '@/utils/tabSync';

function DeviceSessionRehydrateEffect({
  deviceId,
  actuatorKind,
}: {
  deviceId: string;
  actuatorKind: ActuatorKind;
}) {
  const { user } = useAuth();
  const { selectedSub } = useSubTarget();
  const { getDeviceOperationMode } = useDeviceOperationModeApi();
  const panelSettings = useDevicePairingSettings(deviceId, actuatorKind);
  const { sessionsByKey, rehydrateSession } = useLiveSession();
  const attemptedRef = useRef(false);

  const domTarget = user?.displayName ?? user?.username ?? '';
  const runningKind = automaticRunningKindForActuator(actuatorKind);

  useEffect(() => {
    attemptedRef.current = false;
  }, [deviceId, domTarget, selectedSub]);

  useEffect(() => {
    if (!domTarget || !panelSettings.settingsLoaded || panelSettings.isLoading) {
      return;
    }

    if (!readDeviceSceneSessionActive(domTarget, selectedSub, deviceId)) {
      return;
    }

    if (sessionsByKey[sessionDeviceKey(selectedSub, deviceId)]) {
      return;
    }

    if (attemptedRef.current) {
      return;
    }

    const mode = getDeviceOperationMode(deviceId, actuatorKind);
    const timer = window.setTimeout(() => {
      attemptedRef.current = true;
      const automaticSettings = panelSettings.settings.automatic;
      const setRunningLocal =
        runningKind === 'motor'
          ? panelSettings.setMotorAutomaticRunningLocal
          : panelSettings.setAutomaticRunningLocal;

      void reconcileActiveSessionForMode({
        mode,
        selectedSub,
        deviceId,
        automaticSettings,
        rehydrateSession,
        setAutomaticRunningLocal: setRunningLocal,
        probeDevice: false,
      }).catch(() => {
        // Leave UI idle for this device.
      });
    }, 400);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    actuatorKind,
    deviceId,
    domTarget,
    getDeviceOperationMode,
    panelSettings.isLoading,
    panelSettings.settings.automatic,
    panelSettings.settingsLoaded,
    panelSettings.setAutomaticRunningLocal,
    panelSettings.setMotorAutomaticRunningLocal,
    rehydrateSession,
    runningKind,
    selectedSub,
    sessionsByKey,
  ]);

  return null;
}

/** Restores SessionProvider per device when scene session is on. */
export function SessionRehydrator() {
  const { registrations } = useSubDevice();

  return (
    <>
      {registrations.map((registration) => (
        <DeviceSessionRehydrateEffect
          key={registration.deviceId}
          deviceId={registration.deviceId}
          actuatorKind={registration.actuatorKind}
        />
      ))}
    </>
  );
}
