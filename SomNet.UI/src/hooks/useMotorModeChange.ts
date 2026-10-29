import { useCallback } from 'react';
import type { AutomaticControlState, OperationMode } from '@/types/modes';
import { useDevicePairingSettings } from '@/context/DevicePairingSettingsProvider';
import { useLiveSession } from '@/context/SessionProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { deviceAutomaticRunningForDevice } from '@/utils/selectedDeviceAutomatic';
import { automaticRunningKindForActuator } from '@/utils/tabSync';
import { stopAutomaticForModeSwitch } from '@/utils/stopAutomaticForModeSwitch';
import { sessionDeviceKey } from '@/utils/sessionDeviceKey';

/** Stops cooperative motor automatic before switching to manual. */
export function useMotorModeChange(deviceId: string) {
  const { selectedSub } = useSubTarget();
  const panel = useDevicePairingSettings(deviceId, 'hbridge');
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
        automaticRunningKindForActuator('hbridge'),
        panel.settings,
      );

      await stopAutomaticForModeSwitch(
        selectedSub,
        deviceId,
        { running: deviceRunning } as AutomaticControlState,
        {
          endAutomaticSession: async (_reason, deviceResult) => {
            await endAutomaticSessionForDevice(
              selectedSub,
              deviceId,
              'mode-switch',
              deviceResult,
            );
          },
          setAutomaticRunningLocal: panel.setMotorAutomaticRunningLocal,
          isAutomaticSessionActive: () =>
            deviceSession?.mode === 'automatic' || deviceRunning,
        },
        { deviceSessionRunning: deviceRunning, stopGraceMs: 60_000 },
      );

      applyMode();
    },
    [
      deviceId,
      endAutomaticSessionForDevice,
      panel.setMotorAutomaticRunningLocal,
      panel.settings,
      selectedSub,
      sessionsByKey,
    ],
  );
}
