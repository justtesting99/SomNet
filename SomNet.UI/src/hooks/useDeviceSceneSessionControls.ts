import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { useDeviceOperationMode } from '@/context/DeviceOperationModeProvider';
import type { ActuatorKind } from '@/types/device';
import { useDevicePairingSettings } from '@/context/DevicePairingSettingsProvider';
import { useHardwareCommand } from '@/context/HardwareCommandProvider';
import { useLiveSession } from '@/context/SessionProvider';
import { useSiteUserReady } from '@/context/SiteUserReadyProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { useSubDevice } from '@/context/SubDeviceProvider';
import { useSystemStatus } from '@/context/SystemStatusProvider';
import { HARDWARE_COMMAND_KEYS } from '@/types/hardwareCommand';
import { sendHardwareCommand } from '@/services/hardwareCommand';
import { readDeviceAccessoryEngaged } from '@/utils/sessionAccessoryStorage';
import { useDeviceSceneSessionActive } from '@/hooks/useDeviceSceneSessionActive';
import { deviceAutomaticRunningForDevice } from '@/utils/selectedDeviceAutomatic';
import { automaticRunningKindForActuator, subscribeTabSync } from '@/utils/tabSync';
import type { AutomaticResultJson } from '@/utils/automaticResultJson';
import { stopAutomaticForModeSwitch } from '@/utils/stopAutomaticForModeSwitch';
import { isDeviceConnectionOnline, isHubLinkReady } from '@/utils/commandReadiness';
import { sessionDeviceKey } from '@/utils/sessionDeviceKey';
import {
  persistDeviceAccessoryEngaged,
  persistDeviceSceneSession,
} from '@/utils/deviceSceneAccessoryBroadcast';

export function useDeviceSceneSessionControls(deviceId: string, actuatorKind: ActuatorKind) {
  const { user } = useAuth();
  const { mode, needsModeChoice } = useDeviceOperationMode(deviceId, actuatorKind);
  const { selectedSub } = useSubTarget();
  const { registrations } = useSubDevice();
  const { getDeviceStatus } = useSystemStatus();
  const domTarget = user?.displayName ?? user?.username ?? '';
  const registration = registrations.find((row) => row.deviceId === deviceId);
  const panelSettings = useDevicePairingSettings(deviceId, actuatorKind);
  const { isDevicePresentAcknowledged, dismissReadyBannerForSub } = useSiteUserReady();
  const { executeCommand, isCommandPending } = useHardwareCommand();
  const {
    sessionsByKey,
    startSessionForDevice,
    endAutomaticSessionForDevice,
    endSessionForAccessoryForDevice,
    syncActiveSessionModeForDevice,
  } = useLiveSession();

  const sceneSessionActive = useDeviceSceneSessionActive(deviceId);

  const [scenePending, setScenePending] = useState(false);
  const [sceneError, setSceneError] = useState('');
  const [accessoryError, setAccessoryError] = useState('');
  const [accessoryEngaged, setAccessoryEngagedState] = useState(false);

  const syncAccessoryFromStorage = useCallback(() => {
    if (!domTarget) {
      setAccessoryEngagedState(false);
      return;
    }

    setAccessoryEngagedState(readDeviceAccessoryEngaged(domTarget, selectedSub, deviceId));
  }, [deviceId, domTarget, selectedSub]);

  useEffect(() => {
    syncAccessoryFromStorage();
  }, [syncAccessoryFromStorage]);

  useEffect(() => {
    return subscribeTabSync((message) => {
      if (message.type === 'device-accessory') {
        if (message.subTarget === selectedSub && message.deviceId === deviceId) {
          syncAccessoryFromStorage();
        }
      }
    });
  }, [deviceId, selectedSub, syncAccessoryFromStorage]);

  const deviceSession = sessionsByKey[sessionDeviceKey(selectedSub, deviceId)] ?? null;

  const runningKind = automaticRunningKindForActuator(actuatorKind);
  const deviceRunning = deviceAutomaticRunningForDevice(
    selectedSub,
    deviceId,
    runningKind,
    panelSettings.settings,
  );

  const deviceStatus = getDeviceStatus(deviceId);
  const subPresentAcknowledged = isDevicePresentAcknowledged(selectedSub, deviceId);
  const hubReady = isHubLinkReady(deviceStatus);
  const deviceOnline =
    registration?.isConnected ?? isDeviceConnectionOnline(deviceStatus);

  const accessoryTogglePending = isCommandPending(
    HARDWARE_COMMAND_KEYS.sessionAccessory,
    deviceId,
  );

  const canEnableScene =
    Boolean(deviceId) && hubReady && subPresentAcknowledged && !deviceRunning && !scenePending;

  const sceneSwitchDisabled =
    scenePending || (sceneSessionActive ? deviceRunning : !canEnableScene);

  const sceneSwitchDisabledReason = useMemo(() => {
    if (sceneError) {
      return sceneError;
    }

    if (!sceneSessionActive) {
      if (!hubReady) {
        return deviceStatus.detail || deviceStatus.summary;
      }
      if (!subPresentAcknowledged) {
        return 'Double-click this device button before starting a scene session.';
      }
      if (deviceRunning) {
        return 'Stop the automatic run on this device before starting a scene session.';
      }
    }

    return undefined;
  }, [
    deviceRunning,
    deviceStatus.detail,
    deviceStatus.summary,
    hubReady,
    sceneError,
    sceneSessionActive,
    subPresentAcknowledged,
  ]);

  const accessorySwitchDisabled =
    !deviceId ||
    accessoryTogglePending ||
    (accessoryEngaged ? deviceRunning : !sceneSessionActive || !hubReady || !deviceOnline);

  const accessorySwitchDisabledReason = useMemo(() => {
    if (accessoryError) {
      return accessoryError;
    }

    if (!accessoryEngaged && !sceneSessionActive) {
      return 'Turn Scene session on before Accessory.';
    }

    if (!accessoryEngaged && !deviceOnline) {
      return 'Device is not connected.';
    }

    return undefined;
  }, [accessoryEngaged, accessoryError, deviceOnline, sceneSessionActive]);

  useEffect(() => {
    if (!sceneSessionActive || !mode || !deviceSession) {
      return;
    }

    if (deviceSession.mode !== mode) {
      void syncActiveSessionModeForDevice(deviceId, mode);
    }
  }, [
    deviceId,
    deviceSession,
    mode,
    sceneSessionActive,
    syncActiveSessionModeForDevice,
  ]);

  const setSceneSessionActive = useCallback(
    async (active: boolean) => {
      setSceneError('');

      if (active && needsModeChoice) {
        setSceneError('Choose Manual or Automatic for this device first.');
        return;
      }

      if (!domTarget) {
        return;
      }

      setScenePending(true);
      try {
        if (active) {
          persistDeviceSceneSession(domTarget, selectedSub, deviceId, true, {
            dismissReadyBanner: () => dismissReadyBannerForSub(selectedSub),
          });
          await startSessionForDevice(deviceId, mode!);
          return;
        }

        const automaticForStop = {
          ...panelSettings.settings.automatic,
          running: deviceRunning,
        };
        let automaticDeviceResult: AutomaticResultJson | null = null;
        await stopAutomaticForModeSwitch(
          selectedSub,
          deviceId,
          automaticForStop,
          {
            endAutomaticSession: async (_reason, deviceResult) => {
              automaticDeviceResult = deviceResult ?? null;
              await endAutomaticSessionForDevice(
                selectedSub,
                deviceId,
                'scene-off',
                deviceResult,
              );
            },
            setAutomaticRunningLocal: (running) => {
              if (runningKind === 'motor') {
                panelSettings.setMotorAutomaticRunningLocal(running);
              } else {
                panelSettings.setAutomaticRunningLocal(running);
              }
            },
            isAutomaticSessionActive: () => deviceSession?.mode === 'automatic' || deviceRunning,
          },
          {
            deviceSessionRunning: deviceRunning,
            stopGraceMs: actuatorKind === 'hbridge' ? 60_000 : undefined,
          },
        );

        await endSessionForAccessoryForDevice(deviceId, {
          automaticDeviceStarted: deviceSession?.automaticDeviceStarted ?? false,
          automaticDeviceResult,
        });

        if (readDeviceAccessoryEngaged(domTarget, selectedSub, deviceId)) {
          try {
            await sendHardwareCommand(
              selectedSub,
              deviceId,
              HARDWARE_COMMAND_KEYS.sessionAccessory,
              JSON.stringify({ enabled: false }),
            );
          } catch {
            // Best-effort
          }
          persistDeviceAccessoryEngaged(domTarget, selectedSub, deviceId, false);
        }

        persistDeviceSceneSession(domTarget, selectedSub, deviceId, false);
        syncAccessoryFromStorage();
      } catch (error) {
        setSceneError(error instanceof Error ? error.message : 'Could not update scene session.');
      } finally {
        setScenePending(false);
      }
    },
    [
      actuatorKind,
      deviceId,
      deviceRunning,
      deviceSession?.mode,
      dismissReadyBannerForSub,
      domTarget,
      endAutomaticSessionForDevice,
      endSessionForAccessoryForDevice,
      mode,
      needsModeChoice,
      panelSettings,
      runningKind,
      selectedSub,
      startSessionForDevice,
    ],
  );

  const setAccessoryEngaged = useCallback(
    async (active: boolean) => {
      setAccessoryError('');

      if (active && !sceneSessionActive) {
        setAccessoryError('Turn Scene session on before Accessory.');
        return;
      }

      if (!domTarget) {
        return;
      }

      const ran = await executeCommand(
        HARDWARE_COMMAND_KEYS.sessionAccessory,
        async () => {
          await sendHardwareCommand(
            selectedSub,
            deviceId,
            HARDWARE_COMMAND_KEYS.sessionAccessory,
            JSON.stringify({ enabled: active }),
          );
          persistDeviceAccessoryEngaged(domTarget, selectedSub, deviceId, active);
          syncAccessoryFromStorage();
        },
        deviceId,
      );

      if (!ran) {
        setAccessoryError('Accessory command already in progress.');
      }
    },
    [deviceId, domTarget, executeCommand, sceneSessionActive, selectedSub, syncAccessoryFromStorage],
  );

  return {
    sceneSessionActive,
    accessoryEngaged,
    sceneTogglePending: scenePending,
    accessoryTogglePending,
    sceneSwitchDisabled,
    accessorySwitchDisabled,
    sceneSwitchDisabledReason,
    accessorySwitchDisabledReason,
    sceneSessionError: sceneError,
    accessoryError,
    setSceneSessionActive,
    setAccessoryEngaged,
  };
}
