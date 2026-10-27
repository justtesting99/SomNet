import { useCallback } from 'react';
import type { OperationMode } from '@/types/modes';
import { useDevicePairingSettings } from '@/context/DevicePairingSettingsProvider';
import { useLiveSession } from '@/context/SessionProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { deviceAutomaticRunningForDevice } from '@/utils/selectedDeviceAutomatic';
import { automaticRunningKindForActuator } from '@/utils/tabSync';
import { stopAutomaticForModeSwitch } from '@/utils/stopAutomaticForModeSwitch';
import { sessionDeviceKey } from '@/utils/sessionDeviceKey';

/** Stops cooperative automatic on this relay before switching manual/automatic. */
export function useRelayModeChange(deviceId: string) {
  const { selectedSub } = useSubTarget();
  const panel = useDevicePairingSettings(deviceId, 'relay');
  const { sessionsByKey, endAutomaticSessionForDevice } = useLiveSession();

  return useCallback(
    async (fromMode: OperationMode, toMode: OperationMode, applyMode: () => void) => {
      if (fromMode !== 'automatic' || toMode === 'automatic') {
        applyMode();
        return;
      }

      const deviceSession =
        sessionsByKey[sessionDeviceKey(selectedSub, deviceId)] ?? null;
      const deviceRunning = deviceAutomaticRunningForDevice(
        selectedSub,
        deviceId,
        automaticRunningKindForActuator('relay'),
        panel.settings,
      );

      const automaticForStop = {
        ...panel.settings.automatic,
        running: deviceRunning,
      };

      await stopAutomaticForModeSwitch(
        selectedSub,
        deviceId,
        automaticForStop,
        {
          endAutomaticSession: async (_reason, deviceResult) => {
            await endAutomaticSessionForDevice(
              selectedSub,
              deviceId,
              'mode-switch',
              deviceResult,
            );
          },
          setAutomaticRunningLocal: panel.setAutomaticRunningLocal,
          isAutomaticSessionActive: () =>
            deviceSession?.mode === 'automatic' || deviceRunning,
        },
        { deviceSessionRunning: deviceRunning },
      );

      applyMode();
    },
    [
      deviceId,
      endAutomaticSessionForDevice,
      panel.setAutomaticRunningLocal,
      panel.settings,
      selectedSub,
      sessionsByKey,
    ],
  );
}
