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
import {
  readDeviceAccessoryEngaged,
  readDeviceSceneSessionActive,
  writeDeviceAccessoryEngaged,
  writeDeviceSceneSessionActive,
} from '@/utils/sessionAccessoryStorage';
import { deviceAutomaticRunningForDevice } from '@/utils/selectedDeviceAutomatic';
import { automaticRunningKindForActuator } from '@/utils/tabSync';
import { stopAutomaticForModeSwitch } from '@/utils/stopAutomaticForModeSwitch';
import { isDeviceConnectionOnline, isHubLinkReady } from '@/utils/commandReadiness';
import { sessionDeviceKey } from '@/utils/sessionDeviceKey';
import { HeaderToggle } from '@/components/hardware/SubSessionControls';

interface DeviceSubSessionControlsProps {
  deviceId: string;
  actuatorKind: ActuatorKind;
}

export function DeviceSubSessionControls({
  deviceId,
  actuatorKind,
}: DeviceSubSessionControlsProps) {
  const { user } = useAuth();
  const { mode, needsModeChoice } = useDeviceOperationMode(deviceId, actuatorKind);
  const { selectedSub } = useSubTarget();
  const { registrations } = useSubDevice();
  const { status: systemStatus } = useSystemStatus();
  const domTarget = user?.displayName ?? user?.username ?? '';
  const registration = registrations.find((row) => row.deviceId === deviceId);
  const panelSettings = useDevicePairingSettings(deviceId, actuatorKind);
  const { isDevicePresentAcknowledged, dismissReadyBannerForSub } = useSiteUserReady();
  const { executeCommand, isCommandPending } = useHardwareCommand();
  const { sessionsByKey, startSessionForAccessory, endAutomaticSessionForDevice } =
    useLiveSession();
  const [scenePending, setScenePending] = useState(false);
  const [sceneError, setSceneError] = useState('');
  const [accessoryError, setAccessoryError] = useState('');
  const [sceneSessionActive, setSceneSessionActiveState] = useState(false);
  const [accessoryEngaged, setAccessoryEngagedState] = useState(false);

  const syncFromStorage = useCallback(() => {
    if (!domTarget) {
      setSceneSessionActiveState(false);
      setAccessoryEngagedState(false);
      return;
    }

    setSceneSessionActiveState(readDeviceSceneSessionActive(domTarget, selectedSub, deviceId));
    setAccessoryEngagedState(readDeviceAccessoryEngaged(domTarget, selectedSub, deviceId));
  }, [deviceId, domTarget, selectedSub]);

  useEffect(() => {
    syncFromStorage();
  }, [syncFromStorage]);

  const deviceSession = sessionsByKey[sessionDeviceKey(selectedSub, deviceId)] ?? null;

  const runningKind = automaticRunningKindForActuator(actuatorKind);
  const deviceRunning = deviceAutomaticRunningForDevice(
    selectedSub,
    deviceId,
    runningKind,
    panelSettings.settings,
  );

  const subPresentAcknowledged = isDevicePresentAcknowledged(selectedSub, deviceId);
  const hubReady = isHubLinkReady(systemStatus);
  const deviceOnline = registration?.isConnected ?? isDeviceConnectionOnline(systemStatus);

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
        return systemStatus.detail || systemStatus.summary;
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
    hubReady,
    sceneError,
    sceneSessionActive,
    subPresentAcknowledged,
    systemStatus.detail,
    systemStatus.summary,
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

  async function setSceneActive(active: boolean) {
    setSceneError('');

    if (active && needsModeChoice) {
      setSceneError('Choose Manual or Automatic for this device first.');
      return;
    }

    setScenePending(true);
    try {
      if (active) {
        dismissReadyBannerForSub(selectedSub);
        if (domTarget) {
          writeDeviceSceneSessionActive(domTarget, selectedSub, deviceId, true);
        }
        syncFromStorage();
        await startSessionForAccessory(mode!, deviceId);
        return;
      }

      const automatic = panelSettings.settings.automatic;
      await stopAutomaticForModeSwitch(
        selectedSub,
        deviceId,
        automatic,
        {
          endAutomaticSession: async (_reason, deviceResult) => {
            await endAutomaticSessionForDevice(selectedSub, deviceId, 'scene-off', deviceResult);
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

      if (domTarget && readDeviceAccessoryEngaged(domTarget, selectedSub, deviceId)) {
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
        writeDeviceAccessoryEngaged(domTarget, selectedSub, deviceId, false);
      }

      if (domTarget) {
        writeDeviceSceneSessionActive(domTarget, selectedSub, deviceId, false);
      }
      syncFromStorage();
    } catch (error) {
      setSceneError(error instanceof Error ? error.message : 'Could not update scene session.');
    } finally {
      setScenePending(false);
    }
  }

  async function setAccessory(active: boolean) {
    setAccessoryError('');

    if (active && !sceneSessionActive) {
      setAccessoryError('Turn Scene session on before Accessory.');
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
        if (domTarget) {
          writeDeviceAccessoryEngaged(domTarget, selectedSub, deviceId, active);
        }
        syncFromStorage();
      },
      deviceId,
    );

    if (!ran) {
      setAccessoryError('Accessory command already in progress.');
    }
  }

  const deviceShort = `${deviceId.slice(0, 8)}…`;

  return (
    <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-start">
      <HeaderToggle
        label={`Scene (${deviceShort})`}
        shortLabel="Scene"
        active={sceneSessionActive}
        disabled={sceneSwitchDisabled}
        pending={scenePending}
        disabledReason={sceneSwitchDisabledReason}
        ariaLabel={`Scene session for ${deviceId}`}
        dataUi={`scene-session-${deviceId}`}
        toneActive="indigo"
        onToggle={() => void setSceneActive(!sceneSessionActive)}
      />
      <HeaderToggle
        label={`Accessory (${deviceShort})`}
        shortLabel="Accessory"
        active={accessoryEngaged}
        disabled={accessorySwitchDisabled}
        pending={accessoryTogglePending}
        disabledReason={accessorySwitchDisabledReason}
        ariaLabel={`Accessory for ${deviceId}`}
        dataUi={`device-accessory-${deviceId}`}
        toneActive="amber"
        onToggle={() => void setAccessory(!accessoryEngaged)}
      />
    </div>
  );
}
